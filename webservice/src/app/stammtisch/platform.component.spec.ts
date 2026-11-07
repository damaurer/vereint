import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { PlatformComponent } from './platform.component';
import { StammtischApiService, type PlatformStammtischDto } from './stammtisch-api.service';

interface PlatformInternals {
  newName: string;
  adminEmail: string;
  create(): void;
  toggleArchived(item: PlatformStammtischDto): void;
  info(): string | null;
}

const item: PlatformStammtischDto = {
  id: 'st-1',
  name: 'Eber',
  archived: false,
  memberCount: 12,
  createdAt: '2026-01-01T10:00:00Z',
  storageBytes: 3 * 1024 ** 3,
};

describe('PlatformComponent', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  const create = () => {
    api = {
      platformList: vi.fn(() => of([item])),
      platformCreate: vi.fn(() => of({ ...item, id: 'st-2', name: 'Neu' })),
      platformUpdate: vi.fn(() => of({ ...item, archived: true })),
    };
    TestBed.configureTestingModule({
      imports: [PlatformComponent],
      providers: [provideRouter([]), { provide: StammtischApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(PlatformComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance as unknown as PlatformInternals };
  };

  it('lists all groups with member count', () => {
    const { fixture } = create();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Eber');
    expect(text).toContain('12 Mitglieder');
  });

  it('creates a group with an optional admin e-mail', () => {
    const { cmp } = create();
    cmp.newName = ' Neu ';
    cmp.adminEmail = 'chef@example.org';
    cmp.create();
    expect(api['platformCreate']).toHaveBeenCalledWith({ name: 'Neu', adminEmail: 'chef@example.org' });
    expect(api['platformList']).toHaveBeenCalledTimes(2);
  });

  it('archives after confirmation', () => {
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const { cmp } = create();
    cmp.toggleArchived(item);
    expect(api['platformUpdate']).toHaveBeenCalledWith('st-1', { archived: true });
    confirm.mockRestore();
  });

  it('shows the storage in use', () => {
    const { fixture } = create();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('3 GB belegt');
    expect(text).not.toContain('Tarif');
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
  });
});
