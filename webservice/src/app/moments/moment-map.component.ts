import { Component, computed, input, signal } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import type { GeoJsonFeatureDto, MomentMapGeoJsonDto } from '../api/api.types';
import { formatDateTime } from '../member/member-format';

interface MapPin {
  id: string;
  name: string;
  reaction: string;
  statusText?: string;
  createdAt?: string;
  latitude: number;
  longitude: number;
  x: number;
  y: number;
}

/**
 * Interaktive Weltkarte / Kartenvisualisierung für Gemeinschaftsmomente (RFC 7946 GeoJSON).
 *
 * Rendert Positions-Pins für alle Teilnehmer, die der Standortfreigabe (Opt-in)
 * zugestimmt haben, auf einer responsiven SVG-Kartenprojektion.
 */
@Component({
  selector: 'app-moment-map',
  imports: [IconComponent],
  template: `
    <section class="moment-map-section" aria-label="Weltkarte der Teilnehmer">
      <div class="map-header">
        <div>
          <h3 class="map-title">Interaktive Teilnehmerkarte</h3>
          <p class="map-subtitle">
            Standorte von Teilnehmern mit aktiver Standortfreigabe (Opt-in).
          </p>
        </div>
        <span class="map-badge">{{ pins().length }} Standorte</span>
      </div>

      @if (pins().length === 0) {
        <div class="map-empty" role="status">
          <vereint-icon class="map-empty-icon" name="location" />
          <strong>Keine Standorte geteilt</strong>
          <p>
            Für diesen Moment liegen keine Standortdaten vor. Standorte werden DSGVO-konform
            ausschließlich mit freiwilliger Freigabe (Opt-in) erfasst.
          </p>
        </div>
      } @else {
        <div class="map-container">
          <svg
            class="world-map-svg"
            viewBox="0 0 800 450"
            role="img"
            aria-label="Weltkarte mit Teilnehmer-Pins"
          >
            <defs>
              <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
              </pattern>
              <radialGradient id="ocean-grad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#181816" />
                <stop offset="100%" stop-color="#0E0E0C" />
              </radialGradient>
              <filter id="pin-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <!-- Hintergrund Ozean & Koordinatennetz -->
            <rect width="800" height="450" fill="url(#ocean-grad)" rx="12" />
            <rect width="800" height="450" fill="url(#grid-pattern)" rx="12" />

            <!-- Äquator & Nullmeridian -->
            <line x1="0" y1="225" x2="800" y2="225" stroke="rgba(242, 182, 0, 0.2)" stroke-dasharray="4,4" />
            <line x1="400" y1="0" x2="400" y2="450" stroke="rgba(242, 182, 0, 0.2)" stroke-dasharray="4,4" />

            <!-- Kontinent-Silhouetten (schematische Weltkarte) -->
            <g class="landmasses" fill="var(--color-surface-raised)" stroke="var(--color-border)" stroke-width="1.2">
              <!-- Nordamerika -->
              <path d="M 120 70 Q 180 50 250 80 Q 280 120 250 170 Q 180 190 140 140 Z" />
              <!-- Südamerika -->
              <path d="M 230 210 Q 290 230 280 320 Q 240 370 210 330 Q 200 250 230 210 Z" />
              <!-- Europa -->
              <path d="M 370 80 Q 450 70 470 120 Q 420 150 380 130 Z" />
              <!-- Afrika -->
              <path d="M 370 150 Q 480 160 460 270 Q 420 330 380 290 Q 350 210 370 150 Z" />
              <!-- Asien -->
              <path d="M 470 70 Q 650 60 700 140 Q 640 220 540 180 Q 480 140 470 70 Z" />
              <!-- Australien & Ozeanien -->
              <path d="M 620 260 Q 720 270 700 340 Q 630 350 620 290 Z" />
            </g>

            <!-- Teilnehmer Pins -->
            @for (pin of pins(); track pin.id) {
              <g
                class="map-pin-group"
                [class.is-selected]="selectedPin()?.id === pin.id"
                (click)="selectPin(pin)"
                tabindex="0"
                role="button"
                [attr.aria-label]="pin.name + ' (' + pin.reaction + ')'"
                (keydown.enter)="selectPin(pin)"
                (keydown.space)="selectPin(pin)"
              >
                <!-- Pulsierender Kreis -->
                <circle
                  [attr.cx]="pin.x"
                  [attr.cy]="pin.y"
                  r="12"
                  class="pin-pulse"
                />
                <!-- Pin Kern -->
                <circle
                  [attr.cx]="pin.x"
                  [attr.cy]="pin.y"
                  r="6"
                  class="pin-core"
                  filter="url(#pin-glow)"
                />
                <!-- Pin Emoji / Text -->
                <text
                  [attr.x]="pin.x"
                  [attr.y]="pin.y - 12"
                  text-anchor="middle"
                  class="pin-label"
                >
                  {{ getEmoji(pin.reaction) }} {{ pin.name }}
                </text>
              </g>
            }
          </svg>

          <!-- Detailkarte für ausgewählten Pin -->
          @if (selectedPin(); as active) {
            <div class="pin-popup" role="dialog" aria-label="Pin Details">
              <div class="pin-popup-head">
                <span class="pin-popup-title">
                  {{ getEmoji(active.reaction) }} {{ active.name }}
                </span>
                <button
                  type="button"
                  class="pin-popup-close"
                  aria-label="Schließen"
                  (click)="clearSelection()"
                >
                  <vereint-icon name="close" />
                </button>
              </div>

              @if (active.statusText) {
                <p class="pin-popup-text">„{{ active.statusText }}“</p>
              }

              <div class="pin-popup-meta">
                <span class="pin-coords">
                  <vereint-icon name="location" /> {{ active.latitude.toFixed(4) }}°, {{ active.longitude.toFixed(4) }}°
                </span>
                @if (active.createdAt) {
                  <span class="pin-time">{{ formatTime(active.createdAt) }}</span>
                }
              </div>
            </div>
          }
        </div>

        <!-- Standorte Liste -->
        <div class="pin-list-container">
          <h4 class="pin-list-title">Geteilte Standorte</h4>
          <ul class="pin-list">
            @for (pin of pins(); track pin.id) {
              <li
                class="pin-list-item"
                [class.is-active]="selectedPin()?.id === pin.id"
                (click)="selectPin(pin)"
              >
                <span class="pin-list-icon">{{ getEmoji(pin.reaction) }}</span>
                <div class="pin-list-info">
                  <span class="pin-list-name">{{ pin.name }}</span>
                  <span class="pin-list-coords">
                    {{ pin.latitude.toFixed(2) }}° N, {{ pin.longitude.toFixed(2) }}° E
                  </span>
                </div>
                @if (pin.statusText) {
                  <span class="pin-list-snippet">{{ pin.statusText }}</span>
                }
              </li>
            }
          </ul>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .moment-map-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .map-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-2);
        border-bottom: 1px solid var(--color-border);
        padding-bottom: var(--space-2);
      }
      .map-title {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .map-subtitle {
        margin: 0.2rem 0 0;
        font-size: 0.85rem;
        color: var(--color-text-muted);
      }
      .map-badge {
        font-size: 0.85rem;
        font-weight: 600;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        background-color: var(--color-brand-soft);
        color: var(--color-brand);
        border: 1px solid var(--color-brand);
        white-space: nowrap;
      }
      .map-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2.5rem 1.5rem;
        text-align: center;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px dashed var(--color-border);
        gap: 0.5rem;
      }
      .map-empty-icon {
        font-size: 2.5rem;
      }
      .map-empty strong {
        color: var(--color-text);
        font-size: 1rem;
      }
      .map-empty p {
        margin: 0;
        font-size: 0.85rem;
        max-width: 32rem;
        color: var(--color-text-muted);
      }
      .map-container {
        position: relative;
        width: 100%;
        border-radius: var(--radius-md);
        overflow: hidden;
        border: 1px solid var(--color-border);
        background-color: var(--color-surface);
      }
      .world-map-svg {
        display: block;
        width: 100%;
        height: auto;
        aspect-ratio: 800 / 450;
      }
      .landmasses path {
        transition: fill 0.2s ease;
      }
      .map-pin-group {
        cursor: pointer;
        outline: none;
      }
      .pin-pulse {
        fill: rgba(242, 182, 0, 0.25);
        animation: pin-pulse-anim 2s infinite ease-out;
      }
      .pin-core {
        fill: var(--color-brand);
        stroke: #fff;
        stroke-width: 1.5;
        transition: transform 0.2s ease, fill 0.2s ease;
      }
      .map-pin-group:hover .pin-core,
      .map-pin-group.is-selected .pin-core {
        fill: var(--color-brand-strong);
        transform: scale(1.3);
        transform-origin: center;
      }
      .pin-label {
        font-size: 11px;
        font-weight: 700;
        fill: var(--color-text);
        paint-order: stroke;
        stroke: #000;
        stroke-width: 3px;
        stroke-linecap: round;
        stroke-linejoin: round;
        pointer-events: none;
      }
      @keyframes pin-pulse-anim {
        0% {
          r: 6;
          opacity: 1;
        }
        100% {
          r: 20;
          opacity: 0;
        }
      }
      .pin-popup {
        position: absolute;
        bottom: 1rem;
        left: 1rem;
        right: 1rem;
        padding: 0.75rem 1rem;
        border-radius: var(--radius-md);
        background-color: rgba(20, 20, 18, 0.95);
        backdrop-filter: blur(8px);
        border: 1px solid var(--color-brand);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .pin-popup-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .pin-popup-title {
        font-weight: 700;
        font-size: 0.95rem;
        color: var(--color-text);
      }
      .pin-popup-close {
        border: none;
        background: transparent;
        color: var(--color-text-muted);
        cursor: pointer;
        font-size: 1rem;
        padding: 0.2rem;
      }
      .pin-popup-text {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-text);
        font-style: italic;
      }
      .pin-popup-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.75rem;
        color: var(--color-text-muted);
        font-family: monospace;
      }
      .pin-list-container {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .pin-list-title {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .pin-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
        gap: 0.5rem;
      }
      .pin-list-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        border: 1px solid var(--color-border);
        cursor: pointer;
        transition: border-color 0.2s ease;
      }
      .pin-list-item:hover,
      .pin-list-item.is-active {
        border-color: var(--color-brand);
      }
      .pin-list-icon {
        font-size: 1.2rem;
      }
      .pin-list-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .pin-list-name {
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--color-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .pin-list-coords {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        font-family: monospace;
      }
      .pin-list-snippet {
        margin-left: auto;
        font-size: 0.75rem;
        color: var(--color-text-muted);
        font-style: italic;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 5rem;
      }
    `,
  ],
})
export class MomentMapComponent {
  readonly mapData = input<MomentMapGeoJsonDto | null>(null);
  readonly sessionTitle = input<string>('');

