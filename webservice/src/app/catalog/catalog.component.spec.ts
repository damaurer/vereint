import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { CatalogApiService, type DrinkSummaryDto, type FoodSummaryDto } from './catalog-api.service';
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
});
