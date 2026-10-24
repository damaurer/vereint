import {
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import type * as Leaflet from 'leaflet';
import { IconComponent } from '../ui/icon.component';
import type { GeoJsonFeatureDto, MomentMapGeoJsonDto, MomentReactionDto } from '../api/api.types';
import { formatDateTime } from '../member/member-format';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';

/** Lädt Leaflet erst im Browser (SSR kennt kein `window`); in Tests ersetzbar. */
export const LEAFLET_LOADER = new InjectionToken<() => Promise<typeof Leaflet>>('LEAFLET_LOADER', {
  providedIn: 'root',
  // Leaflet ist ein CommonJS-Paket: je nach Bundler liegt es unter `default`.
  factory: () => () =>
    import('leaflet').then(
      (module) => (module as typeof Leaflet & { default?: typeof Leaflet }).default ?? module,
    ),
});

/**
 * Leaflet-Stylesheet als eigenes Bundle (`angular.json`, `inject: false`):
 * Es wird erst geladen, wenn jemand eine Karte öffnet.
 */
export const LEAFLET_STYLESHEET = 'leaflet.css';

/** Hängt das Leaflet-Stylesheet einmalig in den Dokumentkopf. */
function ensureLeafletStylesheet(doc: Document): void {
  if (doc.querySelector('link[data-leaflet]')) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = LEAFLET_STYLESHEET;
  link.dataset['leaflet'] = '';
  doc.head.append(link);
}

/** Kachelserver der Karte; muss in der Content-Security-Policy (`img-src`) stehen. */
export const MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Engster Zoom, damit eng beieinander liegende Pins nicht auf Hausnummer-Ebene landen. */
export const MAX_FIT_ZOOM = 15;
/** Zoom für genau einen geteilten Standort (Stadtteil). */
export const SINGLE_PIN_ZOOM = 14;

export interface MapPin {
  id: string;
  name: string;
  /** `session_initiator` (Starter des Moments) oder `response`. */
  kind: string;
  reaction: string | null;
  statusText?: string;
  createdAt?: string;
  latitude: number;
  longitude: number;
}

/**
 * Ausschnitt, der alle Pins zeigt: bei einem Pin ein fester Zoom um ihn
 * herum, sonst die Begrenzung aller Pins (Leaflet `fitBounds`).
 */
export function mapViewFor(
  pins: readonly Pick<MapPin, 'latitude' | 'longitude'>[],
):
  | { kind: 'none' }
  | { kind: 'point'; center: [number, number]; zoom: number }
  | { kind: 'bounds'; southWest: [number, number]; northEast: [number, number] } {
  if (pins.length === 0) return { kind: 'none' };
  const lats = pins.map((pin) => pin.latitude);
  const lngs = pins.map((pin) => pin.longitude);
  const southWest: [number, number] = [Math.min(...lats), Math.min(...lngs)];
  const northEast: [number, number] = [Math.max(...lats), Math.max(...lngs)];
  if (southWest[0] === northEast[0] && southWest[1] === northEast[1]) {
    return { kind: 'point', center: southWest, zoom: SINGLE_PIN_ZOOM };
  }
  return { kind: 'bounds', southWest, northEast };
}

/**
 * Karte der geteilten Standorte eines Moments (RFC 7946 GeoJSON).
 *
 * Zeigt OpenStreetMap-Kacheln über Leaflet und zoomt immer auf den Bereich,
 * in dem alle Teilnehmer mit Standortfreigabe (Opt-in) liegen, statt die
 * ganze Welt zu zeigen.
 */
@Component({
  selector: 'app-moment-map',
  imports: [IconComponent, TranslatePipe],
  template: `
    <section class="moment-map-section" [attr.aria-label]="'moments.map.ariaLabel' | t">
      <div class="map-header">
        <div>
          <h3 class="map-title">{{ 'moments.map.title' | t }}</h3>
          <p class="map-subtitle">{{ 'moments.map.subtitle' | t }}</p>
        </div>
        <span class="map-badge">{{ 'moments.map.count' | t: { count: pins().length } }}</span>
      </div>

      @if (pins().length === 0) {
        <div class="map-empty" role="status">
          <vereint-icon class="map-empty-icon" name="location" />
          <strong>{{ 'moments.map.emptyTitle' | t }}</strong>
          <p>{{ 'moments.map.emptyMessage' | t }}</p>
        </div>
      } @else {
        <div
          #mapHost
          class="map-canvas"
          role="application"
          [attr.aria-label]="'moments.map.ariaLabel' | t"
        ></div>

        <!-- Standorte Liste -->
        <div class="pin-list-container">
          <h4 class="pin-list-title">{{ 'moments.map.listTitle' | t }}</h4>
          <ul class="pin-list">
            @for (pin of pins(); track pin.id) {
              <li>
                <button
                  type="button"
                  class="pin-list-item"
                  [class.is-active]="selectedPinId() === pin.id"
                  (click)="focusPin(pin)"
                >
                  <span
                    class="pin-list-icon"
                    [class.is-initiator]="pin.kind === 'session_initiator'"
                  >
                    {{ emojiFor(pin) }}
                  </span>
                  <span class="pin-list-info">
                    <span class="pin-list-name">{{ pin.name }}</span>
                    <span class="pin-list-coords">{{ formatCoordinates(pin) }}</span>
                  </span>
                  @if (pin.statusText) {
                    <span class="pin-list-snippet">{{ pin.statusText }}</span>
                  }
                </button>
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
        color: var(--color-brand-strong);
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
        color: var(--color-brand);
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
      .map-canvas {
        width: 100%;
        height: clamp(16rem, 55vh, 28rem);
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        overflow: hidden;
        background-color: var(--color-surface-raised);
        /* Leaflet-Ebenen bleiben unter Dialogen und der App-Navigation. */
        position: relative;
        z-index: 0;
      }
      .pin-list-container {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .pin-list-title {
        margin: 0;
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .pin-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .pin-list-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        padding: 0.5rem 0.75rem;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .pin-list-item:hover,
      .pin-list-item.is-active {
        border-color: var(--color-brand);
        background-color: var(--color-brand-soft);
      }
      .pin-list-icon {
        display: grid;
        place-items: center;
        flex: none;
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
        background-color: var(--color-surface);
        border: 2px solid var(--color-brand);
        font-size: 1rem;
      }
      .pin-list-icon.is-initiator {
        border-color: var(--color-accent);
      }
      .pin-list-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .pin-list-name {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-text);
      }
      .pin-list-coords {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
      .pin-list-snippet {
        margin-left: auto;
        font-size: 0.75rem;
        color: var(--color-text-muted);
        font-style: italic;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 40%;
      }

      /* Leaflet erzeugt Marker und Popups außerhalb der Komponentenvorlage. */
      :host ::ng-deep .moment-pin {
        display: grid;
        place-items: center;
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 50%;
        background-color: var(--color-surface);
        border: 3px solid var(--color-brand);
        box-shadow: var(--vereint-shadow);
        font-size: 1.1rem;
        line-height: 1;
      }
      :host ::ng-deep .moment-pin.is-initiator {
        border-color: var(--color-accent);
        width: 2.6rem;
        height: 2.6rem;
        font-size: 1.3rem;
      }
      :host ::ng-deep .moment-pin.is-active {
        transform: scale(1.15);
        box-shadow: 0 0 0 4px var(--color-brand-soft);
      }
      :host ::ng-deep .moment-popup strong {
        display: block;
        font-size: 0.85rem;
      }
      :host ::ng-deep .moment-popup p {
        margin: 0.2rem 0 0;
        font-size: 0.8rem;
      }
      :host ::ng-deep .moment-popup small {
        display: block;
        margin-top: 0.25rem;
        color: #6b7280;
        font-size: 0.72rem;
      }
    `,
  ],
})
export class MomentMapComponent {
  readonly mapData = input<MomentMapGeoJsonDto | null>(null);
  readonly sessionTitle = input<string>('');
  /** Vom Vorstand gepflegte Reaktionen, für die Emojis der Pins. */
  readonly reactions = input<MomentReactionDto[]>([]);

