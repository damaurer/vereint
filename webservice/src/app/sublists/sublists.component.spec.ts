import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CatalogApiService } from '../catalog/catalog-api.service';
import { SublistsApiService, type SublistSummaryDto, type SublistDto } from './sublists-api.service';
import { SublistsComponent } from './sublists.component';

const mockSublists: SublistSummaryDto[] = [
  {
    id: 's-1',
    name: 'Sommerfest Sublist',
    description: 'Getränke für das Sommerfest',
    itemCount: 2,
  },
];

const mockSublistDetail: SublistDto = {
  id: 's-1',
  name: 'Sommerfest Sublist',
  description: 'Getränke für das Sommerfest',
  createdById: 'u-1',
  items: [
    { id: 'i-1', drinkId: 'd-1', drinkName: 'Eber Hell', defaultPrice: 2.5 },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('SublistsComponent', () => {
  let sublistsApi: {
    listSublists: ReturnType<typeof vi.fn>;
    getSublist: ReturnType<typeof vi.fn>;
    createSublist: ReturnType<typeof vi.fn>;
    updateSublist: ReturnType<typeof vi.fn>;
    deleteSublist: ReturnType<typeof vi.fn>;
    addItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
  };
  let catalogApi: {
    listDrinks: ReturnType<typeof vi.fn>;
  };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [SublistsComponent],
      providers: [
        provideRouter([]),
        { provide: SublistsApiService, useValue: sublistsApi },
        { provide: CatalogApiService, useValue: catalogApi },
      ],
    });
    const fixture = TestBed.createComponent(SublistsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    sublistsApi = {
      listSublists: vi.fn(() => of(mockSublists)),
      getSublist: vi.fn(() => of(mockSublistDetail)),
      createSublist: vi.fn(() => of(mockSublistDetail)),
      updateSublist: vi.fn(() => of(mockSublistDetail)),
      deleteSublist: vi.fn(() => of(undefined)),
      addItem: vi.fn(() => of(mockSublistDetail.items[0])),
      removeItem: vi.fn(() => of(undefined)),
    };
    catalogApi = {
      listDrinks: vi.fn(() => of([])),
    };
  });

  it('renders sublists overview', async () => {
    const fixture = await create();
    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Getränke-Sublists');
    expect(text).toContain('Sommerfest Sublist');
    expect(text).toContain('+ Neue Sublist erstellen');
  });

  it('opens detail modal for managing sublist items', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp['openDetailModal']('s-1');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(sublistsApi.getSublist).toHaveBeenCalledWith('s-1');
  });
});
