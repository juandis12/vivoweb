/**
 * db.js — Motor de persistencia local IndexedDB para VivoTV
 * Permite almacenar miles de ítems de catálogo con alto rendimiento.
 */

const DB_NAME = 'vivotv_cache_db';
const DB_VERSION = 2; // Incrementar versión para el nuevo store
const STORE_NAME = 'content_metadata';
const INVALID_STORE = 'invalid_ids';

export const VIVOTV_DB = {
    _db: null,

    async init() {
        if (this._db) return this._db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'tmdb_id' });
                }
                if (!db.objectStoreNames.contains(INVALID_STORE)) {
                    db.createObjectStore(INVALID_STORE, { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this._db = event.target.result;
                resolve(this._db);
            };

            request.onerror = (event) => reject(event.target.error);
        });
    },

    async saveAll(items) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            items.forEach(item => {
                // Normalizar tmdb_id como string para la llave
                const record = { ...item, tmdb_id: (item.tmdb_id || item.id).toString() };
                store.put(record);
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    },

    async getAll() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    },

    async clear() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME, INVALID_STORE], 'readwrite');
            transaction.objectStore(STORE_NAME).clear();
            transaction.objectStore(INVALID_STORE).clear();
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    },

    async saveInvalidIds(ids) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([INVALID_STORE], 'readwrite');
            const store = transaction.objectStore(INVALID_STORE);
            ids.forEach(id => store.put({ id }));
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    },

    async getInvalidIds() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([INVALID_STORE], 'readonly');
            const store = transaction.objectStore(INVALID_STORE);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result.map(r => r.id));
            request.onerror = (event) => reject(event.target.error);
        });
    }
};
