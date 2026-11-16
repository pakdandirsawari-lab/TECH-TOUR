/**
 * Himalayan Horizons — Google Sheets Central Cloud Database Backend (Apps Script)
 * Target Spreadsheet ID: 1BtuAFZPHsQPiXBijVVQTFWu4Dn2EsajLaSYaRtJHkcM
 *
 * Setup:
 * 1. Open your Google Sheet -> Extensions -> Apps Script -> paste this entire file into Code.gs.
 * 2. Optional Security: In Apps Script -> Project Settings -> Script Properties, add:
 *      - API_SECRET: a random secret string (must match Server API Secret in the app)
 *      - DEFAULT_ADMIN_PASSWORD: your initial admin password (defaults to "admin123" if unset)
 * 3. Select `testAndInitialize` in the top toolbar and click Run once to grant permissions & initialize all tabs.
 * 4. Click Deploy -> New deployment -> Web app:
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Copy the Web App URL (ending in /exec) into the app's Settings -> Google Sheets Cloud Connection.
 */

var DEFAULT_SPREADSHEET_ID = '1BtuAFZPHsQPiXBijVVQTFWu4Dn2EsajLaSYaRtJHkcM';

var SCHEMA = {
  customers: {
    sheetName: 'Customers',
    headers: ['id', 'fullName', 'phone', 'whatsapp', 'email', 'address', 'city', 'state', 'notes', 'createdAt'],
    numberFields: [],
    jsonFields: [],
  },
  bookings: {
    sheetName: 'Bookings',
    headers: [
      'id',
      'bookingDate',
      'customerId',
      'customerName',
      'customerPhone',
      'customerEmail',
      'destination',
      'packageId',
      'packageName',
      'travelStartDate',
      'travelEndDate',
      'adults',
      'children',
      'rooms',
      'vehicleDetails',
      'hotelDetails',
      'totalCost',
      'status',
      'notes',
    ],
    numberFields: ['adults', 'children', 'rooms', 'totalCost'],
    jsonFields: [],
  },
  payments: {
    sheetName: 'Payments',
    headers: ['id', 'bookingId', 'customerId', 'customerName', 'paymentDate', 'amount', 'method', 'transactionRef', 'notes'],
    numberFields: ['amount'],
    jsonFields: [],
  },
  expenses: {
    sheetName: 'Expenses',
    headers: ['id', 'expenseDate', 'category', 'description', 'vendorName', 'relatedBookingId', 'amount', 'paymentMethod', 'notes'],
    numberFields: ['amount'],
    jsonFields: [],
  },
  packages: {
    sheetName: 'Packages',
    headers: [
      'id',
      'name',
      'destination',
      'durationDays',
      'durationNights',
      'description',
      'itinerary',
      'hotelDetails',
      'vehicleDetails',
      'pricePerPerson',
      'minPersons',
      'maxPersons',
      'includedServices',
      'excludedServices',
      'imageUrl',
      'status',
    ],
    numberFields: ['durationDays', 'durationNights', 'pricePerPerson', 'minPersons', 'maxPersons'],
    jsonFields: ['itinerary', 'includedServices', 'excludedServices'],
  },
  staff: {
    sheetName: 'Staff',
    headers: [
      'id',
      'fullName',
      'phone',
      'email',
      'address',
      'designation',
      'joiningDate',
      'monthlySalary',
      'status',
      'salaryRecords',
    ],
    numberFields: ['monthlySalary'],
    jsonFields: ['salaryRecords'],
  },
  partners: {
    sheetName: 'Partners',
    headers: ['id', 'name', 'type', 'location', 'contactPerson', 'phone', 'email', 'rateNotes', 'status'],
    numberFields: [],
    jsonFields: [],
  },
};

var SETTINGS_SHEET = 'Settings';
var USERS_SHEET = 'Users';
var META_SHEET = '_Meta';

function getSpreadsheet_(overrideId) {
  var props = PropertiesService.getScriptProperties();
  var cleanOverride = overrideId ? String(overrideId).trim() : '';
  var id = cleanOverride || props.getProperty('SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID;
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active && (!cleanOverride || active.getId() === id)) {
      return active;
    }
  } catch (e) {
    // Fallback to openById for standalone script projects
  }
  return SpreadsheetApp.openById(id);
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function validateApiSecret_(providedSecret) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_SECRET');
  if (!expected) return true; // Secret not configured in Script Properties
  return String(providedSecret || '') === String(expected);
}

