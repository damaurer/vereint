import {
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import type * as Leaflet from 'leaflet';
import type { MomentWorldMapPinDto } from '../api/api.types';
import { AsyncState } from '../member/async-state';
import { MemberApiService } from '../member/member-api.service';
import { formatShortDate } from '../member/member-format';
import { TranslatePipe } from '../i18n';
import { translate } from '../i18n/i18n.service';
import { IconComponent } from '../ui/icon.component';
import { StateComponent } from '../ui/state.component';
import {
  LEAFLET_LOADER,
  MAP_TILE_URL,
  MAX_FIT_ZOOM,
  ensureLeafletStylesheet,
  mapViewFor,
} from './moment-map.component';

/**
 * Moments an (fast) demselben Ort teilen sich einen Pin, sonst lägen die Pins
 * eines Stammlokals genau übereinander. Drei Nachkommastellen sind rund 100 m.
 */
const PLACE_PRECISION = 3;

export interface WorldMapPlace {
  key: string;
  latitude: number;
  longitude: number;
  /** Neueste zuerst. */
  moments: MomentWorldMapPinDto[];
}

/** Fasst Moments zu Orten zusammen; Position des Orts ist die des neuesten Moments. */
export function groupByPlace(pins: readonly MomentWorldMapPinDto[]): WorldMapPlace[] {
  const places = new Map<string, WorldMapPlace>();
  const sorted = [...pins].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const pin of sorted) {
    const key = `${pin.latitude.toFixed(PLACE_PRECISION)},${pin.longitude.toFixed(PLACE_PRECISION)}`;
    const place = places.get(key);
    if (place) {
      place.moments.push(pin);
    } else {
      places.set(key, { key, latitude: pin.latitude, longitude: pin.longitude, moments: [pin] });
    }
  }
  return [...places.values()];
}

/**
 * Weltkarte aller Moments der Gruppe (laufend und abgeschlossen), die das
 * Mitglied sehen darf. Ein Pin je Ort; ein Tipp öffnet den Moment.
 *
 * Kacheln von OpenStreetMap über Leaflet, ohne API-Key. Standorte gibt es nur
 * mit Opt-in beim Start oder Beitrag.
 */
