import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BoardApiService } from './board-api.service';

/**
 * Verträge der Vorstands-/Kassen-/Kommunikationskontexte: die Tests belegen
 * Pfad, HTTP-Verb, Rumpf und – bei Buchungen – den Idempotency-Key jedes
 * Aufrufs an den Auslieferungs-Proxy (`/api/v1`). Die fachliche Autorisierung
 * ist Sache des Fachservice und nicht Gegenstand dieser Tests.
 */
describe('BoardApiService', () => {
  let service: BoardApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BoardApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BoardApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the aggregated event summary and encodes the id', () => {
    service.getEventSummary('e 1').subscribe();
    const req = http.expectOne('/api/v1/ledger/events/e%201/summary');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('books a topup via POST with an Idempotency-Key header', () => {
    service.topup({ memberId: 'm-1', amount: '5.00' }, 'key-1').subscribe();
    const req = http.expectOne('/api/v1/ledger/topups');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ memberId: 'm-1', amount: '5.00' });
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-1');
    req.flush({});
  });

  it('books a payout via POST with an Idempotency-Key header', () => {
    service.payout({ memberId: 'm-1', amount: '3.00' }, 'key-2').subscribe();
    const req = http.expectOne('/api/v1/ledger/payouts');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-2');
    req.flush({});
  });

  it('books a correction via POST with an Idempotency-Key header', () => {
    service.correct({ originalEntryId: 'l-9', reason: 'Storno' }, 'key-3').subscribe();
    const req = http.expectOne('/api/v1/ledger/corrections');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ originalEntryId: 'l-9', reason: 'Storno' });
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-3');
    req.flush({});
  });

  it('sends a notification via POST', () => {
    service.sendNotification({ userId: 'm-2', title: 'Hallo', body: 'Text' }).subscribe();
    const req = http.expectOne('/api/v1/notifications');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 'm-2', title: 'Hallo', body: 'Text' });
    req.flush({});
  });

  it('filters audit logs by target entity', () => {
    service.listAuditLogs('Notification').subscribe();
    const req = http.expectOne('/api/v1/audit-logs?targetEntity=Notification');
    expect(req.request.method).toBe('GET');
    req.flush({ content: [], page: 0, size: 25, totalElements: 0, totalPages: 0, sort: '' });
  });

  it('lists users without query when no search is given', () => {
    service.listUsers().subscribe();
    const req = http.expectOne('/api/v1/users');
    expect(req.request.method).toBe('GET');
    req.flush({ content: [], page: 0, size: 25, totalElements: 0, totalPages: 0, sort: '' });
  });
});
