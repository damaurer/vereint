import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PasswordResetComponent } from './password-reset.component';

describe('PasswordResetComponent', () => {
  it('renders password reset instructions', async () => {
    TestBed.configureTestingModule({
      imports: [PasswordResetComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(PasswordResetComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Passwort zurücksetzen');
    expect(text).toContain('Keycloak');
    expect(text).toContain('Zurück zur Anmeldung');
  });
});