@Component({
  selector: 'app-moments-world-map',
  imports: [IconComponent, StateComponent, TranslatePipe],
  template: `
    <section class="world-map" [attr.aria-label]="'moments.worldMap.title' | t">
      <div class="world-map-head">
        <p class="world-map-hint">{{ 'moments.worldMap.subtitle' | t }}</p>
        @if (pins().length > 0) {
          <span class="world-map-badge">{{
            'moments.worldMap.count' | t: { count: pins().length }
          }}</span>
        }
      </div>

      @if (state.isLoading() && pins().length === 0) {
        <vereint-state kind="loading" [title]="'common.loading' | t" />
      } @else if (state.errorMessage()) {
        <vereint-state
          kind="error"
          [title]="'moments.unavailable' | t"
          [message]="state.errorMessage()"
          (retry)="load()"
        />
      } @else if (pins().length === 0) {
        <div class="world-map-empty" role="status">
          <vereint-icon name="location" />
          <strong>{{ 'moments.worldMap.emptyTitle' | t }}</strong>
          <p>{{ 'moments.worldMap.emptyMessage' | t }}</p>
        </div>
      } @else {
        <div
          #mapHost
          class="world-map-canvas"
          role="application"
          [attr.aria-label]="'moments.worldMap.ariaLabel' | t"
        ></div>

        <h3 class="world-map-list-title">{{ 'moments.worldMap.listTitle' | t }}</h3>
        <ul class="world-map-list">
          @for (pin of sortedPins(); track pin.momentId) {
            <li>
              <button
                type="button"
                class="world-map-item"
                [class.is-active]="selectedId() === pin.momentId"
                (click)="focus(pin)"
              >
                <span class="world-map-emoji" [class.is-live]="pin.active">{{
                  pin.topicEmoji || '📍'
                }}</span>
                <span class="world-map-info">
                  <strong>{{ pin.title }}</strong>
                  <small>{{ describe(pin) }}</small>
                </span>
                @if (pin.active) {
                  <span class="world-map-live">{{ 'moments.worldMap.live' | t }}</span>
                }
              </button>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [
    `
      .world-map {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .world-map-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .world-map-hint {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-text-muted);
      }
      .world-map-badge,
      .world-map-live {
        flex: none;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.15rem 0.55rem;
        border-radius: 999px;
        background-color: var(--color-brand-soft);
        color: var(--color-brand-strong);
      }
      .world-map-empty {
        display: grid;
        justify-items: center;
        gap: 0.5rem;
        padding: 2.5rem 1.5rem;
        text-align: center;
        border-radius: var(--radius-md);
        border: 1px dashed var(--color-border);
        background-color: var(--color-surface-raised);
        color: var(--color-text-muted);
      }
      .world-map-empty vereint-icon {
        font-size: 2.5rem;
        color: var(--color-brand);
      }
      .world-map-empty strong {
        color: var(--color-text);
      }
      .world-map-empty p {
        margin: 0;
        max-width: 32rem;
        font-size: 0.85rem;
      }
      .world-map-canvas {
        width: 100%;
        height: clamp(18rem, 60vh, 34rem);
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        overflow: hidden;
        background-color: var(--color-surface-raised);
        /* Leaflet-Ebenen bleiben unter Dialogen und der App-Navigation. */
        position: relative;
        z-index: 0;
      }
      .world-map-list-title {
        margin: var(--space-1) 0 0;
        font-size: 0.9rem;
      }
      .world-map-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.35rem;
      }
      .world-map-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        min-height: 3rem;
        padding: 0.5rem 0.75rem;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-raised);
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .world-map-item:hover,
      .world-map-item.is-active {
        border-color: var(--color-brand);
        background-color: var(--color-brand-soft);
      }
      .world-map-emoji {
        display: grid;
        place-items: center;
        flex: none;
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
        border: 2px solid var(--color-border-strong, var(--color-border));
        background-color: var(--color-surface);
      }
      .world-map-emoji.is-live {
        border-color: var(--color-brand);
      }
      .world-map-info {
        display: grid;
        min-width: 0;
        flex: 1;
      }
      .world-map-info strong,
      .world-map-info small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .world-map-info small {
        color: var(--color-text-muted);
      }
    `,
  ],
})
export class MomentsWorldMapComponent {
  /** Nur Moments dieses Events (`/events/:eventId/moments`). */
  readonly eventId = input<string | null>(null);
  /** Ein Moment soll geöffnet werden. */
  readonly openMoment = output<string>();

  private readonly api = inject(MemberApiService);
  private readonly loadLeaflet = inject(LEAFLET_LOADER);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly mapHost = viewChild<ElementRef<HTMLDivElement>>('mapHost');

  protected readonly state = new AsyncState<MomentWorldMapPinDto[]>();
  protected readonly pins = signal<MomentWorldMapPinDto[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly places = computed(() => groupByPlace(this.pins()));
  protected readonly sortedPins = computed(() => this.places().flatMap((place) => place.moments));

  private leaflet: typeof Leaflet | null = null;
  private map: Leaflet.Map | null = null;
  private mapElement: HTMLElement | null = null;
  private markers = new Map<string, Leaflet.Marker>();
  private renderRun = 0;

  constructor() {
    effect(() => {
      this.eventId();
      if (this.isBrowser) this.load();
    });
    effect(() => {
      const places = this.places();
      const host = this.mapHost()?.nativeElement ?? null;
      if (this.isBrowser) void this.render(places, host);
    });
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.state.destroy();
      this.destroyMap();
    });
  }

  load(): void {
    this.state.run(this.api.getMomentsWorldMap(this.eventId()), (pins) => this.pins.set(pins));
  }

  /** Zeile der Liste: Pin auf der Karte zeigen und Popup öffnen. */
  protected focus(pin: MomentWorldMapPinDto): void {
    this.selectedId.set(pin.momentId);
    const place = this.places().find((p) => p.moments.includes(pin));
    const marker = place ? this.markers.get(place.key) : undefined;
    if (!this.map || !marker) return;
    this.map.setView(marker.getLatLng(), Math.max(this.map.getZoom(), 12));
    marker.openPopup();
    this.mapHost()?.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }

  /** „Laufend · 12.11. · 3 Standorte“ bzw. mit Abschlussdatum. */
  protected describe(pin: MomentWorldMapPinDto): string {
    const parts = [
      pin.active
        ? translate('moments.worldMap.started', { date: formatShortDate(pin.createdAt) })
        : translate('moments.worldMap.ended', {
            date: formatShortDate(pin.completedAt ?? pin.createdAt),
          }),
      translate('moments.worldMap.locations', { count: pin.locationsCount }),
    ];
    if (pin.eventTitle) parts.push(pin.eventTitle);
    return parts.join(' · ');
  }

  private async render(places: WorldMapPlace[], host: HTMLElement | null): Promise<void> {
    const run = ++this.renderRun;
    if (!host || places.length === 0) {
      this.destroyMap();
      return;
    }
    ensureLeafletStylesheet(this.document);
    const L = this.leaflet ?? (this.leaflet = await this.loadLeaflet());
    if (run !== this.renderRun) return;

    if (this.map && this.mapElement !== host) this.destroyMap();
    if (!this.map) {
      this.map = L.map(host, { scrollWheelZoom: false, worldCopyJump: true, minZoom: 2 });
      this.mapElement = host;
      L.tileLayer(MAP_TILE_URL, {
        maxZoom: 19,
        attribution: `&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>`,
      }).addTo(this.map);
    }
    const map = this.map;

    this.markers.forEach((marker) => marker.remove());
    this.markers.clear();
    for (const place of places) {
      const marker = L.marker([place.latitude, place.longitude], {
        icon: L.divIcon({
          className: '',
          html: this.markerHtml(place),
          iconSize: [40, 40],
          iconAnchor: [20, 20],
          popupAnchor: [0, -18],
        }),
        title: place.moments.map((m) => m.title).join(', '),
        keyboard: true,
      })
        .bindPopup(this.popupContent(place))
        .addTo(map);
      this.markers.set(place.key, marker);
    }

    const view = mapViewFor(places);
    if (view.kind === 'point') {
      map.setView(view.center, view.zoom);
    } else if (view.kind === 'bounds') {
      map.fitBounds(L.latLngBounds(view.southWest, view.northEast), {
        padding: [36, 36],
        maxZoom: MAX_FIT_ZOOM,
      });
    }
    // Der Container kann gerade erst sichtbar geworden sein (Ansichtswechsel).
    setTimeout(() => map.invalidateSize());
  }

  /** Nur Emoji, Zahl und feste Klassen; Titel stehen im Popup als Textknoten. */
  private markerHtml(place: WorldMapPlace): string {
    const live = place.moments.some((m) => m.active);
    const emoji = this.document.createElement('span');
    emoji.textContent = place.moments[0].topicEmoji || '📍';
    const count =
      place.moments.length > 1
        ? `<span class="world-pin-count">${place.moments.length}</span>`
        : '';
    return `<span class="world-pin${live ? ' is-live' : ''}">${emoji.innerHTML}${count}</span>`;
  }

  private popupContent(place: WorldMapPlace): HTMLElement {
    const root = this.document.createElement('div');
    root.className = 'world-popup';
    for (const moment of place.moments) {
      const button = this.document.createElement('button');
      button.type = 'button';
      button.className = 'world-popup-item';
      const title = this.document.createElement('strong');
      title.textContent = `${moment.topicEmoji ? moment.topicEmoji + ' ' : ''}${moment.title}`;
      const meta = this.document.createElement('small');
      meta.textContent = this.describe(moment);
      const action = this.document.createElement('span');
      action.className = 'world-popup-open';
      action.textContent = translate('moments.worldMap.open');
      button.append(title, meta, action);
      button.addEventListener('click', () => this.openMoment.emit(moment.momentId));
      root.append(button);
    }
    return root;
  }

  private destroyMap(): void {
    this.markers.clear();
    this.map?.remove();
    this.map = null;
    this.mapElement = null;
  }
}
