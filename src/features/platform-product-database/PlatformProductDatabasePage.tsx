import {
  Archive,
  Barcode,
  Camera,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileArchive,
  FileSpreadsheet,
  LoaderCircle,
  PackageCheck,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import type { SharedProduct } from "../../entities/sharedProducts";
import {
  isValidGlobalBarcode,
  normalizeGlobalBarcode,
} from "../../entities/sharedProducts";
import { SharedProductCatalogPage } from "../shared-product-catalog/SharedProductCatalogPage";
import {
  listMasterCategories,
  lookupSharedProductByBarcode,
  submitSharedProduct,
  uploadSharedProductImage,
  type MasterCategory,
} from "../../shared/api/sharedProductCatalogApi";
import { downloadCsv, downloadXlsx } from "../../shared/exportTable";
import {
  barcodeSessionStats,
  createBarcodeSession,
  indexedDbBarcodeSessionStore,
  type BarcodeEntry,
  type BarcodeSession,
  type BarcodeSessionStore,
  type ImportedProductDraft,
} from "./barcodeSessions";
import {
  barcodesFromTable,
  buildBarcodeExport,
  extractBarcodesFromText,
  parseProcessedCatalog,
  readBarcodeTable,
  type ImportedTable,
} from "./barcodeFiles";
import { PlatformBarcodeCameraScanner } from "./PlatformBarcodeCameraScanner";
import "./platform-product-database.css";

type ProductDatabaseTab = "catalog" | "collect" | "import" | "review";
type ScanResult = {
  kind: "added" | "duplicate" | "known" | "invalid" | "error";
  barcode: string;
  title?: string;
};

const tabs: Array<{ id: ProductDatabaseTab; label: string }> = [
  { id: "catalog", label: "Все товары" },
  { id: "collect", label: "Сбор штрих-кодов" },
  { id: "import", label: "Импорт" },
  { id: "review", label: "Требуют проверки" },
];

const fileSlug = (value: string) =>
  value
    .toLocaleLowerCase("ru")
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "session";

const downloadJson = (fileName: string, value: unknown) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileName}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const statusLabel: Record<BarcodeEntry["status"], string> = {
  checking: "Проверяем",
  new: "Новый",
  known: "Уже есть в WayYaam",
  unchecked: "Нужно проверить",
  ready: "Готов",
  review: "Требует проверки",
  imported: "Импортирован",
};

const makeDefaultSession = () => {
  const now = new Date();
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(now);
  return createBarcodeSession({ name: `Новая сессия · ${date}`, now });
};

