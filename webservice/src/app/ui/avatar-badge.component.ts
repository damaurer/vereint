import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Rundes Avatar mit Initialen-Fallback (TICKET-032).
 *
 * Zeigt ein Bild, wenn `imageUrl` gesetzt ist; andernfalls die aus dem Namen
 * abgeleiteten Initialen. Reine Präsentation ohne eigene Datenabfrage.
 */
@Component({
  selector: 'vereint-avatar-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (imageUrl) {
      <img class="ui-avatar" [src]="imageUrl" [alt]="name" />
    } @else {
      <span class="ui-avatar ui-avatar-fallback" aria-hidden="true">{{ initials }}</span>
    }
  `,
})
export class AvatarBadgeComponent {
  @Input() name = '';
  @Input() imageUrl: string | null = null;

  /** Bis zu zwei Initialen aus dem Namen. */
  get initials(): string {
    const parts = this.name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
}
