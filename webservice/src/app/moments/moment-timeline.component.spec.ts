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
        reactionName: 'Anstoßen',
        reactionEmoji: '🍻',
        statusText: 'Prost in die Runde!',
        latitude: 48.137,
        longitude: 11.575,
        createdAt: '2026-09-16T12:00:00Z',
        media: [
          {
            id: 'media-1',
            kind: 'image',
            contentType: 'image/jpeg',
            sizeBytes: 1000,
            width: 800,
            height: 600,
            durationSeconds: null,
            url: '/api/v1/moments/m-1/media/media-1/content',
            canDelete: true,
          },
          {
            id: 'media-2',
            kind: 'video',
            contentType: 'video/mp4',
            sizeBytes: 5000,
            width: null,
            height: null,
            durationSeconds: 12.5,
            url: '/api/v1/moments/m-1/media/media-2/content',
            canDelete: false,
          },
        ],
      },
      {
        id: 'r-2',
        momentId: 'm-1',
        userId: 'u-1', // Same user submitting another status
        userName: 'Max Mustermann',
        reaction: null,
        reactionName: null,
        reactionEmoji: null,
        statusText: 'Noch eine Runde!',
        latitude: null,
        longitude: null,
        createdAt: '2026-09-16T12:30:00Z',
        media: [],
      },
      {
        id: 'r-3',
        momentId: 'm-1',
        userId: 'u-2',
        userName: 'Lisa Schmidt',
        reaction: 'PRAYER',
        reactionName: 'Gebet',
        reactionEmoji: '🙏',
        statusText: 'In Gedanken bei euch 🙏',
        latitude: 52.52,
        longitude: 13.405,
        createdAt: '2026-09-16T12:15:00Z',
        media: [],
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
    expect(text).toContain('🍻 Anstoßen');
    expect(text).toContain('🙏 Gebet');

    const root: HTMLElement = fixture.nativeElement;
    const image = root.querySelector('img.media-image') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/api/v1/moments/m-1/media/media-1/content');
    const video = root.querySelector('video.media-video') as HTMLVideoElement;
    expect(video.getAttribute('src')).toBe('/api/v1/moments/m-1/media/media-2/content#t=0.1');
    // Nur eigene bzw. moderierbare Dateien zeigen den Entfernen-Knopf.
    expect(root.querySelectorAll('.media-remove').length).toBe(1);
  });

  it('emits removeMedia when the remove button is clicked', () => {
    const fixture = createComponent([
      {
        id: 'r-9',
        momentId: 'm-1',
        userId: 'u-1',
        userName: 'Max',
        reaction: null,
        reactionName: null,
        reactionEmoji: null,
        statusText: null,
        latitude: null,
        longitude: null,
        createdAt: '2026-09-16T12:00:00Z',
        media: [
          {
            id: 'media-9',
            kind: 'image',
            contentType: 'image/jpeg',
            sizeBytes: 10,
            width: 1,
            height: 1,
            durationSeconds: null,
            url: '/x',
            canDelete: true,
          },
        ],
      },
    ]);
    const removed: string[] = [];
    fixture.componentInstance.removeMedia.subscribe((media) => removed.push(media.id));
    (fixture.nativeElement.querySelector('.media-remove') as HTMLButtonElement).click();
    expect(removed).toEqual(['media-9']);
  });
});
