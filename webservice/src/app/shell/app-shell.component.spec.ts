import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_LIST_REFRESH_MS } from '../chat/chat-api.service';
import { AuthService } from '../auth/auth.service';
import { AuthSessionUser } from '../auth/auth.types';
import { ChatApiService } from '../chat/chat-api.service';
import { NotificationsApiService } from '../notifications/notifications-api.service';
import { AppShellComponent } from './app-shell.component';
import { BreakpointService } from './breakpoint.service';
import { Viewport } from './breakpoint.service';

/**
 * Nachweis der responsiven Shell (TICKET-032): korrekte Navigations-Darstellung
 * je Breakpoint und rollen-/permissionbasierte Sichtbarkeit (`deny by default`).
 */
describe('AppShellComponent', () => {
  const viewport = signal<Viewport>('web');
  let session: AuthSessionUser | null;
  let unread: number;
  let chatUnread: number;
  let chatUnreadCalls: number;

  const member = (roles: AuthSessionUser['roles'], permissions: string[] = []): AuthSessionUser => ({
    uid: 'u-1',
    email: null,
    displayName: 'Alice',
    provider: 'keycloak',
    roles,
    permissions,
  });

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        provideRouter([]),
        { provide: BreakpointService, useValue: { viewport } },
        { provide: AuthService, useValue: { getSession: () => Promise.resolve(session) } },
        {
          provide: NotificationsApiService,
          useValue: { unreadCount: () => of({ unread }) },
        },
        {
          provide: ChatApiService,
          useValue: {
            unreadCount: () => {
              chatUnreadCalls += 1;
              return of({ unread: chatUnread });
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    session = member(['member']);
    unread = 0;
    chatUnread = 0;
    chatUnreadCalls = 0;
    viewport.set('web');
  });

  it('renders the sidebar, topbar and router outlet on web', async () => {
    const fixture = await create();
    const root = el(fixture);
    expect(root.querySelector('.shell-sidebar')).toBeTruthy();
    expect(root.querySelector('.shell-topbar')).toBeTruthy();
    expect(root.querySelector('router-outlet')).toBeTruthy();
    expect(root.querySelector('.shell-bottom-bar')).toBeFalsy();
  });

  it('renders the bottom tab bar on mobile', async () => {
    viewport.set('mobile');
    const fixture = await create();
    const root = el(fixture);
    expect(root.querySelector('.shell-bottom-bar')).toBeTruthy();
    expect(root.querySelector('.shell-sidebar')).toBeFalsy();
    expect(root.textContent).toContain('Start');
    expect(root.textContent).toContain('Mehr');
    expect(root.querySelector('router-outlet')).toBeTruthy();
  });

  it('renders the icon rail on tablet', async () => {
    viewport.set('tablet');
    const fixture = await create();
    const root = el(fixture);
    expect(root.querySelector('.shell-rail')).toBeTruthy();
    expect(root.querySelector('.shell-sidebar')).toBeFalsy();
    expect(root.querySelector('.shell-bottom-bar')).toBeFalsy();
  });

  it('shows the page title area and a working notifications link in the topbar', async () => {
    const fixture = await create();
    const root = el(fixture);
    expect(root.querySelector('.shell-page-title')).toBeTruthy();
    expect(root.querySelector('a.shell-icon-button')?.getAttribute('href')).toBe('/notifications');
  });

  it('shows the unread count on the bell', async () => {
    unread = 3;
    const fixture = await create();
    const bell = el(fixture).querySelector('a.shell-icon-button');
    expect(bell?.querySelector('.shell-badge')?.textContent?.trim()).toBe('3');
    expect(bell?.getAttribute('aria-label')).toBe('Mitteilungen, 3 ungelesen');
  });

  it('hides the badge when nothing is unread', async () => {
    const fixture = await create();
    const bell = el(fixture).querySelector('a.shell-icon-button');
    expect(bell?.querySelector('.shell-badge')).toBeNull();
    expect(bell?.getAttribute('aria-label')).toBe('Mitteilungen');
  });

  it('offers logout in the profile menu', async () => {
    const fixture = await create();
    const root = el(fixture);
    (root.querySelector('.shell-profile') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('.shell-menu')?.textContent).toContain('Abmelden');
  });

  it('opens the more sheet with all remaining pages on mobile', async () => {
    viewport.set('mobile');
    session = member(['board']);
    const fixture = await create();
    const root = el(fixture);
    const more = Array.from(root.querySelectorAll('.shell-bottom-link')).find((node) =>
      node.textContent?.includes('Mehr'),
    ) as HTMLButtonElement;
    more.click();
    fixture.detectChanges();
    const sheet = root.querySelector('.ui-sheet')?.textContent ?? '';
    expect(sheet).toContain('Profil');
    expect(sheet).toContain('Kasse & Finanzen');
    expect(sheet).toContain('Abmelden');
  });

  it('hides board and admin panels from a plain member (deny by default)', async () => {
    session = member(['member']);
    const fixture = await create();
    expect(el(fixture).textContent).not.toContain('Administration');
    expect(el(fixture).textContent).not.toContain('Vorstand');
  });

  it('shows the admin panel to an admin', async () => {
    session = member(['admin']);
    const fixture = await create();
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('Administration');
    expect(text).toContain('Vorstand');
  });

  const chatLink = (root: HTMLElement, selector: string) =>
    Array.from(root.querySelectorAll<HTMLAnchorElement>(selector)).find(
      (node) => node.getAttribute('href') === '/chat',
    );

  it('shows the unread chat count on the chat entry in the sidebar', async () => {
    chatUnread = 5;
    const fixture = await create();
    const link = chatLink(el(fixture), 'a.shell-nav-link');
    expect(link?.querySelector('.shell-nav-count')?.textContent?.trim()).toBe('5');
    expect(link?.getAttribute('aria-label')).toBe('Chat, 5 ungelesen');
  });

  it('shows the unread chat count in the mobile bottom bar', async () => {
    viewport.set('mobile');
    chatUnread = 120;
    const fixture = await create();
    const link = chatLink(el(fixture), 'a.shell-bottom-link');
    expect(link?.querySelector('.shell-nav-count')?.textContent?.trim()).toBe('99+');
  });

  it('hides the chat badge when nothing is unread', async () => {
    const fixture = await create();
    expect(el(fixture).querySelector('.shell-nav-count')).toBeNull();
    expect(chatLink(el(fixture), 'a.shell-nav-link')?.getAttribute('aria-label')).toBeNull();
  });

  it('refreshes the chat count periodically and stops on destroy', async () => {
    vi.useFakeTimers();
    try {
      const fixture = await create();
      const initial = chatUnreadCalls;
      expect(initial).toBeGreaterThan(0);
      chatUnread = 2;
      vi.advanceTimersByTime(CHAT_LIST_REFRESH_MS);
      fixture.detectChanges();
      expect(chatUnreadCalls).toBe(initial + 1);
      expect(chatLink(el(fixture), 'a.shell-nav-link')?.querySelector('.shell-nav-count')?.textContent?.trim()).toBe('2');
      fixture.destroy();
      vi.advanceTimersByTime(CHAT_LIST_REFRESH_MS * 2);
      expect(chatUnreadCalls).toBe(initial + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the statistics entry to a plain member', async () => {
    const fixture = await create();
    expect(el(fixture).querySelector('a[href="/statistik"]')).toBeTruthy();
  });
});
