import type { TourismDatabase } from '../types/tourism';

export const DESTINATION_GALLERY = [
  {
    label: 'Darjeeling Tea Gardens & Kanchenjunga',
    url: '/src/assets/images/dest_darjeeling_tea_1794845744114.jpg',
  },
  {
    label: 'Gangtok & Tsomgo Lake, Sikkim',
    url: '/src/assets/images/dest_gangtok_sikkim_1794845744144.jpg',
  },
  {
    label: 'Dooars Forest & River Valley',
    url: '/src/assets/images/dest_dooars_forest_1794845744531.jpg',
  },
  {
    label: 'Meghalaya Living Root & Waterfalls',
    url: '/src/assets/images/dest_meghalaya_falls_1794845745472.jpg',
  },
  {
    label: 'Sittong & Kalimpong Hills',
    url: '/src/assets/images/dest_kalimpong_sittong_1794845746066.jpg',
  },
];

export const DEFAULT_MANAGER_AVATAR = '/src/assets/images/avatar_agency_manager_1794845749106.jpg';

/**
 * Clean empty database structure with zero mock or demo records.
 * All operational records are loaded directly from Google Sheets.
 */
export function createEmptyDatabase(): TourismDatabase {
  return {
    settings: {
      agencyName: 'Himalayan Horizons Travels',
      agencyLogo: '',
      address: '2nd Floor, Sevoke Road, Siliguri, West Bengal - 734001',
      phone: '',
      whatsapp: '',
      email: '',
      gstNumber: '',
      currency: '₹',
      dateFormat: 'DD-MM-YYYY',
      theme: 'light',
      requireLogin: true,
      userProfile: {
        id: 'USR-ADMIN',
        name: 'Agency Administrator',
        email: 'admin@himalayanhorizons.in',
        role: 'admin',
        avatar: DEFAULT_MANAGER_AVATAR,
      },
    },
    customers: [],
    packages: [],
    bookings: [],
    payments: [],
    expenses: [],
    staff: [],
    partners: [],
  };
}
