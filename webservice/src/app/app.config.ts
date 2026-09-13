import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideOptimus } from '@openng/optimus-ui/config';
import Aura from '@openng/optimus-ui-themes/aura';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    // `withFetch`: same-origin-Aufrufe an den Express-Auslieferungs-Proxy
    // (`/api/v1`) senden die HttpOnly-Session automatisch mit.
    provideHttpClient(withFetch()),
    provideOptimus({ theme: { preset: Aura } }),
  ],
};
