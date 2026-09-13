import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

/** Basis-Pfad der fachlichen API; Express leitet ihn an Spring weiter. */
export const API_BASE_PATH = '/api/v1';

/**
 * Vereinheitlichter Fehler eines fachlichen API-Aufrufs.
 *
 * `code` stammt aus der RFC-7807-Antwort des Fachservice (`code`) bzw. wird für
 * Transport- und Sitzungsfehler synthetisiert. `status` ist der HTTP-Status
 * (`0` bei Netzwerkabbruch).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
  ) {
    super(detail || code);
    this.name = 'ApiError';
  }
}

interface ProblemBody {
  code?: unknown;
  detail?: unknown;
  title?: unknown;
}

function mapHttpError(error: HttpErrorResponse): ApiError {
  const status = error.status ?? 0;

  if (status === 0) {
    return new ApiError(0, 'network_error', 'Der Fachservice ist nicht erreichbar.');
  }

  const problem = (error.error ?? {}) as ProblemBody;
  const code =
    typeof problem.code === 'string' && problem.code ? problem.code : `http_${status}`;
  const detail =
    (typeof problem.detail === 'string' && problem.detail) ||
    (typeof problem.title === 'string' && problem.title) ||
    error.message;

  return new ApiError(status, code, detail);
}

/**
 * Übersetzt einen [ApiError] in einen mobil geeigneten Benutzertext.
 * `deny by default`: Unbekannte Codes erhalten eine neutrale Meldung.
 */
export function describeApiError(error: unknown): string {
  const code = error instanceof ApiError ? error.code : '';
  switch (code) {
    case 'network_error':
    case 'service_unavailable':
      return 'Der Dienst ist gerade nicht erreichbar. Bitte später erneut versuchen.';
    case 'oidc_session_expired':
      return 'Die Sitzung ist abgelaufen. Bitte erneut anmelden.';
    case 'permission_denied':
    case 'access_denied':
      return 'Für diese Aktion fehlen die erforderlichen Rechte.';
    case 'not_found':
      return 'Der angeforderte Eintrag wurde nicht gefunden.';
    case 'validation_error':
    case 'invalid_request':
      return 'Die Eingabe ist ungültig. Bitte prüfen und erneut versuchen.';
    default:
      return 'Die Aktion konnte nicht abgeschlossen werden. Bitte später erneut versuchen.';
  }
}

/**
 * Schlanker Zugriff auf die fachliche API über den Express-Auslieferungs-Proxy.
 *
 * Der Browser besitzt kein Token: Anfragen laufen same-origin an `/api/v1`, die
 * HttpOnly-Session identifiziert den Benutzer, Express hängt das Access-Token
 * an. Fehlerantworten (RFC 7807) werden einheitlich in [ApiError] übersetzt.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  get<T>(path: string, headers?: Record<string, string>): Observable<T> {
    return this.http
      .get<T>(`${API_BASE_PATH}${path}`, headers ? { headers } : undefined)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => mapHttpError(error))));
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http
      .put<T>(`${API_BASE_PATH}${path}`, body)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => mapHttpError(error))));
  }

  post<T>(path: string, body: unknown, headers?: Record<string, string>): Observable<T> {
    return this.http
      .post<T>(`${API_BASE_PATH}${path}`, body, headers ? { headers } : undefined)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => mapHttpError(error))));
  }

  /**
   * Löscht eine Ressource (`DELETE`). Antworten ohne Inhalt (`204`) liefern
   * `null`; Fehler werden wie bei den übrigen Verben in [ApiError] übersetzt.
   */
  delete<T>(path: string): Observable<T> {
    return this.http
      .delete<T>(`${API_BASE_PATH}${path}`)
      .pipe(catchError((error: HttpErrorResponse) => throwError(() => mapHttpError(error))));
  }
}
