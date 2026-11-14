import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const root = () => document.documentElement;

  afterEach(() => {
    localStorage.clear();
    root().removeAttribute('data-theme');
  });

  it('follows the system by default', () => {
    const theme = TestBed.inject(ThemeService);
    theme.init();
    expect(theme.preference()).toBe('system');
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it('applies and remembers an explicit choice', () => {
    const theme = TestBed.inject(ThemeService);
    theme.set('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('vereint.theme')).toBe('dark');
  });

  it('restores the stored choice on start', () => {
    localStorage.setItem('vereint.theme', 'light');
    const theme = TestBed.inject(ThemeService);
    theme.init();
    expect(theme.preference()).toBe('light');
    expect(root().getAttribute('data-theme')).toBe('light');
  });

  it('ignores unknown stored values', () => {
    localStorage.setItem('vereint.theme', 'neon');
    const theme = TestBed.inject(ThemeService);
    theme.init();
    expect(theme.preference()).toBe('system');
  });

  it('switching back to system clears the attribute and storage', () => {
    const theme = TestBed.inject(ThemeService);
    theme.set('dark');
    theme.set('system');
    expect(root().hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('vereint.theme')).toBeNull();
  });
});
