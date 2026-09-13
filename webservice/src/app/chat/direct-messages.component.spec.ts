import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { DirectMessagesComponent } from './direct-messages.component';
import { ChatDataService } from './chat-data.service';
import type { ChatOverview } from './chat.model';

function overview(): ChatOverview {
  return {
    currentUserId: 'me',
    group: {
      id: 'group-eber',
      name: 'Die Durstigen Eber',
      membersOnline: 8,
      pinned: null,
      messages: [],
    },
    conversations: [
      {
        id: 'dm-max',
        partnerId: 'max',
        partnerName: 'Max Mustermann',
        lastText: 'Ja, ich bringe Karten mit!',
        lastLabel: '20:01',
        unreadCount: 2,
        online: true,
        messages: [],
      },
      {
        id: 'dm-lisa',
        partnerId: 'lisa',
        partnerName: 'Lisa Schmidt',
        lastText: 'Danke fürs Ausrichten!',
        lastLabel: 'Gestern',
        unreadCount: 0,
        online: false,
        messages: [],
      },
    ],
  };
}

describe('DirectMessagesComponent', () => {
  let data: { loadOverview: ReturnType<typeof vi.fn>; sendMessage: ReturnType<typeof vi.fn> };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [DirectMessagesComponent],
      providers: [provideRouter([]), { provide: ChatDataService, useValue: data }],
    });
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const html = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    data = {
      loadOverview: vi.fn(() => of(overview())),
      sendMessage: vi.fn(),
    };
  });

  it('lists conversations with avatar, last text, time and unread indicator', async () => {
    const fixture = await create();
    const root = fixture.nativeElement as HTMLElement;
    expect(html(fixture)).toContain('Max Mustermann');
    expect(html(fixture)).toContain('Ja, ich bringe Karten mit!');
    expect(html(fixture)).toContain('20:01');
    expect(root.querySelector('vereint-avatar-badge')).toBeTruthy();
    expect(root.querySelector('.dm-unread')?.textContent).toContain('2');
  });

  it('filters the conversations by the search term', async () => {
    const fixture = await create();
    const component = fixture.componentInstance as unknown as {
      term: { set: (value: string) => void };
    };
    component.term.set('lisa');
    fixture.detectChanges();
    expect(html(fixture)).toContain('Lisa Schmidt');
    expect(html(fixture)).not.toContain('Max Mustermann');
  });

  it('shows an empty state when the search matches nothing', async () => {
    const fixture = await create();
    const component = fixture.componentInstance as unknown as {
      term: { set: (value: string) => void };
    };
    component.term.set('unbekannt');
    fixture.detectChanges();
    expect(html(fixture)).toContain('Keine Konversationen');
  });

  it('shows a retry state on load error', async () => {
    data.loadOverview.mockReturnValue(throwError(() => new Error('boom')));
    const fixture = await create();
    expect(html(fixture)).toContain('nicht verfügbar');
  });
});
