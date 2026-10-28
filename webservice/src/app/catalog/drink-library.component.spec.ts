import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CatalogApiService, type DrinkLibraryEntryDto } from './catalog-api.service';
import { DrinkLibraryComponent } from './drink-library.component';

interface LibraryInternals {
  barcode: string;
  price: number | null;
  search(): void;
  onScanned(code: string): void;
  adoptingId(): string | null;
  startAdopt(entry: DrinkLibraryEntryDto): void;
  adopt(entry: DrinkLibraryEntryDto): void;
  formError(): string | null;
  success(): string | null;
}

const entries: DrinkLibraryEntryDto[] = [
  { id: 'l-1', name: 'Helles', description: 'Mild', category: 'Bier', barcodes: ['4001'], catalogDrinkId: null },
  { id: 'l-2', name: 'Spezi', description: null, category: null, barcodes: [], catalogDrinkId: 'd-9' },
];

describe('DrinkLibraryComponent', () => {
  let api: { searchLibrary: ReturnType<typeof vi.fn>; proposeDrink: ReturnType<typeof vi.fn> };

  const create = () => {
    api = {
      searchLibrary: vi.fn(() => of(entries)),
      proposeDrink: vi.fn(() => of({ id: 'd-1', status: 'approved' })),
    };
    TestBed.configureTestingModule({
      imports: [DrinkLibraryComponent],
      providers: [provideRouter([]), { provide: CatalogApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(DrinkLibraryComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance as unknown as LibraryInternals };
  };

  it('lists entries and marks drinks already in the catalog', () => {
    const { fixture } = create();
    const text = fixture.nativeElement.textContent as string;
    expect(api.searchLibrary).toHaveBeenCalledWith({ q: '' });
    expect(text).toContain('Helles');
    expect(text).toContain('Schon im Katalog');
  });

  it('searches by barcode when one is given', () => {
    const { cmp } = create();
    cmp.barcode = ' 4001 ';
    cmp.search();
    expect(api.searchLibrary).toHaveBeenLastCalledWith({ barcode: '4001' });
  });

  it('opens the adopt form right away for a scanned barcode with one hit', () => {
    const { cmp } = create();
    api.searchLibrary.mockReturnValue(of([entries[0]]));
    cmp.onScanned('4001');
    expect(api.searchLibrary).toHaveBeenLastCalledWith({ barcode: '4001' });
    expect(cmp.adoptingId()).toBe('l-1');
  });

  it('requires a price and adopts with the library id', () => {
    const { cmp } = create();
    cmp.startAdopt(entries[0]);
    cmp.adopt(entries[0]);
    expect(cmp.formError()).toBeTruthy();
    expect(api.proposeDrink).not.toHaveBeenCalled();

    cmp.price = 2.5;
    cmp.adopt(entries[0]);
    expect(api.proposeDrink).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Helles',
        category: 'Bier',
        description: 'Mild',
        defaultPrice: 2.5,
        barcodes: ['4001'],
        libraryDrinkId: 'l-1',
      }),
    );
    expect(cmp.success()).toContain('Helles');
  });
});
