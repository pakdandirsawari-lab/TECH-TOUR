export type BookingStatus = 'Confirmed' | 'Pending' | 'Cancelled' | 'Completed';

export type PaymentMethod = 'Cash' | 'UPI' | 'Bank Transfer' | 'Card' | 'Other';

export type ExpenseCategory =
  | 'Hotel'
  | 'Vehicle'
  | 'Food'
  | 'Driver'
  | 'Guide'
  | 'Permit'
  | 'Marketing'
  | 'Office Rent'
  | 'Staff Salary'
  | 'Other';

export type StaffDesignation =
  | 'Tour Manager'
  | 'Tour Guide'
  | 'Driver'
  | 'Booking Staff'
  | 'Accountant'
  | 'Office Manager';

export type StaffStatus = 'Active' | 'On Leave' | 'Inactive';

export type PartnerType = 'Hotel' | 'Vehicle Provider' | 'Tour Operator' | 'Local Agent';

export type PackageStatus = 'Active' | 'Seasonal' | 'Inactive';

export type DateFormatOption = 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'YYYY-MM-DD';

export type AppRoute =
  | 'dashboard'
  | 'bookings'
  | 'customers'
  | 'payments'
  | 'expenses'
  | 'packages'
  | 'staff'
  | 'reports'
  | 'settings';

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  state: string;
  notes: string;
  isDemo?: boolean;
  createdAt: string;
}

export interface TourPackage {
  id: string;
  name: string;
  destination: string;
  durationDays: number;
  durationNights: number;
  description: string;
  itinerary: string[];
  hotelDetails: string;
  vehicleDetails: string;
  pricePerPerson: number;
  minPersons: number;
  maxPersons: number;
  includedServices: string[];
  excludedServices: string[];
  imageUrl: string;
  status: PackageStatus;
  isDemo?: boolean;
}

export interface Booking {
  id: string;
  bookingDate: string; // YYYY-MM-DD
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  destination: string;
  packageId: string;
  packageName: string;
  travelStartDate: string; // YYYY-MM-DD
  travelEndDate: string; // YYYY-MM-DD
  adults: number;
  children: number;
  rooms: number;
  vehicleDetails: string;
  hotelDetails: string;
  totalCost: number;
  status: BookingStatus;
  notes: string;
  isDemo?: boolean;
}

export interface Payment {
  id: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  paymentDate: string; // YYYY-MM-DD
  amount: number;
  method: PaymentMethod;
  transactionRef: string;
  notes: string;
  isDemo?: boolean;
}

export interface Expense {
  id: string;
  expenseDate: string; // YYYY-MM-DD
  category: ExpenseCategory;
  description: string;
  vendorName: string;
  relatedBookingId?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes: string;
  isDemo?: boolean;
}

export interface SalaryRecord {
  id: string;
  month: string; // e.g., "2026-10"
  amount: number;
  paidDate: string; // YYYY-MM-DD
  method: PaymentMethod;
  notes: string;
}

export interface StaffMember {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  address: string;
  designation: StaffDesignation;
  joiningDate: string; // YYYY-MM-DD
  monthlySalary: number;
  status: StaffStatus;
  salaryRecords: SalaryRecord[];
  isDemo?: boolean;
}

export interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  location: string;
  contactPerson: string;
  phone: string;
  email: string;
  rateNotes: string;
  status: 'Active' | 'Inactive';
  isDemo?: boolean;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
  password: string;
}

export interface AgencySettings {
  agencyName: string;
  agencyLogo: string;
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  gstNumber: string;
  currency: string;
  dateFormat: DateFormatOption;
  theme: 'light' | 'dark';
  requireLogin: boolean;
  userProfile: UserAccount;
}

export interface TourismDatabase {
  customers: Customer[];
  packages: TourPackage[];
  bookings: Booking[];
  payments: Payment[];
  expenses: Expense[];
  staff: StaffMember[];
  partners: Partner[];
  settings: AgencySettings;
}
