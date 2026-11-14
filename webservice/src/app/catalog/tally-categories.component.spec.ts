import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CatalogApiService, type DrinkSummaryDto, type TallyCategoryDto } from './catalog-api.service';
import { TallyCategoriesComponent } from './tally-categories.component';

const categories: TallyCategoryDto[] = [
  {
    id: 'c-bier',
    name: 'Bier',
    price: 3.5,
    currency: 'EUR',
    sortOrder: 0,
    drinks: [
      { id: 'd-1', name: 'Helles', defaultPrice: 3.5, currency: 'EUR' },
      { id: 'd-2', name: 'Weißbier', defaultPrice: 3.8, currency: 'EUR' },
    ],
  },
  { id: 'c-schnaps', name: 'Schnaps', price: 2, currency: 'EUR', sortOrder: 1, drinks: [] },
];

const drinks: DrinkSummaryDto[] = [
  { id: 'd-1', name: 'Helles', defaultPrice: 3.5, currency: 'EUR', status: 'approved', active: true, catalogVersion: 1, tallyCategoryId: 'c-bier' },
  { id: 'd-3', name: 'Sekt', defaultPrice: 4, currency: 'EUR', status: 'approved', active: true, catalogVersion: 1, tallyCategoryId: null },
  { id: 'd-4', name: 'Altbestand', defaultPrice: 1, currency: 'EUR', status: 'approved', active: false, catalogVersion: 1 },
  { id: 'd-5', name: 'Vorschlag', defaultPrice: 1, currency: 'EUR', status: 'proposed', active: true, catalogVersion: 1 },
];

describe('TallyCategoriesComponent', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [TallyCategoriesComponent],
      providers: [provideRouter([]), { provide: CatalogApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(TallyCategoriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    api = {
      listTallyCategories: vi.fn(() => of(categories)),
      listDrinks: vi.fn(() => of(drinks)),
      createTallyCategory: vi.fn(() => of(categories[0])),
      updateTallyCategory: vi.fn(() => of(categories[0])),
      reorderTallyCategories: vi.fn(() => of(categories)),
      deleteTallyCategory: vi.fn(() => of(undefined)),
      assignTallyCategory: vi.fn(() => of({})),
    };
  });

  it('lists categories with their drinks, strikes through a differing own price and shows drinks without category', async () => {
    const fixture = await create();
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';
    expect(text).toContain('Helles');
    expect(text).toContain('Weißbier');
    expect(el.querySelectorAll('.tally-own-price').length).toBe(1);
    expect(el.querySelector('.tally-own-price')?.textContent).toMatch(/3,80/);
    const without = el.querySelector('.tally-none')?.textContent ?? '';
    expect(without).toContain('Sekt');
    expect(without).not.toContain('Altbestand');
    expect(without).not.toContain('Vorschlag');
  });

  it('creates a category with name and price', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as any;
    cmp.toggleCreate();
    cmp.newName = ' Wein & Sekt ';
    cmp.newPrice = 4;
    cmp.create(new Event('submit'));
    expect(api['createTallyCategory']).toHaveBeenCalledWith({ name: 'Wein & Sekt', price: 4 });
    expect(cmp.creating()).toBe(false);
  });

  it('rejects a negative price without calling the server', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as any;
    cmp.changePrice(categories[0], '-1');
    expect(api['updateTallyCategory']).not.toHaveBeenCalled();
    expect(cmp.error()).toBeTruthy();
  });

  it('changes price, moves a column and assigns or removes drinks', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as any;
    cmp.changePrice(categories[0], '3.60');
    expect(api['updateTallyCategory']).toHaveBeenCalledWith('c-bier', { price: 3.6 });

    cmp.move(categories, categories[1], -1);
    expect(api['reorderTallyCategories']).toHaveBeenCalledWith(['c-schnaps', 'c-bier']);

    cmp.assign('d-3', 'c-schnaps');
    expect(api['assignTallyCategory']).toHaveBeenCalledWith('d-3', 'c-schnaps');
    cmp.assign('d-1', '');
    expect(api['assignTallyCategory']).toHaveBeenCalledWith('d-1', '');
  });

  it('deletes a category after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fixture = await create();
    (fixture.componentInstance as any).remove(categories[1]);
    expect(api['deleteTallyCategory']).toHaveBeenCalledWith('c-schnaps');
  });
});
