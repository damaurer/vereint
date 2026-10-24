import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { MomentMapGeoJsonDto } from '../api/api.types';
import {
  LEAFLET_LOADER,
  MAX_FIT_ZOOM,
  MomentMapComponent,
  SINGLE_PIN_ZOOM,
  mapViewFor,
} from './moment-map.component';

/** Minimaler Leaflet-Ersatz: merkt sich, welchen Ausschnitt die Karte zeigen soll. */
function fakeLeaflet() {
  const map = {
    setView: vi.fn(() => map),
    fitBounds: vi.fn(() => map),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
    getZoom: vi.fn(() => 10),
  };
  const chain = () => {
    const marker: Record<string, unknown> = {};
    marker['bindPopup'] = vi.fn(() => marker);
    marker['on'] = vi.fn(() => marker);
    marker['addTo'] = vi.fn(() => marker);
    marker['remove'] = vi.fn();
    marker['getElement'] = vi.fn(() => null);
    return marker;
  };
  const L = {
    map: vi.fn(() => map),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    marker: vi.fn(() => chain()),
    divIcon: vi.fn((options: unknown) => options),
    latLngBounds: vi.fn((southWest: [number, number], northEast: [number, number]) => ({
      southWest,
      northEast,
    })),
  };
  return { L, map };
}

const feature = (lon: number, lat: number, properties: Record<string, unknown>) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] as [number, number] },
  properties,
});

describe('MomentMapComponent', () => {
  const createComponent = async (mapData: MomentMapGeoJsonDto | null) => {
    const leaflet = fakeLeaflet();
    TestBed.configureTestingModule({
      imports: [MomentMapComponent],
      providers: [{ provide: LEAFLET_LOADER, useValue: () => Promise.resolve(leaflet.L) }],
    });
    const fixture = TestBed.createComponent(MomentMapComponent);
    fixture.componentRef.setInput('mapData', mapData);
    fixture.componentRef.setInput('reactions', [
      { id: 'r-1', code: 'TOAST', name: 'Anstoßen', emoji: '🍻', active: true },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, ...leaflet };
  };

  const html = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.textContent ?? '';

  it('renders empty message when no location data is available', async () => {
    const { fixture, L } = await createComponent({ type: 'FeatureCollection', features: [] });
    expect(html(fixture)).toContain('Keine Standorte geteilt');
    expect(html(fixture)).toContain('DSGVO-konform');
    expect(L.map).not.toHaveBeenCalled();
  });

  it('zooms the map to the area of all shared locations instead of the whole world', async () => {
    const { fixture, L, map } = await createComponent({
      type: 'FeatureCollection',
      features: [
        feature(11.575, 48.137, {
          userName: 'Max Mustermann',
          reaction: 'TOAST',
          statusText: 'München grüßt!',
        }),
        feature(13.405, 52.52, {
          userName: 'Lisa Schmidt',
          reaction: 'PRAYER',
          statusText: 'Berlin ist dabei',
        }),
      ],
    });

    const text = html(fixture);
    expect(text).toContain('2 Standorte');
    expect(text).toContain('Max Mustermann');
    expect(text).toContain('München grüßt!');
    expect(text).toContain('48.14° N, 11.57° O');
    expect(text).toContain('🍻');

    expect(L.map).toHaveBeenCalledTimes(1);
    expect(L.marker).toHaveBeenCalledTimes(2);
    expect(L.latLngBounds).toHaveBeenCalledWith([48.137, 11.575], [52.52, 13.405]);
    expect(map.fitBounds).toHaveBeenCalledWith(expect.anything(), {
      padding: [36, 36],
      maxZoom: MAX_FIT_ZOOM,
    });
    expect(map.setView).not.toHaveBeenCalled();
  });

  it('centres a single location with a fixed zoom', async () => {
    const { map } = await createComponent({
      type: 'FeatureCollection',
      features: [feature(8.68, 50.11, { userName: 'Anna', type: 'session_initiator' })],
    });
    expect(map.setView).toHaveBeenCalledWith([50.11, 8.68], SINGLE_PIN_ZOOM);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it('computes the bounding box of all pins', () => {
    expect(mapViewFor([])).toEqual({ kind: 'none' });
    expect(
      mapViewFor([
        { latitude: 48.1, longitude: 11.5 },
        { latitude: 47.9, longitude: 11.7 },
        { latitude: 48.0, longitude: 11.6 },
      ]),
    ).toEqual({ kind: 'bounds', southWest: [47.9, 11.5], northEast: [48.1, 11.7] });
    expect(mapViewFor([{ latitude: -33.9, longitude: 151.2 }])).toEqual({
      kind: 'point',
      center: [-33.9, 151.2],
      zoom: SINGLE_PIN_ZOOM,
    });
  });
});
