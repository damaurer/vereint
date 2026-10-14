import type { Route } from '@angular/router';
import { routes } from '../app.routes';
import { authGuard, permissionGuard } from '../auth/auth.guards';

/** Sucht rekursiv die erste Route mit dem gegebenen Pfad. */
function findRoute(all: Route[], path: string): Route | undefined {
  for (const route of all) {
    if (route.path === path) return route;
    const child = route.children ? findRoute(route.children, path) : undefined;
    if (child) return child;
  }
  return undefined;
}

describe('statistik route', () => {
  const route = findRoute(routes, 'statistik');

  it('is registered as a lazily loaded child route', () => {
    expect(route).toBeDefined();
    expect(route?.loadComponent).toBeTypeOf('function');
  });

  it('is open to every signed-in member (auth guard only)', () => {
    expect(route?.canActivate).toEqual([authGuard]);
    expect(route?.canActivate).not.toContain(permissionGuard);
  });

  it('no longer requires the statistics permission', () => {
    expect(route?.data?.['permissions']).toBeUndefined();
    expect(route?.data?.['title']).toBe('routes.statistics.title');
  });
});
