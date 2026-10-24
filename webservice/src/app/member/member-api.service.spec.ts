import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { expect } from 'vitest';
import { ApiClient } from '../api/api-client.service';
import { MemberApiService } from './member-api.service';

describe('MemberApiService', () => {
  let service: MemberApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MemberApiService, ApiClient, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MemberApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('calls the profile endpoint', () => {
    service.loadProfile().subscribe();
    const req = httpMock.expectOne('/api/v1/users/me');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('lists events', () => {
    service.listEvents().subscribe();
    const req = httpMock.expectOne('/api/v1/events');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('reads a single event and its participants', () => {
    service.getEvent('e-1').subscribe();
    const reqEvent = httpMock.expectOne('/api/v1/events/e-1');
    expect(reqEvent.request.method).toBe('GET');
    reqEvent.flush({});

    service.listParticipants('e-1').subscribe();
    const reqParticipants = httpMock.expectOne('/api/v1/events/e-1/participants');
    expect(reqParticipants.request.method).toBe('GET');
    reqParticipants.flush([]);
  });

  it('creates an event and answers an invitation', () => {
    service.createEvent({ title: 'Grillen', startsAt: '2026-07-01T16:00:00.000Z', status: 'draft' }).subscribe();
    const create = httpMock.expectOne('/api/v1/events');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ title: 'Grillen', startsAt: '2026-07-01T16:00:00.000Z', status: 'draft' });
    create.flush({});

    service.respondToEvent('e-1', 'maybe').subscribe();
    const rsvp = httpMock.expectOne('/api/v1/events/e-1/rsvp');
    expect(rsvp.request.method).toBe('PUT');
    expect(rsvp.request.body).toEqual({ status: 'maybe' });
    rsvp.flush({});
  });

  it('reads the member directory', () => {
    service.listDirectory().subscribe();
    const req = httpMock.expectOne('/api/v1/users/directory');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('uses the conversation endpoints for the event chat', () => {
    service.getEventConversation('e-1').subscribe();
    httpMock.expectOne('/api/v1/events/e-1/chat').flush({ id: 'c-1' });

    service.listConversationMessages('c-1').subscribe();
    const list = httpMock.expectOne('/api/v1/conversations/c-1/messages');
    expect(list.request.method).toBe('GET');
    list.flush([]);

    service.sendConversationMessage('c-1', 'Hallo').subscribe();
    const send = httpMock.expectOne('/api/v1/conversations/c-1/messages');
    expect(send.request.method).toBe('POST');
    expect(send.request.body).toEqual({ message: 'Hallo' });
    send.flush({});

    service.markConversationRead('c-1').subscribe();
    const read = httpMock.expectOne('/api/v1/conversations/c-1/read');
    expect(read.request.method).toBe('POST');
    read.flush({});
  });

  it('reads balance and entries by member id', () => {
    service.getBalance('m-1').subscribe();
    const reqBalance = httpMock.expectOne('/api/v1/ledger/members/m-1/balance');
    expect(reqBalance.request.method).toBe('GET');
    reqBalance.flush({});

    service.listEntries('m-1').subscribe();
    const reqEntries = httpMock.expectOne('/api/v1/ledger/members/m-1/entries');
    expect(reqEntries.request.method).toBe('GET');
    reqEntries.flush([]);
  });

  it('encodes identifiers used in the path', () => {
    service.getEvent('a/b').subscribe();
    const req = httpMock.expectOne('/api/v1/events/a%2Fb');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('manages moment endpoints (list, detail, start, submit response, map, complete, history)', () => {
    service.listMoments().subscribe();
    const reqAll = httpMock.expectOne('/api/v1/moments');
    expect(reqAll.request.method).toBe('GET');
    reqAll.flush([]);

    service.listMoments('e-1').subscribe();
    const reqList = httpMock.expectOne('/api/v1/moments?eventId=e-1');
    expect(reqList.request.method).toBe('GET');
    reqList.flush([]);

    service.getMomentDetail('m-1').subscribe();
    const reqDetail = httpMock.expectOne('/api/v1/moments/m-1');
    expect(reqDetail.request.method).toBe('GET');
    reqDetail.flush({});

    service
      .startMoment({
        eventId: 'e-1',
        title: 'Anstoßen',
        topicType: 'toast',
        consent: false,
        durationMinutes: 60,
      })
      .subscribe();
    const reqStart = httpMock.expectOne('/api/v1/moments');
    expect(reqStart.request.body.eventId).toBe('e-1');
    expect(reqStart.request.method).toBe('POST');
    reqStart.flush({});

    service
      .submitMomentResponse('m-1', {
        reaction: 'CHEERS',
        statusText: 'Prost!',
        consent: true,
        latitude: 48.13,
        longitude: 11.58,
      })
      .subscribe();
    const reqSubmit = httpMock.expectOne('/api/v1/moments/m-1/responses');
    expect(reqSubmit.request.method).toBe('POST');
    reqSubmit.flush({});

    service.getMomentMapGeoJson('m-1').subscribe();
    const reqMap = httpMock.expectOne('/api/v1/moments/m-1/map');
    expect(reqMap.request.method).toBe('GET');
    reqMap.flush({ type: 'FeatureCollection', features: [] });

    service.completeMoment('m-1').subscribe();
    const reqComplete = httpMock.expectOne('/api/v1/moments/m-1/complete');
    expect(reqComplete.request.method).toBe('POST');
    reqComplete.flush({});

    service.listMomentHistory('e-1').subscribe();
    const reqHistory = httpMock.expectOne('/api/v1/moments/history?eventId=e-1');
    expect(reqHistory.request.method).toBe('GET');
    reqHistory.flush([]);
  });
});
