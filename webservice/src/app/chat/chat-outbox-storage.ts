/** Ablage der Chat-Warteschlange im Browser (nur dieses Gerät, wird beim Abmelden geleert). */
export const CHAT_OUTBOX_STORAGE_KEY = 'vereint.chat.outbox';

/** Leert die Warteschlange dieses Geräts, etwa beim Abmelden. */
export function clearChatOutbox(): void {
  try {
    globalThis.localStorage?.removeItem(CHAT_OUTBOX_STORAGE_KEY);
  } catch {
    // Kein Speicher (privates Fenster): nichts zu leeren.
  }
}
