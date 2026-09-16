import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { MomentResponseDto } from '../api/api.types';
import { MomentTimelineComponent } from './moment-timeline.component';

describe('MomentTimelineComponent', () => {
  const createComponent = (responses: MomentResponseDto[]) => {
    TestBed.configureTestingModule({
      imports: [MomentTimelineComponent],
    });
    const fixture = TestBed.createComponent(MomentTimelineComponent);
    fixture.componentRef.setInput('responses', responses);
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.textContent ?? '';

  it('renders empty message when no responses are present', () => {
    const fixture = createComponent([]);
    expect(html(fixture)).toContain('Noch keine Statusbeiträge geteilt');
  });

  it('renders multiple chronological responses with user avatars, reaction emojis and opt-in coordinates', () => {
    const responses: MomentResponseDto[] = [
      {
        id: 'r-1',
        momentId: 'm-1',
        userId: 'u-1',
        userName: 'Max Mustermann',
        reaction: 'TOAST',
        statusText: 'Prost in die Runde!',
        latitude: 48.137,
        longitude: 11.575,
        createdAt: '2026-09-16T12:00:00Z',
      },
      {
        id: 'r-2',
        momentId: 'm-1',
        userId: 'u-1', // Same user submitting another status
        userName: 'Max Mustermann',
        reaction: 'CHEERS',
        statusText: 'Noch eine Runde!',
        latitude: null,
        longitude: null,
        createdAt: '2026-09-16T12:30:00Z',
      },
      {
        id: 'r-3',
        momentId: 'm-1',
        userId: 'u-2',
        userName: 'Lisa Schmidt',
        reaction: 'PRAYER',
        statusText: 'In Gedanken bei euch 🙏',
        latitude: 52.52,
        longitude: 13.405,
        createdAt: '2026-09-16T12:15:00Z',
      },
    ];

    const fixture = createComponent(responses);
    const text = html(fixture);

    expect(text).toContain('Max Mustermann');
    expect(text).toContain('Prost in die Runde!');
    expect(text).toContain('Noch eine Runde!');
    expect(text).toContain('Lisa Schmidt');
    expect(text).toContain('In Gedanken bei euch 🙏');
    expect(text).toContain('3 Beiträge');
    expect(text).toContain('Standort geteilt');
  });
});