function sanitizeCell_(val) {
  if (val === undefined || val === null) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  var str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function sha256Hex_(input) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(input), Utilities.Charset.UTF_8);
  var hex = [];
  for (var i = 0; i < digest.length; i++) {
    var b = digest[i];
    if (b < 0) b += 256;
    var s = b.toString(16);
    if (s.length === 1) s = '0' + s;
    hex.push(s);
  }
  return hex.join('');
}

function hashPassword_(plainPassword) {
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  return salt + '$' + sha256Hex_(salt + ':' + String(plainPassword));
}

function verifyPassword_(plainPassword, storedHash) {
  var raw = String(storedHash || '');
  var parts = raw.split('$');
  if (parts.length !== 2) return false;
  var salt = parts[0];
  var expectedHex = parts[1];
  return sha256Hex_(salt + ':' + String(plainPassword)) === expectedHex;
}

function ensureSheetWithHeaders_(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow === 0 || lastCol === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  var existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h || '').trim();
  });
  var missing = [];
  for (var i = 0; i < headers.length; i++) {
    if (existingHeaders.indexOf(headers[i]) === -1) {
      missing.push(headers[i]);
    }
  }
  if (missing.length > 0) {
    var nextHeaders = existingHeaders.concat(missing);
    sheet.getRange(1, 1, 1, nextHeaders.length).setValues([nextHeaders]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function getMetaState_(ss) {
  var sheet = ensureSheetWithHeaders_(ss, META_SHEET, ['key', 'value']);
  var rows = sheet.getDataRange().getValues();
  var version = 1;
  var updatedAt = new Date().toISOString();
  for (var r = 1; r < rows.length; r++) {
    if (rows[r][0] === 'version') version = Number(rows[r][1]) || 1;
    if (rows[r][0] === 'updatedAt') updatedAt = String(rows[r][1] || updatedAt);
  }
  if (rows.length <= 1) {
    sheet.getRange(2, 1, 2, 2).setValues([
      ['version', version],
      ['updatedAt', updatedAt],
    ]);
  }
  return { version: version, updatedAt: updatedAt };
}

function bumpMetaVersion_(ss, actionName) {
  var sheet = ensureSheetWithHeaders_(ss, META_SHEET, ['key', 'value']);
  var current = getMetaState_(ss);
  var nextVersion = current.version + 1;
  var nowIso = new Date().toISOString();
  sheet.clearContents();
  sheet.getRange(1, 1, 4, 2).setValues([
    ['key', 'value'],
    ['version', nextVersion],
    ['updatedAt', nowIso],
    ['lastAction', String(actionName || 'update')],
  ]);
  sheet.setFrozenRows(1);
  return { version: nextVersion, updatedAt: nowIso };
}

function seedDefaultUsersIfEmpty_(ss) {
  var sheet = ensureSheetWithHeaders_(ss, USERS_SHEET, [
    'id',
    'name',
    'email',
    'role',
    'passwordHash',
    'status',
    'avatar',
    'createdAt',
  ]);
  if (sheet.getLastRow() > 1) return;

  var props = PropertiesService.getScriptProperties();
  var defaultAdminPass = props.getProperty('DEFAULT_ADMIN_PASSWORD') || 'admin123';
  var defaultStaffPass = props.getProperty('DEFAULT_STAFF_PASSWORD') || 'staff123';
  var nowDate = new Date().toISOString().slice(0, 10);

  sheet.getRange(2, 1, 2, 8).setValues([
    [
      'USR-ADMIN',
      'Agency Administrator',
      'admin@himalayanhorizons.in',
      'admin',
      hashPassword_(defaultAdminPass),
      'Active',
      '/src/assets/images/avatar_agency_manager_1794845749106.jpg',
      nowDate,
    ],
    [
      'USR-STAFF-1',
      'Operations Staff',
      'staff@himalayanhorizons.in',
      'staff',
      hashPassword_(defaultStaffPass),
      'Active',
      '/src/assets/images/avatar_agency_manager_1794845749106.jpg',
      nowDate,
    ],
  ]);
}

function initializeDatabase_(ss) {
  Object.keys(SCHEMA).forEach(function (key) {
    ensureSheetWithHeaders_(ss, SCHEMA[key].sheetName, SCHEMA[key].headers);
  });
  ensureSheetWithHeaders_(ss, SETTINGS_SHEET, ['key', 'value']);
  seedDefaultUsersIfEmpty_(ss);
  var meta = getMetaState_(ss);
  return meta;
}

function serializeValueForSheet_(val, isJsonField) {
  if (isJsonField) {
    return JSON.stringify(Array.isArray(val) ? val : val || []);
  }
  return sanitizeCell_(val);
}

function parseCellFromSheet_(raw, key, def) {
  if (def.jsonFields.indexOf(key) !== -1) {
    if (Array.isArray(raw)) return raw;
    var str = String(raw || '').trim();
    if (!str) return [];
    try {
      var parsed = JSON.parse(str);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  if (def.numberFields.indexOf(key) !== -1) {
    var num = Number(raw);
    return isNaN(num) ? 0 : num;
  }
  if (raw instanceof Date) {
    return Utilities.formatDate(raw, Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd');
  }
  return raw === null || raw === undefined ? '' : String(raw);
}

function readCollection_(ss, collectionKey) {
  var def = SCHEMA[collectionKey];
  if (!def) throw new Error('Unknown collection: ' + collectionKey);
  var sheet = ensureSheetWithHeaders_(ss, def.sheetName, def.headers);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  var headers = values[0].map(function (h) {
    return String(h || '').trim();
  });
  var seenIds = {};
  var records = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var idVal = '';
    var obj = {};
    var hasAnyValue = false;

    for (var c = 0; c < headers.length; c++) {
      var field = headers[c];
      if (!field) continue;
      var parsedVal = parseCellFromSheet_(row[c], field, def);
      if (parsedVal !== '' && parsedVal !== 0) hasAnyValue = true;
      obj[field] = parsedVal;
      if (field === 'id') idVal = String(parsedVal || '').trim();
    }

    if (!hasAnyValue || !idVal) continue;
    if (seenIds[idVal]) continue; // prevent duplicates on read
    seenIds[idVal] = true;
    records.push(obj);
  }
  return records;
}

function readSettings_(ss) {
  var sheet = ensureSheetWithHeaders_(ss, SETTINGS_SHEET, ['key', 'value']);
  var rows = sheet.getDataRange().getValues();
  var out = {
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
      avatar: '/src/assets/images/avatar_agency_manager_1794845749106.jpg',
    },
  };
  for (var r = 1; r < rows.length; r++) {
    var k = String(rows[r][0] || '').trim();
    var v = rows[r][1];
    if (!k || k === 'password') continue;
    if (k === 'requireLogin') {
      out.requireLogin = String(v).toLowerCase() !== 'false' && String(v).toLowerCase() !== 'no';
    } else if (k === 'theme') {
      out.theme = v === 'dark' ? 'dark' : 'light';
    } else if (k in out) {
      out[k] = String(v || '');
    }
  }
  return out;
}

function writeSettings_(ss, settingsObj) {
  var sheet = ensureSheetWithHeaders_(ss, SETTINGS_SHEET, ['key', 'value']);
  var allowedKeys = ['agencyName', 'agencyLogo', 'address', 'phone', 'whatsapp', 'email', 'gstNumber', 'currency', 'dateFormat', 'theme', 'requireLogin'];
  var rows = [['key', 'value']];
  allowedKeys.forEach(function (k) {
    if (settingsObj && settingsObj[k] !== undefined) {
      rows.push([k, k === 'requireLogin' ? String(Boolean(settingsObj[k])) : sanitizeCell_(settingsObj[k])]);
    }
  });
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.setFrozenRows(1);
}

function upsertCollectionRecords_(ss, collectionKey, inputRecords) {
  var def = SCHEMA[collectionKey];
  if (!def) throw new Error('Unknown collection: ' + collectionKey);
  var sheet = ensureSheetWithHeaders_(ss, def.sheetName, def.headers);
  var records = Array.isArray(inputRecords) ? inputRecords : [inputRecords];

  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function (h) {
    return String(h || '').trim();
  });
  var idCol = headers.indexOf('id');
  if (idCol === -1) throw new Error('Missing id header in ' + def.sheetName);

  var rowById = {};
  for (var r = 1; r < values.length; r++) {
    var existingId = String(values[r][idCol] || '').trim();
    if (existingId && !rowById[existingId]) {
      rowById[existingId] = r + 1;
    }
  }

  var added = 0;
  var updated = 0;
  var rowsToAppend = [];

  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    if (!rec || typeof rec !== 'object') continue;
    var recId = String(rec.id || '').trim();
    if (!recId) continue;

    var rowArr = headers.map(function (h) {
      return serializeValueForSheet_(rec[h], def.jsonFields.indexOf(h) !== -1);
    });

    if (rowById[recId]) {
      sheet.getRange(rowById[recId], 1, 1, headers.length).setValues([rowArr]);
      updated++;
    } else {
      rowById[recId] = -1; // prevent duplicates within same batch
      rowsToAppend.push(rowArr);
      added++;
    }
  }

  if (rowsToAppend.length > 0) {
    var startRow = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(startRow, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
  }

  return { added: added, updated: updated };
}

function deleteCollectionRecord_(ss, collectionKey, targetId, cascadeBookingPayments) {
  var def = SCHEMA[collectionKey];
  if (!def) throw new Error('Unknown collection: ' + collectionKey);
  var sheet = ensureSheetWithHeaders_(ss, def.sheetName, def.headers);
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function (h) {
    return String(h || '').trim();
  });
  var idCol = headers.indexOf('id');
  var deleted = 0;

  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][idCol] || '').trim() === String(targetId).trim()) {
      sheet.deleteRow(r + 1);
      deleted++;
    }
  }

  if (collectionKey === 'bookings' && cascadeBookingPayments) {
    var paySheet = ensureSheetWithHeaders_(ss, SCHEMA.payments.sheetName, SCHEMA.payments.headers);
    var payVals = paySheet.getDataRange().getValues();
    var payHeaders = payVals[0].map(function (h) {
      return String(h || '').trim();
    });
    var bCol = payHeaders.indexOf('bookingId');
    if (bCol !== -1) {
      for (var pr = payVals.length - 1; pr >= 1; pr--) {
        if (String(payVals[pr][bCol] || '').trim() === String(targetId).trim()) {
          paySheet.deleteRow(pr + 1);
        }
      }
    }
  }

  return { deleted: deleted };
}

