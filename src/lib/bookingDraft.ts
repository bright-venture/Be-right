// Keeps an unfinished booking on this device so a guest can sign in (possibly via an
// email link that opens a new tab) without losing what they entered. Text fields go
// to localStorage; photos/videos go to IndexedDB because they are too big for it.

const KEY = "br-booking-draft";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DB_NAME = "br-booking";
const STORE = "files";

export type DraftFields = {
  step: number;
  category: string;
  answers: Record<string, string>;
  date: string;
  slot: string;
  area: string;
  address: string;
  phone: string;
  notes: string;
  /** Map pin for the visit address. */
  pin?: { lat: number; lng: number } | null;
};

export function loadDraftFields(): DraftFields | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; fields: DraftFields };
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed.fields;
  } catch {
    return null;
  }
}

export function saveDraftFields(fields: DraftFields) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), fields }));
  } catch {
    // Storage full or blocked — the booking still works, it just won't survive a reload.
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveDraftFiles(files: File[]) {
  try {
    await withStore("readwrite", (s) => s.put(files, "current"));
  } catch {
    // Ignore — photos just won't be restored.
  }
}

export async function loadDraftFiles(): Promise<File[]> {
  try {
    const files = await withStore<File[] | undefined>("readonly", (s) => s.get("current"));
    return Array.isArray(files) ? files : [];
  } catch {
    return [];
  }
}

export async function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  try {
    await withStore("readwrite", (s) => s.delete("current"));
  } catch {
    // ignore
  }
}
