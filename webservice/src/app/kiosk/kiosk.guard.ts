import { inject } from '@angular/core';
import { CanActivateFn, GuardResult, Router } from '@angular/router';
import { KIOSK_HOME, KioskModeService } from './kiosk-mode.service';

/**
 * Hält ein Gerät im Kiosk-Modus auf dem Thekenterminal: Jede andere Seite
 * leitet auf `/tablet` um. Beim serverseitigen Rendern ist der Modus nie aktiv,
 * der Guard lässt dort also alles passieren.
 */
export const kioskGuard: CanActivateFn = (_route, state): GuardResult => {
  const kiosk = inject(KioskModeService);
  if (!kiosk.active()) return true;
  const path = state.url.split(/[?#]/)[0];
  if (path === KIOSK_HOME || path.startsWith(`${KIOSK_HOME}/`)) return true;
  return inject(Router).parseUrl(KIOSK_HOME);
};
