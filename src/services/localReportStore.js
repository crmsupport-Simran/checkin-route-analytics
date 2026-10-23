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

export async function saveLocalReport(key, file) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      blob: file,
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
    }, key);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('The report could not be saved in this browser.')); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Saving the report in this browser was interrupted.')); };
  });
}

export async function loadLocalReport(key) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => {
      const stored = request.result;
      if (!stored?.blob) return;
      resolve(new File([stored.blob], stored.name || 'Check-In report', {
        type: stored.type || stored.blob.type || 'application/octet-stream',
        lastModified: stored.lastModified || Date.now(),
      }));
    };
    request.onerror = () => reject(request.error || new Error('The saved report could not be read.'));
    transaction.oncomplete = () => { database.close(); if (request.readyState === 'done' && request.result == null) resolve(null); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('The saved report could not be read.')); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Reading the saved report was interrupted.')); };
  });
}
