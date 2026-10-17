// Speicher-Backend lokal: IndexedDB im Browser (Testmodus ohne Login).
// Gleiche Schnittstelle (open, all, put, del, clear) wie das Online-Backend in cloud.js.
import { STORES } from './schema.js';

const NAME = 'mx-sports';
const VERSION = 2;

let db;

export function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Datenbank ist in einem anderen Tab geöffnet.'));
  });
}

function run(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Abgebrochen'));
  });
}

export const all = store => run(store, 'readonly', s => s.getAll());
export const put = (store, rows) => run(store, 'readwrite', s => { for (const r of [].concat(rows)) s.put(r); });
export const del = (store, key) => run(store, 'readwrite', s => s.delete(key));
export const clear = store => run(store, 'readwrite', s => s.clear());
