import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';

export const HOME_ROUTE = '/dashboard';

/**
 * Anmeldeeinstieg.
 *
 * Die Anmeldung selbst findet in Keycloak statt: Die Ansicht startet
 * ausschließlich den serverseitigen OIDC-Flow (`GET /api/auth/login`). Es
 * werden keine Anmeldedaten im Browser verarbeitet und keine Tokens
 * gespeichert.
 */
@Component({
  selector: 'app-login',
  imports: [RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const code = this.route.snapshot.queryParamMap.get('error');
    if (code) {
      this.error.set(this.auth.describeError(code));
    }
  }

  /** Ziel nach erfolgreicher Anmeldung; Express prüft den Wert erneut. */
  protected returnUrl(): string {
    return this.route.snapshot.queryParamMap.get('returnUrl') ?? HOME_ROUTE;
  }

  protected startLogin(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;

    if (!this.auth.isAvailable()) {
      this.error.set('Der Anmeldedienst ist auf diesem Gerät nicht verfügbar.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      this.auth.startLogin(this.returnUrl());
    } catch (error) {
      this.busy.set(false);
      this.error.set(this.auth.describeError(error));
    }
  }
}
