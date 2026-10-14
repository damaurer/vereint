import { DEFAULT_LANGUAGE, findLanguage, negotiateLanguage } from './languages';

/**
 * Cookie mit der ausdrücklich gewählten Sprache. Kein Geheimnis und bewusst nicht
 * HttpOnly: Browser, SSR und BFF (Sprache der Keycloak-Anmeldung) lesen ihn.
 */
export const LANGUAGE_COOKIE = 'vereint.lang';

export function readCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Sprache einer Anfrage ohne Angular (Express/BFF): Cookie vor `Accept-Language`,
 * sonst Deutsch.
 */
export function requestLanguage(cookieHeader: string | undefined, acceptLanguage: string | undefined): string {
  const stored = findLanguage(readCookie(cookieHeader ?? '', LANGUAGE_COOKIE));
  if (stored) return stored.code;
  return acceptLanguage ? negotiateLanguage(acceptLanguage) : DEFAULT_LANGUAGE;
}
