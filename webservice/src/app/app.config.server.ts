import { mergeApplicationConfig, ApplicationConfig, CSP_NONCE, inject, REQUEST_CONTEXT } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

/** Vom Express-Server je Anfrage übergebener Kontext (siehe `server.ts`). */
export interface SsrRequestContext {
  cspNonce?: string;
}

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Angulars Inline-Skripte (Event-Replay) erhalten die Nonce der
    // Content-Security-Policy dieser Antwort; ohne sie blockiert der Browser sie.
    {
      provide: CSP_NONCE,
      useFactory: () => (inject(REQUEST_CONTEXT, { optional: true }) as SsrRequestContext | null)?.cspNonce ?? null,
    },
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
