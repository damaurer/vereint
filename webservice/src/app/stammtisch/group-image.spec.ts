import { GroupImageError, GroupImagePreparer } from './group-image';
import { STAMMTISCH_IMAGE_MAX_BYTES, stammtischImageUrl } from './stammtisch-api.service';
import { groupInitials } from './group-avatar.component';

/** Ersetzt das Verkleinern im Browser (Canvas fehlt in jsdom). */
class FakePreparer extends GroupImagePreparer {
  result: Blob | null = new Blob(['jpeg'], { type: 'image/jpeg' });
  resizeCalls = 0;

  protected override resize(): Promise<Blob | null> {
    this.resizeCalls += 1;
    return Promise.resolve(this.result);
  }
}

describe('group picture helpers', () => {
  let preparer: FakePreparer;

  beforeEach(() => {
    preparer = new FakePreparer();
  });

  it('scales PNG, JPEG and GIF pictures down to a JPEG', async () => {
    for (const type of ['image/png', 'image/jpeg', 'image/gif']) {
      const prepared = await preparer.prepare(new File(['x'], 'bild', { type }));
      expect(prepared).toEqual({ blob: preparer.result, filename: 'gruppe.jpg' });
    }
    expect(preparer.resizeCalls).toBe(3);
  });

  it('rejects other formats before uploading', async () => {
    await expect(preparer.prepare(new File(['x'], 'bild.webp', { type: 'image/webp' }))).rejects.toBeInstanceOf(
      GroupImageError,
    );
    expect(preparer.resizeCalls).toBe(0);
  });

  it('falls back to the original when the browser cannot read it, within the size limit', async () => {
    preparer.result = null;
    const small = new File(['x'], 'logo.png', { type: 'image/png' });
    expect(await preparer.prepare(small)).toEqual({ blob: small, filename: 'logo.png' });

    const huge = new File([new Uint8Array(STAMMTISCH_IMAGE_MAX_BYTES + 1)], 'riesig.png', { type: 'image/png' });
    await expect(preparer.prepare(huge)).rejects.toThrow('höchstens 5 MB');
  });

  it('builds the image address only when a picture exists', () => {
    expect(stammtischImageUrl('st-1', 2)).toBe('/api/v1/stammtische/st-1/image?v=2');
    expect(stammtischImageUrl('st-1', null)).toBeNull();
    expect(stammtischImageUrl('st-1', undefined)).toBeNull();
  });

  it('derives up to two initials from the group name', () => {
    expect(groupInitials('Mein Stammtisch')).toBe('MS');
    expect(groupInitials('Kegelfreunde Nord e.V.')).toBe('KE');
    expect(groupInitials('eber')).toBe('E');
    expect(groupInitials('  ')).toBe('?');
  });
});
