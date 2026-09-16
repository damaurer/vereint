import { Routes } from '@angular/router';
import { DummyPageComponent } from './dummy-page.component';
import { AppShellComponent } from './shell/app-shell.component';
import { authGuard, guestGuard, homeGuard, permissionGuard, roleGuard } from './auth/auth.guards';

const page = (title: string, description: string, access = 'Geschützter Bereich') => ({
  component: DummyPageComponent,
  data: { title, description, access },
});

/** Geschützte Mitgliederseite: benötigt eine angemeldete Session (`authGuard`). */
const memberPage = (title: string, description: string, access = 'Geschützter Bereich') => ({
  ...page(title, description, access),
  canActivate: [authGuard],
});

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [homeGuard], children: [] },
  {
    path: 'login',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'web/login',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'pwa/login',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
  },
  { path: 'password-reset', ...page('Passwort zurücksetzen', 'Neutraler Passwort-Reset für Webkonten.', 'Öffentlich') },
  { path: 'invite/accept', ...page('Einladung annehmen', 'Einladung annehmen oder Gastaktivierung.', 'Gültiger Einladungscode erforderlich') },
  { path: 'register/:inviteCode', ...page('Einladung registrieren', 'Registrierung oder Gastaktivierung mit validem Einladungscode.', 'Gültiger Einladungscode erforderlich') },
  { path: '403', ...page('Kein Zugriff', 'Für diese Seite fehlen die erforderlichen Rechte.', 'Zugriff verweigert') },
  { path: '404', ...page('Nicht gefunden', 'Die angeforderte Seite existiert nicht.', 'Öffentlich') },
  {
    // Layout-Route: genau eine AppShell umschließt alle geschützten Routen
    // (TICKET-032). Die Kindrouten behalten ihre Guards und `route.data`.
    path: '',
    component: AppShellComponent,
    children: [
  { path: 'app', ...memberPage('Mitglieder-PWA', 'Persönliche Übersicht und Schnellzugriff.') },
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
  { path: 'catalog', ...memberPage('Getränkekatalog', 'Globaler Katalog und Vorschläge.') },
  { path: 'sublists', ...memberPage('Sublists', 'Wiederverwendbare Getränkelisten.') },
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
  { path: 'notifications', ...memberPage('Notifications', 'In-App- und Push-Benachrichtigungen.') },
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
