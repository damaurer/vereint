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
    service.listMoments('e-1').subscribe();
    const reqList = httpMock.expectOne('/api/v1/events/e-1/moments');
    expect(reqList.request.method).toBe('GET');
    reqList.flush([]);

    service.getMomentDetail('e-1', 'm-1').subscribe();
    const reqDetail = httpMock.expectOne('/api/v1/events/e-1/moments/m-1');
    expect(reqDetail.request.method).toBe('GET');
    reqDetail.flush({});

    service
      .startMoment('e-1', {
        title: 'Anstoßen',
        topicType: 'toast',
        consent: false,
        durationMinutes: 60,
      })
      .subscribe();
    const reqStart = httpMock.expectOne('/api/v1/events/e-1/moments');
    expect(reqStart.request.method).toBe('POST');
    reqStart.flush({});

    service
      .submitMomentResponse('e-1', 'm-1', {
        reaction: 'CHEERS',
        statusText: 'Prost!',
        consent: true,
        latitude: 48.13,
        longitude: 11.58,
      })
      .subscribe();
    const reqSubmit = httpMock.expectOne('/api/v1/events/e-1/moments/m-1/responses');
    expect(reqSubmit.request.method).toBe('POST');
    reqSubmit.flush({});

    service.getMomentMapGeoJson('e-1', 'm-1').subscribe();
    const reqMap = httpMock.expectOne('/api/v1/events/e-1/moments/m-1/map');
    expect(reqMap.request.method).toBe('GET');
    reqMap.flush({ type: 'FeatureCollection', features: [] });

    service.completeMoment('e-1', 'm-1').subscribe();
    const reqComplete = httpMock.expectOne('/api/v1/events/e-1/moments/m-1/complete');
    expect(reqComplete.request.method).toBe('POST');
    reqComplete.flush({});

    service.listMomentHistory('e-1').subscribe();
    const reqHistory = httpMock.expectOne('/api/v1/events/e-1/moments/history');
    expect(reqHistory.request.method).toBe('GET');
    reqHistory.flush([]);
  });
});
