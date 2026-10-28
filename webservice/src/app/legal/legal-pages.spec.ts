import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AgbComponent } from './agb.component';
import { ImpressumComponent } from './impressum.component';
import { LEGAL_OPERATOR, hasOpenPlaceholders, isPlaceholder } from './legal-operator';

const render = <T>(component: Type<T>) => {
  TestBed.configureTestingModule({ imports: [component], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
};

describe('legal pages', () => {
  it('recognises placeholders in square brackets', () => {
    expect(isPlaceholder('[PLZ Ort]')).toBe(true);
    expect(isPlaceholder('12345 Musterstadt')).toBe(false);
    expect(hasOpenPlaceholders({ ...LEGAL_OPERATOR, name: '[Name]' })).toBe(true);
    const filled = Object.fromEntries(
      Object.entries(LEGAL_OPERATOR).map(([key, value]) => [
        key,
        typeof value === 'string' ? 'x' : value,
      ]),
    ) as unknown as typeof LEGAL_OPERATOR;
    expect(hasOpenPlaceholders(filled)).toBe(false);
  });

  it('shows the operator, the DSA contact point and the dispute notice in the imprint', () => {
    const page = render(ImpressumComponent);
    const text = page.textContent ?? '';
    expect(page.querySelector('h1')?.textContent).toContain('Impressum');
    expect(text).toContain('§ 5 DDG');
    expect(text).toContain(LEGAL_OPERATOR.name);
    expect(text).toContain(LEGAL_OPERATOR.street);
    expect(text).toContain('Verordnung (EU) 2022/2065');
    expect(text).toContain('Verbraucherschlichtungsstelle');
    expect(page.querySelector(`a[href="mailto:${LEGAL_OPERATOR.email}"]`)).not.toBeNull();
  });

  it('warns while operator details are still placeholders', () => {
    const page = render(ImpressumComponent);
    expect(page.querySelector('.legal-notice-warning') !== null).toBe(hasOpenPlaceholders());
  });

  it('covers free use, cancellation and content reports in the terms', () => {
    const page = render(AgbComponent);
    const text = page.textContent ?? '';
    for (const heading of [
      'Laufzeit und Kündigung',
      'Umgang mit rechtswidrigen Inhalten',
      'Haftung',
    ]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain('weder E-Geld');
    expect(text).toContain('keine bezahlten Tarife');
    expect(text).not.toContain('Stripe');
    expect(page.querySelector('#widerruf')).toBeNull();
    expect(page.querySelector('#inhalte')).not.toBeNull();
  });
});
