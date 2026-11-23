import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import type { ContentReport } from '../api/api.types';
import { ModerationApiService } from './moderation-api.service';
import { ReportsComponent } from './reports.component';

const report = (overrides: Partial<ContentReport> = {}): ContentReport => ({
  id: 'r-1',
  targetType: 'chat_message',
  targetId: 'm-1',
  contextId: 'c-1',
  targetUserId: 'u-2',
  targetUserName: 'Bob',
  reporterName: 'Alice',
  reason: 'spam',
  note: 'Werbung',
  excerpt: 'Kauft jetzt!',
  status: 'open',
  resolution: null,
  resolvedByName: null,
  resolvedAt: null,
  createdAt: '2026-11-23T10:00:00Z',
  contentAvailable: true,
  ...overrides,
});

describe('ReportsComponent', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  const create = (scope: 'group' | 'platform') => {
    TestBed.configureTestingModule({
      imports: [ReportsComponent],
      providers: [
        provideRouter([]),
        { provide: ModerationApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { data: { scope } } } },
      ],
    });
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  };

  const button = (root: HTMLElement, label: string) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === label,
    )!;

  beforeEach(() => {
    api = {
      groupReports: vi.fn(() => of([report()])),
      resolveGroupReport: vi.fn(() => of(report({ status: 'resolved', resolution: 'removed' }))),
      platformReports: vi.fn(() => of([report({ targetType: 'direct_message' })])),
      resolvePlatformReport: vi.fn(() =>
        of(report({ status: 'resolved', resolution: 'dismissed' })),
      ),
    };
  });

  it('lists group reports and removes the content', () => {
    const { fixture, root } = create('group');
    expect(root.textContent).toContain('Meldungen der Gruppe');
    expect(root.textContent).toContain('Kauft jetzt!');
    expect(root.textContent).toContain('Gemeldet von Alice, Inhalt von Bob');
    expect(root.textContent).toContain('Notiz: Werbung');

    button(root, 'Inhalt entfernen').click();
    fixture.detectChanges();
    expect(api['resolveGroupReport']).toHaveBeenCalledWith('r-1', 'removed');
    expect(api['groupReports']).toHaveBeenCalledTimes(2);
  });

  it('uses the platform endpoints for direct message reports', () => {
    const { root } = create('platform');
    expect(root.textContent).toContain('Meldungen zu Direktnachrichten');
    button(root, 'Ohne Folgen schließen').click();
    expect(api['resolvePlatformReport']).toHaveBeenCalledWith('r-1', 'dismissed');
    expect(api['groupReports']).not.toHaveBeenCalled();
  });
});
