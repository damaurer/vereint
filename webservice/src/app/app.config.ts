import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideOptimus } from '@openng/optimus-ui/config';
import Aura from '@openng/optimus-ui-themes/aura';
import { acceptLanguageInterceptor } from './i18n/accept-language.interceptor';
import { I18nService } from './i18n/i18n.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    // `withFetch`: same-origin-Aufrufe an den Express-Auslieferungs-Proxy
    // (`/api/v1`) senden die HttpOnly-Session automatisch mit.
    provideHttpClient(withFetch(), withInterceptors([acceptLanguageInterceptor])),
    // Sprache vor dem ersten Rendern festlegen, damit SSR und Hydration denselben
    // Text sehen und nichts sichtbar umspringt.
    provideAppInitializer(() => inject(I18nService).init()),
    provideOptimus({ theme: { preset: Aura } }),
  ],
};
