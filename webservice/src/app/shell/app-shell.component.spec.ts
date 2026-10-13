import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { AuthSessionUser } from '../auth/auth.types';
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
});
