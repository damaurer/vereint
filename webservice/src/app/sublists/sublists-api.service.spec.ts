import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ApiClient } from '../api/api-client.service';
import { SublistsApiService } from './sublists-api.service';

describe('SublistsApiService', () => {
  let service: SublistsApiService;
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
        SublistsApiService,
        { provide: ApiClient, useValue: api },
      ],
    });
    service = TestBed.inject(SublistsApiService);
  });

  it('lists and gets sublists', () => {
    service.listSublists();
    expect(api.get).toHaveBeenCalledWith('/sublists');

    service.getSublist('s-1');
    expect(api.get).toHaveBeenCalledWith('/sublists/s-1');
  });

  it('creates, updates and deletes a sublist', () => {
    service.createSublist({ name: 'Stammtisch' });
    expect(api.post).toHaveBeenCalledWith('/sublists', { name: 'Stammtisch' });

    service.updateSublist('s-1', { name: 'Neu' });
    expect(api.put).toHaveBeenCalledWith('/sublists/s-1', { name: 'Neu' });

    service.deleteSublist('s-1');
    expect(api.delete).toHaveBeenCalledWith('/sublists/s-1');
  });

  it('adds and removes sublist items', () => {
    service.addItem('s-1', { drinkId: 'd-1', defaultPrice: 2.5 });
    expect(api.post).toHaveBeenCalledWith('/sublists/s-1/items', { drinkId: 'd-1', defaultPrice: 2.5 });

    service.removeItem('s-1', 'item-1');
    expect(api.delete).toHaveBeenCalledWith('/sublists/s-1/items/item-1');
  });
});
