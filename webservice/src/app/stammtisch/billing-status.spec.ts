import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BillingStatusStore, readOnlyInterceptor } from './billing-status';

describe('readOnlyInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([readOnlyInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('marks the Stammtisch read-only on a stammtisch_read_only rejection and passes the error on', () => {
    let failed = false;
    http.post('/api/v1/purchases', {}).subscribe({ error: () => (failed = true) });
    httpMock
      .expectOne('/api/v1/purchases')
      .flush({ code: 'stammtisch_read_only' }, { status: 403, statusText: 'Forbidden' });
    expect(failed).toBe(true);
    expect(TestBed.inject(BillingStatusStore).readOnly()).toBe(true);
  });

  it('ignores other permission errors', () => {
    http.post('/api/v1/purchases', {}).subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/v1/purchases')
      .flush({ code: 'permission_denied' }, { status: 403, statusText: 'Forbidden' });
    expect(TestBed.inject(BillingStatusStore).readOnly()).toBe(false);
  });
});
