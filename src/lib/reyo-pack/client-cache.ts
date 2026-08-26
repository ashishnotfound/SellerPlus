"use client";

const DB_NAME = "sellerplus-reyo-pack";
const DB_VERSION = 1;
const STORE_NAME = "workspace-snapshots";

interface SnapshotRecord {
  key: string;
  workspaceId: string;
  value: unknown;
  savedAt: string;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => resolve(null);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function readReyoPackSnapshot<T>(workspaceId: string, name: string): Promise<{ value: T; savedAt: string } | null> {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(`${workspaceId}:${name}`);
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const record = request.result as SnapshotRecord | undefined;
      resolve(record ? { value: record.value as T, savedAt: record.savedAt } : null);
    };
    transaction.oncomplete = () => database.close();
  });
}

export async function writeReyoPackSnapshot(workspaceId: string, name: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({
      key: `${workspaceId}:${name}`,
      workspaceId,
      value,
      savedAt: new Date().toISOString(),
    } satisfies SnapshotRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
  database.close();
}

export async function clearReyoPackWorkspaceCache(workspaceId: string): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result as IDBCursorWithValue | null;
      if (!cursor) return;
      const record = cursor.value as SnapshotRecord;
      if (record.workspaceId === workspaceId) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
  database.close();
}
