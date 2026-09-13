import type { Route } from '@angular/router';
import { routes } from '../app.routes';
import { authGuard, permissionGuard } from '../auth/auth.guards';
import { STATISTICS_PERMISSION } from '../shell/nav-model';

/** Sucht rekursiv die erste Route mit dem gegebenen Pfad. */
function findRoute(all: Route[], path: string): Route | undefined {
  for (const route of all) {
    if (route.path === path) return route;
    const child = route.children ? findRoute(route.children, path) : undefined;
    if (child) return child;
  }
  return undefined;
}

describe('statistik route (deny by default)', () => {
  const route = findRoute(routes, 'statistik');

  it('is registered as a lazily loaded child route', () => {
    expect(route).toBeDefined();
    expect(route?.loadComponent).toBeTypeOf('function');
  });

  it('is guarded by both auth and permission guards', () => {
    expect(route?.canActivate).toContain(authGuard);
    expect(route?.canActivate).toContain(permissionGuard);
  });

  it('requires the statistics permission via route data', () => {
    expect(route?.data?.['permissions']).toEqual([STATISTICS_PERMISSION]);
  });
});
