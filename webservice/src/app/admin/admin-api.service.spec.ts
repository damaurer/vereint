import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminApiService } from './admin-api.service';

/**
 * Verträge der Administration: die Tests belegen Pfad, HTTP-Verb und Rumpf jedes
 * Aufrufs an den Auslieferungs-Proxy (`/api/v1`). Die fachliche Autorisierung
 * (nur `admin`) ist Sache des Fachservice und nicht Gegenstand dieser Tests.
 */
describe('AdminApiService', () => {
  let service: AdminApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AdminApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists users without a query when none is given', () => {
    service.listUsers().subscribe();
    const req = http.expectOne('/api/v1/users');
    expect(req.request.method).toBe('GET');
    req.flush({ content: [], page: 0, size: 25, totalElements: 0, totalPages: 0, sort: '' });
  });

  it('encodes search and disabled query parameters', () => {
    service.listUsers({ search: 'A B', disabled: true }).subscribe();
    const req = http.expectOne('/api/v1/users?search=A+B&disabled=true');
    expect(req.request.method).toBe('GET');
    req.flush({ content: [], page: 0, size: 25, totalElements: 0, totalPages: 0, sort: '' });
  });

  it('reads a single user by id', () => {
    service.getUser('u-1').subscribe();
    const req = http.expectOne('/api/v1/users/u-1');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('assigns roles via PUT', () => {
    service.assignRoles('u-1', { roles: ['board', 'admin'] }).subscribe();
    const req = http.expectOne('/api/v1/users/u-1/roles');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ roles: ['board', 'admin'] });
    req.flush({});
  });

  it('updates the profile via PUT', () => {
    service.updateUser('u-1', { boardRole: 'treasurer', drinkRecorder: true }).subscribe();
    const req = http.expectOne('/api/v1/users/u-1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ boardRole: 'treasurer', drinkRecorder: true });
    req.flush({});
  });

  it('updates the status via PUT', () => {
    service.updateStatus('u-1', { disabled: true }).subscribe();
    const req = http.expectOne('/api/v1/users/u-1/status');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ disabled: true });
    req.flush({});
  });

  it('reads the full audit log', () => {
    service.listAuditLogs().subscribe();
    const req = http.expectOne('/api/v1/audit-logs');
    expect(req.request.method).toBe('GET');
    req.flush({ content: [], page: 0, size: 25, totalElements: 0, totalPages: 0, sort: '' });
  });
});
