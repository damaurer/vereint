import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  createdAt: string;
  /** Ziel in der App, z. B. `/events/{id}` bei Einladungen. */
  link?: string | null;
}

export interface UnreadCountResponse {
  unread: number;
}

export interface VapidPublicKeyResponse {
  enabled: boolean;
  publicKey: string;
}

export interface PushSubscriptionItem {
  id: string;
  endpoint: string;
  userAgent?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterPushSubscriptionRequest {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationsApiService {
  private readonly api = inject(ApiClient);

  list(): Observable<NotificationItem[]> {
    return this.api.get<NotificationItem[]>('/notifications');
  }

  unreadCount(): Observable<UnreadCountResponse> {
    return this.api.get<UnreadCountResponse>('/notifications/unread-count');
  }

  markRead(notificationId: string): Observable<NotificationItem> {
    return this.api.post<NotificationItem>(`/notifications/${encodeURIComponent(notificationId)}/read`, {});
  }

  markAllRead(): Observable<UnreadCountResponse> {
    return this.api.post<UnreadCountResponse>('/notifications/read-all', {});
  }

  /** Zu- oder Absage auf eine Event-Einladung (`PUT /events/{id}/rsvp`). */
  respondToEvent(eventId: string, status: 'accepted' | 'declined'): Observable<unknown> {
    return this.api.put<unknown>(`/events/${encodeURIComponent(eventId)}/rsvp`, { status });
  }

  vapidPublicKey(): Observable<VapidPublicKeyResponse> {
    return this.api.get<VapidPublicKeyResponse>('/notifications/vapid-public-key');
  }

  listSubscriptions(): Observable<PushSubscriptionItem[]> {
    return this.api.get<PushSubscriptionItem[]>('/notifications/subscriptions');
  }

  registerSubscription(request: RegisterPushSubscriptionRequest): Observable<PushSubscriptionItem> {
    return this.api.post<PushSubscriptionItem>('/notifications/subscriptions', request);
  }

  deleteSubscription(subscriptionId: string): Observable<void> {
    return this.api.delete<void>(`/notifications/subscriptions/${encodeURIComponent(subscriptionId)}`);
  }
}
