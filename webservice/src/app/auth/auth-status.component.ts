import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';
import { AuthService } from './auth.service';
import { LegalLinksComponent } from '../legal/legal-links.component';

export type AuthStatusMode = 'error' | 'loggedOut';

@Component({
  selector: 'app-auth-status',
  imports: [RouterLink, TranslatePipe, LegalLinksComponent],
  templateUrl: './auth-status.component.html',
  styleUrl: './auth-status.component.css',
})
export class AuthStatusComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly mode = computed<AuthStatusMode>(() => {
    return (this.route.snapshot.data['mode'] as AuthStatusMode | undefined) ?? 'error';
  });

  protected readonly isError = computed(() => this.mode() === 'error');

  protected readonly title = computed(() => {
    return translate(this.isError() ? 'auth.status.loginFailed' : 'auth.status.loggedOutTitle');
  });

  protected readonly errorMessage = computed(() => {
    const code = this.route.snapshot.queryParamMap.get('error');
    return this.auth.describeError(code);
  });

  protected retryLogin(): void {
    if (this.auth.isAvailable()) {
      this.auth.startLogin();
    }
  }
}
