import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ForbiddenComponent } from './forbidden.component';

describe('ForbiddenComponent', () => {
  it('renders 403 badge and title', async () => {
    TestBed.configureTestingModule({
      imports: [ForbiddenComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(ForbiddenComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('403');
    expect(text).toContain('Zugriff verweigert');
    expect(text).toContain('Zum Dashboard');
  });
});
