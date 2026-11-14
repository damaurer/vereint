import { signal } from '@angular/core';
import type { Observable, Subscription } from 'rxjs';
import { describeApiError } from '../api/api-client.service';

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * Kleiner, signalbasierter Ladezustand für die Mitglieder-Ansichten.
 *
 * Kapselt die für mobile Oberflächen geforderten Zustände Laden, Erfolg und
 * Fehler an einer Stelle, damit jede Ansicht sie einheitlich rendert
 * (TICKET-024). Fehler werden über [describeApiError] in neutrale Texte
 * übersetzt (`deny by default`).
 */
export class AsyncState<T> {
  readonly status = signal<AsyncStatus>('idle');
  readonly data = signal<T | null>(null);
  readonly errorMessage = signal<string | null>(null);

  private subscription?: Subscription;

  /**
   * Startet einen Ladevorgang und überführt das Ergebnis in die Signale.
   * `onSuccess` wird nach erfolgreichem Laden mit dem Ergebnis aufgerufen.
   */
  run(source$: Observable<T>, onSuccess?: (value: T) => void): void {
    this.subscription?.unsubscribe();
    this.status.set('loading');
    this.errorMessage.set(null);

    this.subscription = source$.subscribe({
      next: (value) => {
        this.data.set(value);
        this.status.set('success');
        onSuccess?.(value);
      },
      error: (error: unknown) => {
        this.errorMessage.set(describeApiError(error));
        this.status.set('error');
      },
    });
  }

  isLoading(): boolean {
    return this.status() === 'loading';
  }

  isError(): boolean {
    return this.status() === 'error';
  }

  isSuccess(): boolean {
    return this.status() === 'success';
  }

  /** Beendet ein laufendes Abonnement (Aufruf in `ngOnDestroy`). */
  destroy(): void {
    this.subscription?.unsubscribe();
  }
}
