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

export const APPS_SCRIPT_TEMPLATE = `var DEFAULT_SPREADSHEET_ID = '${DEFAULT_BACKUP_SPREADSHEET_ID}';

var TYPE_SHEET_CONFIG = {
  bookings: {
    sheetName: 'Bookings',
    columns: [
      'id', 'bookingDate', 'customerId', 'customerName', 'customerPhone', 'customerEmail',
      'destination', 'packageId', 'packageName', 'travelStartDate', 'travelEndDate',
      'adults', 'children', 'rooms', 'hotelDetails', 'vehicleDetails', 'totalCost', 'status', 'notes'
    ]
  },
  customers: {
    sheetName: 'Customers',
    columns: ['id', 'fullName', 'phone', 'whatsapp', 'email', 'address', 'city', 'state', 'createdAt', 'notes']
  },
  payments: {
    sheetName: 'Payments',
    columns: ['id', 'bookingId', 'customerId', 'customerName', 'paymentDate', 'amount', 'method', 'transactionRef', 'notes']
  },
  expenses: {
    sheetName: 'Expenses',
    columns: ['id', 'expenseDate', 'category', 'description', 'vendorName', 'relatedBookingId', 'amount', 'paymentMethod', 'notes']
  },
  packages: {
    sheetName: 'Packages',
    columns: ['id', 'name', 'destination', 'durationDays', 'durationNights', 'pricePerPerson', 'status']
  },
  staff: {
    sheetName: 'Staff',
    columns: ['id', 'fullName', 'designation', 'phone', 'email', 'joiningDate', 'monthlySalary', 'status']
  },
  partners: {
    sheetName: 'Partners',
    columns: ['id', 'name', 'type', 'location', 'contactPerson', 'phone', 'email', 'status']
  }
};

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonResponse_({
    ok: true,
    spreadsheetId: DEFAULT_SPREADSHEET_ID,
    message: 'Tourism webhook is active. Send an HTTP POST with JSON payload.'
  });
}

function testAuthorization() {
  var ss = SpreadsheetApp.openById(DEFAULT_SPREADSHEET_ID);
  Logger.log('Authorized access to: ' + ss.getName());
}

function testDoPostSample() {
  var mockEvent = {
    postData: {
      contents: JSON.stringify({
        spreadsheetId: DEFAULT_SPREADSHEET_ID,
        type: 'bookings',
        mode: 'upsert',
        data: {
          id: 'TEST-001',
          bookingDate: '2026-11-16',
          customerName: 'Sample Guest',
          destination: 'Darjeeling',
          totalCost: 15000,
          status: 'Confirmed'
        }
      })
    }
  };
  Logger.log(doPost(mockEvent).getContent());
}

function sanitizeCell_(val) {
  if (val === undefined || val === null) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  var str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (/^[=+\\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function normalizeRows_(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  var maxCols = 0;
  for (var r = 0; r < rows.length; r++) {
    if (Array.isArray(rows[r]) && rows[r].length > maxCols) {
      maxCols = rows[r].length;
    }
  }
  if (maxCols === 0) return [];
  var normalized = [];
  for (var i = 0; i < rows.length; i++) {
    var src = Array.isArray(rows[i]) ? rows[i] : [rows[i]];
    var out = [];
    for (var c = 0; c < maxCols; c++) {
      out.push(sanitizeCell_(c < src.length ? src[c] : ''));
    }
    normalized.push(out);
  }
  return normalized;
}

function objectsToSheetRows_(items, preferredKeys) {
  if (!Array.isArray(items) || items.length === 0) {
    return preferredKeys && preferredKeys.length ? [preferredKeys] : [['No Records']];
  }
  var keys = [];
  var seen = {};
  if (Array.isArray(preferredKeys)) {
    preferredKeys.forEach(function(k) {
      if (!seen[k]) {
        seen[k] = true;
        keys.push(k);
      }
    });
  }
  items.forEach(function(item) {
    if (item && typeof item === 'object') {
      Object.keys(item).forEach(function(k) {
        if (!seen[k]) {
          seen[k] = true;
          keys.push(k);
        }
      });
    }
  });
  var rows = [keys];
  items.forEach(function(item) {
    rows.push(keys.map(function(k) {
      return item && typeof item === 'object' ? sanitizeCell_(item[k]) : '';
    }));
  });
  return rows;
}

function writeTabRows_(ss, tabName, rawRows) {
  var rows = normalizeRows_(rawRows);
  var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
  sheet.clearContents();
  if (rows.length > 0) {
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sheet.setFrozenRows(1);
  }
  return { tabName: tabName, action: 'replaced', rowCount: Math.max(0, rows.length - 1) };
}

function upsertOrAppendTypedData_(ss, rawType, rawData, mode) {
  var key = String(rawType || '').trim().toLowerCase();
  var cfg = TYPE_SHEET_CONFIG[key];
  var sheetName = cfg ? cfg.sheetName : String(rawType || 'Data').trim();
  var preferredCols = cfg ? cfg.columns : [];

  var records = Array.isArray(rawData) ? rawData : (rawData && typeof rawData === 'object' ? [rawData] : []);
  if (mode === 'replace') {
    return writeTabRows_(ss, sheetName, objectsToSheetRows_(records, preferredCols));
  }

  var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  var existingValues = sheet.getDataRange().getValues();
  var hasExistingHeader = existingValues.length > 0 && existingValues[0].some(function(cell) { return String(cell).trim() !== ''; });

  if (!hasExistingHeader) {
    return writeTabRows_(ss, sheetName, objectsToSheetRows_(records, preferredCols));
  }

  var headers = existingValues[0].map(function(h) { return String(h).trim(); });
  records.forEach(function(rec) {
    if (rec && typeof rec === 'object') {
      Object.keys(rec).forEach(function(k) {
        if (headers.indexOf(k) === -1) {
          headers.push(k);
        }
      });
    }
  });
  if (headers.length > existingValues[0].length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);

  var idColIdx = headers.indexOf('id');
  var rowIndexById = {};
  if (idColIdx !== -1 && mode !== 'append') {
    for (var r = 1; r < existingValues.length; r++) {
      var existingId = String(existingValues[r][idColIdx] || '').trim();
      if (existingId) {
        rowIndexById[existingId] = r + 1;
      }
    }
  }

  var updatedCount = 0;
  var appendedRows = [];
  records.forEach(function(rec) {
    if (!rec || typeof rec !== 'object') return;
    var row = headers.map(function(h) { return sanitizeCell_(rec[h]); });
    var recId = idColIdx !== -1 && rec.id !== undefined && rec.id !== null ? String(rec.id).trim() : '';
    if (recId && rowIndexById[recId]) {
      sheet.getRange(rowIndexById[recId], 1, 1, headers.length).setValues([row]);
      updatedCount++;
    } else {
      appendedRows.push(row);
    }
  });

  if (appendedRows.length > 0) {
    var startRow = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(startRow, 1, appendedRows.length, headers.length).setValues(appendedRows);
  }

  return {
    tabName: sheetName,
    action: mode === 'append' ? 'appended' : 'upserted',
    updatedCount: updatedCount,
    appendedCount: appendedRows.length
  };
}

function writeJsonSnapshotFallback_(ss, payloadObj) {
  var jsonStr = JSON.stringify(payloadObj);
  var maxCellChars = 45000;
  var totalChunks = Math.max(1, Math.ceil(jsonStr.length / maxCellChars));
  var exportedAt = new Date().toISOString();
  var rows = [['Section', 'Chunk Index', 'Total Chunks', 'Exported At (ISO)', 'JSON Payload']];
  for (var i = 0; i < totalChunks; i++) {
    rows.push(['full_state_json', i + 1, totalChunks, exportedAt, jsonStr.slice(i * maxCellChars, (i + 1) * maxCellChars)]);
  }
  return writeTabRows_(ss, 'JSON_Snapshot', rows);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var rawContents = '';
    if (e && e.postData && typeof e.postData.contents === 'string') {
      rawContents = e.postData.contents;
    } else if (e && e.parameter && (e.parameter.payload || e.parameter.data)) {
      rawContents = e.parameter.payload || e.parameter.data;
    }

    if (!rawContents) {
      return jsonResponse_({
        ok: false,
        error: 'Missing postData payload. Deploy as a Web App (Anyone) and send POST JSON, or run testAuthorization / testDoPostSample in the editor.'
      });
    }

    var body = JSON.parse(rawContents);
    if (!body || typeof body !== 'object') {
      return jsonResponse_({ ok: false, error: 'Parsed JSON payload is empty or invalid.' });
    }

    lock.waitLock(15000);
    var targetId = (body.spreadsheetId && String(body.spreadsheetId).trim()) || DEFAULT_SPREADSHEET_ID;
    var ss = SpreadsheetApp.openById(targetId);
    var updatedTabs = [];

    if (body.type) {
      var mode = String(body.mode || (body.replace ? 'replace' : 'upsert')).toLowerCase();
      var payloadData = body.data !== undefined ? body.data : (body.records !== undefined ? body.records : (body.record !== undefined ? body.record : body.payload));
      if (payloadData === undefined) {
        return jsonResponse_({
          ok: false,
          error: 'Payload specified "type" (' + body.type + ') without a "data" or "records" field.'
        });
      }
      updatedTabs.push(upsertOrAppendTypedData_(ss, body.type, payloadData, mode));
    } else if (body.tabs && typeof body.tabs === 'object' && Object.keys(body.tabs).length > 0) {
      Object.keys(body.tabs).forEach(function(tabName) {
        updatedTabs.push(writeTabRows_(ss, tabName, body.tabs[tabName]));
      });
    } else {
      var source = (body.collections && typeof body.collections === 'object') ? body.collections : body;
      Object.keys(TYPE_SHEET_CONFIG).forEach(function(key) {
        if (Array.isArray(source[key])) {
          var cfg = TYPE_SHEET_CONFIG[key];
          updatedTabs.push(writeTabRows_(ss, cfg.sheetName, objectsToSheetRows_(source[key], cfg.columns)));
        }
      });
      updatedTabs.push(writeJsonSnapshotFallback_(ss, body));
    }

    SpreadsheetApp.flush();
    return jsonResponse_({
      ok: true,
      spreadsheetId: ss.getId(),
      spreadsheetTitle: ss.getName(),
      updatedTabs: updatedTabs
    });
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (lockErr) {
      // ignore if lock was not acquired
    }
  }
}`;

