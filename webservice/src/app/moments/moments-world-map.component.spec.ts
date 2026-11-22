import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { MomentWorldMapPinDto } from '../api/api.types';
import { MemberApiService } from '../member/member-api.service';
import { LEAFLET_LOADER, MAX_FIT_ZOOM, SINGLE_PIN_ZOOM } from './moment-map.component';
import { MomentsWorldMapComponent, groupByPlace } from './moments-world-map.component';

/** Minimaler Leaflet-Ersatz; merkt sich Marker samt Popup-Inhalt. */
function fakeLeaflet() {
  const map = {
    setView: vi.fn(() => map),
    fitBounds: vi.fn(() => map),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
    getZoom: vi.fn(() => 5),
  };
  const popups: HTMLElement[] = [];
  const L = {
    map: vi.fn(() => map),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    marker: vi.fn(() => {
      const marker: Record<string, unknown> = {};
      marker['bindPopup'] = vi.fn((content: HTMLElement) => {
        popups.push(content);
        return marker;
      });
      marker['addTo'] = vi.fn(() => marker);
      marker['remove'] = vi.fn();
      marker['openPopup'] = vi.fn();
      marker['getLatLng'] = vi.fn(() => [0, 0]);
      return marker;
    }),
    divIcon: vi.fn((options: unknown) => options),
    latLngBounds: vi.fn((southWest: [number, number], northEast: [number, number]) => ({
      southWest,
      northEast,
    })),
  };
  return { L, map, popups };
}

const pin = (overrides: Partial<MomentWorldMapPinDto>): MomentWorldMapPinDto => ({
  momentId: 'm-1',
  title: 'Anstoßen',
  topicType: 'toast',
  topicName: 'Gemeinsames Anstoßen',
  topicEmoji: '🍻',
  active: false,
  eventId: null,
  eventTitle: null,
  creatorName: 'Anna',
  latitude: 48.137,
  longitude: 11.575,
  locationSource: 'initiator',
  responsesCount: 2,
  locationsCount: 2,
  createdAt: '2026-11-20T18:00:00Z',
  completedAt: '2026-11-20T19:00:00Z',
  ...overrides,
});

describe('MomentsWorldMapComponent', () => {
  const create = async (pins: MomentWorldMapPinDto[], eventId: string | null = null) => {
    const leaflet = fakeLeaflet();
    const api = { getMomentsWorldMap: vi.fn(() => of(pins)) };
    TestBed.configureTestingModule({
      imports: [MomentsWorldMapComponent],
      providers: [
        { provide: LEAFLET_LOADER, useValue: () => Promise.resolve(leaflet.L) },
        { provide: MemberApiService, useValue: api },
      ],
    });
    const fixture = TestBed.createComponent(MomentsWorldMapComponent);
    fixture.componentRef.setInput('eventId', eventId);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, api, ...leaflet };
  };

  it('explains how moments get onto the map when none has a location', async () => {
    const { fixture, L } = await create([]);
    expect(fixture.nativeElement.textContent).toContain('Noch keine Moments mit Standort');
    expect(L.map).not.toHaveBeenCalled();
  });

  it('loads only the moments of the event it is shown for', async () => {
    const { api } = await create([], 'ev-1');
    expect(api.getMomentsWorldMap).toHaveBeenCalledWith('ev-1');
  });

  it('shows one pin per place, fits all places and opens a moment from its popup', async () => {
    const { fixture, L, map, popups } = await create([
      pin({ momentId: 'm-1', title: 'Biergarten', createdAt: '2026-11-20T18:00:00Z' }),
      pin({
        momentId: 'm-2',
        title: 'Nochmal Biergarten',
        latitude: 48.1371,
        longitude: 11.5751,
        createdAt: '2026-11-21T18:00:00Z',
      }),
      pin({
        momentId: 'm-3',
        title: 'Berlin',
        latitude: 52.52,
        longitude: 13.405,
        active: true,
        completedAt: null,
      }),
    ]);

    expect(L.marker).toHaveBeenCalledTimes(2);
    expect(map.fitBounds).toHaveBeenCalledWith(expect.anything(), {
      padding: [36, 36],
      maxZoom: MAX_FIT_ZOOM,
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('3 Moments');
    expect(text).toContain('Läuft');

    const opened: string[] = [];
    fixture.componentInstance.openMoment.subscribe((id) => opened.push(id));
    const munich = popups.find((p) => p.textContent?.includes('Biergarten'))!;
    const buttons = munich.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    // Neuester Moment am Ort zuerst.
    expect(buttons[0].textContent).toContain('Nochmal Biergarten');
    buttons[1].click();
    expect(opened).toEqual(['m-1']);
  });

  it('centres a single moment with a fixed zoom', async () => {
    const { map } = await create([pin({ latitude: 50.11, longitude: 8.68 })]);
    expect(map.setView).toHaveBeenCalledWith([50.11, 8.68], SINGLE_PIN_ZOOM);
  });

  it('groups moments within about 100 m into one place', () => {
    const places = groupByPlace([
      pin({ momentId: 'a', latitude: 48.1371, longitude: 11.5752 }),
      pin({ momentId: 'b', latitude: 48.1374, longitude: 11.5749 }),
      pin({ momentId: 'c', latitude: 48.2, longitude: 11.5 }),
    ]);
    expect(places.map((p) => p.moments.map((m) => m.momentId))).toEqual([['a', 'b'], ['c']]);
  });
});
