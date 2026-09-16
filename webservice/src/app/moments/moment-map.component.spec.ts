import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { MomentMapGeoJsonDto } from '../api/api.types';
import { MomentMapComponent } from './moment-map.component';

describe('MomentMapComponent', () => {
  const createComponent = (mapData: MomentMapGeoJsonDto | null) => {
    TestBed.configureTestingModule({
      imports: [MomentMapComponent],
    });
    const fixture = TestBed.createComponent(MomentMapComponent);
    fixture.componentRef.setInput('mapData', mapData);
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.textContent ?? '';

  it('renders empty message when no location data is available', () => {
    const fixture = createComponent({ type: 'FeatureCollection', features: [] });
    expect(html(fixture)).toContain('Keine Standorte geteilt');
    expect(html(fixture)).toContain('DSGVO-konform');
  });

  it('projects GeoJSON features into interactive map pins and list', () => {
    const mapData: MomentMapGeoJsonDto = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [11.575, 48.137], // [lon, lat]
          },
          properties: {
            userName: 'Max Mustermann',
            reaction: 'TOAST',
            statusText: 'München grüßt!',
            createdAt: '2026-09-16T12:00:00Z',
          },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [13.405, 52.52], // [lon, lat]
          },
          properties: {
            userName: 'Lisa Schmidt',
            reaction: 'PRAYER',
            statusText: 'Berlin ist dabei',
            createdAt: '2026-09-16T12:05:00Z',
          },
        },
      ],
    };

    const fixture = createComponent(mapData);
    const text = html(fixture);

    expect(text).toContain('2 Standorte');
    expect(text).toContain('Max Mustermann');
    expect(text).toContain('Lisa Schmidt');
    expect(text).toContain('München grüßt!');
    expect(text).toContain('Berlin ist dabei');

    // Check SVG pin elements exist
    const pins = fixture.nativeElement.querySelectorAll('.map-pin-group');
    expect(pins).toHaveLength(2);
  });
});
