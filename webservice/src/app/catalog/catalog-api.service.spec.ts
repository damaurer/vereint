import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ApiClient } from '../api/api-client.service';
import { CatalogApiService } from './catalog-api.service';

describe('CatalogApiService', () => {
  let service: CatalogApiService;
  let api: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = {
      get: vi.fn(() => of([])),
      post: vi.fn(() => of({})),
      put: vi.fn(() => of({})),
      delete: vi.fn(() => of(undefined)),
    };

    TestBed.configureTestingModule({
      providers: [
        CatalogApiService,
        { provide: ApiClient, useValue: api },
      ],
    });
    service = TestBed.inject(CatalogApiService);
  });

  it('lists drinks with optional status filter', () => {
    service.listDrinks('approved');
    expect(api.get).toHaveBeenCalledWith('/drinks?status=approved');
  });

  it('proposes a drink via POST /drinks', () => {
    const payload = { name: 'Eber-Bier', defaultPrice: 2.5 };
    service.proposeDrink(payload);
    expect(api.post).toHaveBeenCalledWith('/drinks', payload);
  });

  it('approves and rejects a drink', () => {
    service.approveDrink('d-1');
    expect(api.post).toHaveBeenCalledWith('/drinks/d-1/approve', {});

    service.rejectDrink('d-1');
    expect(api.post).toHaveBeenCalledWith('/drinks/d-1/reject', {});
  });

  it('manages food items', () => {
    service.listFoods(true);
    expect(api.get).toHaveBeenCalledWith('/food?active=true');

    service.createFood({ name: 'Currywurst', defaultPrice: 4.5 });
    expect(api.post).toHaveBeenCalledWith('/food', { name: 'Currywurst', defaultPrice: 4.5 });
  });
});
