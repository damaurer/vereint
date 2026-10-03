import { Routes } from '@angular/router';
import { AppShellComponent } from './shell/app-shell.component';
import { authGuard, guestGuard, homeGuard, permissionGuard, roleGuard } from './auth/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [homeGuard], children: [] },
  {
    path: 'auth/error',
    data: { mode: 'error', title: 'Anmeldefehler', description: 'Fehler während der Anmeldung über Keycloak.', access: 'Öffentlich' },
    loadComponent: () => import('./auth/auth-status.component').then((m) => m.AuthStatusComponent),
  },
  {
    path: 'auth/logged-out',
    data: { mode: 'loggedOut', title: 'Abgemeldet', description: 'Erfolgreich abgemeldet.', access: 'Öffentlich' },
    loadComponent: () => import('./auth/auth-status.component').then((m) => m.AuthStatusComponent),
  },
  {
    path: 'invite/accept',
    data: { title: 'Einladung annehmen', description: 'Einladung annehmen oder Gastaktivierung.', access: 'Gültiger Einladungscode erforderlich' },
    loadComponent: () => import('./guest/invite-accept.component').then((m) => m.InviteAcceptComponent),
  },
  {
    path: '403',
    data: { title: 'Kein Zugriff', description: 'Für diese Seite fehlen die erforderlichen Rechte.', access: 'Zugriff verweigert' },
    loadComponent: () => import('./errors/forbidden.component').then((m) => m.ForbiddenComponent),
  },
  {
    path: '404',
    data: { title: 'Nicht gefunden', description: 'Die angeforderte Seite existiert nicht.', access: 'Öffentlich' },
    loadComponent: () => import('./errors/not-found.component').then((m) => m.NotFoundComponent),
  },
  {
    // Layout-Route: genau eine AppShell umschließt alle geschützten Routen
    // (TICKET-032). Die Kindrouten behalten ihre Guards und `route.data`.
    path: '',
    component: AppShellComponent,
    children: [
      { path: 'app', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
    canActivate: [authGuard],
    data: { title: 'Dashboard', description: 'Persönliche Übersicht und teilnehmende Events.', access: 'Geschützter Bereich' },
    loadComponent: () => import('./member/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    data: { title: 'Profil', description: 'Persönliche Kontodaten und Provider.', access: 'Geschützter Bereich' },
    loadComponent: () => import('./member/profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: 'wallet',
    canActivate: [authGuard],
    data: { title: 'Guthaben', description: 'Persönliches Guthaben und Ledger.', access: 'Geschützter Bereich' },
    loadComponent: () => import('./member/wallet.component').then((m) => m.WalletComponent),
  },
  {
    path: 'purchases',
    canActivate: [authGuard],
    data: { title: 'Käufe', description: 'Historische Käufe mit unveränderlichen Snapshots.', access: 'Geschützter Bereich' },
    loadComponent: () => import('./member/purchases.component').then((m) => m.PurchasesComponent),
  },
  {
    path: 'events',
    canActivate: [authGuard],
    data: { title: 'Events', description: 'Eventübersicht und Eventdetails.', access: 'Geschützter Bereich' },
    loadComponent: () => import('./member/events.component').then((m) => m.EventsComponent),
  },
  {
    path: 'events/:eventId',
    canActivate: [authGuard],
    data: { title: 'Event', description: 'Eventdetails, Getränkeliste und Chat.', access: 'Geschützter Bereich' },
    loadComponent: () => import('./member/event-detail.component').then((m) => m.EventDetailComponent),
  },
  {
    path: 'events/:eventId/manage',
    canActivate: [authGuard],
    data: { title: 'Event verwalten', description: 'Stammdaten, Einladungen, Getränke und Chat des eigenen Events.', access: 'Geschützter Bereich' },
    loadComponent: () => import('./events/event-manage.component').then((m) => m.EventManageComponent),
  },
  {
    path: 'guest/:eventId',
    canActivate: [guestGuard],
    data: { title: 'Gast-Event', description: 'Freigegebene Eventdetails und Event-Chat.', access: 'Gültiges Gast-Token erforderlich' },
    loadComponent: () => import('./guest/guest-event.component').then((m) => m.GuestEventComponent),
  },
  {
    path: 'catalog',
    canActivate: [authGuard],
    data: { title: 'Getränkekatalog', description: 'Globaler Katalog und Vorschläge.', access: 'Geschützter Bereich' },
    loadComponent: () => import('./catalog/catalog.component').then((m) => m.CatalogComponent),
  },
  {
    path: 'sublists',
    canActivate: [authGuard],
    data: { title: 'Sublists', description: 'Wiederverwendbare Getränkelisten.', access: 'Geschützter Bereich' },
    loadComponent: () => import('./sublists/sublists.component').then((m) => m.SublistsComponent),
  },
  {
    path: 'chat',
    canActivate: [authGuard],
    data: { title: 'Chat', description: 'Mitglieds- und Event-Chats.', access: 'Geschützter Bereich' },
    loadComponent: () => import('./chat/chat.component').then((m) => m.ChatComponent),
  },
  {
    path: 'direktnachrichten',
    canActivate: [authGuard],
    data: { title: 'Direktnachrichten', description: 'Persönliche Einzelgespräche.', access: 'Geschützter Bereich' },
    loadComponent: () =>
      import('./chat/direct-messages.component').then((m) => m.DirectMessagesComponent),
  },
  {
    path: 'notifications',
    canActivate: [authGuard],
    data: { title: 'Benachrichtigungen', description: 'In-App- und Push-Benachrichtigungen.', access: 'Geschützter Bereich' },
    loadComponent: () => import('./notifications/notifications.component').then((m) => m.NotificationsComponent),
  },
  {
    path: 'moments',
    canActivate: [authGuard],
    data: {
      title: 'Moments',
      description: 'Gemeinschaftsmomente & Rituale für aktive Events.',
      access: 'Geschützter Bereich',
    },
    loadComponent: () => import('./moments/moments.component').then((m) => m.MomentsComponent),
  },
  {
    path: 'events/:eventId/moments',
    canActivate: [authGuard],
    data: {
      title: 'Event Moments',
      description: 'Gemeinschaftsmomente & Rituale für dieses Event.',
      access: 'Geschützter Bereich',
    },
    loadComponent: () => import('./moments/moments.component').then((m) => m.MomentsComponent),
  },
  {
    path: 'board',
    canActivate: [authGuard, roleGuard],
    data: {
      title: 'Vorstand',
      description: 'Moderation, Finanzübersichten und vorbereitete Notifications.',
      access: 'Vorstand oder Admin',
      roles: ['board', 'admin'],
    },
    loadComponent: () => import('./board/board.component').then((m) => m.BoardComponent),
  },
  {
    path: 'board/treasury',
    canActivate: [authGuard, roleGuard],
    data: {
      title: 'Kasse & Finanzen',
      description: 'Finanzübersichten und Buchungen.',
      access: 'Vorstand oder Admin',
      roles: ['board', 'admin'],
    },
    loadComponent: () => import('./board/treasury.component').then((m) => m.TreasuryComponent),
  },
  {
    path: 'board/communications',
    canActivate: [authGuard, roleGuard],
    data: {
      title: 'Kommunikation',
      description: 'Mitteilungen und Ankündigungen.',
      access: 'Vorstand oder Admin',
      roles: ['board', 'admin'],
    },
    loadComponent: () =>
      import('./board/communications.component').then((m) => m.CommunicationsComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: {
      title: 'Administration',
      description: 'Mitglieder, Rollen und Audit-Ansichten.',
      access: 'Admin',
      roles: ['admin'],
    },
    loadComponent: () => import('./admin/admin.component').then((m) => m.AdminComponent),
  },
  {
    path: 'tablet',
    canActivate: [authGuard, permissionGuard],
    data: {
      title: 'Tablet-Erfassung',
      description: 'Manuelle Getränkeerfassung für den Drink Recorder.',
      access: 'drinkRecorder',
      permissions: ['purchase.tablet'],
    },
    loadComponent: () => import('./tablet/tablet.component').then((m) => m.TabletComponent),
  },
  {
    path: 'statistik',
    canActivate: [authGuard, permissionGuard],
    data: {
      title: 'Statistiken',
      description: 'Konsum, Anwesenheit, Ausgaben-Verlauf und Rankings der Eber-Analytik.',
      access: 'Statistiken einsehen',
      permissions: ['statistics.view'],
    },
    loadComponent: () =>
      import('./statistics/statistics.component').then((m) => m.StatisticsComponent),
  },
    ],
  },
  { path: '**', redirectTo: '404' },
];