function buildAppsScriptJsonSnapshotRows(db: TourismDatabase, spreadsheetId: string): (string | number)[][] {
  const maxCellChars = 45000;
  const exportedAt = new Date().toISOString();
  const safeSettings = {
    ...db.settings,
    userProfile: {
      name: db.settings.userProfile.name,
      email: db.settings.userProfile.email,
      role: db.settings.userProfile.role,
    },
  };
  const fullPayload = {
    schemaVersion: '1.0.0',
    exportedAt,
    spreadsheetId,
    agency: safeSettings,
    collections: {
      bookings: db.bookings,
      customers: db.customers,
      payments: db.payments,
      expenses: db.expenses,
      packages: db.packages,
      staff: db.staff,
      partners: db.partners,
    },
  };

  const rows: (string | number)[][] = [
    ['Section', 'Chunk Index', 'Total Chunks', 'Record Count', 'Exported At (ISO)', 'JSON Payload'],
  ];

  const appendSection = (name: string, count: number, value: unknown) => {
    const json = JSON.stringify(value);
    const totalChunks = Math.max(1, Math.ceil(json.length / maxCellChars));
    for (let i = 0; i < totalChunks; i++) {
      rows.push([name, i + 1, totalChunks, count, exportedAt, json.slice(i * maxCellChars, (i + 1) * maxCellChars)]);
    }
  };

  appendSection('bookings', db.bookings.length, db.bookings);
  appendSection('customers', db.customers.length, db.customers);
  appendSection('payments', db.payments.length, db.payments);
  appendSection('expenses', db.expenses.length, db.expenses);
  appendSection('packages', db.packages.length, db.packages);
  appendSection('staff', db.staff.length, db.staff);
  appendSection('partners', db.partners.length, db.partners);
  appendSection('full_state_json', 1, fullPayload);

  return rows;
}

