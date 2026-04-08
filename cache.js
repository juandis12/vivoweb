/**
 * VivoCache v1.0 — Motor de persistencia basado en IndexedDB.
 * Proporciona almacenamiento permanente para metadatos de películas y series.
 */
const DB_NAME = 'VivoWeb_CacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'api_cache';

export const VivoCache = {
    _db: null,

    async init() {
        if (this._db) return this._db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                }
            };

            request.onsuccess = (e) => {
                this._db = e.target.result;
                resolve(this._db);
            };

            request.onerror = (e) => reject(e.target.error);
        });
    },

    async get(key) {
        const db = await this.init();
        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);
            
            request.onsuccess = () => {
                const result = request.result;
                if (result && VivoCache.isFresh(result.timestamp)) {
                    resolve(result.data);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => resolve(null);
        });
    },

    async set(key, data) {
        const db = await this.init();
        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.put({
                key,
                data,
                timestamp: Date.now()
            });
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => resolve(false);
        });
    },

    isFresh(timestamp) {
        const TTL = 24 * 60 * 60 * 1000; // 24 horas para IndexedDB
        return (Date.now() - timestamp) < TTL;
    },

    async clear() {
        const db = await this.init();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).clear();
    }
};