function readAllUsersSafe_(ss) {
  seedDefaultUsersIfEmpty_(ss);
  var sheet = ss.getSheetByName(USERS_SHEET);
  var rows = sheet.getDataRange().getValues();
  var users = [];
  for (var r = 1; r < rows.length; r++) {
    var id = String(rows[r][0] || '').trim();
    if (!id) continue;
    users.push({
      id: id,
      name: String(rows[r][1] || ''),
      email: String(rows[r][2] || '').toLowerCase(),
      role: String(rows[r][3] || 'staff') === 'admin' ? 'admin' : 'staff',
      status: String(rows[r][5] || 'Active') === 'Inactive' ? 'Inactive' : 'Active',
      avatar: String(rows[r][6] || '/src/assets/images/avatar_agency_manager_1794845749106.jpg'),
      createdAt: String(rows[r][7] || ''),
    });
  }
  return users;
}

function verifyUserLogin_(ss, email, password) {
  seedDefaultUsersIfEmpty_(ss);
  var sheet = ss.getSheetByName(USERS_SHEET);
  var rows = sheet.getDataRange().getValues();
  var cleanEmail = String(email || '').trim().toLowerCase();

  for (var r = 1; r < rows.length; r++) {
    var rowEmail = String(rows[r][2] || '').trim().toLowerCase();
    var status = String(rows[r][5] || 'Active');
    if (rowEmail === cleanEmail) {
      if (status !== 'Active') {
        return { ok: false, error: 'This user account is inactive. Contact an administrator.' };
      }
      if (!verifyPassword_(password, rows[r][4])) {
        return { ok: false, error: 'Invalid email or password.' };
      }
      return {
        ok: true,
        user: {
          id: String(rows[r][0] || ''),
          name: String(rows[r][1] || ''),
          email: rowEmail,
          role: String(rows[r][3] || 'staff') === 'admin' ? 'admin' : 'staff',
          status: 'Active',
          avatar: String(rows[r][6] || '/src/assets/images/avatar_agency_manager_1794845749106.jpg'),
          createdAt: String(rows[r][7] || ''),
        },
      };
    }
  }
  return { ok: false, error: 'Invalid email or password.' };
}

