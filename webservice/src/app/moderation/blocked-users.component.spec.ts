import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { BlockedUsersComponent } from './blocked-users.component';
import { ModerationApiService } from './moderation-api.service';

describe('BlockedUsersComponent', () => {
  it('lists blocked people and unblocks them', () => {
    const api = {
      blocks: vi.fn(() =>
        of([{ userId: 'u-2', displayName: 'Bob', since: '2026-11-20T10:00:00Z' }]),
      ),
      unblock: vi.fn(() => of(undefined)),
    };
    TestBed.configureTestingModule({
      imports: [BlockedUsersComponent],
      providers: [{ provide: ModerationApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(BlockedUsersComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Bob');

    root.querySelector<HTMLButtonElement>('.blocked-item button')!.click();
    fixture.detectChanges();
    expect(api.unblock).toHaveBeenCalledWith('u-2');
    expect(root.textContent).toContain('Du hast niemanden blockiert.');
  });
});
