import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import type {
  BlockedUser,
  ContentReport,
  CreateReportPayload,
  ReportCreated,
} from '../api/api.types';

/**
 * Blockieren und Melden (#153). Chatnachrichten meldet [ChatApiService]
 * (braucht den Chat-Header der Gruppe); hier liegt der Rest.
 */
@Injectable({ providedIn: 'root' })
export class ModerationApiService {
  private readonly api = inject(ApiClient);

  /** Eigene Liste blockierter Personen (`GET /blocks`). */
  blocks(): Observable<BlockedUser[]> {
    return this.api.get<BlockedUser[]>('/blocks');
  }

  block(userId: string): Observable<BlockedUser> {
    return this.api.put<BlockedUser>(`/blocks/${encodeURIComponent(userId)}`, {});
  }

  unblock(userId: string): Observable<void> {
    return this.api.delete<void>(`/blocks/${encodeURIComponent(userId)}`);
  }

  reportMoment(momentId: string, payload: CreateReportPayload): Observable<ReportCreated> {
    return this.api.post<ReportCreated>(`/moments/${encodeURIComponent(momentId)}/report`, payload);
  }

  reportMomentResponse(
    momentId: string,
    responseId: string,
    payload: CreateReportPayload,
  ): Observable<ReportCreated> {
    return this.api.post<ReportCreated>(
      `/moments/${encodeURIComponent(momentId)}/responses/${encodeURIComponent(responseId)}/report`,
      payload,
    );
  }

  /** Meldungen der gewählten Gruppe (`chat.moderate` oder `members.manage`). */
  groupReports(all = false): Observable<ContentReport[]> {
    return this.api.get<ContentReport[]>(all ? '/reports?all=true' : '/reports');
  }

  /** Zahl offener Meldungen der Gruppe; 0 ohne Moderationsrecht. */
  openReportCount(): Observable<{ open: number }> {
    return this.api.get<{ open: number }>('/reports/open-count');
  }

  resolveGroupReport(id: string, resolution: 'removed' | 'dismissed'): Observable<ContentReport> {
    return this.api.post<ContentReport>(`/reports/${encodeURIComponent(id)}/resolve`, {
      resolution,
    });
  }

  /** Meldungen zu Direktnachrichten (nur Anwendungs-Administration). */
  platformReports(all = false): Observable<ContentReport[]> {
    return this.api.get<ContentReport[]>(all ? '/platform/reports?all=true' : '/platform/reports');
  }

  resolvePlatformReport(
    id: string,
    resolution: 'removed' | 'dismissed',
  ): Observable<ContentReport> {
    return this.api.post<ContentReport>(`/platform/reports/${encodeURIComponent(id)}/resolve`, {
      resolution,
    });
  }
}
