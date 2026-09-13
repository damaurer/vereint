import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GUEST_TOKEN_HEADER, GuestEventService } from './guest-event.service';

/**
 * Der Gast-Datenzugriff darf ausschließlich den Gast-Chat erreichen und muss
 * das eventgebundene Gast-Token im Header `X-Guest-Token` mitsenden. Die Tests
 * belegen Pfad, Verb und Header; die Autorisierung selbst prüft der Fachservice.
 */
describe('GuestEventService', () => {
  let service: GuestEventService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GuestEventService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GuestEventService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the guest chat with the guest token header', () => {
    service.listMessages('e-1', 'secret-token').subscribe();

    const req = http.expectOne('/api/v1/events/e-1/chat/guest/messages');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get(GUEST_TOKEN_HEADER)).toBe('secret-token');
    req.flush([]);
  });

  it('sends a guest message with the guest token header and body', () => {
    service.sendMessage('e-1', 'secret-token', { message: 'Hallo' }).subscribe();

    const req = http.expectOne('/api/v1/events/e-1/chat/guest/messages');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get(GUEST_TOKEN_HEADER)).toBe('secret-token');
    expect(req.request.body).toEqual({ message: 'Hallo' });
    req.flush({});
  });
});
