import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { expect } from 'vitest';
import { ApiClient, ApiError, describeApiError } from './api-client.service';

describe('ApiClient', () => {
  let client: ApiClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiClient, provideHttpClient(), provideHttpClientTesting()],
    });
    client = TestBed.inject(ApiClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('prefixes the api base path on GET', async () => {
    const promise = new Promise((resolve, reject) =>
      client.get<{ ok: boolean }>('/users/me').subscribe({ next: resolve, error: reject }),
    );

    const req = httpMock.expectOne('/api/v1/users/me');
    expect(req.request.method).toBe('GET');
    req.flush({ ok: true });

    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('sends the body on PUT', async () => {
    const promise = new Promise((resolve, reject) =>
      client.put('/users/me', { displayName: 'Neo' }).subscribe({ next: resolve, error: reject }),
    );

    const req = httpMock.expectOne('/api/v1/users/me');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ displayName: 'Neo' });
    req.flush({ displayName: 'Neo' });

    await promise;
  });

  it('maps an RFC 7807 error to an ApiError with code and detail', async () => {
    const failure = new Promise<unknown>((resolve) =>
      client.get('/events').subscribe({ error: resolve }),
    );

    httpMock
      .expectOne('/api/v1/events')
      .flush(
        { code: 'permission_denied', detail: 'Keine Rechte', status: 403 },
        { status: 403, statusText: 'Forbidden' },
      );

    const error = (await failure) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.code).toBe('permission_denied');
    expect(error.detail).toBe('Keine Rechte');
  });

  it('maps a transport failure to a network_error ApiError', async () => {
    const failure = new Promise<unknown>((resolve) =>
      client.get('/events').subscribe({ error: resolve }),
    );

    httpMock.expectOne('/api/v1/events').error(new ProgressEvent('error'));

    const error = (await failure) as ApiError;
    expect(error.status).toBe(0);
    expect(error.code).toBe('network_error');
  });

  it('describeApiError yields neutral texts and a default for unknown codes', () => {
    expect(describeApiError(new ApiError(403, 'permission_denied', ''))).toContain('Rechte');
    expect(describeApiError(new ApiError(401, 'oidc_session_expired', ''))).toContain('Sitzung');
    expect(describeApiError(new ApiError(0, 'network_error', ''))).toContain('nicht erreichbar');
    expect(describeApiError(new ApiError(500, 'weird_code', ''))).toContain('nicht abgeschlossen');
    expect(describeApiError('plain string')).toContain('nicht abgeschlossen');
  });
});
