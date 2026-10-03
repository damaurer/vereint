import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiClient, ApiError } from '../api/api-client.service';
import { InviteAcceptComponent } from './invite-accept.component';

describe('InviteAcceptComponent', () => {
  let api: { post: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  const create = async (tokenParam: string | null = 'test-token') => {
    TestBed.configureTestingModule({
      imports: [InviteAcceptComponent],
      providers: [
        provideRouter([]),
        { provide: ApiClient, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => (key === 'token' ? tokenParam : null),
              },
            },
          },
        },
      ],
    });
    router = TestBed.inject(Router) as unknown as { navigate: ReturnType<typeof vi.fn> };
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(InviteAcceptComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    api = {
      post: vi.fn(() =>
        of({
          guestToken: 'gt-123',
          eventId: 'evt-1',
          eventTitle: 'Sommerfest',
          displayName: 'Gast',
          status: 'accepted',
          expiresAt: '2026-07-01T23:00:00Z',
        }),
      ),
    };
  });

  it('automatically accepts valid token and navigates to guest event page', async () => {
    await create('valid-token');
    expect(api.post).toHaveBeenCalledWith('/invites/accept', { token: 'valid-token' });
    expect(router.navigate).toHaveBeenCalledWith(['/guest', 'evt-1'], {
      queryParams: {
        token: 'gt-123',
        title: 'Sommerfest',
      },
    });
  });

  it('shows error message if no token is provided', async () => {
    const fixture = await create(null);
    expect(api.post).not.toHaveBeenCalled();
    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Ungültiger Einladungslink');
  });

  it('handles api error on acceptance failure', async () => {
    api.post.mockReturnValue(throwError(() => new ApiError(404, 'not_found', 'Einladung nicht gefunden')));
    const fixture = await create('expired-token');
    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Einladung konnte nicht eingelöst werden');
  });
});
