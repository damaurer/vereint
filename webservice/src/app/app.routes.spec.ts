import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type RedirectFunction, type Route, type UrlTree } from '@angular/router';
import { routes } from './app.routes';
import { authGuard } from './auth/auth.guards';

/** Kindrouten der AppShell (alle geschützten Seiten). */
function shellChildren(): Route[] {
  return routes.find((route) => route.path === '' && route.children?.length)?.children ?? [];
}

describe('app routes: events', () => {
  const children = shellChildren();
  const indexOf = (path: string) => children.findIndex((route) => route.path === path);

  it('registers the create page before the event detail route', () => {
    expect(indexOf('events/new')).toBeGreaterThan(-1);
    expect(indexOf('events/new')).toBeLessThan(indexOf('events/:eventId'));
  });

  it('protects the create page with the auth guard only and loads it lazily', async () => {
    const route = children[indexOf('events/new')];
    expect(route.canActivate).toEqual([authGuard]);
    expect(route.data?.['title']).toBe('routes.eventCreate.title');
    const component = await (route.loadComponent as () => Promise<unknown>)();
    expect((component as { name: string }).name).toContain('EventCreateComponent');
  });
});

describe('app routes: group addresses', () => {
  const top = (path: string) => routes.find((route) => route.path === path);

  it('serves the group pages under their new addresses', () => {
    expect(top('gruppen')?.loadComponent).toBeTypeOf('function');
    expect(top('gruppe-eroeffnen')?.loadComponent).toBeTypeOf('function');
    expect(shellChildren().find((route) => route.path === 'gruppe')?.data?.['title']).toBe('routes.stammtisch.title');
  });

  it('redirects the former addresses and keeps query and fragment (Stripe return)', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const router = TestBed.inject(Router);
    const cases: [string, string, Record<string, string>, string][] = [
      ['stammtisch', '/gruppe?billing=success&returnTo=%2Fdashboard', { billing: 'success', returnTo: '/dashboard' }, ''],
      ['stammtische', '/gruppen?returnTo=%2Fboard', { returnTo: '/board' }, ''],
      ['eroeffnen', '/gruppe-eroeffnen#start', {}, 'start'],
    ];
    for (const [path, expected, queryParams, fragment] of cases) {
      const redirect = top(path)?.redirectTo as RedirectFunction;
      expect(typeof redirect, path).toBe('function');
      const tree = TestBed.runInInjectionContext(() =>
        redirect({ queryParams, fragment: fragment || null } as unknown as Parameters<RedirectFunction>[0]),
      );
      expect(router.serializeUrl(tree as UrlTree), path).toBe(expected);
    }
  });
});