  private readonly loadLeaflet = inject(LEAFLET_LOADER);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly mapHost = viewChild<ElementRef<HTMLDivElement>>('mapHost');

  private leaflet: typeof Leaflet | null = null;
  private map: Leaflet.Map | null = null;
  private mapElement: HTMLElement | null = null;
  private markers = new Map<string, Leaflet.Marker>();
  /** Verwirft veraltete Läufe, wenn sich die Daten während des Ladens ändern. */
  private renderRun = 0;

  protected readonly selectedPinId = signal<string | null>(null);

  /** Pins aus den GeoJSON-Features. */
  protected readonly pins = computed<MapPin[]>(() => {
    const data = this.mapData();
    if (!data?.features) return [];

    return data.features
      .filter((f): f is GeoJsonFeatureDto => Array.isArray(f?.geometry?.coordinates))
      .map((f, idx) => {
        const [lon, lat] = f.geometry.coordinates;
        const props = f.properties || {};
        const name = (props['userName'] ||
          props['name'] ||
          translate('moments.map.fallbackName', { number: idx + 1 })) as string;
        return {
          id: String(props['id'] ?? `pin-${idx}-${lon}-${lat}`),
          name,
          kind: String(props['type'] ?? 'response'),
          reaction: (props['reaction'] as string | null | undefined) ?? null,
          statusText: (props['statusText'] as string | undefined) ?? undefined,
          createdAt: props['createdAt'] as string | undefined,
          latitude: lat,
          longitude: lon,
        };
      });
  });

