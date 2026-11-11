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
