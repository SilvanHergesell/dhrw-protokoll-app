// Minimal IndexedDB wrapper: one store for protocol records, one for
// photo/signature blobs keyed "<recordId>:<slot>".

const DB_NAME = 'dhrw-protokoll';
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('records', { keyPath: 'id' });
      db.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    t.onerror = () => reject(t.error);
  });
}

export const listRecords = async () =>
  (await tx('records', 'readonly', (s) => s.getAll())).sort((a, b) => b.updatedAt - a.updatedAt);
export const getRecord = (id) => tx('records', 'readonly', (s) => s.get(id));
export const putRecord = (rec) => tx('records', 'readwrite', (s) => s.put(rec));

export const getBlob = (id, slot) => tx('blobs', 'readonly', (s) => s.get(`${id}:${slot}`));
export const putBlob = (id, slot, blob) => tx('blobs', 'readwrite', (s) => s.put(blob, `${id}:${slot}`));
export const deleteBlob = (id, slot) => tx('blobs', 'readwrite', (s) => s.delete(`${id}:${slot}`));

export async function deleteRecord(id) {
  await tx('records', 'readwrite', (s) => s.delete(id));
  await tx('blobs', 'readwrite', (s) => s.delete(IDBKeyRange.bound(`${id}:`, `${id}:\uffff`)));
}
