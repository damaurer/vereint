import { Routes } from '@angular/router';
import { AppShellComponent } from './shell/app-shell.component';
import { authGuard, guestGuard, homeGuard, permissionGuard, roleGuard } from './auth/auth.guards';

/**
 * `data.title`, `data.description` und `data.access` sind Übersetzungsschlüssel
 * (Namensraum `routes`); Shell und Platzhalterseite übersetzen sie beim Anzeigen.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [homeGuard], children: [] },
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
    data: { title: 'routes.inviteAccept.title', description: 'routes.inviteAccept.description', access: 'routes.access.invite' },
    loadComponent: () => import('./guest/invite-accept.component').then((m) => m.InviteAcceptComponent),
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
    path: '',
    component: AppShellComponent,
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
    path: 'events',
    canActivate: [authGuard],
    data: { title: 'routes.events.title', description: 'routes.events.description', access: 'routes.access.protected' },
    loadComponent: () => import('./member/events.component').then((m) => m.EventsComponent),
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
    canActivate: [authGuard, roleGuard],
    data: {
      title: 'routes.board.title',
      description: 'routes.board.description',
      access: 'routes.access.boardOrAdmin',
      roles: ['board', 'admin'],
    },
    loadComponent: () => import('./board/board.component').then((m) => m.BoardComponent),
  },
  {
    path: 'board/treasury',
    canActivate: [authGuard, roleGuard],
    data: {
      title: 'routes.treasury.title',
      description: 'routes.treasury.description',
      access: 'routes.access.boardOrAdmin',
      roles: ['board', 'admin'],
    },
    loadComponent: () => import('./board/treasury.component').then((m) => m.TreasuryComponent),
  },
  {
    path: 'board/communications',
    canActivate: [authGuard, roleGuard],
    data: {
      title: 'routes.communications.title',
      description: 'routes.communications.description',
      access: 'routes.access.boardOrAdmin',
      roles: ['board', 'admin'],
    },
    loadComponent: () =>
      import('./board/communications.component').then((m) => m.CommunicationsComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: {
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
    path: 'statistik',
    canActivate: [authGuard, permissionGuard],
    data: {
      title: 'routes.statistics.title',
      description: 'routes.statistics.description',
      access: 'routes.access.statistics',
      permissions: ['statistics.view'],
    },
    loadComponent: () =>
      import('./statistics/statistics.component').then((m) => m.StatisticsComponent),
  },
    ],
  },
  { path: '**', redirectTo: '404' },
];
