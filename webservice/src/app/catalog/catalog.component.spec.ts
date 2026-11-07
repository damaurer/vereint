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
    shareToLibrary: ReturnType<typeof vi.fn>;
    searchLibrary: ReturnType<typeof vi.fn>;
  };
  let auth: { getSession: ReturnType<typeof vi.fn> };

  const create = async (roles: string[] = ['member'], permissions: string[] = []) => {
    auth = {
      getSession: vi.fn(async () => ({
        uid: 'u-1',
        email: null,
        displayName: 'User',
        provider: 'keycloak',
        roles,
        boardRole: undefined,
        permissions,
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
      shareToLibrary: vi.fn(() => of({ id: 'l-1' })),
      searchLibrary: vi.fn(() => of([])),
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
    expect(text).toMatch(/3,50\s€/);
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

  it('prefills a scanned drink from the drinks database and links it on save', async () => {
    catalogApi.searchLibrary.mockReturnValue(
      of([
        {
          id: 'lib-1',
          name: 'Spezi Original',
          description: 'Cola-Mix',
          category: 'Limo',
          barcodes: ['4029764001807', '4029764001814', '4029764001821'],
          catalogDrinkId: null,
        },
      ]),
    );
    // 4029764001821 gehört in diesem Katalog schon zu einem anderen Getränk.
    catalogApi.getDrinkByBarcode.mockImplementation((code: string) =>
      code === '4029764001821'
        ? of({ ...mockDrinks[0], barcodes: [] })
        : throwError(() => new ApiError(404, 'not_found', 'nicht gefunden')),
    );
    catalogApi.proposeDrink.mockReturnValue(of({ status: 'approved' }));
    const fixture = await create(['board']);
    const cmp = fixture.componentInstance as any;

    cmp.openLookup();
    cmp.lookupBarcode('4029764001807');

    expect(catalogApi.searchLibrary).toHaveBeenCalledWith({ barcode: '4029764001807' });
    expect(cmp.showLookup()).toBe(false);
    expect(cmp.drinkFormMode()).toBe('create');
    expect(cmp.drinkName).toBe('Spezi Original');
    expect(cmp.drinkCategory).toBe('Limo');
    expect(cmp.formInfo()).toContain('Getränkedatenbank');
    expect(cmp.formBarcodes()).toEqual([{ barcode: '4029764001807' }, { barcode: '4029764001814' }]);

    cmp.drinkPrice = 2.5;
    cmp.submitDrinkForm(new Event('submit'));
    expect(catalogApi.proposeDrink).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Spezi Original',
        defaultPrice: 2.5,
        libraryDrinkId: 'lib-1',
        barcodes: ['4029764001807', '4029764001814'],
      }),
    );
  });

  it('opens the existing drink when the database entry is already in the catalog', async () => {
    catalogApi.searchLibrary.mockReturnValue(
      of([{ id: 'lib-1', name: 'Eber Hell', description: null, category: 'Bier', barcodes: ['777'], catalogDrinkId: 'd-1' }]),
    );
    catalogApi.getDrink.mockReturnValue(of({ ...mockDrinks[0], description: null, barcodes: [] }));
    const fixture = await create(['board']);
    const cmp = fixture.componentInstance as any;

    cmp.lookupBarcode('777');

    expect(catalogApi.getDrink).toHaveBeenCalledWith('d-1');
    expect(cmp.drinkFormMode()).toBe('edit');
    expect(cmp.barcodeInput).toBe('777');
    expect(cmp.formInfo()).toContain('Eber Hell');
  });

  it('falls back to an empty create form when the drinks database is unreachable', async () => {
    catalogApi.searchLibrary.mockReturnValue(throwError(() => new ApiError(503, 'unavailable', 'weg')));
    const fixture = await create(['board']);
    const cmp = fixture.componentInstance as any;

    cmp.lookupBarcode('555');

    expect(cmp.drinkFormMode()).toBe('create');
    expect(cmp.drinkName).toBe('');
    expect(cmp.formBarcodes()).toEqual([{ barcode: '555' }]);
  });

  it('fills an empty create form when a scanned barcode is in the drinks database', async () => {
    catalogApi.searchLibrary.mockReturnValue(
      of([{ id: 'lib-2', name: 'Augustiner Hell', description: null, category: 'Bier', barcodes: ['888'], catalogDrinkId: null }]),
    );
    const fixture = await create(['member']);
    const cmp = fixture.componentInstance as any;

    cmp.openCreateDrink();
    cmp.onFormBarcodeScanned('888');

    expect(cmp.drinkName).toBe('Augustiner Hell');
    expect(cmp.formBarcodes()).toEqual([{ barcode: '888' }]);

    // Ein schon eingetragener Name wird nicht überschrieben.
    cmp.openCreateDrink();
    cmp.drinkName = 'Mein Helles';
    cmp.onFormBarcodeScanned('888');
    expect(cmp.drinkName).toBe('Mein Helles');
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

  it('links to the drinks database and lets approvers share an approved drink', async () => {
    const approved = {
      ...mockDrinks[0],
      description: null,
      barcodes: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      libraryDrinkId: null,
    };
    catalogApi.getDrink.mockReturnValue(of(approved));
    const fixture = await create(['board'], ['catalog.approve']);
    expect(fixture.nativeElement.querySelector('a[href="/catalog/library"]')).toBeTruthy();

    fixture.componentInstance['openEditDrink']('d-1');
    fixture.detectChanges();
    const share = [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLButtonElement) =>
      b.textContent?.includes('In die Getränkedatenbank teilen'),
    ) as HTMLButtonElement;
    expect(share).toBeTruthy();
    share.click();
    expect(catalogApi.shareToLibrary).toHaveBeenCalledWith('d-1');
    expect(catalogApi.listDrinks).toHaveBeenCalledTimes(2);
  });
});
