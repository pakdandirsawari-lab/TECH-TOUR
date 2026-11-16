import { createEmptyDatabase } from '../data/emptyDatabase';
import type { TourismDatabase } from '../types/tourism';

export const tourismJsonHelpers = {
  exportJson(current: TourismDatabase): string {
    const { userProfile: _stripProfile, ...safeSettings } = current.settings;
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        schemaVersion: 2,
        source: 'google-sheets-cloud',
        data: {
          ...current,
          settings: {
            ...safeSettings,
            userProfile: {
              id: current.settings.userProfile.id,
              name: current.settings.userProfile.name,
              email: current.settings.userProfile.email,
              role: current.settings.userProfile.role,
              avatar: current.settings.userProfile.avatar,
            },
          },
        },
      },
      null,
      2
    );
  },

  parseImportedJson(jsonText: string): TourismDatabase {
    const raw = JSON.parse(jsonText);
    const candidate = (raw?.data ?? raw) as Partial<TourismDatabase>;
    if (
      !candidate ||
      (!Array.isArray(candidate.customers) &&
        !Array.isArray(candidate.bookings) &&
        !Array.isArray(candidate.payments) &&
        !Array.isArray(candidate.expenses))
    ) {
      throw new Error('Invalid backup file format. Expected Tourism Management System JSON.');
    }
    const base = createEmptyDatabase();
    return {
      customers: Array.isArray(candidate.customers) ? candidate.customers : [],
      packages: Array.isArray(candidate.packages) ? candidate.packages : [],
      bookings: Array.isArray(candidate.bookings) ? candidate.bookings : [],
      payments: Array.isArray(candidate.payments) ? candidate.payments : [],
      expenses: Array.isArray(candidate.expenses) ? candidate.expenses : [],
      staff: Array.isArray(candidate.staff) ? candidate.staff : [],
      partners: Array.isArray(candidate.partners) ? candidate.partners : [],
      settings: candidate.settings ? { ...base.settings, ...candidate.settings } : base.settings,
    };
  },
};
