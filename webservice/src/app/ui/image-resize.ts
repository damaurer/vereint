/**
 * Verkleinert ein Bild im Browser auf höchstens `maxEdge` Pixel (längste Kante)
 * und kodiert es als JPEG. Das spart Upload-Zeit und Speicher und entfernt
 * nebenbei EXIF/GPS. `null`, wenn der Browser das Bild nicht lesen kann.
 *
 * Genutzt für Moment-Fotos und das Gruppenbild.
 */
export async function resizeImageToJpeg(file: Blob, maxEdge: number, quality = 0.85): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  } finally {
    bitmap.close();
  }
}
