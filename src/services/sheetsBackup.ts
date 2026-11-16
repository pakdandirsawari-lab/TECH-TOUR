import { TourismDatabase } from '../types/tourism';
import { formatDate, getTodayISO } from '../utils/formatters';
import { getAccessToken } from './googleAuth';

export const DEFAULT_BACKUP_SPREADSHEET_ID = '1BtuAFZPHsQPiXBijVVQTFWu4Dn2EsajLaSYaRtJHkcM';

function sanitizeCell(value: string | number): string | number {
  if (typeof value === 'number') return value;
  const str = String(value ?? '');
  if (/^[=+\-@]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export class SheetsAuthExpiredError extends Error {
  constructor(message = 'Google session expired. Please sign in with Google again.') {
    super(message);
    this.name = 'SheetsAuthExpiredError';
  }
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  sheetTitles: string[];
  spreadsheetUrl: string;
}

export interface BackupTabSummary {
  tabName: string;
  rowCount: number;
}

export interface BackupResult {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  updatedTabs: BackupTabSummary[];
  totalCellsWritten: number;
  timestamp: string;
}

export const BACKUP_TABS = [
  'Summary',
  'Bookings',
  'Customers',
  'Payments',
  'Expenses',
  'Packages',
  'Staff',
  'Staff_Salaries',
  'Partners',
  'Settings',
] as const;

export type BackupTabName = (typeof BACKUP_TABS)[number];

async function sheetsFetch(url: string, accessToken: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (res.status === 401) {
    throw new SheetsAuthExpiredError();
  }
  if (!res.ok) {
    let errMsg = `Google Sheets API error (${res.status})`;
    try {
      const json = await res.json();
      if (json?.error?.message) errMsg = json.error.message;
    } catch {
      // ignore json parse error
    }
    throw new Error(errMsg);
  }
  return res.json();
}

export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMetadata> {
  const cleanId = spreadsheetId.trim();
  if (!cleanId) throw new Error('Spreadsheet ID is required.');
  const data = await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title`,
    accessToken
  );
  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'Untitled Spreadsheet',
    sheetTitles: Array.isArray(data.sheets)
      ? data.sheets.map((s: { properties?: { title?: string } }) => s.properties?.title || '').filter(Boolean)
      : [],
    spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${cleanId}`,
  };
}

/**
 * Serializes the complete TourismContext state into tabular 2D arrays
 * ready for Google Sheets batchUpdate across all 10 domain tabs.
 */
export function serializeTourismDatabase(db: TourismDatabase): Record<BackupTabName, (string | number)[][]> {
  const dateFmt = db.settings.dateFormat;

  const paidByBooking = new Map<string, number>();
  for (const p of db.payments) {
    paidByBooking.set(p.bookingId, (paidByBooking.get(p.bookingId) ?? 0) + (Number(p.amount) || 0));
  }

  const totalRevenue = db.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalExpenses = db.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const netProfit = totalRevenue - totalExpenses;
  const activeBookings = db.bookings.filter((b) => b.status !== 'Cancelled');
  const totalOutstanding = activeBookings.reduce((s, b) => {
    const paid = paidByBooking.get(b.id) ?? 0;
    return s + Math.max(0, b.totalCost - paid);
  }, 0);

  const Summary: (string | number)[][] = [
    ['Metric / Field', 'Value'],
    ['Agency Name', db.settings.agencyName],
    ['Address', db.settings.address],
    ['Phone', db.settings.phone],
    ['WhatsApp', db.settings.whatsapp],
    ['Email', db.settings.email],
    ['GSTIN', db.settings.gstNumber || 'N/A'],
    ['Backup Date', formatDate(getTodayISO(), dateFmt)],
    ['Backup Timestamp (ISO)', new Date().toISOString()],
    ['Currency', db.settings.currency],
    ['Total Bookings', db.bookings.length],
    ['Total Customers', db.customers.length],
    ['Total Payments Recorded', db.payments.length],
    ['Total Expenses Recorded', db.expenses.length],
    ['Total Tour Packages', db.packages.length],
    ['Total Staff Members', db.staff.length],
    ['Total Partners', db.partners.length],
    ['Total Revenue (Payments Received)', totalRevenue],
    ['Total Expenses', totalExpenses],
    ['Net Profit', netProfit],
    ['Outstanding Receivables', totalOutstanding],
  ];

  const Bookings: (string | number)[][] = [
    [
      'Booking ID',
      'Booking Date',
      'Customer ID',
      'Customer Name',
      'Phone',
      'Email',
      'Destination',
      'Package ID',
      'Package Name',
      'Travel Start',
      'Travel End',
      'Adults',
      'Children',
      'Rooms',
      'Hotel Details',
      'Vehicle Details',
      'Total Cost',
      'Paid Amount',
      'Remaining Balance',
      'Status',
      'Notes',
      'Demo Record',
    ],
    ...db.bookings.map((b) => {
      const paid = paidByBooking.get(b.id) ?? 0;
      const remaining = b.status === 'Cancelled' ? 0 : Math.max(0, b.totalCost - paid);
      return [
        b.id,
        formatDate(b.bookingDate, dateFmt),
        b.customerId,
        b.customerName,
        b.customerPhone,
        b.customerEmail,
        b.destination,
        b.packageId,
        b.packageName,
        formatDate(b.travelStartDate, dateFmt),
        formatDate(b.travelEndDate, dateFmt),
        b.adults,
        b.children,
        b.rooms,
        b.hotelDetails,
        b.vehicleDetails,
        b.totalCost,
        paid,
        remaining,
        b.status,
        b.notes,
        b.isDemo ? 'Yes' : 'No',
      ];
    }),
  ];

  const Customers: (string | number)[][] = [
    [
      'Customer ID',
      'Full Name',
      'Phone',
      'WhatsApp',
      'Email',
      'Address',
      'City',
      'State',
      'Created Date',
      'Notes',
      'Demo Record',
    ],
    ...db.customers.map((c) => [
      c.id,
      c.fullName,
      c.phone,
      c.whatsapp,
      c.email,
      c.address,
      c.city,
      c.state,
      formatDate(c.createdAt, dateFmt),
      c.notes,
      c.isDemo ? 'Yes' : 'No',
    ]),
  ];

  const Payments: (string | number)[][] = [
    [
      'Payment ID',
      'Booking ID',
      'Customer ID',
      'Customer Name',
      'Payment Date',
      'Amount',
      'Method',
      'Transaction Reference',
      'Notes',
      'Demo Record',
    ],
    ...db.payments.map((p) => [
      p.id,
      p.bookingId,
      p.customerId,
      p.customerName,
      formatDate(p.paymentDate, dateFmt),
      p.amount,
      p.method,
      p.transactionRef,
      p.notes,
      p.isDemo ? 'Yes' : 'No',
    ]),
  ];

  const Expenses: (string | number)[][] = [
    [
      'Expense ID',
      'Expense Date',
      'Category',
      'Description',
      'Vendor Name',
      'Related Booking ID',
      'Amount',
      'Payment Method',
      'Notes',
      'Demo Record',
    ],
    ...db.expenses.map((e) => [
      e.id,
      formatDate(e.expenseDate, dateFmt),
      e.category,
      e.description,
      e.vendorName,
      e.relatedBookingId || '',
      e.amount,
      e.paymentMethod,
      e.notes,
      e.isDemo ? 'Yes' : 'No',
    ]),
  ];

  const Packages: (string | number)[][] = [
    [
      'Package ID',
      'Package Name',
      'Destination',
      'Days',
      'Nights',
      'Price Per Person',
      'Min Pax',
      'Max Pax',
      'Hotel Details',
      'Vehicle Details',
      'Status',
      'Description',
      'Itinerary',
      'Included Services',
      'Excluded Services',
      'Demo Record',
    ],
    ...db.packages.map((p) => [
      p.id,
      p.name,
      p.destination,
      p.durationDays,
      p.durationNights,
      p.pricePerPerson,
      p.minPersons,
      p.maxPersons,
      p.hotelDetails,
      p.vehicleDetails,
      p.status,
      p.description,
      p.itinerary.join(' | '),
      p.includedServices.join(', '),
      p.excludedServices.join(', '),
      p.isDemo ? 'Yes' : 'No',
    ]),
  ];

  const Staff: (string | number)[][] = [
    [
      'Staff ID',
      'Full Name',
      'Designation',
      'Phone',
      'Email',
      'Address',
      'Joining Date',
      'Monthly Salary',
      'Status',
      'Salary Records Count',
      'Demo Record',
    ],
    ...db.staff.map((s) => [
      s.id,
      s.fullName,
      s.designation,
      s.phone,
      s.email,
      s.address,
      formatDate(s.joiningDate, dateFmt),
      s.monthlySalary,
      s.status,
      s.salaryRecords.length,
      s.isDemo ? 'Yes' : 'No',
    ]),
  ];

  const Staff_Salaries: (string | number)[][] = [
    ['Salary Record ID', 'Staff ID', 'Staff Name', 'Designation', 'Salary Month', 'Paid Date', 'Amount', 'Method', 'Notes'],
    ...db.staff.flatMap((s) =>
      s.salaryRecords.map((sr) => [
        sr.id,
        s.id,
        s.fullName,
        s.designation,
        sr.month,
        formatDate(sr.paidDate, dateFmt),
        sr.amount,
        sr.method,
        sr.notes,
      ])
    ),
  ];

  const Partners: (string | number)[][] = [
    ['Partner ID', 'Name', 'Type', 'Location', 'Contact Person', 'Phone', 'Email', 'Rate Notes', 'Status', 'Demo Record'],
    ...db.partners.map((p) => [
      p.id,
      p.name,
      p.type,
      p.location,
      p.contactPerson,
      p.phone,
      p.email,
      p.rateNotes,
      p.status,
      p.isDemo ? 'Yes' : 'No',
    ]),
  ];

  const Settings: (string | number)[][] = [
    ['Setting Key', 'Setting Value'],
    ['agencyName', db.settings.agencyName],
    ['address', db.settings.address],
    ['phone', db.settings.phone],
    ['whatsapp', db.settings.whatsapp],
    ['email', db.settings.email],
    ['gstNumber', db.settings.gstNumber],
    ['currency', db.settings.currency],
    ['dateFormat', db.settings.dateFormat],
    ['theme', db.settings.theme],
    ['requireLogin', db.settings.requireLogin ? 'Yes' : 'No'],
    ['adminName', db.settings.userProfile.name],
    ['adminEmail', db.settings.userProfile.email],
    ['adminRole', db.settings.userProfile.role],
  ];

  return {
    Summary,
    Bookings,
    Customers,
    Payments,
    Expenses,
    Packages,
    Staff,
    Staff_Salaries,
    Partners,
    Settings,
  };
}

export async function backupAllDataToSpreadsheet(
  spreadsheetId: string,
  accessToken: string,
  db: TourismDatabase
): Promise<BackupResult> {
  const cleanId = spreadsheetId.trim();
  const metadata = await fetchSpreadsheetMetadata(cleanId, accessToken);

  const missingTabs = BACKUP_TABS.filter((tab) => !metadata.sheetTitles.includes(tab));
  if (missingTabs.length > 0) {
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: missingTabs.map((title) => ({
            addSheet: {
              properties: {
                title,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          })),
        }),
      }
    );
  }

  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}/values:batchClear`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        ranges: BACKUP_TABS.map((t) => `'${t}'`),
      }),
    }
  );

  const payloads = serializeTourismDatabase(db);
  const data = BACKUP_TABS.map((tab) => ({
    range: `'${tab}'!A1`,
    majorDimension: 'ROWS',
    values: payloads[tab].map((row) => row.map(sanitizeCell)),
  }));

  const writeRes = await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data,
      }),
    }
  );

  const updatedTabs: BackupTabSummary[] = BACKUP_TABS.map((tab) => ({
    tabName: tab,
    rowCount: Math.max(0, payloads[tab].length - 1),
  }));

  return {
    spreadsheetId: cleanId,
    spreadsheetTitle: metadata.title,
    spreadsheetUrl: metadata.spreadsheetUrl,
    updatedTabs,
    totalCellsWritten: writeRes.totalUpdatedCells ?? 0,
    timestamp: new Date().toLocaleString(),
  };
}

/**
 * Serializes the current TourismContext database state and exports all records
 * (Summary, Bookings, Customers, Payments, Expenses, Packages, Staff, Staff_Salaries, Partners, Settings)
 * to the target Google Spreadsheet ID.
 */
export async function exportToGoogleSheets(
  db: TourismDatabase,
  spreadsheetId: string = DEFAULT_BACKUP_SPREADSHEET_ID,
  accessToken?: string
): Promise<BackupResult> {
  const token = accessToken ?? (await getAccessToken());
  if (!token) {
    throw new SheetsAuthExpiredError('Google sign-in is required to export data to Google Sheets.');
  }
  return backupAllDataToSpreadsheet(spreadsheetId, token, db);
}

export const APPS_SCRIPT_TEMPLATE = `function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: 'Tourism backup webhook is active.' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function testAuthorization() {
  var ss = SpreadsheetApp.openById('${DEFAULT_BACKUP_SPREADSHEET_ID}');
  Logger.log('Authorized access to: ' + ss.getName());
}