function upsertUserAccount_(ss, userPayload) {
  seedDefaultUsersIfEmpty_(ss);
  var sheet = ss.getSheetByName(USERS_SHEET);
  var rows = sheet.getDataRange().getValues();
  var cleanEmail = String(userPayload.email || '').trim().toLowerCase();
  if (!cleanEmail) throw new Error('User email is required.');
  var role = userPayload.role === 'admin' ? 'admin' : 'staff';
  var status = userPayload.status === 'Inactive' ? 'Inactive' : 'Active';
  var avatar = String(userPayload.avatar || '/src/assets/images/avatar_agency_manager_1794845749106.jpg');
  var userId = String(userPayload.id || ('USR-' + new Date().getTime().toString().slice(-5)));
  var nowDate = new Date().toISOString().slice(0, 10);

  for (var r = 1; r < rows.length; r++) {
    if (String(rows[r][0] || '') === userId || String(rows[r][2] || '').toLowerCase() === cleanEmail) {
      var existingHash = String(rows[r][4] || '');
      var nextHash = userPayload.password && String(userPayload.password).trim()
        ? hashPassword_(String(userPayload.password).trim())
        : existingHash;
      sheet.getRange(r + 1, 1, 1, 8).setValues([
        [
          String(rows[r][0] || userId),
          sanitizeCell_(userPayload.name || rows[r][1]),
          cleanEmail,
          role,
          nextHash,
          status,
          avatar,
          String(rows[r][7] || nowDate),
        ],
      ]);
      return readAllUsersSafe_(ss);
    }
  }

  if (!userPayload.password || !String(userPayload.password).trim()) {
    throw new Error('Password is required when creating a new user.');
  }
  sheet.appendRow([
    userId,
    sanitizeCell_(userPayload.name || 'Staff Member'),
    cleanEmail,
    role,
    hashPassword_(String(userPayload.password).trim()),
    status,
    avatar,
    nowDate,
  ]);
  return readAllUsersSafe_(ss);
}

