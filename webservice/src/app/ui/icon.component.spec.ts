import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { IconComponent } from './icon.component';
import { ICONS, IconName } from './icons';

/** Nachweis des Vereint-Icon-Sets. */
describe('IconComponent', () => {
  const create = (name: IconName, label: string | null = null) => {
    TestBed.configureTestingModule({ imports: [IconComponent] });
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', name);
    fixture.componentRef.setInput('label', label);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('renders an inline svg in currentColor', () => {
    const svg = create('home').querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(svg?.querySelectorAll('path, circle, rect, line').length).toBe(ICONS.home.length);
  });

  it('is decorative without a label', () => {
    const svg = create('bell').querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
  });

  it('becomes a named image with a label', () => {
    const svg = create('bell', 'Mitteilungen').querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Mitteilungen');
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
  });

  it('fills the brand nodes instead of stroking them', () => {
    const node = create('home').querySelector('circle');
    expect(node?.getAttribute('fill')).toBe('currentColor');
    expect(node?.getAttribute('stroke')).toBe('none');
  });

  it('keeps every icon inside the 24px grid', () => {
    for (const [name, shapes] of Object.entries(ICONS)) {
      expect(shapes.length, name).toBeGreaterThan(0);
      for (const shape of shapes) {
        const coords =
          shape.t === 'circle'
            ? [shape.cx - shape.r, shape.cy - shape.r, shape.cx + shape.r, shape.cy + shape.r]
            : shape.t === 'rect'
              ? [shape.x, shape.y, shape.x + shape.w, shape.y + shape.h]
              : shape.t === 'line'
                ? [shape.x1, shape.y1, shape.x2, shape.y2]
                : [];
        for (const value of coords) {
          expect(value, name).toBeGreaterThanOrEqual(0);
          expect(value, name).toBeLessThanOrEqual(24);
        }
      }
    }
  });
});
