import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { StateComponent, type StateKind } from './state.component';

describe('StateComponent', () => {
  const create = (kind: StateKind, withRetry = false) => {
    TestBed.configureTestingModule({ imports: [StateComponent] });
    const fixture = TestBed.createComponent(StateComponent);
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('title', 'Titel');
    fixture.componentRef.setInput('message', 'Nachricht');
    const retry = vi.fn();
    if (withRetry) fixture.componentInstance.retry.subscribe(retry);
    fixture.detectChanges();
    return { root: fixture.nativeElement as HTMLElement, retry };
  };

  it('announces loading politely with a spinner', () => {
    const { root } = create('loading');
    const card = root.querySelector('.ui-state');
    expect(card?.getAttribute('role')).toBe('status');
    expect(card?.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('.ui-state-spinner')).toBeTruthy();
    expect(root.textContent).toContain('Titel');
    expect(root.textContent).toContain('Nachricht');
  });

  it('shows an empty state with an icon and no button', () => {
    const { root } = create('empty');
    expect(root.querySelector('.ui-state')?.getAttribute('role')).toBe('status');
    expect(root.querySelector('svg')).toBeTruthy();
    expect(root.querySelector('button')).toBeNull();
  });

  it('renders errors as alerts with a working retry button', () => {
    const { root, retry } = create('error', true);
    expect(root.querySelector('.ui-state')?.getAttribute('role')).toBe('alert');
    const button = root.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('Erneut versuchen');
    button.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button when nobody listens', () => {
    const { root } = create('error');
    expect(root.querySelector('button')).toBeNull();
  });
});
