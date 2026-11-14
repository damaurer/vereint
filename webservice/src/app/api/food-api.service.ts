import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client.service';
import type {
  CreateFoodPayload,
  EventFood,
  FoodDetail,
  FoodSummary,
  UpdateFoodPayload,
  AddEventFoodPayload,
  UpdateEventFoodPayload,
} from './api.types';

@Injectable({ providedIn: 'root' })
export class FoodApiService {
  private readonly api = inject(ApiClient);

  listClubFood(active?: boolean): Observable<FoodSummary[]> {
    const query = active !== undefined ? `?active=${active}` : '';
    return this.api.get<FoodSummary[]>(`/food${query}`);
  }

  getClubFood(id: string): Observable<FoodDetail> {
    return this.api.get<FoodDetail>(`/food/${encodeURIComponent(id)}`);
  }

  createClubFood(payload: CreateFoodPayload): Observable<FoodDetail> {
    return this.api.post<FoodDetail>('/food', payload);
  }

  updateClubFood(id: string, payload: UpdateFoodPayload): Observable<FoodDetail> {
    return this.api.put<FoodDetail>(`/food/${encodeURIComponent(id)}`, payload);
  }

  listEventFood(eventId: string): Observable<EventFood[]> {
    return this.api.get<EventFood[]>(`/events/${encodeURIComponent(eventId)}/food`);
  }

  addEventFood(eventId: string, payload: AddEventFoodPayload): Observable<EventFood> {
    return this.api.post<EventFood>(`/events/${encodeURIComponent(eventId)}/food`, payload);
  }

  updateEventFood(
    eventId: string,
    eventFoodId: string,
    payload: UpdateEventFoodPayload
  ): Observable<EventFood> {
    return this.api.put<EventFood>(
      `/events/${encodeURIComponent(eventId)}/food/${encodeURIComponent(eventFoodId)}`,
      payload
    );
  }

  removeEventFood(eventId: string, eventFoodId: string): Observable<void> {
    return this.api.delete<void>(
      `/events/${encodeURIComponent(eventId)}/food/${encodeURIComponent(eventFoodId)}`
    );
  }
}