  constructor() {
    effect(() => {
      const pins = this.pins();
      const host = this.mapHost()?.nativeElement ?? null;
      // Abhängigkeit für die Emojis der Pins.
      this.reactions();
      if (!this.isBrowser) return;
      void this.render(pins, host);
    });
    inject(DestroyRef).onDestroy(() => this.destroyMap());
  }

  /** Springt in der Karte zum Pin und öffnet dessen Popup. */
  protected focusPin(pin: MapPin): void {
    this.selectedPinId.set(pin.id);
    const marker = this.markers.get(pin.id);
    if (!this.map || !marker) return;
    this.map.setView(marker.getLatLng(), Math.max(this.map.getZoom(), SINGLE_PIN_ZOOM));
    marker.openPopup();
    this.highlightMarker(pin.id);
  }

  protected emojiFor(pin: MapPin): string {
    if (pin.reaction) {
      const configured = this.reactions().find((r) => r.code === pin.reaction);
      if (configured) return configured.emoji;
    }
    return pin.kind === 'session_initiator' ? '⭐' : '📍';
  }

  protected formatCoordinates(pin: MapPin): string {
    const lat = `${Math.abs(pin.latitude).toFixed(2)}° ${translate(pin.latitude >= 0 ? 'moments.map.north' : 'moments.map.south')}`;
    const lng = `${Math.abs(pin.longitude).toFixed(2)}° ${translate(pin.longitude >= 0 ? 'moments.map.east' : 'moments.map.west')}`;
    return `${lat}, ${lng}`;
  }

  private async render(pins: MapPin[], host: HTMLElement | null): Promise<void> {
    const run = ++this.renderRun;
    if (!host || pins.length === 0) {
      this.destroyMap();
      return;
    }
    ensureLeafletStylesheet(this.document);
    const L = this.leaflet ?? (this.leaflet = await this.loadLeaflet());
    if (run !== this.renderRun) return;

    if (this.map && this.mapElement !== host) this.destroyMap();
    if (!this.map) {
      this.map = L.map(host, { scrollWheelZoom: false, worldCopyJump: true });
      this.mapElement = host;
      L.tileLayer(MAP_TILE_URL, {
        maxZoom: 19,
        attribution: `&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>`,
      }).addTo(this.map);
    }
    const map = this.map;

    this.markers.forEach((marker) => marker.remove());
    this.markers.clear();
    for (const pin of pins) {
      const marker = L.marker([pin.latitude, pin.longitude], {
        icon: L.divIcon({
          className: '',
          html: this.markerHtml(pin),
          iconSize: [40, 40],
          iconAnchor: [20, 20],
          popupAnchor: [0, -18],
        }),
        title: pin.name,
        keyboard: true,
      })
        .bindPopup(this.popupContent(pin))
        .on('click', () => {
          this.selectedPinId.set(pin.id);
          this.highlightMarker(pin.id);
        })
        .addTo(map);
      this.markers.set(pin.id, marker);
    }

    const view = mapViewFor(pins);
    if (view.kind === 'point') {
      map.setView(view.center, view.zoom);
    } else if (view.kind === 'bounds') {
      map.fitBounds(L.latLngBounds(view.southWest, view.northEast), {
        padding: [36, 36],
        maxZoom: MAX_FIT_ZOOM,
      });
    }
    // Der Container kann gerade erst sichtbar geworden sein (Tab-Wechsel).
    setTimeout(() => map.invalidateSize());
  }

  /** Nur Emoji und feste Klassen; Namen und Texte stehen im Popup als Textknoten. */
  private markerHtml(pin: MapPin): string {
    const classes = ['moment-pin'];
    if (pin.kind === 'session_initiator') classes.push('is-initiator');
    const emoji = document.createElement('span');
    emoji.textContent = this.emojiFor(pin);
    return `<span class="${classes.join(' ')}" data-pin="${encodeURIComponent(pin.id)}">${emoji.innerHTML}</span>`;
  }

  private popupContent(pin: MapPin): HTMLElement {
    const root = document.createElement('div');
    root.className = 'moment-popup';
    const name = document.createElement('strong');
    name.textContent =
      pin.kind === 'session_initiator'
        ? `${pin.name} · ${translate('moments.map.initiator')}`
        : pin.name;
    root.append(name);
    const text = pin.kind === 'session_initiator' ? this.sessionTitle() : pin.statusText;
    if (text) {
      const p = document.createElement('p');
      p.textContent = text;
      root.append(p);
    }
    if (pin.createdAt) {
      const time = document.createElement('small');
      time.textContent = formatDateTime(pin.createdAt);
      root.append(time);
    }
    return root;
  }

  private highlightMarker(pinId: string): void {
    this.markers.forEach((marker, id) => {
      marker
        .getElement()
        ?.querySelector('.moment-pin')
        ?.classList.toggle('is-active', id === pinId);
    });
  }

  private destroyMap(): void {
    this.markers.clear();
    this.map?.remove();
    this.map = null;
    this.mapElement = null;
  }
}
