import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';

export interface CreateSublistRequest {
  name: string;
  description?: string | null;
}

export interface UpdateSublistRequest {
  name?: string | null;
  description?: string | null;
}

export interface AddSublistItemRequest {
  drinkId: string;
  defaultPrice?: number | null;
}

export interface SublistItemDto {
  id: string;
  drinkId: string;
  drinkName: string;
  defaultPrice?: number | null;
}

export interface SublistDto {
  id: string;
  name: string;
  description?: string | null;
  createdById?: string | null;
  items: SublistItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface SublistSummaryDto {
  id: string;
  name: string;
  description?: string | null;
  itemCount: number;
}

@Injectable({
  providedIn: 'root',
})
export class SublistsApiService {
  private readonly api = inject(ApiClient);

  listSublists(): Observable<SublistSummaryDto[]> {
    return this.api.get<SublistSummaryDto[]>('/sublists');
  }

  getSublist(id: string): Observable<SublistDto> {
    return this.api.get<SublistDto>(`/sublists/${encodeURIComponent(id)}`);
  }

  createSublist(request: CreateSublistRequest): Observable<SublistDto> {
    return this.api.post<SublistDto>('/sublists', request);
  }

  updateSublist(id: string, request: UpdateSublistRequest): Observable<SublistDto> {
    return this.api.put<SublistDto>(`/sublists/${encodeURIComponent(id)}`, request);
  }

  deleteSublist(id: string): Observable<void> {
    return this.api.delete<void>(`/sublists/${encodeURIComponent(id)}`);
  }

  addItem(sublistId: string, request: AddSublistItemRequest): Observable<SublistItemDto> {
    return this.api.post<SublistItemDto>(`/sublists/${encodeURIComponent(sublistId)}/items`, request);
  }

  removeItem(sublistId: string, itemId: string): Observable<void> {
    return this.api.delete<void>(
      `/sublists/${encodeURIComponent(sublistId)}/items/${encodeURIComponent(itemId)}`,
    );
  }
}
