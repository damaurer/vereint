import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiClient } from '../api/api-client.service';
import { StatisticsDataService } from './statistics-data.service';
import type { StatisticsView } from './statistics.types';

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

  it('loads the club statistics from the backend', () => {
    let result: StatisticsView | undefined;
    service.loadStatistics().subscribe((value) => (result = value));
    const req = httpMock.expectOne('/api/v1/statistics');
    expect(req.request.method).toBe('GET');
    req.flush({ periodDays: 90, totalItems: 0 });
    expect(result?.periodDays).toBe(90);
  });
});
