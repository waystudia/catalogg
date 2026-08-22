export type SharedProductCreationDraft = {
  barcode: string;
  title: string;
  categoryId: string;
  description: string;
  originalPhoto: File | null;
  updatedAt: string;
};

export type SharedProductDraftStore = {
  load: (key: string) => Promise<SharedProductCreationDraft | null>;
  save: (key: string, draft: SharedProductCreationDraft) => Promise<void>;
  clear: (key: string) => Promise<void>;
};

type StoredSharedProductCreationDraft = SharedProductCreationDraft & { key: string };

const DATABASE_NAME = 'wayyaam-shared-product-drafts';
const STORE_NAME = 'creation-drafts';
const DATABASE_VERSION = 1;

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Не удалось открыть черновики товаров'));
});

const withStore = async <T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, transaction: IDBTransaction) => Promise<T>
) => {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    return await operation(transaction.objectStore(STORE_NAME), transaction);
  } finally {
    database.close();
  }
};

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Ошибка локального черновика'));
});

const transactionComplete = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error('Ошибка сохранения черновика'));
  transaction.onabort = () => reject(transaction.error ?? new Error('Сохранение черновика отменено'));
});

export const indexedDbSharedProductDraftStore: SharedProductDraftStore = {
  load: (key) => withStore('readonly', async (store) => {
    const stored = await requestResult(store.get(key) as IDBRequest<StoredSharedProductCreationDraft | undefined>);
    if (!stored) return null;
    return {
      barcode: stored.barcode,
      title: stored.title,
      categoryId: stored.categoryId,
      description: stored.description,
      originalPhoto: stored.originalPhoto,
      updatedAt: stored.updatedAt
    };
  }),
  save: (key, draft) => withStore('readwrite', async (store, transaction) => {
    store.put({ ...draft, key } satisfies StoredSharedProductCreationDraft);
    await transactionComplete(transaction);
  }),
  clear: (key) => withStore('readwrite', async (store, transaction) => {
    store.delete(key);
    await transactionComplete(transaction);
  })
};
