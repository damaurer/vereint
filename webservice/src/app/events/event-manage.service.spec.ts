import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EventManageService } from './event-manage.service';

/**
 * Verträge der Eventverwaltung: die Tests belegen Pfad, HTTP-Verb und Rumpf
 * jedes Aufrufs an den Auslieferungs-Proxy (`/api/v1`). Die fachliche
 * Autorisierung ist Sache des Fachservice und nicht Gegenstand dieser Tests.
 */
describe('EventManageService', () => {
  let service: EventManageService;
  let http: HttpTestingController;
  const eventId = 'e 1'; // enthält ein Leerzeichen, prüft die URL-Kodierung

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EventManageService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EventManageService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('encodes the event id and updates via PUT', () => {
    service.updateEvent(eventId, { title: 'Neu', status: 'active' }).subscribe();

    const req = http.expectOne('/api/v1/events/e%201');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ title: 'Neu', status: 'active' });
    req.flush({});
  });

  it('adds a participant via POST', () => {
    service.addParticipant('e-1', { userId: 'u-2', role: 'coHost' }).subscribe();

    const req = http.expectOne('/api/v1/events/e-1/participants');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 'u-2', role: 'coHost' });
    req.flush({});
  });

  it('removes a participant via DELETE', () => {
    service.removeParticipant('e-1', 'u-2').subscribe();

    const req = http.expectOne('/api/v1/events/e-1/participants/u-2');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('assigns a sublist via the dedicated endpoint', () => {
    service.assignSublist('e-1', { sublistId: 's-9' }).subscribe();

    const req = http.expectOne('/api/v1/events/e-1/drinks/assign-sublist');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ sublistId: 's-9' });
    req.flush([]);
  });

  it('removes an event drink via DELETE', () => {
    service.removeDrink('e-1', 'd-3').subscribe();

    const req = http.expectOne('/api/v1/events/e-1/drinks/d-3');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('creates a guest invite via POST', () => {
    service.createInvite('e-1', { role: 'guest', expiresInMinutes: 60 }).subscribe();

    const req = http.expectOne('/api/v1/events/e-1/invites');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ role: 'guest', expiresInMinutes: 60 });
    req.flush({});
  });

  it('revokes an invite via DELETE', () => {
    service.revokeInvite('e-1', 'i-7').subscribe();

    const req = http.expectOne('/api/v1/events/e-1/invites/i-7');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('sends a chat message to the member endpoint', () => {
    service.sendMessage('e-1', { message: 'Hallo' }).subscribe();

    const req = http.expectOne('/api/v1/events/e-1/chat/messages');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ message: 'Hallo' });
    req.flush({});
  });

  it('lists event food via GET', () => {
    service.listEventFood('e-1').subscribe();

    const req = http.expectOne('/api/v1/events/e-1/food');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('adds food to an event via POST', () => {
    service.addFood('e-1', { foodId: 'f-1', price: '4.00' }).subscribe();

    const req = http.expectOne('/api/v1/events/e-1/food');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ foodId: 'f-1', price: '4.00' });
    req.flush({});
  });

  it('removes event food via DELETE', () => {
    service.removeFood('e-1', 'ef-1').subscribe();

    const req = http.expectOne('/api/v1/events/e-1/food/ef-1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
