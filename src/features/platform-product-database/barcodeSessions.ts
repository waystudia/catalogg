import type { SharedProduct } from "../../entities/sharedProducts";

export type BarcodeSessionStatus =
  | "draft"
  | "exported"
  | "processing"
  | "ready"
  | "imported"
  | "archived";
export type BarcodeEntryStatus =
  | "checking"
  | "new"
  | "known"
  | "unchecked"
  | "ready"
  | "review"
  | "imported";

export type BarcodeEntry = {
  barcode: string;
  normalizedBarcode: string;
  firstScannedAt: string;
  lastScannedAt: string;
  scanCount: number;
  status: BarcodeEntryStatus;
  knownProduct: SharedProduct | null;
};

export type BarcodeSession = {
  id: string;
  name: string;
  merchant: string;
  createdAt: string;
  updatedAt: string;
  status: BarcodeSessionStatus;
  entries: BarcodeEntry[];
};

export type ImportedProductDraft = {
  id: string;
  barcode: string;
  title: string;
  brand: string;
  category: string;
  subcategory: string;
  description: string;
  netContentValue: number | null;
  netContentUnit: "g" | "kg" | "ml" | "l" | "piece" | null;
  imagePath: string | null;
  imageFile: File | null;
  confidence: number | null;
  categoryId: string | null;
  status: "ready" | "review" | "duplicate" | "imported" | "error";
  reasons: string[];
  error: string | null;
};

export type BarcodeSessionStore = {
  list: () => Promise<BarcodeSession[]>;
  put: (session: BarcodeSession) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const DB_NAME = "wayyaam-superadmin-products";
const STORE_NAME = "barcode-sessions";
const DB_VERSION = 1;

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Не удалось открыть локальную базу"));
  });

const runTransaction = async <T>(
  mode: IDBTransactionMode,
  operation: (
    store: IDBObjectStore,
    resolve: (value: T) => void,
    reject: (reason?: unknown) => void,
  ) => void,
) => {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      operation(transaction.objectStore(STORE_NAME), resolve, reject);
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Ошибка локального сохранения"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Локальное сохранение отменено"));
    });
  } finally {
    database.close();
  }
};

export const indexedDbBarcodeSessionStore: BarcodeSessionStore = {
  list: () =>
    runTransaction<BarcodeSession[]>("readonly", (store, resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () =>
        resolve(
          (request.result as BarcodeSession[]).sort((left, right) =>
            right.updatedAt.localeCompare(left.updatedAt),
          ),
        );
      request.onerror = () => reject(request.error);
    }),
  put: (session) =>
    runTransaction<void>("readwrite", (store, resolve, reject) => {
      const request = store.put(session);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }),
  remove: (id) =>
    runTransaction<void>("readwrite", (store, resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }),
};

export const createBarcodeSession = (input: {
  name: string;
  merchant?: string;
  now?: Date;
}): BarcodeSession => {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    name: input.name.trim() || `Сессия ${now.toLocaleDateString("ru-RU")}`,
    merchant: input.merchant?.trim() ?? "",
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "draft",
    entries: [],
  };
};

export const barcodeSessionStats = (session: BarcodeSession) => ({
  unique: session.entries.length,
  newCount: session.entries.filter(
    (entry) => entry.status === "new" || entry.status === "unchecked",
  ).length,
  known: session.entries.filter((entry) => entry.status === "known").length,
  repeats: session.entries.reduce(
    (total, entry) => total + Math.max(0, entry.scanCount - 1),
    0,
  ),
});
