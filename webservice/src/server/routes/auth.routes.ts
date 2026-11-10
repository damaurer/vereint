import { Router, type Request, type Response } from 'express';
import type { OidcTransactionState } from '../auth/auth.types';
import { clearOidcStateCookie, readOidcStateCookie, setOidcStateCookie } from '../auth/cookie.service';
import {
  accountSecurityUrl,
  buildEndSessionUrl,
  createAuthorizationRequest,
  exchangeCodeForTokens,
} from '../auth/oidc.service';
import { resolveSafeReturnTo } from '../auth/redirect';
import { createCorrelationId, logSecurityEvent } from '../auth/security-log';
import { createSessionFromTokens, destroySession } from '../auth/session.service';
import { serverEnvironment } from '../config/environment';
import { invalidateAccessDecision, resolveAccessDecision } from '../authorization/authorization.service';
import { requestLanguage } from '../../app/i18n/language-cookie';
import {
  clearStammtischCookie,
  isStammtischId,
  readStammtischCookie,
  setStammtischCookie,
} from '../stammtisch/stammtisch-cookie';

export const authRoutes = Router();

/** Gültigkeitsdauer des OIDC-Transaktionsstates (identisch zum State-Cookie). */
const OIDC_STATE_MAX_AGE_MS = 10 * 60 * 1000;

const LOGIN_ERROR_PATH = '/auth/error';
const LOGGED_OUT_PATH = '/auth/logged-out';

function loginErrorRedirect(code: string): string {
  return `${LOGIN_ERROR_PATH}?error=${encodeURIComponent(code)}`;
}

/**
 * Startet den OIDC Authorization Code Flow mit PKCE gegen Keycloak.
 */
async function handleLogin(req: Request, res: Response): Promise<void> {
  // Open-Redirect-Schutz: nur relative Pfade auf bekannte App-Präfixe.
  const returnTo = resolveSafeReturnTo(req.query['returnTo']);
  const customScope = typeof req.query['scope'] === 'string' ? req.query['scope'] : undefined;

  // Bestimme Redirect URI passend zum aufgerufenen Pfad oder Default
  const isOauth2Path = req.baseUrl.includes('oauth2');
  const redirectUri = isOauth2Path
    ? `${serverEnvironment.publicBaseUrl}/login/oauth2/code/keycloak`
    : `${serverEnvironment.publicBaseUrl}/api/auth/callback`;

  const { authorizationUrl, stateString } = createAuthorizationRequest({
    redirectUri,
    returnTo,
    scope: customScope,
    // Keycloak zeigt Anmeldung/Registrierung in der Sprache der App.
    uiLocales: requestLanguage(req.headers.cookie, req.headers['accept-language']),
  });

  setOidcStateCookie(res, stateString);
  res.redirect(302, authorizationUrl);
}

authRoutes.get('/login', (req, res, next) => {
  void handleLogin(req, res).catch(next);
});

/**
 * Verarbeitet den OIDC-Callback von Keycloak.
 *
 * Alle Fehlerpfade werden strukturiert protokolliert — ohne Tokens, Codes,
 * PKCE-Verifier oder Nonces.
 */
