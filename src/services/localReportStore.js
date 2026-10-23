const DATABASE_NAME = 'checkin-route-analytics-local-data';
const DATABASE_VERSION = 1;
const STORE_NAME = 'reports';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('This browser does not support local report storage.'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Local report storage could not be opened.'));
    request.onblocked = () => reject(new Error('Local report storage is blocked by another open dashboard tab.'));
  });
}

export async function clearLocalReport(key) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('The previous uploaded report could not be cleared.')); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Clearing the previous uploaded report was interrupted.')); };
  });
}
