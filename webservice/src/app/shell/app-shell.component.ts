import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import { AuthSessionUser } from '../auth/auth.types';
import { BreakpointService } from './breakpoint.service';
import { buildPanelNav, buildPrimaryNav, NavItem } from './nav-model';

/**
 * Responsive Layout-Hülle (TICKET-032).
 *
 * Genau eine Shell umschließt alle geschützten Routen und schaltet die
 * Navigations-Darstellung je Breakpoint um: Bottom-Tab-Bar (mobil), Icon-Rail
 * (Tablet), Sidebar + Topbar (Web). Die sichtbaren Einträge werden anhand von
 * Rolle/Permission der bereits serverseitig freigegebenen Session gefiltert
 * (`deny by default`). Der Gast-Kontext (`/guest/...`) erhält eine reduzierte
 * Shell ohne rollenspezifische Navigation.
 *
 * SSR: serverseitig rendert die Shell neutral (Default-Breakpoint `web`, keine
 * Session) und schreibt keine Tokens/Guthaben/privaten Daten ins HTML.
 */
@Component({
  selector: 'vereint-app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-shell.component.html',
})
export class AppShellComponent implements OnInit, OnDestroy {
  private readonly sessionSignal = signal<AuthSessionUser | null>(null);
  private readonly urlSignal = signal<string>('');
  private routerSub: Subscription | null = null;

  /** Aktueller Viewport (Signal des Breakpoint-Service). */
  readonly viewport;

  /** Reduzierte Shell im Gast-Kontext (keine rollenspezifische Navigation). */
  readonly isGuest = computed(() => {
    const url = this.urlSignal();
    return url === '/guest' || url.startsWith('/guest/');
  });

  /** Sichtbare primäre Navigationseinträge (leer im Gast-Kontext). */
  readonly primaryNav = computed<NavItem[]>(() =>
    this.isGuest() ? [] : buildPrimaryNav(this.sessionSignal()),
  );

  /** Sichtbare rollenspezifische Panel-Einträge (leer im Gast-Kontext). */
  readonly panelNav = computed<NavItem[]>(() =>
    this.isGuest() ? [] : buildPanelNav(this.sessionSignal()),
  );

  /** Anzeigename der aktiven Session für die Topbar. */
  readonly displayName = computed(() => this.sessionSignal()?.displayName ?? null);

  constructor(
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private readonly breakpoints: BreakpointService,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {
    this.viewport = this.breakpoints.viewport;
  }

  ngOnInit(): void {
    this.urlSignal.set(this.router.url);
    this.routerSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.urlSignal.set(event.urlAfterRedirects));

    if (isPlatformBrowser(this.platformId)) {
      void this.auth.getSession().then((session) => this.sessionSignal.set(session));
    }
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  trackNav(_index: number, item: NavItem): string {
    return item.id;
  }
}