export async function backupViaAppsScriptWebhook(
  webhookUrl: string,
  db: TourismDatabase,
  spreadsheetId: string = DEFAULT_BACKUP_SPREADSHEET_ID
): Promise<BackupResult> {
  const cleanUrl = webhookUrl.trim();
  if (!cleanUrl.startsWith('https://script.google.com/')) {
    throw new Error('Please enter a valid Google Apps Script Web App URL (https://script.google.com/...).');
  }
  if (cleanUrl.endsWith('/dev')) {
    throw new Error('Please use the deployed Web App "/exec" URL (not the "/dev" test URL).');
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

  const jsonSnapshotRows = buildAppsScriptJsonSnapshotRows(db, cleanId);
  sanitizedTabs['JSON_Snapshot'] = jsonSnapshotRows;
  totalCells += jsonSnapshotRows.reduce((sum, r) => sum + r.length, 0);

  let response: Response;
  try {
    // Use text/plain to send a CORS-simple POST without preflight while reading Apps Script's JSON response
    response = await fetch(cleanUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        spreadsheetId: cleanId,
        tabs: sanitizedTabs,
      }),
    });
  } catch {
    throw new Error(
      'Unable to reach the Apps Script Web App. Ensure it is deployed with "Who has access: Anyone" using the /exec URL.'
    );
  }

  if (!response.ok) {
    throw new Error(`Apps Script Web App returned HTTP ${response.status}. Verify deployment access is set to "Anyone".`);
  }

  let parsedTitle = `Spreadsheet (${cleanId.slice(0, 10)}...)`;
  try {
    const resultJson = (await response.json()) as {
      ok?: boolean;
      error?: string;
      spreadsheetTitle?: string;
    };
    if (resultJson && resultJson.ok === false) {
      throw new Error(resultJson.error || 'Apps Script doPost returned an error.');
    }
    if (resultJson?.spreadsheetTitle) {
      parsedTitle = resultJson.spreadsheetTitle;
    }
  } catch (err) {
    if (err instanceof Error && !err.message.includes('JSON')) {
      throw err;
    }
  }

  const updatedTabs: BackupTabSummary[] = [
    ...BACKUP_TABS.map((tab) => ({
      tabName: tab,
      rowCount: Math.max(0, payloads[tab].length - 1),
    })),
    {
      tabName: 'JSON_Snapshot',
      rowCount: Math.max(0, jsonSnapshotRows.length - 1),
    },
  ];

  return {
    spreadsheetId: cleanId,
    spreadsheetTitle: parsedTitle,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cleanId}`,
    updatedTabs,
    totalCellsWritten: totalCells,
    timestamp: new Date().toLocaleString(),
  };
}
