import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { describeApiError } from '../api/api-client.service';
import { AsyncState } from './async-state';
import { MemberApiService } from './member-api.service';
import { formatDateTime } from './member-format';
import type { MemberProfile, UpdateProfilePayload } from '../api/api.types';
import { HeroGreetingComponent, RoleChipComponent } from '../ui';
import { IconComponent } from '../ui/icon.component';
import { StateComponent } from '../ui/state.component';
import { ThemeService, type ThemePreference } from '../shell/theme.service';
import { PwaSettingsComponent } from '../pwa/pwa-settings.component';
import { I18nService, TranslatePipe } from '../i18n';

/**
 * Persönliches Profil eines Mitglieds (TICKET-024, Redesign TICKET-033).
 *
 * Zeigt die serverseitig aufgelösten Profildaten (Avatar/Hero, Rollen-Chips,
 * persönliche Angaben) über die geteilten UI-Primitive und erlaubt die Pflege
 * von Anzeigename und E-Mail. Rollen, Status und Berechtigungen sind reine
 * Anzeige; ihre Vergabe erfolgt ausschließlich administrativ im Fachservice.
 * Der `BeerWithMe`-Schalter (Standortfreigabe) ist rein clientseitig und löst
 * keine serverseitige Mutation aus.
 */
@Component({
  selector: 'app-member-profile',
  imports: [
    HeroGreetingComponent,
    RoleChipComponent,
    IconComponent,
    StateComponent,
    TranslatePipe,
    PwaSettingsComponent,
  ],
  templateUrl: './profile.component.html',
  styles: [
    `
      .profile-roles {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin: 0.25rem 0 var(--space-3);
      }

      .profile-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        padding: var(--space-3);
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
      }

      .profile-toggle-text {
        display: grid;
        gap: 0.2rem;
      }

      .profile-toggle-title {
        color: var(--color-text);
        font-weight: 700;
      }

      .profile-theme {
        display: grid;
        gap: 0.5rem;
        margin: var(--space-3) 0 0;
        padding: var(--space-3);
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
      }

      .profile-theme-options {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.25rem;
        padding: 0.25rem;
        border-radius: 999px;
        background-color: var(--color-bg);
      }

      .profile-theme-option,
      .profile-language-option {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        min-height: 2.75rem;
        border: none;
        border-radius: 999px;
        background: transparent;
        color: var(--color-text-muted);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }

      .profile-theme-option[aria-checked='true'],
      .profile-language-option[aria-checked='true'] {
        background-color: var(--color-surface);
        color: var(--color-brand);
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.15);
      }

      .profile-toggle input {
        width: 1.25rem;
        height: 1.25rem;
        accent-color: var(--color-brand);
      }
    `,
  ],
})
export class ProfileComponent implements OnInit, OnDestroy {
  private readonly api = inject(MemberApiService);
  private readonly theme = inject(ThemeService);
  private readonly i18n = inject(I18nService);

  protected readonly load = new AsyncState<MemberProfile>();
  protected readonly displayName = signal('');
  protected readonly email = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected readonly beerWithMe = signal(false);
  protected readonly formatDateTime = formatDateTime;
  protected readonly themePreference = this.theme.preference;
  protected readonly themeOptions: readonly { value: ThemePreference; labelKey: string }[] = [
    { value: 'system', labelKey: 'profile.theme.system' },
    { value: 'light', labelKey: 'profile.theme.light' },
    { value: 'dark', labelKey: 'profile.theme.dark' },
  ];
  /**
   * Zwei-Faktor-Anmeldung ist freiwillig: Mitglieder richten sie in der
   * Keycloak-Kontoverwaltung ein; der BFF leitet dorthin weiter, weil nur er
   * die Adresse von Keycloak kennt. Danach fragt der Standard-Login den Code
   * automatisch ab.
   */
  protected readonly twoFactorUrl = '/api/auth/account-security';
  protected readonly languages = this.i18n.languages;
  protected readonly language = this.i18n.language;

  protected setTheme(preference: ThemePreference): void {
    this.theme.set(preference);
  }

  protected setLanguage(code: string): void {
    void this.i18n.use(code);
  }

  ngOnInit(): void {
    this.reload();
  }

  /**
   * Schaltet die `BeerWithMe`-Standortfreigabe rein clientseitig um. Der
   * eigentliche Geolocation-Zugriff erfolgt ausschließlich im Browser; es wird
   * kein Serverzustand verändert.
   */
  protected toggleBeerWithMe(): void {
    this.beerWithMe.update((active) => !active);
  }

  ngOnDestroy(): void {
    this.load.destroy();
  }

  protected reload(): void {
    this.saved.set(false);
    this.saveError.set(null);
    this.load.run(this.api.loadProfile(), (profile) => this.applyToForm(profile));
  }

  private applyToForm(profile: MemberProfile): void {
    this.displayName.set(profile.displayName);
    this.email.set(profile.email ?? '');
  }

  protected onDisplayName(value: string): void {
    this.displayName.set(value);
    this.saved.set(false);
  }

  protected onEmail(value: string): void {
    this.email.set(value);
    this.saved.set(false);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.saving()) return;

    const displayName = this.displayName().trim();
    const email = this.email().trim();
    const payload: UpdateProfilePayload = {
      displayName,
      email: email ? email : undefined,
    };

    this.saving.set(true);
    this.saveError.set(null);
    this.saved.set(false);

    this.api.updateProfile(payload).subscribe({
      next: (profile) => {
        this.saving.set(false);
        this.saved.set(true);
        this.load.data.set(profile);
        this.applyToForm(profile);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(describeApiError(error));
      },
    });
  }
}
