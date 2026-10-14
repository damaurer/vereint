import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { I18nService } from './i18n.service';

/**
 * Schickt die gewählte App-Sprache an die eigene API, damit Fehlermeldungen des
 * Fachservice in derselben Sprache zurückkommen. Fremde Ursprünge bleiben unberührt.
 */
export const acceptLanguageInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const language = inject(I18nService).language();
  return next(req.clone({ setHeaders: { 'Accept-Language': language } }));
};
