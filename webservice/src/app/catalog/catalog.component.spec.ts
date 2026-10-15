import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiError } from '../api/api-client.service';
import { vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import {
  CatalogApiService,
  type DrinkSummaryDto,
  type FoodSummaryDto,
} from './catalog-api.service';
import { CatalogComponent } from './catalog.component';

const mockDrinks: DrinkSummaryDto[] = [
  {
    id: 'd-1',
    name: 'Eber Hell',
    category: 'Bier',
    defaultPrice: 2.5,
    currency: 'EUR',
    status: 'approved',
    active: true,
    catalogVersion: 1,
  },
  {
    id: 'd-2',
    name: 'Eber Spezial',
    category: 'Bier',
    defaultPrice: 3.0,
    currency: 'EUR',
    status: 'proposed',
    active: true,
    catalogVersion: 1,
  },
];

const mockFoods: FoodSummaryDto[] = [
  {
    id: 'f-1',
    name: 'Bratwurstsemmel',
    category: 'Grill',
    defaultPrice: 3.5,
    costPrice: 1.5,
    currency: 'EUR',
    active: true,
  },
];

describe('CatalogComponent', () => {
  let catalogApi: {
    listDrinks: ReturnType<typeof vi.fn>;
    listFoods: ReturnType<typeof vi.fn>;
    proposeDrink: ReturnType<typeof vi.fn>;
    approveDrink: ReturnType<typeof vi.fn>;
    rejectDrink: ReturnType<typeof vi.fn>;
    getDrink: ReturnType<typeof vi.fn>;
    getFood: ReturnType<typeof vi.fn>;
    getDrinkByBarcode: ReturnType<typeof vi.fn>;
    updateDrink: ReturnType<typeof vi.fn>;
    addBarcode: ReturnType<typeof vi.fn>;
    removeBarcode: ReturnType<typeof vi.fn>;
  };
  let auth: { getSession: ReturnType<typeof vi.fn> };

  const create = async (roles: string[] = ['member']) => {
    auth = {
      getSession: vi.fn(async () => ({
        uid: 'u-1',
        email: null,
        displayName: 'User',
        provider: 'keycloak',
        roles,
        boardRole: undefined,
        permissions: [],
      })),
    };

    TestBed.configureTestingModule({
      imports: [CatalogComponent],
      providers: [
        provideRouter([]),
        { provide: CatalogApiService, useValue: catalogApi },
        { provide: AuthService, useValue: auth },
      ],
    });
    const fixture = TestBed.createComponent(CatalogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    catalogApi = {
      listDrinks: vi.fn(() => of(mockDrinks)),
      listFoods: vi.fn(() => of(mockFoods)),
      proposeDrink: vi.fn(() => of({})),
      approveDrink: vi.fn(() => of({})),
      rejectDrink: vi.fn(() => of({})),
      getDrink: vi.fn(() => of(mockDrinks[0])),
      getFood: vi.fn(() => of(mockFoods[0])),
      getDrinkByBarcode: vi.fn(() =>
        throwError(() => new ApiError(404, 'not_found', 'nicht gefunden')),
      ),
      updateDrink: vi.fn(() => of({})),
      addBarcode: vi.fn(() => of({ id: 'b-9', barcode: '999', active: true })),
      removeBarcode: vi.fn(() => of(undefined)),
    };
  });

  it('renders drink catalog by default', async () => {
    const fixture = await create();
    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Getränke- & Speisenkatalog');
    expect(text).toContain('Eber Hell');
    expect(text).toContain('Eber Spezial');
    expect(text).toContain('+ Getränk vorschlagen');
  });

  it('switches to food tab and displays food items', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp['setTab']('food');
    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Bratwurstsemmel');
    expect(text).toContain('3.50 EUR');
  });

  it('shows approve/reject buttons for board/admin users on proposed drinks', async () => {
    const fixture = await create(['board']);
    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Freigeben');
    expect(text).toContain('Ablehnen');
  });

  it('lets the board create a drink directly with cost price and scanned barcodes', async () => {
    catalogApi.proposeDrink.mockReturnValue(of({ status: 'approved' }));
    const fixture = await create(['board']);
    const cmp = fixture.componentInstance as any;
    expect(fixture.nativeElement.textContent).toContain('+ Getränk anlegen');

    cmp.openCreateDrink();
    cmp.drinkName = '  Spezi ';
    cmp.drinkPrice = 2;
    cmp.drinkCostPrice = 0.9;
    cmp.onFormBarcodeScanned('4029 764 001807');
    cmp.submitDrinkForm(new Event('submit'));

    expect(catalogApi.getDrinkByBarcode).toHaveBeenCalledWith('4029764001807');
    expect(catalogApi.proposeDrink).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Spezi',
        defaultPrice: 2,
        costPrice: 0.9,
        barcodes: ['4029764001807'],
      }),
    );
    expect(cmp.proposeInfo()).toContain('sofort im Katalog');
  });

  it('refuses a barcode that already belongs to another drink', async () => {
    catalogApi.getDrinkByBarcode.mockReturnValue(of({ ...mockDrinks[0], barcodes: [] }));
    const fixture = await create(['board']);
    const cmp = fixture.componentInstance as any;

    cmp.openCreateDrink();
    cmp.barcodeInput = '123';
    cmp.addFormBarcode();

    expect(cmp.formBarcodes()).toEqual([]);
    expect(cmp.barcodeHint()).toContain('Eber Hell');
  });

  it('opens the create form with the barcode when a scanned code is unknown', async () => {
    const fixture = await create(['board']);
    const cmp = fixture.componentInstance as any;

    cmp.openLookup();
    cmp.lookupBarcode('555');

    expect(cmp.showLookup()).toBe(false);
    expect(cmp.drinkFormMode()).toBe('create');
    expect(cmp.formBarcodes()).toEqual([{ barcode: '555' }]);
  });

  it('edits price, cost price and availability of an existing drink', async () => {
    catalogApi.getDrink.mockReturnValue(
      of({ ...mockDrinks[0], description: null, costPrice: 1.1, barcodes: [] }),
    );
    const fixture = await create(['board']);
    const cmp = fixture.componentInstance as any;

    cmp.openEditDrink('d-1');
    expect(cmp.drinkFormMode()).toBe('edit');
    cmp.drinkPrice = 2.8;
    cmp.drinkActive = false;
    cmp.submitDrinkForm(new Event('submit'));

    expect(catalogApi.updateDrink).toHaveBeenCalledWith(
      'd-1',
      expect.objectContaining({ defaultPrice: 2.8, costPrice: 1.1, active: false }),
    );
  });

  it('warns about a drink with the same name', async () => {
    const fixture = await create(['board']);
    const cmp = fixture.componentInstance as any;
    cmp.openCreateDrink();
    cmp.drinkName = 'eber  hell';
    expect(cmp.similarDrink()?.id).toBe('d-1');
  });

  it('filters drinks by the search text', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as any;
    cmp.searchQuery.set('spezial');
    expect(cmp.filteredDrinks().map((d: DrinkSummaryDto) => d.id)).toEqual(['d-2']);
  });

  it('lets members only propose and never sends a purchase price', async () => {
    catalogApi.proposeDrink.mockReturnValue(of({ status: 'proposed' }));
    const fixture = await create(['member']);
    const cmp = fixture.componentInstance as any;

    cmp.openCreateDrink();
    cmp.drinkName = 'Radler';
    cmp.drinkPrice = 3.2;
    cmp.drinkCostPrice = 1;
    cmp.submitDrinkForm(new Event('submit'));

    const payload = catalogApi.proposeDrink.mock.calls[0][0];
    expect(payload).not.toHaveProperty('costPrice');
    expect(cmp.proposeInfo()).toContain('vorgeschlagen');
  });
});
