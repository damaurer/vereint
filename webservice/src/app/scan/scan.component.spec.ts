import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { LedgerEntry, PurchasePreview } from '../api/api.types';
import { MemberApiService } from '../member/member-api.service';
import { BARCODE_SCANNER, BarcodeScanner } from './barcode-scanner';
import { ScanComponent } from './scan.component';

const preview: PurchasePreview = {
  barcode: '4006381333931',
  drinkId: 'g-1',
  drinkName: 'Helles',
  imageReference: null,
  options: [{ eventId: 'e-1', eventTitle: 'Vereinsabend', unitPrice: '2.50', currency: 'EUR' }],
  creditBalance: '1.00',
  balanceCurrency: 'EUR',
};

const entry = {
  id: 'l-1',
  amount: '2.50',
  currency: 'EUR',
  createdAt: '2026-10-14T18:00:00Z',
} as LedgerEntry;

describe('ScanComponent', () => {
  let api: {
    previewPurchase: ReturnType<typeof vi.fn>;
    purchaseByBarcode: ReturnType<typeof vi.fn>;
    undoPurchase: ReturnType<typeof vi.fn>;
  };
  let scanner: BarcodeScanner & { emit: (code: string) => void; stop: ReturnType<typeof vi.fn> };

  const create = async () => {
    TestBed.configureTestingModule({
      imports: [ScanComponent],
      providers: [
        provideRouter([]),
        { provide: MemberApiService, useValue: api },
        { provide: BARCODE_SCANNER, useValue: scanner },
      ],
    });
    const fixture = TestBed.createComponent(ScanComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const settle = async (fixture: Awaited<ReturnType<typeof create>>) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const text = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  const click = (fixture: { nativeElement: unknown }, label: string) => {
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => (b.textContent ?? '').includes(label));
    if (!button) throw new Error(`button "${label}" not found`);
    button.click();
  };

  beforeEach(() => {
    api = {
      previewPurchase: vi.fn(() => of(preview)),
      purchaseByBarcode: vi.fn(() => of(entry)),
      undoPurchase: vi.fn(() => of({ id: 'l-2' } as LedgerEntry)),
    };
    let onCode: (code: string) => void = () => undefined;
    const stop = vi.fn();
    scanner = {
      supported: () => true,
      start: vi.fn(async (_video: HTMLVideoElement, cb: (code: string) => void) => {
        onCode = cb;
        return { stop };
      }),
      emit: (code: string) => onCode(code),
      stop,
    };
  });

  it('shows drink, price and credit afterwards after a scan and charges nothing yet', async () => {
    const fixture = await create();
    scanner.emit('4006381333931');
    await settle(fixture);

    expect(scanner.stop).toHaveBeenCalled();
    expect(api.previewPurchase).toHaveBeenCalledWith('4006381333931');
    expect(text(fixture)).toContain('Helles');
    expect(text(fixture)).toContain('Vereinsabend');
    expect(text(fixture)).toContain('ins Minus');
    expect(api.purchaseByBarcode).not.toHaveBeenCalled();
  });

  it('charges the credit only after confirming and offers undo', async () => {
    const fixture = await create();
    scanner.emit('4006381333931');
    await settle(fixture);

    click(fixture, 'bezahlen');
    await settle(fixture);

    expect(api.purchaseByBarcode).toHaveBeenCalledTimes(1);
    const [eventId, barcode, key] = api.purchaseByBarcode.mock.calls[0];
    expect(eventId).toBe('e-1');
    expect(barcode).toBe('4006381333931');
    expect(typeof key).toBe('string');
    expect(text(fixture)).toContain('Bezahlt');

    click(fixture, 'Rückgängig');
    await settle(fixture);
    expect(api.undoPurchase).toHaveBeenCalledWith('l-1', expect.any(String));
    expect(text(fixture)).toContain('Kauf zurückgenommen');
  });

  it('reuses the idempotency key when paying again after a failure', async () => {
    api.purchaseByBarcode.mockReturnValueOnce(
      throwError(() => new ApiError(0, 'network_error', '')),
    );
    const fixture = await create();
    scanner.emit('4006381333931');
    await settle(fixture);

    click(fixture, 'bezahlen');
    await settle(fixture);
    click(fixture, 'bezahlen');
    await settle(fixture);

    expect(api.purchaseByBarcode).toHaveBeenCalledTimes(2);
    expect(api.purchaseByBarcode.mock.calls[0][2]).toBe(api.purchaseByBarcode.mock.calls[1][2]);
    expect(text(fixture)).toContain('Bezahlt');
  });

  it('lets the member choose the event when the drink is sold at several', async () => {
    api.previewPurchase.mockReturnValue(
      of({
        ...preview,
        options: [
          { eventId: 'e-1', eventTitle: 'Vereinsabend', unitPrice: '2.50', currency: 'EUR' },
          { eventId: 'e-2', eventTitle: 'Sommerfest', unitPrice: '3.00', currency: 'EUR' },
        ],
      }),
    );
    const fixture = await create();
    scanner.emit('4006381333931');
    await settle(fixture);

    const radios = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
      'input[type=radio]',
    );
    expect(radios.length).toBe(2);
    radios[1].click();
    await settle(fixture);
    click(fixture, 'bezahlen');
    await settle(fixture);

    expect(api.purchaseByBarcode.mock.calls[0][0]).toBe('e-2');
  });

  it('shows the server message for an unknown barcode and lets the member scan again', async () => {
    api.previewPurchase.mockReturnValue(
      throwError(() => new ApiError(404, 'not_found', "Kein Getränk zu Barcode '123' gefunden")),
    );
    const fixture = await create();
    scanner.emit('123');
    await settle(fixture);

    expect(text(fixture)).toContain("Kein Getränk zu Barcode '123' gefunden");
    click(fixture, 'Nochmal scannen');
    await settle(fixture);
    expect(scanner.start).toHaveBeenCalledTimes(2);
  });

  it('falls back to typing the number when there is no camera', async () => {
    scanner.supported = () => false;
    const fixture = await create();

    expect(text(fixture)).toContain('keine Kamera');
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[name=barcode]',
    )!;
    input.value = '4006381 333931';
    input.dispatchEvent(new Event('input'));
    await settle(fixture);
    click(fixture, 'Suchen');
    await settle(fixture);

    expect(api.previewPurchase).toHaveBeenCalledWith('4006381333931');
  });
});
