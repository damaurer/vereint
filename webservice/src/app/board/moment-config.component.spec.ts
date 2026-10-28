import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-client.service';
import type { MomentConfigDto, MomentTypeDto } from '../api/api.types';
import { MemberApiService } from '../member/member-api.service';
import { MomentConfigComponent } from './moment-config.component';

interface ConfigInternals {
  typeName: string;
  typeEmoji: string;
  typeAllReactions: boolean;
  typeReactionIds: Set<string>;
  formError(): string | null;
  typeFormOpen(): boolean;
  editType(type: MomentTypeDto | null): void;
  toggleTypeReaction(id: string): void;
  canSaveType(): boolean;
  saveType(): void;
}

const config: MomentConfigDto = {
  types: [
    {
      id: 't-1',
      code: 'toast',
      name: 'Anstoßen',
      emoji: '🍻',
      description: 'Alle heben das Glas',
      active: true,
      allReactions: false,
      reactionIds: ['r-1'],
      allowedReactionCodes: ['TOAST'],
    },
    {
      id: 't-2',
      code: 'other',
      name: 'Sonstiges',
      emoji: '✨',
      description: null,
      active: false,
      allReactions: true,
      reactionIds: [],
      allowedReactionCodes: ['TOAST', 'HEART'],
    },
  ],
  reactions: [
    { id: 'r-1', code: 'TOAST', name: 'Prost', emoji: '🥂', active: true },
    { id: 'r-2', code: 'HEART', name: 'Herz', emoji: '❤️', active: true },
  ],
  mediaLimits: {
    maxImageBytes: 10,
    maxVideoBytes: 100,
    maxVideoSeconds: 60,
    maxMediaPerResponse: 4,
    imageTypes: ['image/jpeg'],
    videoTypes: ['video/mp4'],
  },
};

describe('MomentConfigComponent', () => {
  let api: {
    getMomentConfig: ReturnType<typeof vi.fn>;
    saveMomentType: ReturnType<typeof vi.fn>;
    saveMomentReaction: ReturnType<typeof vi.fn>;
  };

  const create = () => {
    TestBed.configureTestingModule({
      imports: [MomentConfigComponent],
      providers: [provideRouter([]), { provide: MemberApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(MomentConfigComponent);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    api = {
      getMomentConfig: vi.fn(() => of(config)),
      saveMomentType: vi.fn(() => of(config.types[0])),
      saveMomentReaction: vi.fn(() => of(config.reactions[0])),
    };
  });

  it('shows types and reactions by name with the allowed reactions, never IDs', () => {
    const text = (create().nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Anstoßen');
    expect(text).toContain('Prost');
    expect(text).toContain('Herz');
    expect(text).not.toContain('t-1');
    expect(text).not.toContain('r-2');
  });

  it('saves a new type limited to the chosen reactions', () => {
    const cmp = create().componentInstance as unknown as ConfigInternals;
    cmp.editType(null);
    cmp.typeName = ' Siegerehrung ';
    cmp.typeEmoji = '🏆';
    cmp.typeAllReactions = false;
    expect(cmp.canSaveType()).toBe(false);
    cmp.toggleTypeReaction('r-2');
    expect(cmp.canSaveType()).toBe(true);

    cmp.saveType();

    expect(api.saveMomentType).toHaveBeenCalledWith(null, {
      name: 'Siegerehrung',
      emoji: '🏆',
      description: undefined,
      active: true,
      allReactions: false,
      reactionIds: ['r-2'],
    });
    expect(cmp.typeFormOpen()).toBe(false);
    expect(api.getMomentConfig).toHaveBeenCalledTimes(2);
  });

  it('keeps the form open and shows the server message when saving fails', () => {
    api.saveMomentType.mockReturnValue(
      throwError(() => new ApiError(409, 'conflict', 'Diesen Namen gibt es schon.')),
    );
    const cmp = create().componentInstance as unknown as ConfigInternals;
    cmp.editType(config.types[0]);
    cmp.saveType();

    expect(api.saveMomentType).toHaveBeenCalledWith('t-1', expect.objectContaining({ reactionIds: ['r-1'] }));
    expect(cmp.typeFormOpen()).toBe(true);
    expect(cmp.formError()).toBe('Diesen Namen gibt es schon.');
  });
});
