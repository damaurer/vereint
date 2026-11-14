import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PersonalApiService } from './personal-api.service';

describe('PersonalApiService', () => {
  let service: PersonalApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PersonalApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('calls the calendar and friends endpoints', () => {
    const from = new Date('2026-09-28T00:00:00Z');
    const to = new Date('2026-11-02T00:00:00Z');
    service.calendar(from, to).subscribe();
    const calendar = http.expectOne((request) => request.url.startsWith('/api/v1/calendar?'));
    expect(calendar.request.urlWithParams).toContain('from=2026-09-28T00%3A00%3A00.000Z');
    expect(calendar.request.urlWithParams).toContain('to=2026-11-02T00%3A00%3A00.000Z');
    calendar.flush({ from: '', to: '', entries: [] });

    service.friends().subscribe();
    http
      .expectOne({ method: 'GET', url: '/api/v1/friends' })
      .flush({ friends: [], incoming: [], outgoing: [] });

    service.contacts().subscribe();
    http.expectOne({ method: 'GET', url: '/api/v1/friends/contacts' }).flush([]);

    service.request('u 1').subscribe();
    const request = http.expectOne({ method: 'POST', url: '/api/v1/friends/requests' });
    expect(request.request.body).toEqual({ userId: 'u 1' });
    request.flush({});

    service.accept('u 1').subscribe();
    http.expectOne({ method: 'POST', url: '/api/v1/friends/requests/u%201/accept' }).flush({});

    service.remove('u1').subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/v1/friends/u1' }).flush(null);
  });
});