export function PlatformProductDatabasePage({
  catalog,
}: {
  catalog?: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<ProductDatabaseTab>("collect");
  return (
    <section className="product-database-page">
      <header className="product-database-head">
        <div>
          <span>Master Product Catalog</span>
          <h1>База товаров</h1>
          <p>Общий каталог WayYaam и подготовка новых товаров.</p>
        </div>
      </header>
      <nav className="product-database-tabs" aria-label="Разделы базы товаров">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {activeTab === "catalog" ? (
        <div className="product-database-catalog">
          {catalog ?? <SharedProductCatalogPage mode="platform" />}
        </div>
      ) : (
        <BarcodeCollectionWorkspace
          section={activeTab}
          onSectionChange={setActiveTab}
        />
      )}
    </section>
  );
}

export function BarcodeCollectionWorkspace({
  section,
  onSectionChange,
  store = indexedDbBarcodeSessionStore,
  lookupProduct = lookupSharedProductByBarcode,
}: {
  section: Exclude<ProductDatabaseTab, "catalog">;
  onSectionChange: (tab: ProductDatabaseTab) => void;
  store?: BarcodeSessionStore;
  lookupProduct?: (barcode: string) => Promise<SharedProduct | null>;
}) {
  const [sessions, setSessions] = useState<BarcodeSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [bulkValue, setBulkValue] = useState("");
  const [tableImport, setTableImport] = useState<ImportedTable | null>(null);
  const [tableColumn, setTableColumn] = useState(0);
  const [importDrafts, setImportDrafts] = useState<ImportedProductDraft[]>([]);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [categories, setCategories] = useState<MasterCategory[]>([]);
  const [categoryError, setCategoryError] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);
  const tableFileRef = useRef<HTMLInputElement>(null);
  const catalogFileRef = useRef<HTMLInputElement>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const sessionsRef = useRef<BarcodeSession[]>([]);
  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ??
    sessions[0] ??
    null;

  const persistSession = useCallback(
    async (session: BarcodeSession) => {
      const nextSessions = [
        session,
        ...sessionsRef.current.filter((item) => item.id !== session.id),
      ];
      sessionsRef.current = nextSessions;
      setSessions(nextSessions);
      setActiveSessionId(session.id);
      try {
        await store.put(session);
        setStorageError("");
      } catch {
        setStorageError(
          "Не удалось сохранить локально. Не закрывайте вкладку и повторите действие.",
        );
      }
    },
    [store],
  );

  useEffect(() => {
    let cancelled = false;
    void store
      .list()
      .then(async (saved) => {
        if (cancelled) return;
        if (saved.length > 0) {
          sessionsRef.current = saved;
          setSessions(saved);
          setActiveSessionId(saved[0].id);
        } else {
          const initial = makeDefaultSession();
          await store.put(initial);
          if (!cancelled) {
            sessionsRef.current = [initial];
            setSessions([initial]);
            setActiveSessionId(initial.id);
          }
        }
      })
      .catch(() => {
        if (!cancelled)
          setStorageError(
            "Локальная база недоступна. Проверьте настройки браузера.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => {
    if (
      section !== "collect" ||
      newSessionOpen ||
      bulkOpen ||
      cameraOpen ||
      tableImport
    )
      return;
    scanInputRef.current?.focus();
  }, [
    activeSessionId,
    bulkOpen,
    cameraOpen,
    newSessionOpen,
    section,
    tableImport,
  ]);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current !== null)
        window.clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if ((section !== "import" && section !== "review") || categories.length > 0)
      return;
    void listMasterCategories()
      .then(setCategories)
      .catch(() => setCategoryError("Не удалось загрузить категории WayYaam."));
  }, [categories.length, section]);

  const showScanResult = (result: ScanResult) => {
    setScanResult(result);
    if (feedbackTimerRef.current !== null)
      window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(
      () => setScanResult(null),
      2200,
    );
  };

  const updateEntryAfterLookup = async (
    sessionId: string,
    normalizedBarcode: string,
    barcode: string,
  ) => {
    try {
      const product = await lookupProduct(barcode);
      const source = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (!source) return;
      const next: BarcodeSession = {
        ...source,
        updatedAt: new Date().toISOString(),
        entries: source.entries.map((entry) =>
          entry.normalizedBarcode === normalizedBarcode
            ? {
                ...entry,
                status: product ? "known" : "new",
                knownProduct: product,
              }
            : entry,
        ),
      };
      await persistSession(next);
      if (product)
        showScanResult({ kind: "known", barcode, title: product.title });
    } catch {
      const source = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (!source) return;
      await persistSession({
        ...source,
        updatedAt: new Date().toISOString(),
        entries: source.entries.map((entry) =>
          entry.normalizedBarcode === normalizedBarcode
            ? { ...entry, status: "unchecked" }
            : entry,
        ),
      });
    }
  };

  const addBarcode = async (rawBarcode: string, runLookup = true) => {
    const sourceSession =
      sessionsRef.current.find((session) => session.id === activeSessionId) ??
      activeSession;
    if (!sourceSession) return false;
    const barcode = rawBarcode.trim().replace(/[\s-]+/g, "");
    const normalizedBarcode = normalizeGlobalBarcode(barcode);
    if (!normalizedBarcode || !isValidGlobalBarcode(barcode)) {
      showScanResult({ kind: "invalid", barcode });
      return false;
    }
    const existing = sourceSession.entries.find(
      (entry) => entry.normalizedBarcode === normalizedBarcode,
    );
    const now = new Date().toISOString();
    if (existing) {
      const next = {
        ...sourceSession,
        updatedAt: now,
        entries: sourceSession.entries.map((entry) =>
          entry.normalizedBarcode === normalizedBarcode
            ? { ...entry, scanCount: entry.scanCount + 1, lastScannedAt: now }
            : entry,
        ),
      };
      await persistSession(next);
      showScanResult({ kind: "duplicate", barcode });
      return false;
    }
    const entry: BarcodeEntry = {
      barcode,
      normalizedBarcode,
      firstScannedAt: now,
      lastScannedAt: now,
      scanCount: 1,
      status: runLookup ? "checking" : "unchecked",
      knownProduct: null,
    };
    const next = {
      ...sourceSession,
      updatedAt: now,
      entries: [entry, ...sourceSession.entries],
    };
    await persistSession(next);
    showScanResult({ kind: "added", barcode });
    if (runLookup)
      void updateEntryAfterLookup(next.id, normalizedBarcode, barcode);
    return true;
  };

  const submitScan = async (event: FormEvent) => {
    event.preventDefault();
    const value = scanValue;
    setScanValue("");
    await addBarcode(value);
    window.requestAnimationFrame(() => scanInputRef.current?.focus());
  };

  const addMany = async (barcodes: string[]) => {
    const sourceSession =
      sessionsRef.current.find((session) => session.id === activeSessionId) ??
      activeSession;
    if (!sourceSession) return;
    const now = new Date().toISOString();
    const byBarcode = new Map(
      sourceSession.entries.map((entry) => [entry.normalizedBarcode, entry]),
    );
    let repeats = 0;
    for (const barcode of barcodes) {
      const normalized = normalizeGlobalBarcode(barcode);
      if (!normalized) continue;
      const current = byBarcode.get(normalized);
      if (current) {
        byBarcode.set(normalized, {
          ...current,
          scanCount: current.scanCount + 1,
          lastScannedAt: now,
        });
        repeats += 1;
      } else {
        byBarcode.set(normalized, {
          barcode,
          normalizedBarcode: normalized,
          firstScannedAt: now,
          lastScannedAt: now,
          scanCount: 1,
          status: "unchecked",
          knownProduct: null,
        });
      }
    }
    await persistSession({
      ...sourceSession,
      updatedAt: now,
      entries: Array.from(byBarcode.values()).reverse(),
    });
    showScanResult({
      kind: repeats > 0 ? "duplicate" : "added",
      barcode: `${barcodes.length} кодов`,
    });
  };

  const createSession = async (event: FormEvent) => {
    event.preventDefault();
    const next = createBarcodeSession({
      name: sessionName,
      merchant: merchantName,
    });
    await persistSession(next);
    setSessionName("");
    setMerchantName("");
    setNewSessionOpen(false);
    onSectionChange("collect");
  };

  const importBarcodeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const table = await readBarcodeTable(file);
      setTableImport(table);
      setTableColumn(table.suggestedBarcodeColumn);
      setImportError("");
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Не удалось прочитать файл",
      );
    }
  };

  const applyTableImport = async () => {
    if (!tableImport) return;
    await addMany(barcodesFromTable(tableImport, tableColumn));
    setTableImport(null);
  };

  const exportSession = async (format: "xlsx" | "json" | "csv") => {
    if (!activeSession) return;
    const baseName = `wayyaam-barcodes-${fileSlug(activeSession.merchant || activeSession.name)}-${new Date().toISOString().slice(0, 10)}`;
    const rows = activeSession.entries
      .filter(
        (entry) => entry.status !== "known" && entry.status !== "imported",
      )
      .map((entry) => [
        entry.barcode,
        entry.scanCount,
        statusLabel[entry.status],
        entry.firstScannedAt,
      ]);
    if (format === "xlsx")
      await downloadXlsx(
        baseName,
        "WayYaam barcodes",
        ["barcode", "scan_count", "status", "scanned_at"],
        rows,
      );
    if (format === "csv")
      downloadCsv(
        baseName,
        ["barcode", "scan_count", "status", "scanned_at"],
        rows,
      );
    if (format === "json")
      downloadJson(baseName, buildBarcodeExport(activeSession));
    await persistSession({
      ...activeSession,
      status: "exported",
      updatedAt: new Date().toISOString(),
    });
  };

  const importProcessedFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportError("");
    setImporting(true);
    try {
      const drafts = await parseProcessedCatalog(file);
      const nextDrafts: ImportedProductDraft[] = drafts.map((draft) => {
        const category = categories.find((item) =>
          [draft.subcategory, draft.category]
            .filter(Boolean)
            .some(
              (name) =>
                item.name.toLocaleLowerCase("ru") ===
                name.toLocaleLowerCase("ru"),
            ),
        );
        const reasons = category
          ? draft.reasons
          : [...draft.reasons, "Категория не сопоставлена с WayYaam"];
        return {
          ...draft,
          categoryId: category?.id ?? null,
          reasons,
          status: reasons.length === 0 ? "ready" : "review",
        };
      });
      let cursor = 0;
      const checkedDrafts = [...nextDrafts];
      const workers = Array.from(
        { length: Math.min(6, checkedDrafts.length) },
        async () => {
          while (cursor < checkedDrafts.length) {
            const index = cursor;
            cursor += 1;
            const draft = checkedDrafts[index];
            if (!isValidGlobalBarcode(draft.barcode)) continue;
            try {
              const duplicate = await lookupProduct(draft.barcode);
              if (duplicate)
                checkedDrafts[index] = {
                  ...draft,
                  status: "duplicate",
                  error: `Уже есть: ${duplicate.title}`,
                };
            } catch {
              // A temporary lookup failure does not block the preview; submit repeats the trusted check.
            }
          }
        },
      );
      await Promise.all(workers);
      setImportDrafts(checkedDrafts);
      onSectionChange(
        checkedDrafts.some(
          (item) => item.status === "review" || item.status === "error",
        )
          ? "review"
          : "import",
      );
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Не удалось прочитать каталог",
      );
    } finally {
      setImporting(false);
    }
  };

  const updateDraft = (id: string, patch: Partial<ImportedProductDraft>) => {
    setImportDrafts((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        const reasons = next.reasons.filter(
          (reason) =>
            reason !== "Категория не сопоставлена с WayYaam" &&
            reason !== "Не указано название",
        );
        if (!next.title.trim()) reasons.push("Не указано название");
        if (!next.categoryId)
          reasons.push("Категория не сопоставлена с WayYaam");
        return {
          ...next,
          reasons,
          status: reasons.length === 0 ? "ready" : "review",
        };
      }),
    );
  };

  const approveReviewedDraft = (id: string) => {
    setImportDrafts((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        if (
          !isValidGlobalBarcode(item.barcode) ||
          !item.title.trim() ||
          !item.categoryId
        )
          return item;
        return { ...item, reasons: [], status: "ready", error: null };
      }),
    );
  };

  const importOneProduct = async (draft: ImportedProductDraft) => {
    setImportDrafts((current) =>
      current.map((item) =>
        item.id === draft.id ? { ...item, error: null } : item,
      ),
    );
    try {
      const duplicate = await lookupProduct(draft.barcode);
      if (duplicate) {
        setImportDrafts((current) =>
          current.map((item) =>
            item.id === draft.id
              ? {
                  ...item,
                  status: "duplicate",
                  error: `Уже есть: ${duplicate.title}`,
                }
              : item,
          ),
        );
        return;
      }
      let imageUrl: string | null = null;
      if (draft.imageFile)
        imageUrl = (await uploadSharedProductImage({ file: draft.imageFile }))
          .url;
      await submitSharedProduct({
        barcode: draft.barcode,
        title: draft.title,
        masterCategoryId: draft.categoryId,
        imageUrl,
        product: {
          brand: draft.brand,
          description: draft.description,
          netContentValue: draft.netContentValue ?? undefined,
          netContentUnit: draft.netContentUnit ?? undefined,
          attributes: {
            source: "barcode-session-import",
            confidence: draft.confidence,
          },
        },
      });
      setImportDrafts((current) =>
        current.map((item) =>
          item.id === draft.id
            ? { ...item, status: "imported", error: null }
            : item,
        ),
      );
    } catch (error) {
      setImportDrafts((current) =>
        current.map((item) =>
          item.id === draft.id
            ? {
                ...item,
                status: "error",
                error:
                  error instanceof Error ? error.message : "Ошибка импорта",
              }
            : item,
        ),
      );
    }
  };

  const importReadyProducts = async () => {
    setImporting(true);
    try {
      for (const draft of importDrafts.filter(
        (item) => item.status === "ready",
      ))
        await importOneProduct(draft);
    } finally {
      setImporting(false);
    }
  };

  if (loading)
    return (
      <div className="barcode-local-state">
        <LoaderCircle className="is-spinning" /> Загружаем локальные сессии…
      </div>
    );
  if (!activeSession)
    return (
      <div className="barcode-local-state">Не удалось открыть сессию.</div>
    );

  const stats = barcodeSessionStats(activeSession);
  const filteredEntries = activeSession.entries.filter((entry) => {
    const value = search.toLocaleLowerCase("ru");
    return (
      !value ||
      entry.barcode.includes(value) ||
      entry.knownProduct?.title.toLocaleLowerCase("ru").includes(value)
    );
  });
  const pageSize = 100;
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const visibleEntries = filteredEntries.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const reviewDrafts = importDrafts.filter(
    (item) => item.status === "review" || item.status === "error",
  );
  const shownDrafts = section === "review" ? reviewDrafts : importDrafts;

  return (
    <div className="barcode-workspace">
      {storageError && (
        <div className="barcode-alert barcode-alert--error" role="alert">
          <ShieldAlert />
          {storageError}
        </div>
      )}
      {section === "collect" && (
        <>
          <div className="barcode-session-toolbar">
            <label>
              <span>Текущая сессия</span>
              <select
                value={activeSession.id}
                onChange={(event) => setActiveSessionId(event.target.value)}
              >
                {sessions.map((session) => (
                  <option value={session.id} key={session.id}>
                    {session.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="barcode-primary"
              onClick={() => setNewSessionOpen(true)}
            >
              <Plus />
              Новая сессия
            </button>
          </div>

          <section className="barcode-session-summary">
            <div className="barcode-session-title">
              <span>
                {activeSession.status === "exported"
                  ? "Экспортирована"
                  : "Черновик · сохраняется автоматически"}
              </span>
              <h2>{activeSession.name}</h2>
              {activeSession.merchant && <p>{activeSession.merchant}</p>}
            </div>
            <dl>
              <div>
                <dt>{stats.unique}</dt>
                <dd>уникальных</dd>
              </div>
              <div>
                <dt>{stats.newCount}</dt>
                <dd>новых</dd>
              </div>
              <div>
                <dt>{stats.known}</dt>
                <dd>уже есть</dd>
              </div>
              <div>
                <dt>{stats.repeats}</dt>
                <dd>повторов</dd>
              </div>
            </dl>
          </section>

          <section className="barcode-scanner-card">
            <div className="barcode-scanner-icon">
              <Barcode />
            </div>
            <form onSubmit={submitScan}>
              <label htmlFor="barcode-hid-input">
                Сканируйте следующий товар
              </label>
              <input
                id="barcode-hid-input"
                ref={scanInputRef}
                value={scanValue}
                onChange={(event) => setScanValue(event.target.value)}
                placeholder="4601234567890"
                inputMode="numeric"
                autoComplete="off"
                aria-describedby="barcode-scanner-help"
              />
              <p id="barcode-scanner-help">
                <span />
                USB/Bluetooth‑сканер готов · Enter добавляет код автоматически
              </p>
            </form>
            <div className="barcode-scanner-buttons">
              <button
                type="button"
                className="barcode-camera-button"
                onClick={() => setCameraOpen(true)}
              >
                <Camera />
                Сканировать камерой
              </button>
              <button
                type="button"
                className="barcode-refocus"
                onClick={() => scanInputRef.current?.focus()}
              >
                <Play />
                Внешний сканер
              </button>
            </div>
            {scanResult && (
              <div
                className={`barcode-scan-result barcode-scan-result--${scanResult.kind}`}
                role="status"
              >
                {scanResult.kind === "added" && <CheckCircle2 />}
                {scanResult.kind === "known" && <PackageCheck />}
                {scanResult.kind === "duplicate" && <RotateCcw />}
                {(scanResult.kind === "invalid" ||
                  scanResult.kind === "error") && <ShieldAlert />}
                <span>
                  <strong>
                    {scanResult.kind === "added"
                      ? "Добавлен"
                      : scanResult.kind === "known"
                        ? "Уже есть в WayYaam"
                        : scanResult.kind === "duplicate"
                          ? "Уже отсканирован"
                          : "Не удалось распознать"}
                  </strong>
                  <code>{scanResult.barcode}</code>
                  {scanResult.title && <small>{scanResult.title}</small>}
                </span>
              </div>
            )}
          </section>

          {cameraOpen && (
            <PlatformBarcodeCameraScanner
              onDetected={(barcode) => addBarcode(barcode)}
              onClose={() => setCameraOpen(false)}
            />
          )}

          <div className="barcode-actions">
            <button type="button" onClick={() => setBulkOpen(true)}>
              <ClipboardPaste />
              Вставить список
            </button>
            <button type="button" onClick={() => tableFileRef.current?.click()}>
              <Upload />
              Импортировать CSV / XLSX
            </button>
            <input
              ref={tableFileRef}
              hidden
              type="file"
              accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={importBarcodeFile}
            />
            <span />
            <button type="button" onClick={() => void exportSession("json")}>
              <FileArchive />
              JSON
            </button>
            <button type="button" onClick={() => void exportSession("csv")}>
              <FileSpreadsheet />
              CSV
            </button>
            <button
              type="button"
              className="barcode-primary"
              disabled={activeSession.entries.length === 0}
              onClick={() => void exportSession("xlsx")}
            >
              <Download />
              Экспортировать для обработки
            </button>
          </div>

          {importError && (
            <div className="barcode-alert barcode-alert--error" role="alert">
              {importError}
            </div>
          )}
          <section className="barcode-entry-list">
            <header>
              <div>
                <h2>Последние сканирования</h2>
                <span>{filteredEntries.length}</span>
              </div>
              <label>
                <Search />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Поиск по коду или названию"
                />
              </label>
            </header>
            <div
              className="barcode-entry-table"
              role="table"
              aria-label="Собранные штрих-коды"
            >
              <div
                className="barcode-entry-row barcode-entry-row--head"
                role="row"
              >
                <span>Штрих-код</span>
                <span>Статус</span>
                <span>Название товара</span>
                <span>Время</span>
              </div>
              {visibleEntries.map((entry) => (
                <div
                  className="barcode-entry-row"
                  role="row"
                  key={entry.normalizedBarcode}
                >
                  <code>
                    {entry.barcode}
                    {entry.scanCount > 1 && <small>×{entry.scanCount}</small>}
                  </code>
                  <span
                    className={`barcode-status barcode-status--${entry.status}`}
                  >
                    {statusLabel[entry.status]}
                  </span>
                  <span>{entry.knownProduct?.title ?? "—"}</span>
                  <time>
                    {new Date(entry.lastScannedAt).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
              {visibleEntries.length === 0 && (
                <p className="barcode-empty">
                  Отсканируйте первый товар — он сразу появится здесь.
                </p>
              )}
            </div>
            {totalPages > 1 && (
              <footer className="barcode-pagination">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Назад
                </button>
                <span>
                  {page} из {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Далее
                </button>
              </footer>
            )}
          </section>
        </>
      )}

      {(section === "import" || section === "review") && (
        <section className="processed-import">
          <header>
            <div>
              <span>
                {section === "review"
                  ? "Контроль качества"
                  : "Обратная загрузка"}
              </span>
              <h2>
                {section === "review"
                  ? "Требуют проверки"
                  : "Импорт обработанных товаров"}
              </h2>
              <p>
                Загрузите ZIP с products.json и папкой images или отдельный
                JSON. Ничего не добавится без предварительного просмотра.
              </p>
            </div>
            <button
              type="button"
              className="barcode-primary"
              disabled={importing}
              onClick={() => catalogFileRef.current?.click()}
            >
              {importing ? (
                <LoaderCircle className="is-spinning" />
              ) : (
                <Upload />
              )}
              {importing ? "Проверяем файл…" : "Выбрать ZIP / JSON"}
            </button>
            <input
              ref={catalogFileRef}
              hidden
              type="file"
              accept=".zip,.json,application/zip,application/json"
              onChange={importProcessedFile}
            />
          </header>
          {categoryError && (
            <div className="barcode-alert barcode-alert--error">
              {categoryError}
            </div>
          )}
          {importError && (
            <div className="barcode-alert barcode-alert--error" role="alert">
              {importError}
            </div>
          )}
          {importDrafts.length > 0 && (
            <div className="processed-import-summary">
              <div>
                <strong>{importDrafts.length}</strong>
                <span>найдено</span>
              </div>
              <div>
                <strong>
                  {
                    importDrafts.filter((item) => item.status === "ready")
                      .length
                  }
                </strong>
                <span>готово</span>
              </div>
              <div>
                <strong>{reviewDrafts.length}</strong>
                <span>проверить</span>
              </div>
              <div>
                <strong>
                  {
                    importDrafts.filter((item) => item.status === "error")
                      .length
                  }
                </strong>
                <span>ошибок</span>
              </div>
              <div>
                <strong>
                  {
                    importDrafts.filter((item) => item.status === "duplicate")
                      .length
                  }
                </strong>
                <span>дубликатов</span>
              </div>
              <button
                type="button"
                className="barcode-primary"
                disabled={
                  importing ||
                  !importDrafts.some((item) => item.status === "ready")
                }
                onClick={() => void importReadyProducts()}
              >
                {importing ? (
                  <LoaderCircle className="is-spinning" />
                ) : (
                  <Check />
                )}
                Импортировать готовые
              </button>
            </div>
          )}
          <div className="processed-product-list">
            {shownDrafts.map((draft) => (
              <article className="processed-product-card" key={draft.id}>
                <ImportedProductImage file={draft.imageFile} />
                <div className="processed-product-copy">
                  <span
                    className={`barcode-status barcode-status--${draft.status}`}
                  >
                    {draft.status === "ready"
                      ? "Готов"
                      : draft.status === "review"
                        ? "Проверить"
                        : draft.status === "imported"
                          ? "Импортирован"
                          : draft.status === "duplicate"
                            ? "Дубликат"
                            : "Ошибка"}
                  </span>
                  <input
                    aria-label={`Название ${draft.barcode}`}
                    value={draft.title}
                    onChange={(event) =>
                      updateDraft(draft.id, { title: event.target.value })
                    }
                  />
                  <code>{draft.barcode}</code>
                  <p>
                    {[draft.brand, draft.category, draft.subcategory]
                      .filter(Boolean)
                      .join(" · ") || "Нет описания"}
                  </p>
                  <label>
                    Категория WayYaam
                    <select
                      value={draft.categoryId ?? ""}
                      onChange={(event) =>
                        updateDraft(draft.id, {
                          categoryId: event.target.value || null,
                        })
                      }
                    >
                      <option value="">Выберите категорию</option>
                      {categories.map((category) => (
                        <option value={category.id} key={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {draft.reasons.length > 0 && (
                    <ul>
                      {draft.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                  {draft.error && (
                    <p className="processed-product-error">{draft.error}</p>
                  )}
                </div>
                <div className="processed-product-actions">
                  <small>
                    {draft.confidence === null
                      ? "confidence —"
                      : `confidence ${Math.round(draft.confidence * 100)}%`}
                  </small>
                  {draft.status === "review" && (
                    <button
                      type="button"
                      disabled={
                        !isValidGlobalBarcode(draft.barcode) ||
                        !draft.title.trim() ||
                        !draft.categoryId
                      }
                      onClick={() => approveReviewedDraft(draft.id)}
                    >
                      <Check />
                      Данные проверены
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={draft.status !== "ready" || importing}
                    onClick={() => void importOneProduct(draft)}
                  >
                    <Check />
                    Подтвердить
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setImportDrafts((current) =>
                        current.filter((item) => item.id !== draft.id),
                      )
                    }
                  >
                    <X />
                    Исключить
                  </button>
                </div>
              </article>
            ))}
            {shownDrafts.length === 0 && (
              <div className="processed-import-empty">
                <FileArchive />
                <h3>
                  {section === "review"
                    ? "Нет товаров, требующих проверки"
                    : "Загрузите результат обработки"}
                </h3>
                <p>
                  Поддерживается структура wayyaam-products-import.zip /
                  products.json / images/.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {newSessionOpen && (
        <div className="barcode-dialog-backdrop" role="presentation">
          <form
            className="barcode-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-session-title"
            onSubmit={createSession}
          >
            <header>
              <div>
                <span>Локальное сохранение</span>
                <h2 id="new-session-title">Новая сессия</h2>
              </div>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setNewSessionOpen(false)}
              >
                <X />
              </button>
            </header>
            <label>
              Название сессии
              <input
                autoFocus
                required
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
                placeholder="Финики — основной магазин — 16.08.2026"
              />
            </label>
            <label>
              Магазин или источник
              <input
                value={merchantName}
                onChange={(event) => setMerchantName(event.target.value)}
                placeholder="Финики"
              />
            </label>
            <button className="barcode-primary" type="submit">
              <Plus />
              Создать и начать
            </button>
          </form>
        </div>
      )}

      {bulkOpen && (
        <div className="barcode-dialog-backdrop" role="presentation">
          <form
            className="barcode-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-title"
            onSubmit={(event) => {
              event.preventDefault();
              void addMany(extractBarcodesFromText(bulkValue));
              setBulkOpen(false);
              setBulkValue("");
            }}
          >
            <header>
              <div>
                <span>Массовое добавление</span>
                <h2 id="bulk-title">Вставить список кодов</h2>
              </div>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setBulkOpen(false)}
              >
                <X />
              </button>
            </header>
            <label>
              Коды через перенос строки, пробел, запятую или точку с запятой
              <textarea
                autoFocus
                value={bulkValue}
                onChange={(event) => setBulkValue(event.target.value)}
                placeholder={"4601234567890\n5449000054227"}
              />
            </label>
            <p>
              Распознано валидных уникальных кодов:{" "}
              <strong>{extractBarcodesFromText(bulkValue).length}</strong>
            </p>
            <button
              className="barcode-primary"
              type="submit"
              disabled={extractBarcodesFromText(bulkValue).length === 0}
            >
              <ClipboardPaste />
              Добавить в сессию
            </button>
          </form>
        </div>
      )}

      {tableImport && (
        <div className="barcode-dialog-backdrop" role="presentation">
          <section
            className="barcode-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="column-title"
          >
            <header>
              <div>
                <span>Импорт файла</span>
                <h2 id="column-title">Выберите колонку со штрих-кодом</h2>
              </div>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setTableImport(null)}
              >
                <X />
              </button>
            </header>
            <label>
              Колонка
              <select
                value={tableColumn}
                onChange={(event) => setTableColumn(Number(event.target.value))}
              >
                {tableImport.headers.map((header, index) => (
                  <option value={index} key={`${header}-${index}`}>
                    {header || `Колонка ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Будет добавлено уникальных валидных кодов:{" "}
              <strong>
                {barcodesFromTable(tableImport, tableColumn).length}
              </strong>
            </p>
            <button
              className="barcode-primary"
              type="button"
              onClick={() => void applyTableImport()}
            >
              <Upload />
              Добавить в сессию
            </button>
          </section>
        </div>
      )}

      <footer className="barcode-safety-note">
        <Archive />
        <span>
          Сессии сохраняются в IndexedDB этого браузера. Экспорт не удаляет
          данные; очистка доступна только с отдельным подтверждением.
        </span>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                `Удалить сессию «${activeSession.name}»? Восстановить её можно будет только из ранее экспортированного файла.`,
              )
            ) {
              void store.remove(activeSession.id).then(() => {
                const next = sessionsRef.current.filter(
                  (item) => item.id !== activeSession.id,
                );
                sessionsRef.current = next;
                if (next.length > 0) {
                  setSessions(next);
                  setActiveSessionId(next[0].id);
                } else {
                  const replacement = makeDefaultSession();
                  void persistSession(replacement);
                }
              });
            }
          }}
        >
          <Trash2 />
          Удалить сессию
        </button>
      </footer>
    </div>
  );
}

function ImportedProductImage({ file }: { file: File | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  return (
    <div className="processed-product-image">
      {url ? <img src={url} alt="" /> : <Barcode />}
    </div>
  );
}