function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        error: 'Missing postData. Deploy as a Web App (Anyone) or run testAuthorization in the editor instead of Run on doPost.'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var body = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.openById(body.spreadsheetId || '${DEFAULT_BACKUP_SPREADSHEET_ID}');
  var tabs = body.tabs || {};
  Object.keys(tabs).forEach(function(tabName) {
    var rows = tabs[tabName];
    var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
    sheet.clearContents();
    if (rows && rows.length > 0 && rows[0].length > 0) {
      sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
      sheet.setFrozenRows(1);
    }
  });
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, spreadsheetTitle: ss.getName() }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

export async function backupViaAppsScriptWebhook(
  webhookUrl: string,
  db: TourismDatabase,
  spreadsheetId: string = DEFAULT_BACKUP_SPREADSHEET_ID
): Promise<BackupResult> {
  const cleanUrl = webhookUrl.trim();
  if (!cleanUrl.startsWith('https://script.google.com/')) {
    throw new Error('Please enter a valid Google Apps Script Web App URL (https://script.google.com/...).');
  }
  const cleanId = spreadsheetId.trim() || DEFAULT_BACKUP_SPREADSHEET_ID;
  const payloads = serializeTourismDatabase(db);
  const sanitizedTabs: Record<string, (string | number)[][]> = {};
  let totalCells = 0;

  for (const tab of BACKUP_TABS) {
    const rows = payloads[tab].map((row) => row.map(sanitizeCell));
    sanitizedTabs[tab] = rows;
    totalCells += rows.reduce((sum, r) => sum + r.length, 0);
  }

  // Use text/plain to avoid CORS preflight issues with Google Apps Script Web Apps
  await fetch(cleanUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      spreadsheetId: cleanId,
      tabs: sanitizedTabs,
    }),
  });

  const updatedTabs: BackupTabSummary[] = BACKUP_TABS.map((tab) => ({
    tabName: tab,
    rowCount: Math.max(0, payloads[tab].length - 1),
  }));

  return {
    spreadsheetId: cleanId,
    spreadsheetTitle: `Spreadsheet (${cleanId.slice(0, 10)}...)`,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cleanId}`,
    updatedTabs,
    totalCellsWritten: totalCells,
    timestamp: new Date().toLocaleString(),
  };
}
