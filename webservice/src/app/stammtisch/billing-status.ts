import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, Injector, PLATFORM_ID, inject, signal } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { StammtischApiService } from './stammtisch-api.service';

/**
 * Ob der gewählte Stammtisch nur noch lesbar ist (Zahlung überfällig, Kulanzfrist
 * abgelaufen). Speist das Banner der App-Shell; verbindlich sperrt der Fachservice.
 */
@Injectable({ providedIn: 'root' })
export class BillingStatusStore {
  private readonly injector = inject(Injector);

  readonly readOnly = signal(false);

  /** Fragt den Tarif ab; Fehler lassen das Banner einfach aus. */
  refresh(): void {
    this.injector
      .get(StammtischApiService)
      .billing()
      .subscribe({
        next: (billing) => this.readOnly.set(billing.readOnly),
        error: () => undefined,
      });
  }
}

/** Merkt sich eine `stammtisch_read_only`-Ablehnung des Fachservice für das Banner. */
export const readOnlyInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const store = inject(BillingStatusStore);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 403 &&
        (error.error as { code?: unknown } | null)?.code === 'stammtisch_read_only'
      ) {
        store.readOnly.set(true);
      }
      return throwError(() => error);
    }),
  );
};

/** Verlässt die App zu einer fremden Seite (Stripe); nur im Browser. */
@Injectable({ providedIn: 'root' })
export class ExternalNavigation {
  private readonly platformId = inject(PLATFORM_ID);

  assign(url: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    globalThis.location.assign(url);
  }
}
