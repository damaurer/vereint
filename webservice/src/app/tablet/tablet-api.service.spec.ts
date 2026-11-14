import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TabletApiService } from './tablet-api.service';

/**
 * Verträge des Tablet-Kontexts: die Tests belegen Pfad, HTTP-Verb, Rumpf und –
 * bei Käufen – den Idempotency-Key jedes Aufrufs an den Auslieferungs-Proxy
 * (`/api/v1`). Preis, Modus, Herkunft und Autorisierung (`purchase.tablet`)
 * bestimmt der Fachservice und sind nicht Gegenstand dieser Tests.
 */
describe('TabletApiService', () => {
  let service: TabletApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TabletApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TabletApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists active events', () => {
    service.listEvents().subscribe();
    const req = http.expectOne('/api/v1/tablet/events');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('lists members and drinks and encodes the event id', () => {
    service.listMembers('e 1').subscribe();
    const members = http.expectOne('/api/v1/tablet/events/e%201/members');
    expect(members.request.method).toBe('GET');
    members.flush([]);

    service.listDrinks('e-2').subscribe();
    const drinks = http.expectOne('/api/v1/tablet/events/e-2/drinks');
    expect(drinks.request.method).toBe('GET');
    drinks.flush([]);
  });

  it('records a manual purchase via POST with an Idempotency-Key header', () => {
    service
      .recordPurchase('e-1', { memberId: 'm-1', eventDrinkId: 'd-1' }, 'key-1')
      .subscribe();
    const req = http.expectOne('/api/v1/tablet/events/e-1/purchases');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ memberId: 'm-1', eventDrinkId: 'd-1' });
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-1');
    req.flush({});
  });
});
