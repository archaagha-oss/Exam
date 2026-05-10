/**
 * Persistent answer queue backed by IndexedDB.
 *
 * If the network is down or the request fails, queued writes survive a
 * tab close / refresh. On reconnect, the queue drains in order.
 *
 * Each item carries its idempotency key so server-side replays are safe.
 */
const DB_NAME = 'secureexam';
const DB_VERSION = 1;
const STORE = 'answer_queue';

export interface QueuedWrite {
  id: string; // primary key (idempotency key)
  url: string;
  body: unknown;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function enqueue(write: QueuedWrite): Promise<void> {
  await tx('readwrite', (s) => s.put(write));
}

export async function listAll(): Promise<QueuedWrite[]> {
  return tx<QueuedWrite[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedWrite[]>);
}

export async function remove(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

export async function clear(): Promise<void> {
  await tx('readwrite', (s) => s.clear());
}

/**
 * Drain the queue, calling sender(write) for each item. Items that succeed
 * are removed; failures are left in the queue for the next attempt.
 */
export async function drain(
  sender: (w: QueuedWrite) => Promise<void>
): Promise<{ sent: number; failed: number }> {
  const items = await listAll();
  items.sort((a, b) => a.createdAt - b.createdAt);
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await sender(item);
      await remove(item.id);
      sent += 1;
    } catch {
      failed += 1;
      // Stop on first failure — preserve order
      break;
    }
  }
  return { sent, failed };
}
