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
    httpMock.expectOne('/api/v1/events/e-1').flush({});

    service.listParticipants('e-1').subscribe();
    httpMock.expectOne('/api/v1/events/e-1/participants').flush([]);
  });

  it('reads balance and entries by member id', () => {
    service.getBalance('m-1').subscribe();
    httpMock.expectOne('/api/v1/ledger/members/m-1/balance').flush({});

    service.listEntries('m-1').subscribe();
    httpMock.expectOne('/api/v1/ledger/members/m-1/entries').flush([]);
  });

  it('encodes identifiers used in the path', () => {
    service.getEvent('a/b').subscribe();
    httpMock.expectOne('/api/v1/events/a%2Fb').flush({});
  });
});
