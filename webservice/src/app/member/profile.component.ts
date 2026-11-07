import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { describeApiError } from '../api/api-client.service';
import { AsyncState } from './async-state';
import { MemberApiService } from './member-api.service';
import { formatDateTime } from './member-format';
import { activeLocale, translate } from '../i18n/i18n.service';
import type { MemberProfile, UpdateProfilePayload } from '../api/api.types';
import { AvatarBadgeComponent, RoleChipComponent } from '../ui';
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
    AvatarBadgeComponent,
    RoleChipComponent,
    IconComponent,
    StateComponent,
    TranslatePipe,
    PwaSettingsComponent,
  ],
  templateUrl: './profile.component.html',
  styles: [
    `
      .profile-head {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        margin-bottom: var(--space-3);
      }

      .profile-avatar {
        --avatar-size: 3.75rem;
        flex: none;
      }

      .profile-head-text {
        display: grid;
        gap: 0.15rem;
        min-width: 0;
      }

      .profile-name {
        margin: 0;
        font-size: 1.4rem;
        font-weight: 800;
        letter-spacing: -0.01em;
      }

      .profile-email {
        margin: 0;
        overflow: hidden;
        font-size: 0.875rem;
        text-overflow: ellipsis;
      }

      .profile-roles {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.3rem;
      }

      .profile-card {
        display: grid;
        gap: var(--space-2);
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background-color: var(--color-surface);
      }

      .profile-inline {
        display: flex;
        gap: var(--space-1);
      }

      .profile-inline input {
        flex: 1;
        min-width: 0;
      }

      .profile-inline .member-button {
        flex: none;
      }

      .profile-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        padding: 0.8rem var(--space-3);
        border-top: 1px solid var(--color-border);
      }

      .profile-toggle-text {
        display: grid;
        gap: 0.1rem;
      }

      .profile-toggle-text .member-muted {
        font-size: 0.8rem;
      }

      .profile-toggle-title {
        color: var(--color-text);
        font-size: 0.95rem;
        font-weight: 700;
      }

      .profile-section-title {
        color: var(--color-text);
        font-weight: 700;
      }

      .profile-theme {
        display: grid;
        gap: 0.5rem;
        margin: var(--space-3) 0 0;
      }

      .profile-theme-options {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.25rem;
        padding: 0.25rem;
        border-radius: 0.65rem;
        background-color: var(--color-surface-muted);
      }

      .profile-theme-option,
      .profile-language-option {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        min-height: 2.25rem;
        border: none;
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--color-text-muted);
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
      }

      .profile-theme-option[aria-checked='true'],
      .profile-language-option[aria-checked='true'] {
        background-color: var(--color-surface);
        color: var(--color-text);
        font-weight: 700;
        box-shadow: var(--vereint-shadow);
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

  /** Datum ohne Uhrzeit („17.10.2026“). */
  protected formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'medium' }).format(date);
  }

  /** Systemrollen übersetzt („Mitglied“), eigene Rollen mit ihrem Code. */
  protected roleLabel(code: string): string {
    const key = `admin.roles.${code}`;
    const label = translate(key);
    return label === key ? code : label;
  }
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
