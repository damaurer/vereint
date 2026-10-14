import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Renderstrategie je Route.
 *
 * Öffentliche Einstiege werden serverseitig gerendert; sie enthalten keine
 * personenbezogenen Daten. Alle privaten App-Kontexte (Mitglieder-PWA,
 * Guthaben, Ledger, Events, Vorstand, Admin, Tablet, Gast) werden im Browser
 * gerendert: Damit entsteht kein Leckrisiko im SSR-HTML und es fällt keine
 * SSR-Last ohne SEO-Nutzen an (TICKET-007).
 *
 * Die Zugriffskontrolle bleibt unverändert serverseitig in Express
 * (`src/server/authorization/authorization.middleware.ts`).
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Server },
  { path: 'auth/error', renderMode: RenderMode.Server },
  { path: 'auth/logged-out', renderMode: RenderMode.Server },
  { path: 'invite/accept', renderMode: RenderMode.Server },
  { path: '403', renderMode: RenderMode.Server },
  { path: '404', renderMode: RenderMode.Server },

  // Private Kontexte
  { path: 'app', renderMode: RenderMode.Client },
  { path: 'dashboard', renderMode: RenderMode.Client },
  { path: 'profile', renderMode: RenderMode.Client },
  { path: 'wallet', renderMode: RenderMode.Client },
  { path: 'purchases', renderMode: RenderMode.Client },
  { path: 'scan', renderMode: RenderMode.Client },
  { path: 'events', renderMode: RenderMode.Client },
  { path: 'events/new', renderMode: RenderMode.Client },
  { path: 'events/:eventId', renderMode: RenderMode.Client },
  { path: 'events/:eventId/manage', renderMode: RenderMode.Client },
  { path: 'guest/:eventId', renderMode: RenderMode.Client },
  { path: 'catalog', renderMode: RenderMode.Client },
  { path: 'sublists', renderMode: RenderMode.Client },
  { path: 'chat', renderMode: RenderMode.Client },
  { path: 'direktnachrichten', renderMode: RenderMode.Client },
  { path: 'notifications', renderMode: RenderMode.Client },
  { path: 'moments', renderMode: RenderMode.Client },
  { path: 'events/:eventId/moments', renderMode: RenderMode.Client },
  { path: 'board', renderMode: RenderMode.Client },
  { path: 'board/treasury', renderMode: RenderMode.Client },
  { path: 'board/communications', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'tablet', renderMode: RenderMode.Client },
  { path: 'statistik', renderMode: RenderMode.Client },

  // Deny by default: unbekannte Pfade werden nicht serverseitig gerendert.
  { path: '**', renderMode: RenderMode.Client },
];
