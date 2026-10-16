import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { stammtischImageUrl } from './stammtisch-api.service';

/** Bis zu zwei Initialen aus dem Gruppennamen (`Mein Stammtisch` → `MS`). */
export function groupInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return Array.from(parts[0])[0].toUpperCase();
  return (Array.from(parts[0])[0] + Array.from(parts[parts.length - 1])[0]).toUpperCase();
}

/**
 * Rundes Bild einer Gruppe (Stammtisch); ohne Bild oder wenn es nicht lädt,
 * die Initialen des Namens. Steht meist neben dem Namen und ist dann
 * schmückend (`alt=""`); allein stehend kann `label` den Alternativtext geben.
 */
@Component({
  selector: 'vereint-group-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'group-avatar',
    '[style.--group-avatar-size]': 'size()',
  },
  template: `
    @if (src(); as url) {
      <img class="group-avatar-img" [src]="url" [attr.alt]="label()" loading="lazy" decoding="async" (error)="failed.set(true)" />
    } @else {
      <span class="group-avatar-fallback" [attr.aria-hidden]="label() ? null : 'true'" [attr.aria-label]="label() || null" [attr.role]="label() ? 'img' : null">{{ initials() }}</span>
    }
  `,
  styles: [
    `
      :host {
        --group-avatar-size: 2.5rem;
        display: inline-flex;
        flex: 0 0 auto;
        width: var(--group-avatar-size);
        height: var(--group-avatar-size);
        border-radius: 999px;
        overflow: hidden;
      }
      .group-avatar-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .group-avatar-fallback {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        background-color: var(--color-brand);
        color: #ffffff;
        font-weight: 800;
        font-size: calc(var(--group-avatar-size) * 0.4);
        line-height: 1;
        user-select: none;
      }
    `,
  ],
})
export class GroupAvatarComponent {
  readonly groupId = input.required<string>();
  readonly name = input('');
  readonly imageVersion = input<number | null | undefined>(null);
  /** CSS-Länge, z. B. `1.75rem`. */
  readonly size = input('2.5rem');
  /** Alternativtext; leer = schmückend. */
  readonly label = input('');

  protected readonly failed = signal(false);
  protected readonly initials = computed(() => groupInitials(this.name()));
  protected readonly src = computed(() => (this.failed() ? null : stammtischImageUrl(this.groupId(), this.imageVersion())));

  constructor() {
    // Neue Version oder andere Gruppe: einen neuen Ladeversuch erlauben.
    effect(() => {
      this.groupId();
      this.imageVersion();
      this.failed.set(false);
    });
  }
}
