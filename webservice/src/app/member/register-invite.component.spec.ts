import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { RegisterInviteComponent } from './register-invite.component';

describe('RegisterInviteComponent', () => {
  it('renders invite code and registration button', async () => {
    TestBed.configureTestingModule({
      imports: [RegisterInviteComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'inviteCode' ? 'INV-12345' : null),
              },
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(RegisterInviteComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Einladung zum Verein');
    expect(text).toContain('INV-12345');
    expect(text).toContain('Weiter zur Anmeldung & Registrierung');
  });

  it('shows error if invite code is missing', async () => {
    TestBed.configureTestingModule({
      imports: [RegisterInviteComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: () => null,
              },
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(RegisterInviteComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Ungültiger Registrierungscode');
  });
});
