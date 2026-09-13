import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import compression from 'compression';
import express from 'express';
import { join } from 'node:path';
import { attachIdentity } from './server/auth/auth.middleware';
import { authorizePages } from './server/authorization/authorization.middleware';
import { invalidateAccessDecision } from './server/authorization/authorization.service';
import {
  applyDeliveryHeaders,
  attachCspNonce,
  isPrivateDeliveryPath,
  securityHeaders,
} from './server/authorization/delivery.middleware';
import { sanitizeTransferState } from './server/authorization/transfer-state';
import { assertServerEnvironment, serverEnvironment } from './server/config/environment';
import { authRoutes } from './server/routes/auth.routes';
import { inviteRoutes } from './server/invites/invite.routes';
import { apiProxy } from './server/api/api-proxy.middleware';

const browserDistFolder = join(import.meta.dirname, '../browser');
const app = express();
const angularApp = new AngularNodeAppEngine();

// Kompression vor allen statischen Routen; `no-store`-Antworten bleiben
// unverändert komprimierbar, weil `Vary: Accept-Encoding` gesetzt wird.
app.use(compression());
app.use(attachCspNonce);
app.use(securityHeaders);
app.use(applyDeliveryHeaders);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(attachIdentity);

/**
 * Beim Logout wird die kurz gecachte Zugriffsentscheidung verworfen, damit eine
 * neue Session keine alten Rechte erbt (TICKET-006).
 */
app.use('/api/auth/logout', (req, _res, next) => {
  invalidateAccessDecision(req.sessionData?.sessionId);
  next();
});

app.use('/api/auth', authRoutes);
app.use('/oauth2/authorization', authRoutes);
app.use('/login/oauth2/code', authRoutes);
app.use('/api/invites', inviteRoutes);
// Auslieferungs-Proxy: hängt das Session-Token an und leitet die fachliche API
// an Spring weiter. Keine Fachlogik; `deny by default` ohne gültige Session.
app.use('/api/v1', apiProxy);
app.use(authorizePages);
// `cacheControl: false`: Die Cache-Regeln stammen ausschließlich aus
// `applyDeliveryHeaders` und dürfen nicht doppelt vergeben werden.
app.use(
  express.static(browserDistFolder, {
    index: false,
    redirect: false,
    cacheControl: false,
    etag: true,
    lastModified: true,
  }),
);

app.use((req, res, next) => {
  const isPrivateContext = isPrivateDeliveryPath(req.path);

  angularApp
    .handle(req)
    .then(async (response) => {
      if (!response) {
        next();
        return;
      }

      if (!isPrivateContext) {
        writeResponseToNodeResponse(response, res);
        return;
      }

      // Private Kontexte: Transfer-State auf die Positivliste reduzieren,
      // bevor das HTML den Server verlässt.
      const body = await response.text();
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'content-length') return;
        res.setHeader(key, value);
      });
      res.status(response.status).send(sanitizeTransferState(body));
    })
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  assertServerEnvironment(serverEnvironment);

  const port = serverEnvironment.port;
  app.listen(port, (error) => {
    if (error) throw error;
    console.log(`Node Express server listening on http://localhost:${port}`);
    console.log(
      `Keycloak-Realm ${serverEnvironment.keycloakRealm}, Fachservice ${serverEnvironment.springApiBaseUrl}`,
    );
  });
}

export const reqHandler = createNodeRequestHandler(app);
