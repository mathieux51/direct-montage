// Shared IndexedDB for cross-app audio file sharing
const SHARED_DB_NAME = "DirectPodcastSharedDB";
const SHARED_DB_VERSION = 1;
const SHARED_STORE_NAME = "sharedAudioFiles";

export interface SharedAudioFile {
  id: string;
  filename: string;
  fileType: string;
  arrayBuffer: ArrayBuffer;
  timestamp: number;
}

export const openSharedDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARED_DB_NAME, SHARED_DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SHARED_STORE_NAME)) {
        const store = db.createObjectStore(SHARED_STORE_NAME, {
          keyPath: "id",
        });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
};

export const saveSharedAudioFile = async (
  filename: string,
  fileType: string,
  arrayBuffer: ArrayBuffer,
): Promise<string> => {
  const db = await openSharedDB();
  const id = `shared_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const sharedFile: SharedAudioFile = {
    id,
    filename,
    fileType,
    arrayBuffer,
    timestamp: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SHARED_STORE_NAME], "readwrite");
    const store = transaction.objectStore(SHARED_STORE_NAME);
    const request = store.put(sharedFile);

    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
  });
};

export const getLatestSharedAudioFile =
  async (): Promise<SharedAudioFile | null> => {
    const db = await openSharedDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SHARED_STORE_NAME], "readonly");
      const store = transaction.objectStore(SHARED_STORE_NAME);
      const index = store.index("timestamp");
      const request = index.openCursor(null, "prev"); // Get latest first

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          resolve(cursor.value as SharedAudioFile);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  };

export const clearSharedAudioFiles = async (): Promise<void> => {
  const db = await openSharedDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SHARED_STORE_NAME], "readwrite");
    const store = transaction.objectStore(SHARED_STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const cleanupOldSharedFiles = async (
  maxAgeMs: number = 24 * 60 * 60 * 1000,
): Promise<void> => {
  const db = await openSharedDB();
  const cutoffTime = Date.now() - maxAgeMs;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SHARED_STORE_NAME], "readwrite");
    const store = transaction.objectStore(SHARED_STORE_NAME);
    const index = store.index("timestamp");
    const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));

    const deleteOldFiles = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };

    request.onsuccess = deleteOldFiles;
    request.onerror = () => reject(request.error);
  });
};
