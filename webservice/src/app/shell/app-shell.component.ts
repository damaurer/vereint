import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  Inject,
  Injector,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import {
  ActivatedRouteSnapshot,
  IsActiveMatchOptions,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthNavigationService } from '../auth/auth-navigation.service';
import { AuthService } from '../auth/auth.service';
import { AuthSessionUser } from '../auth/auth.types';
import { NotificationsApiService } from '../notifications/notifications-api.service';
import { UnreadBadgeStore } from '../notifications/unread-badge.store';
import { BreakpointService } from './breakpoint.service';
import { BottomSheetComponent } from '../ui/bottom-sheet.component';
import { IconComponent } from '../ui/icon.component';
import { buildNavSections, buildPrimaryNav, NavItem, NavSection, PRIMARY_NAV } from './nav-model';

const PRIMARY_IDS = new Set(PRIMARY_NAV.map((item) => item.id));

const SUBSET_MATCH: IsActiveMatchOptions = {
  paths: 'subset',
  queryParams: 'ignored',
  fragment: 'ignored',
  matrixParams: 'ignored',
};
const EXACT_MATCH: IsActiveMatchOptions = { ...SUBSET_MATCH, paths: 'exact' };

/** Seitentitel aus `route.data.title` der tiefsten aktiven Route. */
function titleOf(root: ActivatedRouteSnapshot): string {
  let route: ActivatedRouteSnapshot | null = root;
  let title = '';
  while (route) {
    const candidate = route.data?.['title'];
    if (typeof candidate === 'string') title = candidate;
    route = route.firstChild;
  }
  return title;
}

/**
 * Responsive Layout-Hülle (TICKET-032).
 *
 * Genau eine Shell umschließt alle geschützten Routen und schaltet die
 * Navigations-Darstellung je Breakpoint um: Bottom-Tab-Bar mit „Mehr“-Sheet
 * (mobil), beschriftete Icon-Rail mit „Mehr“-Sheet (Tablet), gruppierte
 * Sidebar (Web). Die Kopfzeile zeigt immer den Seitentitel und den Weg zu den
 * Mitteilungen, am Tablet/Desktop zusätzlich das Profil-Menü mit Abmelden. Die sichtbaren Einträge werden anhand von
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, BottomSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-shell.component.html',
})
export class AppShellComponent implements OnInit, OnDestroy {
  private readonly sessionSignal = signal<AuthSessionUser | null>(null);
  private readonly urlSignal = signal<string>('');
  private readonly titleSignal = signal<string>('');
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

  /** Gruppierte Navigation der Seitenleiste (leer im Gast-Kontext). */
  readonly sections = computed<NavSection[]>(() =>
    this.isGuest() ? [] : buildNavSections(this.sessionSignal()),
  );

  /** Abschnitte des „Mehr“-Sheets: alles außer den primären Zielen. */
  readonly moreSections = computed<NavSection[]>(() =>
    this.sections()
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !PRIMARY_IDS.has(item.id)),
      }))
      .filter((section) => section.items.length > 0),
  );

  /** Liegt die aktuelle Seite hinter „Mehr“? Dann wird „Mehr“ markiert. */
  readonly moreActive = computed(() => {
    const url = this.urlSignal().split(/[?#]/)[0];
    const inPrimary = this.primaryNav().some(
      (item) => url === item.route || url.startsWith(`${item.route}/`),
    );
    return !inPrimary && url !== '';
  });

  /** Anzeigename der aktiven Session für die Topbar. */
  readonly displayName = computed(() => this.sessionSignal()?.displayName ?? null);

  /** Initialen für den Avatar im Profil-Menü. */
  readonly initials = computed(() => {
    const parts = (this.displayName() ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  });

  /** Titel der aktuellen Seite (aus `route.data.title`). */
  readonly pageTitle = computed(() => this.titleSignal() || 'Vereint');

  /** Ungelesene Mitteilungen für das Glocken-Badge (nur im Browser geladen). */
  readonly unread;

  /** Badge-Text: ab 100 gekürzt, damit der Kreis klein bleibt. */
  readonly unreadBadge = computed(() => {
    const count = this.unread();
    if (count <= 0) return null;
    return count > 99 ? '99+' : String(count);
  });

  /** Zugängliche Bezeichnung der Glocke inklusive Anzahl. */
  readonly bellLabel = computed(() => {
    const count = this.unread();
    return count > 0 ? `Mitteilungen, ${count} ungelesen` : 'Mitteilungen';
  });

  readonly moreOpen = signal(false);
  readonly profileOpen = signal(false);

  constructor(
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private readonly breakpoints: BreakpointService,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly injector: Injector,
  ) {
    this.viewport = this.breakpoints.viewport;
    this.unread = this.injector.get(UnreadBadgeStore).count;
  }

  ngOnInit(): void {
    this.urlSignal.set(this.router.url);
    this.titleSignal.set(titleOf(this.router.routerState.snapshot.root));
    this.routerSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.urlSignal.set(event.urlAfterRedirects);
        this.titleSignal.set(titleOf(this.router.routerState.snapshot.root));
        this.closeMenus();
        this.refreshUnread();
      });

    if (isPlatformBrowser(this.platformId)) {
      void this.auth.getSession().then((session) => {
        this.sessionSignal.set(session);
        this.refreshUnread();
      });
    }
  }

  /**
   * Lädt die Anzahl ungelesener Mitteilungen. Nur im Browser und mit Session;
   * Fehler lassen das Badge einfach aus, die Glocke bleibt nutzbar.
   */
  private refreshUnread(): void {
    if (!isPlatformBrowser(this.platformId) || !this.sessionSignal() || this.isGuest()) return;
    this.injector
      .get(NotificationsApiService)
      .unreadCount()
      .subscribe({
        next: (response) => this.unread.set(Math.max(0, response?.unread ?? 0)),
        error: () => this.unread.set(0),
      });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  trackNav(_index: number, item: NavItem): string {
    return item.id;
  }

  /** `/board` ist Elternpfad von Kasse/Kommunikation und daher exakt. */
  activeOptions(item: NavItem): IsActiveMatchOptions {
    return item.route === '/board' ? EXACT_MATCH : SUBSET_MATCH;
  }

  openMore(): void {
    this.profileOpen.set(false);
    this.moreOpen.set(true);
  }

  toggleProfile(event: Event): void {
    event.stopPropagation();
    this.profileOpen.update((open) => !open);
  }

  closeMenus(): void {
    this.moreOpen.set(false);
    this.profileOpen.set(false);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.profileOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.profileOpen.set(false);
  }

  logout(): void {
    this.closeMenus();
    void this.injector.get(AuthNavigationService).logout();
  }
}