  protected readonly selectedPin = signal<MapPin | null>(null);

  /** Berechnet die projizierten Karten-Pins aus den GeoJSON Features. */
  protected readonly pins = computed<MapPin[]>(() => {
    const data = this.mapData();
    if (!data?.features) return [];

    return data.features
      .filter((f): f is GeoJsonFeatureDto => Array.isArray(f?.geometry?.coordinates))
      .map((f, idx) => {
        const [lon, lat] = f.geometry.coordinates;
        // Equirectangular Projection: x: -180..180 -> 0..800, y: 90..-90 -> 0..450
        const x = Math.max(10, Math.min(790, ((lon + 180) / 360) * 800));
        const y = Math.max(10, Math.min(440, ((90 - lat) / 180) * 450));

        const props = f.properties || {};
        const name = (props['userName'] || props['name'] || `Teilnehmer ${idx + 1}`) as string;
        const reaction = (props['reaction'] || 'TOAST') as string;
        const statusText = props['statusText'] as string | undefined;
        const createdAt = props['createdAt'] as string | undefined;

        return {
          id: `pin-${idx}-${lon}-${lat}`,
          name,
          reaction,
          statusText,
          createdAt,
          latitude: lat,
          longitude: lon,
          x,
          y,
        };
      });
  });

  protected selectPin(pin: MapPin): void {
    this.selectedPin.set(pin);
  }

  protected clearSelection(): void {
    this.selectedPin.set(null);
  }

  protected formatTime(iso: string): string {
    return formatDateTime(iso);
  }

  protected getEmoji(reaction: string): string {
    const r = reaction.toUpperCase();
    switch (r) {
      case 'TOAST':
      case 'CHEERS':
        return '🍻';
      case 'PRAYER':
        return '🙏';
      case 'CHEER':
        return '📣';
      case 'THUMBS_UP':
        return '👍';
      case 'CELEBRATE':
        return '🎉';
      case 'HEART':
        return '❤️';
      case 'CHECKIN':
        return '📍';
      default:
        return '✨';
    }
  }
}
