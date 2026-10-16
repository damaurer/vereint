import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';
import { AppShellComponent } from './shell/app-shell.component';
import {
  authGuard,
  contextGuard,
  guestGuard,
  homeGuard,
  permissionGuard,
  platformGuard,
  signedInGuard,
} from './auth/auth.guards';
import { kioskGuard } from './kiosk/kiosk.guard';

/** Sichtbare Adressen der Gruppen-Seiten (im Code weiterhin „Stammtisch“). */
export const GROUP_CHOICE_PATH = 'gruppen';
export const GROUP_SETTINGS_PATH = 'gruppe';
export const GROUP_OPEN_PATH = 'gruppe-eroeffnen';

/**
 * Frühere Adressen (`/stammtische`, `/stammtisch`, `/eroeffnen`) führen auf die
 * neuen; Query-Parameter (etwa `?billing=success` der Stripe-Rückkehr oder
 * `returnTo`) und Fragment bleiben erhalten.
 */
export function legacyRedirect(target: string): RedirectFunction {
  return ({ queryParams, fragment }) =>
    inject(Router).createUrlTree([`/${target}`], { queryParams, fragment: fragment ?? undefined });
}

/**
 * `data.title`, `data.description` und `data.access` sind Übersetzungsschlüssel
 * (Namensraum `routes`); Shell und Platzhalterseite übersetzen sie beim Anzeigen.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [kioskGuard, homeGuard], children: [] },
  {
    path: 'auth/error',
    data: { mode: 'error', title: 'routes.authError.title', description: 'routes.authError.description', access: 'routes.access.public' },
    loadComponent: () => import('./auth/auth-status.component').then((m) => m.AuthStatusComponent),
  },
  {
    path: 'auth/logged-out',
    data: { mode: 'loggedOut', title: 'routes.loggedOut.title', description: 'routes.loggedOut.description', access: 'routes.access.public' },
    loadComponent: () => import('./auth/auth-status.component').then((m) => m.AuthStatusComponent),
  },
  {
    path: 'invite/accept',
    canActivate: [kioskGuard],
    data: { title: 'routes.inviteAccept.title', description: 'routes.inviteAccept.description', access: 'routes.access.invite' },
    loadComponent: () => import('./guest/invite-accept.component').then((m) => m.InviteAcceptComponent),
  },
  {
    path: 'register',
    canActivate: [kioskGuard],
    data: { title: 'Registrieren', description: 'Mit einem Einladungslink als Mitglied registrieren.', access: 'Gültiger Einladungslink erforderlich' },
    loadComponent: () => import('./auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    // Eigene Gruppe eröffnen: ohne Konto samt Registrierung, angemeldet nur mit Namen.
    path: GROUP_OPEN_PATH,
    canActivate: [kioskGuard],
    data: { title: 'routes.stammtischOpen.title', description: 'routes.stammtischOpen.description', access: 'routes.access.public' },
    loadComponent: () => import('./stammtisch/stammtisch-open.component').then((m) => m.StammtischOpenComponent),
  },
  {
    // Ohne gewählte Gruppe: auswählen, beitreten oder (Plattform-Admin) anlegen.
    path: GROUP_CHOICE_PATH,
    canActivate: [kioskGuard, signedInGuard],
    data: { title: 'routes.stammtische.title', description: 'routes.stammtische.description', access: 'routes.access.protected' },
    loadComponent: () => import('./stammtisch/stammtisch-choice.component').then((m) => m.StammtischChoiceComponent),
  },
  { path: 'eroeffnen', pathMatch: 'full', redirectTo: legacyRedirect(GROUP_OPEN_PATH) },
  { path: 'stammtische', pathMatch: 'full', redirectTo: legacyRedirect(GROUP_CHOICE_PATH) },
  // Stripe kehrt (noch) nach `/stammtisch?billing=…` zurück.
  { path: 'stammtisch', pathMatch: 'full', redirectTo: legacyRedirect(GROUP_SETTINGS_PATH) },
  {
    path: 'plattform',
    canActivate: [kioskGuard, platformGuard],
    data: { title: 'routes.platform.title', description: 'routes.platform.description', access: 'routes.access.platform' },
    loadComponent: () => import('./stammtisch/platform.component').then((m) => m.PlatformComponent),
  },
  {
    path: '403',
    data: { title: 'routes.forbidden.title', description: 'routes.forbidden.description', access: 'routes.access.denied' },
    loadComponent: () => import('./errors/forbidden.component').then((m) => m.ForbiddenComponent),
  },
  {
    path: '404',
    data: { title: 'routes.notFound.title', description: 'routes.notFound.description', access: 'routes.access.public' },
    loadComponent: () => import('./errors/not-found.component').then((m) => m.NotFoundComponent),
  },
  {
    // Layout-Route: genau eine AppShell umschließt alle geschützten Routen
    // (TICKET-032). Die Kindrouten behalten ihre Guards und `route.data`.
    // Im Kiosk-Modus führt jede Kindroute außer `/tablet` zurück aufs Terminal.
    path: '',
    component: AppShellComponent,
    canActivateChild: [kioskGuard],
    children: [
      { path: 'app', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
    canActivate: [authGuard],
    data: { title: 'routes.dashboard.title', description: 'routes.dashboard.description', access: 'routes.access.protected' },
    loadComponent: () => import('./member/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    data: { title: 'routes.profile.title', description: 'routes.profile.description', access: 'routes.access.protected' },
    loadComponent: () => import('./member/profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: 'wallet',
    canActivate: [authGuard],
    data: { title: 'routes.wallet.title', description: 'routes.wallet.description', access: 'routes.access.protected' },
    loadComponent: () => import('./member/wallet.component').then((m) => m.WalletComponent),
  },
  {
    path: 'purchases',
    canActivate: [authGuard],
    data: { title: 'routes.purchases.title', description: 'routes.purchases.description', access: 'routes.access.protected' },
    loadComponent: () => import('./member/purchases.component').then((m) => m.PurchasesComponent),
  },
  {
    path: 'scan',
    canActivate: [authGuard],
    data: { title: 'routes.scan.title', description: 'routes.scan.description', access: 'routes.access.protected' },
    loadComponent: () => import('./scan/scan.component').then((m) => m.ScanComponent),
  },
  {
    path: 'events',
    canActivate: [authGuard],
    data: { title: 'routes.events.title', description: 'routes.events.description', access: 'routes.access.protected' },
    loadComponent: () => import('./member/events.component').then((m) => m.EventsComponent),
  },
  {
    // Muss vor `events/:eventId` stehen, sonst gilt `new` als Event-ID.
    path: 'events/new',
    canActivate: [authGuard],
    data: { title: 'routes.eventCreate.title', description: 'routes.eventCreate.description', access: 'routes.access.protected' },
    loadComponent: () => import('./events/event-create.component').then((m) => m.EventCreateComponent),
  },
  {
    path: 'events/:eventId',
    canActivate: [authGuard],
    data: { title: 'routes.eventDetail.title', description: 'routes.eventDetail.description', access: 'routes.access.protected' },
    loadComponent: () => import('./member/event-detail.component').then((m) => m.EventDetailComponent),
  },
  {
    path: 'events/:eventId/manage',
    canActivate: [authGuard],
    data: { title: 'routes.eventManage.title', description: 'routes.eventManage.description', access: 'routes.access.protected' },
    loadComponent: () => import('./events/event-manage.component').then((m) => m.EventManageComponent),
  },
  {
    path: 'guest/:eventId',
    canActivate: [guestGuard],
    data: { title: 'routes.guestEvent.title', description: 'routes.guestEvent.description', access: 'routes.access.guestToken' },
    loadComponent: () => import('./guest/guest-event.component').then((m) => m.GuestEventComponent),
  },
  {
    path: 'catalog',
    canActivate: [authGuard],
    data: { title: 'routes.catalog.title', description: 'routes.catalog.description', access: 'routes.access.protected' },
    loadComponent: () => import('./catalog/catalog.component').then((m) => m.CatalogComponent),
  },
  {
    path: 'sublists',
    canActivate: [authGuard],
    data: { title: 'routes.sublists.title', description: 'routes.sublists.description', access: 'routes.access.protected' },
    loadComponent: () => import('./sublists/sublists.component').then((m) => m.SublistsComponent),
  },
  {
    path: 'chat',
    canActivate: [authGuard],
    data: { title: 'routes.chat.title', description: 'routes.chat.description', access: 'routes.access.protected' },
    loadComponent: () => import('./chat/chat.component').then((m) => m.ChatComponent),
  },
  {
    path: 'direktnachrichten',
    canActivate: [authGuard],
    data: { title: 'routes.directMessages.title', description: 'routes.directMessages.description', access: 'routes.access.protected' },
    loadComponent: () =>
      import('./chat/direct-messages.component').then((m) => m.DirectMessagesComponent),
  },
  {
    path: 'notifications',
    canActivate: [authGuard],
    data: { title: 'routes.notifications.title', description: 'routes.notifications.description', access: 'routes.access.protected' },
    loadComponent: () => import('./notifications/notifications.component').then((m) => m.NotificationsComponent),
  },
  {
    path: 'moments',
    canActivate: [authGuard],
    data: {
      title: 'routes.moments.title',
      description: 'routes.moments.description',
      access: 'routes.access.protected',
    },
    loadComponent: () => import('./moments/moments.component').then((m) => m.MomentsComponent),
  },
  {
    path: 'events/:eventId/moments',
    canActivate: [authGuard],
    data: {
      title: 'routes.eventMoments.title',
      description: 'routes.eventMoments.description',
      access: 'routes.access.protected',
    },
    loadComponent: () => import('./moments/moments.component').then((m) => m.MomentsComponent),
  },
  {
    path: 'board',
    canActivate: [authGuard, contextGuard],
    data: {
      appContext: 'boardGeneral',
      title: 'routes.board.title',
      description: 'routes.board.description',
      access: 'routes.access.boardOrAdmin',
      roles: ['board', 'admin'],
    },
    loadComponent: () => import('./board/board.component').then((m) => m.BoardComponent),
  },
  {
    path: 'board/treasury',
    canActivate: [authGuard, contextGuard],
    data: {
      appContext: 'boardTreasury',
      title: 'routes.treasury.title',
      description: 'routes.treasury.description',
      access: 'routes.access.boardOrAdmin',
      roles: ['board', 'admin'],
    },
    loadComponent: () => import('./board/treasury.component').then((m) => m.TreasuryComponent),
  },
  {
    path: 'board/communications',
    canActivate: [authGuard, contextGuard],
    data: {
      appContext: 'boardCommunications',
      title: 'routes.communications.title',
      description: 'routes.communications.description',
      access: 'routes.access.boardOrAdmin',
      roles: ['board', 'admin'],
    },
    loadComponent: () =>
      import('./board/communications.component').then((m) => m.CommunicationsComponent),
  },
  {
    path: 'board/moments',
    canActivate: [authGuard, contextGuard],
    data: {
      appContext: 'boardGeneral',
      title: 'routes.boardMoments.title',
      description: 'routes.boardMoments.description',
      access: 'routes.access.boardOrAdmin',
      roles: ['board', 'admin'],
    },
    loadComponent: () =>
      import('./board/moment-config.component').then((m) => m.MomentConfigComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard, contextGuard],
    data: {
      appContext: 'admin',
      title: 'routes.admin.title',
      description: 'routes.admin.description',
      access: 'routes.access.admin',
      roles: ['admin'],
    },
    loadComponent: () => import('./admin/admin.component').then((m) => m.AdminComponent),
  },
  {
    path: 'tablet',
    canActivate: [authGuard, permissionGuard],
    data: {
      title: 'routes.tablet.title',
      description: 'routes.tablet.description',
      access: 'routes.access.drinkRecorder',
      permissions: ['purchase.tablet'],
    },
    loadComponent: () => import('./tablet/tablet.component').then((m) => m.TabletComponent),
  },
  {
    // Name, Bild, Tarif, Rollen und Austritt der gewählten Gruppe.
    path: GROUP_SETTINGS_PATH,
    canActivate: [authGuard],
    data: { title: 'routes.stammtisch.title', description: 'routes.stammtisch.description', access: 'routes.access.protected' },
    loadComponent: () => import('./stammtisch/stammtisch-settings.component').then((m) => m.StammtischSettingsComponent),
  },
  {
    // Übergreifende Getränkedatenbank: Getränke in den eigenen Katalog übernehmen.
    path: 'catalog/library',
    canActivate: [authGuard],
    data: { title: 'routes.drinkLibrary.title', description: 'routes.drinkLibrary.description', access: 'routes.access.protected' },
    loadComponent: () => import('./catalog/drink-library.component').then((m) => m.DrinkLibraryComponent),
  },
  {
    // Statistik sehen alle Angemeldeten (eigene Werte und Vereinsranking).
    path: 'statistik',
    canActivate: [authGuard],
    data: {
      title: 'routes.statistics.title',
      description: 'routes.statistics.description',
      access: 'routes.access.statistics',
    },
    loadComponent: () =>
      import('./statistics/statistics.component').then((m) => m.StatisticsComponent),
  },
    ],
  },
  { path: '**', redirectTo: '404' },
];
