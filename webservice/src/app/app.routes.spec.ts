import type { Route } from '@angular/router';
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
