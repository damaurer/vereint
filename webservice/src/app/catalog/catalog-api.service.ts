import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client.service';

export interface DrinkBarcodeDto {
  id: string;
  barcode: string;
  active: boolean;
}

export interface DrinkSummaryDto {
  id: string;
  name: string;
  category?: string | null;
  defaultPrice: number;
  costPrice?: number;
  currency: string;
  status: string;
  active: boolean;
  catalogVersion: number;
}

export interface DrinkDto {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  defaultPrice: number;
  costPrice?: number;
  currency: string;
  imageReference?: string | null;
  catalogVersion: number;
  status: string;
  active: boolean;
  proposedById?: string | null;
  approvedById?: string | null;
  barcodes: DrinkBarcodeDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ProposeDrinkRequest {
  name: string;
  description?: string | null;
  category?: string | null;
  defaultPrice: number;
  costPrice?: number | null;
  currency?: string | null;
  imageReference?: string | null;
  barcodes?: string[] | null;
}

export interface UpdateDrinkRequest {
  name?: string | null;
  description?: string | null;
  category?: string | null;
  defaultPrice?: number | null;
  costPrice?: number | null;
  currency?: string | null;
  imageReference?: string | null;
  active?: boolean | null;
}

export interface AddBarcodeRequest {
  barcode: string;
}

export interface FoodSummaryDto {
  id: string;
  name: string;
  category?: string | null;
  defaultPrice: number;
  costPrice?: number;
  currency: string;
  active: boolean;
}

export interface FoodDto {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  defaultPrice: number;
  costPrice: number;
  currency: string;
  active: boolean;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFoodRequest {
  name: string;
  description?: string | null;
  category?: string | null;
  defaultPrice: number;
  costPrice?: number | null;
  currency?: string | null;
}

export interface UpdateFoodRequest {
  name?: string | null;
  description?: string | null;
  category?: string | null;
  defaultPrice?: number | null;
  costPrice?: number | null;
  currency?: string | null;
  active?: boolean | null;
}

@Injectable({
  providedIn: 'root',
})
export class CatalogApiService {
  private readonly api = inject(ApiClient);

  listDrinks(status?: string): Observable<DrinkSummaryDto[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.api.get<DrinkSummaryDto[]>(`/drinks${query}`);
  }

  getDrink(id: string): Observable<DrinkDto> {
    return this.api.get<DrinkDto>(`/drinks/${encodeURIComponent(id)}`);
  }

  getDrinkByBarcode(barcode: string): Observable<DrinkDto> {
    return this.api.get<DrinkDto>(`/drinks/barcode/${encodeURIComponent(barcode)}`);
  }

  proposeDrink(request: ProposeDrinkRequest): Observable<DrinkDto> {
    return this.api.post<DrinkDto>('/drinks', request);
  }

  updateDrink(id: string, request: UpdateDrinkRequest): Observable<DrinkDto> {
    return this.api.put<DrinkDto>(`/drinks/${encodeURIComponent(id)}`, request);
  }

  approveDrink(id: string): Observable<DrinkDto> {
    return this.api.post<DrinkDto>(`/drinks/${encodeURIComponent(id)}/approve`, {});
  }

  rejectDrink(id: string): Observable<DrinkDto> {
    return this.api.post<DrinkDto>(`/drinks/${encodeURIComponent(id)}/reject`, {});
  }

  addBarcode(id: string, request: AddBarcodeRequest): Observable<DrinkBarcodeDto> {
    return this.api.post<DrinkBarcodeDto>(`/drinks/${encodeURIComponent(id)}/barcodes`, request);
  }

  removeBarcode(id: string, barcodeId: string): Observable<void> {
    return this.api.delete<void>(`/drinks/${encodeURIComponent(id)}/barcodes/${encodeURIComponent(barcodeId)}`);
  }

  listFoods(active?: boolean): Observable<FoodSummaryDto[]> {
    const query = active !== undefined ? `?active=${active}` : '';
    return this.api.get<FoodSummaryDto[]>(`/food${query}`);
  }

  getFood(id: string): Observable<FoodDto> {
    return this.api.get<FoodDto>(`/food/${encodeURIComponent(id)}`);
  }

  createFood(request: CreateFoodRequest): Observable<FoodDto> {
    return this.api.post<FoodDto>('/food', request);
  }

  updateFood(id: string, request: UpdateFoodRequest): Observable<FoodDto> {
    return this.api.put<FoodDto>(`/food/${encodeURIComponent(id)}`, request);
  }
}
