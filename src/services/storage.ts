import { createDemoDatabase } from '../data/demoData';
import { TourismDatabase } from '../types/tourism';

const STORAGE_KEY = 'hh_tms_database_v1';

export interface TourismRepository {
  load(): TourismDatabase;
  save(data: TourismDatabase): void;
  resetToDemo(): TourismDatabase;
  clearDemoRecords(current: TourismDatabase): TourismDatabase;
  exportJson(current: TourismDatabase): string;
  parseImportedJson(jsonText: string): TourismDatabase;
}

class LocalStorageTourismRepository implements TourismRepository {
  load(): TourismDatabase {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const demo = createDemoDatabase();
        this.save(demo);
        return demo;
      }
      const parsed = JSON.parse(raw) as Partial<TourismDatabase>;
      const fallback = createDemoDatabase();
      return {
        customers: Array.isArray(parsed.customers) ? parsed.customers : fallback.customers,
        packages: Array.isArray(parsed.packages) ? parsed.packages : fallback.packages,
        bookings: Array.isArray(parsed.bookings) ? parsed.bookings : fallback.bookings,
        payments: Array.isArray(parsed.payments) ? parsed.payments : fallback.payments,
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : fallback.expenses,
        staff: Array.isArray(parsed.staff) ? parsed.staff : fallback.staff,
        partners: Array.isArray(parsed.partners) ? parsed.partners : fallback.partners,
        settings: parsed.settings ? { ...fallback.settings, ...parsed.settings } : fallback.settings,
      };
    } catch {
      const demo = createDemoDatabase();
      this.save(demo);
      return demo;
    }
  }

  save(data: TourismDatabase): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('Failed to persist database to localStorage:', err);
    }
  }

  resetToDemo(): TourismDatabase {
    const demo = createDemoDatabase();
    this.save(demo);
    return demo;
  }

  clearDemoRecords(current: TourismDatabase): TourismDatabase {
    const cleaned: TourismDatabase = {
      ...current,
      customers: current.customers.filter((c) => !c.isDemo),
      packages: current.packages.filter((p) => !p.isDemo),
      bookings: current.bookings.filter((b) => !b.isDemo),
      payments: current.payments.filter((p) => !p.isDemo),
      expenses: current.expenses.filter((e) => !e.isDemo),
      staff: current.staff.filter((s) => !s.isDemo),
      partners: current.partners.filter((p) => !p.isDemo),
    };
    this.save(cleaned);
    return cleaned;
  }

  exportJson(current: TourismDatabase): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        schemaVersion: 1,
        data: current,
      },
      null,
      2
    );
  }

  parseImportedJson(jsonText: string): TourismDatabase {
    const raw = JSON.parse(jsonText);
    const candidate = (raw?.data ?? raw) as Partial<TourismDatabase>;
    if (
      !candidate ||
      !Array.isArray(candidate.customers) ||
      !Array.isArray(candidate.bookings) ||
      !Array.isArray(candidate.payments)
    ) {
      throw new Error('Invalid backup file format. Expected Tourism Management System JSON.');
    }
    const fallback = createDemoDatabase();
    const restored: TourismDatabase = {
      customers: candidate.customers,
      packages: Array.isArray(candidate.packages) ? candidate.packages : [],
      bookings: candidate.bookings,
      payments: candidate.payments,
      expenses: Array.isArray(candidate.expenses) ? candidate.expenses : [],
      staff: Array.isArray(candidate.staff) ? candidate.staff : [],
      partners: Array.isArray(candidate.partners) ? candidate.partners : [],
      settings: candidate.settings ? { ...fallback.settings, ...candidate.settings } : fallback.settings,
    };
    this.save(restored);
    return restored;
  }
}

export const tourismRepository: TourismRepository = new LocalStorageTourismRepository();

export const CLIENT_INSTANCE_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export interface SharedDatabaseEnvelope {
  version: number;
  updatedAt: string;
  data: TourismDatabase;
}

export function hasCustomLocalRecords(db: TourismDatabase): boolean {
  return (
    db.bookings.some((b) => !b.isDemo) ||
    db.customers.some((c) => !c.isDemo) ||
    db.payments.some((p) => !p.isDemo) ||
    db.expenses.some((e) => !e.isDemo) ||
    db.packages.some((p) => !p.isDemo) ||
    db.staff.some((s) => !s.isDemo) ||
    db.partners.some((p) => !p.isDemo)
  );
}

export async function fetchSharedDatabase(): Promise<SharedDatabaseEnvelope | null> {
  try {
    const res = await fetch('/api/tourism-db', { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<SharedDatabaseEnvelope>;
    if (!json || typeof json.version !== 'number' || !json.data) return null;
    return {
      version: json.version,
      updatedAt: json.updatedAt || new Date().toISOString(),
      data: json.data,
    };
  } catch {
    return null;
  }
}

export async function pushSharedDatabase(
  data: TourismDatabase
): Promise<{ version: number; updatedAt: string } | null> {
  try {
    const res = await fetch('/api/tourism-db', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: CLIENT_INSTANCE_ID,
        data,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok?: boolean; version?: number; updatedAt?: string };
    if (!json.ok || typeof json.version !== 'number') return null;
    return {
      version: json.version,
      updatedAt: json.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