async function handleCallback(req: Request, res: Response): Promise<void> {
  const correlationId = createCorrelationId();
  const error = req.query['error'] || req.body?.error;

  const fail = (code: string, errorClass: string, status = 400, detail?: string): void => {
    logSecurityEvent(
      { event: 'oidc_callback', outcome: 'denied', errorClass, correlationId, detail },
      req,
    );
    clearOidcStateCookie(res);
    if (req.accepts('html')) {
      res.redirect(302, loginErrorRedirect(code));
      return;
    }
    res.status(status).json({ code, traceId: correlationId });
  };

  if (error) {
    fail('oidc_login_failed', `provider_error_${String(error).slice(0, 40)}`);
    return;
  }

  const code = typeof req.query['code'] === 'string' ? req.query['code'] : req.body?.code;
  const state = typeof req.query['state'] === 'string' ? req.query['state'] : req.body?.state;
  const rawStoredState = readOidcStateCookie(req);

  if (!code || !state || !rawStoredState) {
    fail('oidc_login_failed', 'missing_callback_parameters');
    return;
  }

  let storedState: OidcTransactionState;
  try {
    storedState = JSON.parse(rawStoredState) as OidcTransactionState;
  } catch {
    fail('oidc_login_failed', 'invalid_state_cookie');
    return;
  }

  if (storedState.state !== state) {
    fail('invalid_state', 'state_mismatch');
    return;
  }

  if (!storedState.createdAt || Date.now() - storedState.createdAt > OIDC_STATE_MAX_AGE_MS) {
    fail('oidc_login_failed', 'state_expired');
    return;
  }

  const isOauth2Path = req.baseUrl.includes('oauth2') || req.baseUrl.includes('code');
  const redirectUri = isOauth2Path
    ? `${serverEnvironment.publicBaseUrl}/login/oauth2/code/keycloak`
    : `${serverEnvironment.publicBaseUrl}/api/auth/callback`;

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, storedState.codeVerifier, redirectUri, correlationId);
  } catch (err) {
    fail('oidc_login_failed', (err as Error).message?.split(' ')[0] || 'token_exchange_failed');
    return;
  }

  try {
    // `nonce` wird gegen den ID-Token-Claim geprüft; Abweichung bricht den Login ab.
    await createSessionFromTokens(tokens, res, {
      rememberMe: true,
      nonce: storedState.nonce,
      correlationId,
    });
  } catch (err) {
    fail('oidc_login_failed', (err as Error).message?.split(' ')[0] || 'session_creation_failed');
    return;
  }

  clearOidcStateCookie(res);

  const destination = resolveSafeReturnTo(storedState.returnTo);
  logSecurityEvent({ event: 'oidc_callback', outcome: 'allowed', correlationId }, req);

  if (req.accepts('html')) {
    res.redirect(302, destination);
  } else {
    res.status(200).json({ success: true, redirectUrl: destination });
  }
}

authRoutes.get('/callback', (req, res, next) => {
  void handleCallback(req, res).catch(next);
});

authRoutes.post('/callback', (req, res, next) => {
  void handleCallback(req, res).catch(next);
});

authRoutes.get('/keycloak', (req, res, next) => {
  if (req.query['code'] || req.query['error']) {
    void handleCallback(req, res).catch(next);
  } else {
    void handleLogin(req, res).catch(next);
  }
});

/**
 * Gibt die aktuelle Session-Identität zurück.
 *
 * Rohe Token-Claims verlassen den Server nicht: geliefert werden ausschließlich
 * `subject`, `displayName`, `roles`, `boardRole`, `permissions` sowie der
 * gewählte Stammtisch und die Mitgliedschaften (`docs/backend-for-frontend/03-authentication-and-session.md`).
 *
 * Die Permissions stammen aus der Rollen-Matrix des Fachservices
 * (`/api/v1/auth/access`, kurz gecacht). Keycloak stellt keinen
 * `permissions`-Claim aus; ohne diese Ergänzung blieben Seiten mit
 * Permission-Guard (z. B. die Thekenerfassung) für alle gesperrt.
 */
async function respondWithIdentity(req: Request, res: Response): Promise<void> {
  if (!req.identity) {
    res.status(401).json({ authenticated: false, code: 'oidc_session_expired' });
    return;
  }

  const selected = readStammtischCookie(req);
  const resolved = await resolveAccessDecision({
    identity: req.identity,
    accessToken: req.sessionData?.tokens.accessToken,
    sessionId: req.sessionData?.sessionId,
    stammtischId: selected,
  });
  const decision = resolved.outcome === 'resolved' ? resolved.decision : undefined;

  // Ein Cookie für einen Stammtisch ohne Mitgliedschaft wird verworfen.
  if (selected && (resolved.stammtischRejected || (decision && decision.stammtischId !== selected))) {
    clearStammtischCookie(res);
  }

  // Rollen und Rechte gelten je Stammtisch; die Realmrollen des Tokens zählen
  // nur, solange der Fachservice nicht erreichbar ist (Navigation, kein Zugriff).
  const permissions = new Set(req.identity.permissions ?? []);
  for (const permission of decision?.permissions ?? []) permissions.add(permission);

  res.status(200).json({
    authenticated: true,
    identity: {
      subject: req.identity.uid,
      displayName: req.identity.displayName ?? null,
      roles: decision ? decision.roles : req.identity.roles,
      boardRole: (decision ? decision.boardRole : req.identity.boardRole) ?? null,
      permissions: [...permissions],
      stammtisch: decision?.stammtischId
        ? {
            id: decision.stammtischId,
            name: decision.stammtischName ?? '',
            // Das Bild der gewählten Gruppe steht an ihrer Mitgliedschaft.
            imageVersion:
              decision.memberships?.find((membership) => membership.id === decision.stammtischId)?.imageVersion ?? null,
          }
        : null,
      memberships: decision?.memberships ?? [],
      platformAdmin: decision?.platformAdmin === true,
      appContexts: decision?.allowedAppContexts ?? [],
    },
  });
}

