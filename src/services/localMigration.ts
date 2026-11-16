import { createEmptyDatabase } from '../data/emptyDatabase';
import type { LocalStorageScanResult, TourismDatabase } from '../types/tourism';

const KNOWN_STORAGE_KEYS = ['hh_tms_database_v1', 'hh_tms_apps_script_url'];

function deduplicateById<T extends { id?: string; isDemo?: boolean }>(
  target: T[],
  incoming: unknown[],
  includeDemo: boolean,
  onSkipDemo: () => void
) {
  const seen = new Set(target.map((item) => String(item.id || '').trim()).filter(Boolean));
  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as T;
    if (item.isDemo && !includeDemo) {
      onSkipDemo();
      continue;
    }
    const id = String(item.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const { isDemo: _stripDemo, ...cleanItem } = item;
    target.push(cleanItem as T);
  }
}

function tryMergeParsedCandidate(
  candidate: unknown,
  acc: TourismDatabase,
  includeDemo: boolean,
  onSkipDemo: () => void
): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  const obj = candidate as Partial<TourismDatabase> & { data?: Partial<TourismDatabase> };
  const root = obj.data && typeof obj.data === 'object' ? obj.data : obj;

  let foundAny = false;
  if (Array.isArray(root.customers)) {
    deduplicateById(acc.customers, root.customers, includeDemo, onSkipDemo);
    foundAny = true;
  }
  if (Array.isArray(root.packages)) {
    deduplicateById(acc.packages, root.packages, includeDemo, onSkipDemo);
    foundAny = true;
  }
  if (Array.isArray(root.bookings)) {
    deduplicateById(acc.bookings, root.bookings, includeDemo, onSkipDemo);
    foundAny = true;
  }
  if (Array.isArray(root.payments)) {
    deduplicateById(acc.payments, root.payments, includeDemo, onSkipDemo);
    foundAny = true;
  }
  if (Array.isArray(root.expenses)) {
    deduplicateById(acc.expenses, root.expenses, includeDemo, onSkipDemo);
    foundAny = true;
  }
  if (Array.isArray(root.staff)) {
    deduplicateById(acc.staff, root.staff, includeDemo, onSkipDemo);
    foundAny = true;
  }
  if (Array.isArray(root.partners)) {
    deduplicateById(acc.partners, root.partners, includeDemo, onSkipDemo);
    foundAny = true;
  }
  if (root.settings && typeof root.settings === 'object' && root.settings.agencyName) {
    const { userProfile: _stripProfile, ...safeSettings } = root.settings;
    acc.settings = { ...acc.settings, ...safeSettings };
    foundAny = true;
  }
  return foundAny;
}

async function scanIndexedDb(
  acc: TourismDatabase,
  includeDemo: boolean,
  onSkipDemo: () => void
): Promise<string[]> {
  const foundDbNames: string[] = [];
  if (typeof window === 'undefined' || !('indexedDB' in window)) return foundDbNames;
  const idbFactory = window.indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string; version?: number }>>;
  };
  if (typeof idbFactory.databases !== 'function') return foundDbNames;

  try {
    const dbs = await idbFactory.databases();
    for (const dbInfo of dbs) {
      if (!dbInfo.name) continue;
      const dbName = dbInfo.name;
      await new Promise<void>((resolve) => {
        const req = idbFactory.open(dbName);
        req.onerror = () => resolve();
        req.onsuccess = () => {
          const idb = req.result;
          const storeNames = Array.from(idb.objectStoreNames);
          if (storeNames.length === 0) {
            idb.close();
            resolve();
            return;
          }
          let pending = storeNames.length;
          const finishOne = () => {
            pending -= 1;
            if (pending <= 0) {
              idb.close();
              resolve();
            }
          };
          for (const storeName of storeNames) {
            try {
              const tx = idb.transaction(storeName, 'readonly');
              const store = tx.objectStore(storeName);
              const getAllReq = store.getAll();
              getAllReq.onsuccess = () => {
                const values = Array.isArray(getAllReq.result) ? getAllReq.result : [];
                let matched = false;
                for (const val of values) {
                  if (tryMergeParsedCandidate(val, acc, includeDemo, onSkipDemo)) {
                    matched = true;
                  }
                }
                if (matched && !foundDbNames.includes(dbName)) {
                  foundDbNames.push(dbName);
                }
                finishOne();
              };
              getAllReq.onerror = () => finishOne();
            } catch {
              finishOne();
            }
          }
        };
      });
    }
  } catch {
    // ignore browser restrictions on indexedDB.databases()
  }
  return foundDbNames;
}

/**
 * Scans localStorage, sessionStorage, and IndexedDB for existing Tourism Management records.
 * Never modifies or deletes browser storage during scanning.
 */
export async function scanBrowserStorageForTourismData(
  includeDemoRecords = false
): Promise<LocalStorageScanResult> {
  const acc = createEmptyDatabase();
  const sourcesFound = new Set<string>();
  const matchedStorageKeys: string[] = [];
  let demoRecordsSkipped = 0;
  const onSkipDemo = () => {
    demoRecordsSkipped += 1;
  };

  const scanWebStorage = (storage: Storage, label: string) => {
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key) continue;
        const raw = storage.getItem(key);
        if (!raw || (!raw.trim().startsWith('{') && !raw.trim().startsWith('['))) continue;
        try {
          const parsed = JSON.parse(raw);
          if (tryMergeParsedCandidate(parsed, acc, includeDemoRecords, onSkipDemo)) {
            sourcesFound.add(label);
            matchedStorageKeys.push(`${label}:${key}`);
          }
        } catch {
          // ignore non-JSON keys
        }
      }
    } catch {
      // ignore storage access errors
    }
  };

  if (typeof window !== 'undefined') {
    scanWebStorage(window.localStorage, 'localStorage');
    scanWebStorage(window.sessionStorage, 'sessionStorage');
  }

  const indexedDbNames = await scanIndexedDb(acc, includeDemoRecords, onSkipDemo);
  if (indexedDbNames.length > 0) {
    sourcesFound.add('IndexedDB');
  }

  const counts = {
    customers: acc.customers.length,
    packages: acc.packages.length,
    bookings: acc.bookings.length,
    payments: acc.payments.length,
    expenses: acc.expenses.length,
    staff: acc.staff.length,
    partners: acc.partners.length,
  };

  const totalRecords =
    counts.customers +
    counts.packages +
    counts.bookings +
    counts.payments +
    counts.expenses +
    counts.staff +
    counts.partners;

  return {
    sourcesFound: Array.from(sourcesFound),
    storageKeys: matchedStorageKeys,
    indexedDbNames,
    counts,
    totalRecords,
    demoRecordsSkipped,
    data: acc,
  };
}

/**
 * Clears migrated local browser storage entries ONLY after verified Google Sheets migration.
 */
export function clearVerifiedLocalStorageKeys(scanResult: LocalStorageScanResult): void {
  if (typeof window === 'undefined') return;
  for (const taggedKey of scanResult.storageKeys) {
    const [storageType, ...rest] = taggedKey.split(':');
    const key = rest.join(':');
    if (!key) continue;
    try {
      if (storageType === 'localStorage') window.localStorage.removeItem(key);
      if (storageType === 'sessionStorage') window.sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  for (const knownKey of KNOWN_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(knownKey);
      window.sessionStorage.removeItem(knownKey);
    } catch {
      // ignore
    }
  }
}
