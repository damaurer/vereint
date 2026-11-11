import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiClient } from '../api/api-client.service';
import { StatisticsDataService } from './statistics-data.service';

describe('StatisticsDataService', () => {
  let service: StatisticsDataService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StatisticsDataService, ApiClient, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StatisticsDataService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads the entry statistics for the chosen period', () => {
    let period: string | undefined;
    service.loadStatistics('year').subscribe((value) => (period = value.period));
    const req = httpMock.expectOne('/api/v1/statistics?period=year');
    expect(req.request.method).toBe('GET');
    req.flush({ period: 'year', totalItems: 0 });
    expect(period).toBe('year');
  });

  it('defaults to 90 days', () => {
    service.loadStatistics().subscribe();
    httpMock.expectOne('/api/v1/statistics?period=90').flush({});
  });

  it('loads drink statistics by member or by drink', () => {
    service.loadDrinks('30', 'drink').subscribe();
    httpMock.expectOne('/api/v1/statistics/drinks?period=30&by=drink').flush({});
  });

  it('loads the overview', () => {
    service.loadOverview('90').subscribe();
    httpMock.expectOne('/api/v1/statistics/overview?period=90').flush({});
  });
});

describe('StatisticsDataService (Ebenen und Schalter)', () => {
  let service: StatisticsDataService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StatisticsDataService, ApiClient, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StatisticsDataService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads the levels with the zeitraum parameter', () => {
    service.loadMine('year').subscribe();
    httpMock.expectOne('/api/v1/statistics/me?zeitraum=jahr').flush({});
    service.loadCrossEvents('30').subscribe();
    httpMock.expectOne('/api/v1/statistics/events?zeitraum=30').flush({});
    service.loadGroupEvents('90').subscribe();
    httpMock.expectOne('/api/v1/statistics/group-events?zeitraum=90').flush({});
    service.loadFeatures('90').subscribe();
    httpMock.expectOne('/api/v1/statistics/features?zeitraum=90').flush({});
    service.loadEvent('e 1').subscribe();
    httpMock.expectOne('/api/v1/events/e%201/statistics').flush({});
  });

  it('reads, switches and deletes the own statistics', () => {
    service.loadMySettings().subscribe();
    httpMock.expectOne('/api/v1/me/statistics-settings').flush({ enabled: true });
    service.saveMySettings(false).subscribe();
    const put = httpMock.expectOne('/api/v1/me/statistics-settings');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ enabled: false });
    put.flush({ enabled: false });
    service.deleteMine().subscribe();
    const del = httpMock.expectOne('/api/v1/me/statistics');
    expect(del.request.method).toBe('DELETE');
    del.flush({ deleted: 3 });
  });

  it('reads, switches and deletes the group statistics', () => {
    service.loadGroupSettings().subscribe();
    httpMock.expectOne('/api/v1/stammtisch/statistics-settings').flush({ enabled: true });
    service.saveGroupSettings(true).subscribe();
    const put = httpMock.expectOne('/api/v1/stammtisch/statistics-settings');
    expect(put.request.method).toBe('PUT');
    put.flush({ enabled: true });
    service.deleteGroup().subscribe();
    const del = httpMock.expectOne('/api/v1/stammtisch/statistics');
    expect(del.request.method).toBe('DELETE');
    del.flush({ deleted: 0 });
  });
});
