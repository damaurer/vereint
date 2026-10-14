import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { TranslatePipe } from '../i18n';
import { AvatarBadgeComponent } from './avatar-badge.component';

/**
 * Begrüßungs-Hero mit Avatar und optionalem Untertitel (TICKET-032).
 * Wird auf Home/Dashboard über alle Devices geteilt.
 */
@Component({
  selector: 'vereint-hero-greeting',
  standalone: true,
  imports: [AvatarBadgeComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="ui-hero">
      <vereint-avatar-badge [name]="name" [imageUrl]="avatarUrl" />
      <div class="ui-hero-text">
        <p class="ui-hero-eyebrow">{{ eyebrow ?? ('ui.heroGreeting.eyebrow' | t) }}</p>
        <h1 class="ui-hero-title">{{ name }}</h1>
        @if (subtitle) {
          <p class="ui-hero-subtitle">{{ subtitle }}</p>
        }
      </div>
    </header>
  `,
})
export class HeroGreetingComponent {
  @Input() name = '';
  /** Ohne Angabe: „Hallo“ in der aktiven Sprache. */
  @Input() eyebrow: string | null = null;
  @Input() subtitle: string | null = null;
  @Input() avatarUrl: string | null = null;
}
