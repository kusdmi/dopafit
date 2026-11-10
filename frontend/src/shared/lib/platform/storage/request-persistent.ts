/**
 * Просит браузер закрепить хранилище origin (исключить из LRU/ITP-eviction).
 * На Safari/Chromium грант авто, без промпта. Best-effort: нет API — no-op.
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // best-effort: сбой запроса не должен влиять на запуск приложения.
  }
}
