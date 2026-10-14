import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from './i18n.service';
import type { TranslationParams } from './translate';

/**
 * `{{ 'nav.events' | t }}` bzw. `{{ 'wallet.balance' | t: { amount: value } }}`.
 *
 * Bewusst nicht `pure`: Die Pipe liest die Sprache als Signal und aktualisiert
 * sich beim Sprachwechsel; das Nachschlagen selbst ist ein einfacher Objektzugriff.
 */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: string, params?: TranslationParams): string {
    return this.i18n.t(key, params);
  }
}