/**
 * Wählt den Stammtisch der Session. Die Mitgliedschaft prüft der Fachservice;
 * ohne sie bleibt die Auswahl unverändert (`403`).
 */
async function selectStammtisch(req: Request, res: Response): Promise<void> {
  if (!req.identity) {
    res.status(401).json({ code: 'oidc_session_expired' });
    return;
  }

  const requested = (req.body as { stammtischId?: unknown } | undefined)?.stammtischId;
  if (requested === null) {
    clearStammtischCookie(res);
    res.status(204).end();
    return;
  }
  if (!isStammtischId(requested)) {
    res.status(400).json({ code: 'invalid_request' });
    return;
  }

  const stammtischId = requested.toLowerCase();
  // Die Auswahl folgt oft auf eine neue Mitgliedschaft (Stammtisch eröffnet,
  // Einladung angenommen): gecachte Entscheidungen kennen sie noch nicht.
  invalidateAccessDecision(req.sessionData?.sessionId);
  const resolved = await resolveAccessDecision({
    identity: req.identity,
    accessToken: req.sessionData?.tokens.accessToken,
    sessionId: req.sessionData?.sessionId,
    stammtischId,
  });
  if (resolved.outcome === 'unavailable') {
    res.status(503).json({ code: 'service_unavailable' });
    return;
  }
  if (resolved.stammtischRejected || resolved.decision?.stammtischId !== stammtischId) {
    logSecurityEvent(
      { event: 'stammtisch_select', outcome: 'denied', errorClass: 'not_a_member', subject: req.identity.uid },
      req,
    );
    res.status(403).json({ code: 'stammtisch_access_denied' });
    return;
  }

  setStammtischCookie(res, stammtischId);
  res.status(204).end();
}

authRoutes.post('/stammtisch', (req, res, next) => {
  selectStammtisch(req, res).catch(next);
});

/**
 * Leitet zur Zwei-Faktor-Einrichtung in der Keycloak-Kontoverwaltung weiter.
 * Das Frontend kennt die Adresse von Keycloak nicht, sie folgt aus
 * `KEYCLOAK_ISSUER_URI`.
 */
authRoutes.get('/account-security', (_req, res) => {
  res.redirect(302, accountSecurityUrl());
});

authRoutes.get('/me', (req, res, next) => {
  respondWithIdentity(req, res).catch(next);
});

authRoutes.get('/session', (req, res, next) => {
  respondWithIdentity(req, res).catch(next);
});

/**
 * Der frühere Firebase-ID-Token-Endpunkt ist entfallen: Identität liefert
 * ausschließlich Keycloak über den OIDC-Callback.
 */
authRoutes.post('/session', (req, res) => {
  logSecurityEvent(
    { event: 'legacy_session_endpoint', outcome: 'denied', errorClass: 'endpoint_removed' },
    req,
  );
  res.status(410).json({ code: 'invalid_request', detail: 'Legacy-Session-Endpunkt entfernt.' });
});

/**
 * Meldet den Benutzer ab und verwirft die Session.
 */
async function handleLogout(req: Request, res: Response): Promise<void> {
  const session = req.sessionData;
  const idToken = session?.tokens.idToken;

  const backchannelLogout = await destroySession(req, res);

  if (req.query['redirect'] === 'true' || (req.accepts('html') && req.method === 'GET')) {
    const endSessionUrl = buildEndSessionUrl({
      idTokenHint: idToken,
      postLogoutRedirectUri: `${serverEnvironment.publicBaseUrl}${LOGGED_OUT_PATH}`,
    });
    res.redirect(302, endSessionUrl);
    return;
  }

  if (!backchannelLogout) {
    // Die lokale Session ist verworfen; der Backchannel-Fehler ist protokolliert.
    res.status(200).json({ success: true, backchannelLogout: false });
    return;
  }

  res.status(204).end();
}

authRoutes.post('/logout', (req, res, next) => {
  void handleLogout(req, res).catch(next);
});

authRoutes.get('/logout', (req, res, next) => {
  void handleLogout(req, res).catch(next);
});
