/**
 * Kamera- und Standort-Erlaubnis im Browser abfragen und anfragen.
 *
 * Nur im Browser aufrufen. Die eigentliche Nutzung (Scan, Moment mit Standort)
 * fragt weiterhin selbst; diese Helfer dienen dem Startdialog, der die
 * Erlaubnis vorab per Knopfdruck einholen kann.
 */

/** `unsupported`: Browser oder Gerät kann die Funktion nicht (z. B. keine Kamera). */
export type DevicePermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

type QueryName = 'camera' | 'geolocation';

/** Liest den Stand über die Permissions-API; unbekannt gilt als „noch nicht gefragt“. */
async function query(name: QueryName): Promise<DevicePermission> {
  try {
    const status = await Promise.race([
      navigator.permissions?.query({ name: name as PermissionName }),
      // Manche Browser antworten nie; dann lieber fragen als hängen.
      new Promise<undefined>((resolve) => setTimeout(resolve, 1_500)),
    ]);
    if (status?.state === 'granted' || status?.state === 'denied') return status.state;
  } catch {
    // Firefox kennt `camera` nicht; dann bleibt nur das Fragen.
  }
  return 'prompt';
}

/** Hat das Gerät überhaupt eine Kamera? Ohne Erlaubnis fehlen nur die Namen. */
async function hasCamera(): Promise<boolean> {
  const media = navigator.mediaDevices;
  if (typeof media?.getUserMedia !== 'function') return false;
  if (typeof media.enumerateDevices !== 'function') return true;
  try {
    const devices = await Promise.race([
      media.enumerateDevices(),
      new Promise<MediaDeviceInfo[] | null>((resolve) => setTimeout(() => resolve(null), 1_500)),
    ]);
    if (!devices) return true;
    return devices.some((device) => device.kind === 'videoinput');
  } catch {
    return true;
  }
}

export async function cameraPermission(): Promise<DevicePermission> {
  if (!(await hasCamera())) return 'unsupported';
  return query('camera');
}

export async function locationPermission(): Promise<DevicePermission> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  return query('geolocation');
}

/** Öffnet kurz die Kamera, damit der Browser fragt, und gibt sie sofort wieder frei. */
export async function requestCamera(): Promise<DevicePermission> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'unsupported';
    return 'denied';
  }
}

/** Fragt einmal nach dem Standort; der Wert selbst wird verworfen. */
export function requestLocation(): Promise<DevicePermission> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (error) => resolve(error.code === error.PERMISSION_DENIED ? 'denied' : 'granted'),
      { maximumAge: Infinity, timeout: 15_000 },
    );
  });
}