function deleteUserAccount_(ss, userId) {
  var sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  for (var r = rows.length - 1; r >= 1; r--) {
    if (String(rows[r][0] || '') === String(userId)) {
      sheet.deleteRow(r + 1);
    }
  }
  return readAllUsersSafe_(ss);
}

function testAndInitialize() {
  var ss = getSpreadsheet_();
  var meta = initializeDatabase_(ss);
  Logger.log('Initialized spreadsheet: ' + ss.getName() + ' (version ' + meta.version + ')');
}

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (!validateApiSecret_(params.apiSecret)) {
      return jsonOut_({ ok: false, error: 'Unauthorized API secret.' });
    }

    var ss = getSpreadsheet_(params.spreadsheetId);
    var action = String(params.action || 'ping');

    if (action === 'ping' || action === 'health' || action === 'init') {
      var getLock = LockService.getScriptLock();
      getLock.waitLock(15000);
      try {
        var meta = initializeDatabase_(ss);
        SpreadsheetApp.flush();
        return jsonOut_({
          ok: true,
          scriptVersion: '2.0.0',
          spreadsheetId: ss.getId(),
          spreadsheetTitle: ss.getName(),
          version: meta.version,
          updatedAt: meta.updatedAt,
        });
      } finally {
        try {
          getLock.releaseLock();
        } catch (lockErr) {}
      }
    }

    if (action === 'version') {
      var vMeta = getMetaState_(ss);
      return jsonOut_({
        ok: true,
        version: vMeta.version,
        updatedAt: vMeta.updatedAt,
      });
    }

    if (action === 'readUsers') {
      return jsonOut_({
        ok: true,
        users: readAllUsersSafe_(ss),
      });
    }

    if (action === 'readAll') {
      var rMeta = initializeDatabase_(ss);
      return jsonOut_({
        ok: true,
        version: rMeta.version,
        updatedAt: rMeta.updatedAt,
        data: {
          customers: readCollection_(ss, 'customers'),
          packages: readCollection_(ss, 'packages'),
          bookings: readCollection_(ss, 'bookings'),
          payments: readCollection_(ss, 'payments'),
          expenses: readCollection_(ss, 'expenses'),
          staff: readCollection_(ss, 'staff'),
          partners: readCollection_(ss, 'partners'),
          settings: readSettings_(ss),
        },
      });
    }

    return jsonOut_({ ok: false, error: 'Unsupported GET action: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var raw = '';
    if (e && e.postData && typeof e.postData.contents === 'string') {
      raw = e.postData.contents;
    } else if (e && e.parameter && (e.parameter.payload || e.parameter.data)) {
      raw = e.parameter.payload || e.parameter.data;
    }
    if (!raw) {
      return jsonOut_({ ok: false, error: 'Missing POST request body. Deploy as a Web App instead of clicking Run on doPost.' });
    }

    var body = JSON.parse(raw);
    if (!validateApiSecret_(body.apiSecret)) {
      return jsonOut_({ ok: false, error: 'Unauthorized API secret.' });
    }

    lock.waitLock(20000);
    var ss = getSpreadsheet_(body.spreadsheetId);
    var action = String(body.action || '');

    if (action === 'init') {
      var initMeta = initializeDatabase_(ss);
      return jsonOut_({
        ok: true,
        scriptVersion: '2.0.0',
        spreadsheetId: ss.getId(),
        spreadsheetTitle: ss.getName(),
        version: initMeta.version,
        updatedAt: initMeta.updatedAt,
      });
    }

    if (action === 'login') {
      initializeDatabase_(ss);
      return jsonOut_(verifyUserLogin_(ss, body.email, body.password));
    }

    if (action === 'upsert') {
      initializeDatabase_(ss);
      var upsertRes = upsertCollectionRecords_(ss, body.collection, body.records || body.record);
      var metaAfterUpsert = bumpMetaVersion_(ss, 'upsert:' + body.collection);
      SpreadsheetApp.flush();
      return jsonOut_({
        ok: true,
        added: upsertRes.added,
        updated: upsertRes.updated,
        version: metaAfterUpsert.version,
        updatedAt: metaAfterUpsert.updatedAt,
      });
    }

    if (action === 'delete') {
      initializeDatabase_(ss);
      var delRes = deleteCollectionRecord_(ss, body.collection, body.id, Boolean(body.cascadeBookingPayments));
      var metaAfterDel = bumpMetaVersion_(ss, 'delete:' + body.collection);
      SpreadsheetApp.flush();
      return jsonOut_({
        ok: true,
        deleted: delRes.deleted,
        version: metaAfterDel.version,
        updatedAt: metaAfterDel.updatedAt,
      });
    }

    if (action === 'saveSettings') {
      initializeDatabase_(ss);
      writeSettings_(ss, body.settings || {});
      var metaAfterSet = bumpMetaVersion_(ss, 'saveSettings');
      SpreadsheetApp.flush();
      return jsonOut_({
        ok: true,
        version: metaAfterSet.version,
        updatedAt: metaAfterSet.updatedAt,
      });
    }

    if (action === 'migrate') {
      initializeDatabase_(ss);
      var incoming = body.data || {};
      var summary = {};
      Object.keys(SCHEMA).forEach(function (colKey) {
        if (Array.isArray(incoming[colKey]) && incoming[colKey].length > 0) {
          summary[colKey] = upsertCollectionRecords_(ss, colKey, incoming[colKey]);
        } else {
          summary[colKey] = { added: 0, updated: 0 };
        }
      });
      if (incoming.settings && typeof incoming.settings === 'object') {
        writeSettings_(ss, incoming.settings);
      }
      var metaAfterMig = bumpMetaVersion_(ss, 'migrate');
      SpreadsheetApp.flush();
      return jsonOut_({
        ok: true,
        verified: true,
        summary: summary,
        version: metaAfterMig.version,
        updatedAt: metaAfterMig.updatedAt,
      });
    }

    if (action === 'upsertUser') {
      initializeDatabase_(ss);
      var updatedUsers = upsertUserAccount_(ss, body.user || {});
      return jsonOut_({ ok: true, users: updatedUsers });
    }

    if (action === 'deleteUser') {
      initializeDatabase_(ss);
      var remainingUsers = deleteUserAccount_(ss, body.userId);
      return jsonOut_({ ok: true, users: remainingUsers });
    }

    return jsonOut_({ ok: false, error: 'Unsupported POST action: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, error: err && err.message ? err.message : String(err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (lockErr) {
      // ignore
    }
  }
}
