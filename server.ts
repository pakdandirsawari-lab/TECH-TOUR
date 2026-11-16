import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { AuthUser, TourismDatabase, UserRole } from './src/types/tourism.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_SPREADSHEET_ID =
  process.env.GOOGLE_SPREADSHEET_ID || '1BtuAFZPHsQPiXBijVVQTFWu4Dn2EsajLaSYaRtJHkcM';

const DATA_DIR = path.resolve(__dirname, '.data');
const CLOUD_CONFIG_FILE = path.join(DATA_DIR, 'cloud-config.json');
const SESSION_SECRET_FILE = path.join(DATA_DIR, 'session-secret.txt');

interface CloudConfig {
  webAppUrl: string;
  apiSecret: string;
  spreadsheetId: string;
}

interface SessionPayload {
  user: AuthUser;
  exp: number;
}

interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

const sseClients = new Set<Response>();
let lastKnownVersion = 0;
let lastKnownUpdatedAt: string | null = null;
let lastVersionPollMs = 0;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16) {
    return process.env.SESSION_SECRET.trim();
  }
  ensureDataDir();
  if (fs.existsSync(SESSION_SECRET_FILE)) {
    const existing = fs.readFileSync(SESSION_SECRET_FILE, 'utf-8').trim();
    if (existing.length >= 32) return existing;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SESSION_SECRET_FILE, generated, 'utf-8');
  return generated;
}

const SESSION_SECRET = loadSessionSecret();

function readCloudConfig(): CloudConfig {
  const envUrl = (process.env.APPS_SCRIPT_WEB_APP_URL || '').trim();
  const envSecret = (process.env.APPS_SCRIPT_API_SECRET || '').trim();
  ensureDataDir();

  if (fs.existsSync(CLOUD_CONFIG_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(CLOUD_CONFIG_FILE, 'utf-8')) as Partial<CloudConfig>;
      return {
        webAppUrl: (parsed.webAppUrl || envUrl || '').trim(),
        apiSecret: (parsed.apiSecret || envSecret || '').trim(),
        spreadsheetId: (parsed.spreadsheetId || DEFAULT_SPREADSHEET_ID).trim(),
      };
    } catch {
      // ignore corrupted config and fall back to env
    }
  }
  return {
    webAppUrl: envUrl,
    apiSecret: envSecret,
    spreadsheetId: DEFAULT_SPREADSHEET_ID,
  };
}

function saveCloudConfig(next: CloudConfig): void {
  ensureDataDir();
  const tmpFile = `${CLOUD_CONFIG_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(next, null, 2), 'utf-8');
  fs.renameSync(tmpFile, CLOUD_CONFIG_FILE);
}

let cloudConfig: CloudConfig = readCloudConfig();

function signSessionToken(user: AuthUser): string {
  const payload: SessionPayload = {
    user,
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySessionToken(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as SessionPayload;
    if (!decoded.user || typeof decoded.exp !== 'number' || Date.now() > decoded.exp) {
      return null;
    }
    return decoded.user;
  } catch {
    return null;
  }
}

function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

function extractAuthUser(req: Request): AuthUser | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerUser = verifySessionToken(authHeader.slice(7).trim());
    if (bearerUser) return bearerUser;
  }
  const cookieToken = parseCookie(req.headers.cookie, 'hh_session');
  return verifySessionToken(cookieToken);
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const user = extractAuthUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'Authentication required.' });
    return;
  }
  req.authUser = user;
  next();
}

function requireRole(roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      res.status(403).json({ ok: false, error: 'Administrator permission required for this action.' });
      return;
    }
    next();
  };
}

function maskUrlPreview(url: string): string {
  if (!url) return '';
  if (url.length <= 42) return url;
  return `${url.slice(0, 32)}...${url.slice(-10)}`;
}

function normalizeAppsScriptUrl(rawUrl: string): string {
  let clean = String(rawUrl || '').trim();
  // Strip accidental Google multi-account segment (/macros/u/0/s/ -> /macros/s/)
  clean = clean.replace(/^(https:\/\/script\.google\.com\/macros)\/u\/\d+\/(s\/)/i, '$1/$2');
  clean = clean.replace(/^(https:\/\/script\.google\.com\/a\/[^/]+\/macros)\/u\/\d+\/(s\/)/i, '$1/$2');
  try {
    const parsed = new URL(clean);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return clean;
  }
}

function diagnoseAppsScriptNonJsonError(text: string, finalUrl: string, status: number): string {
  const lowerText = text.toLowerCase();
  const lowerUrl = finalUrl.toLowerCase();
  const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  const htmlTitle = titleMatch ? titleMatch[1].trim() : '';
  const bodyErrorMatch = text.match(/<div[^>]*text-align:\s*center[^>]*>([^<]+)<\/div>/i);
  const bodyError = bodyErrorMatch ? bodyErrorMatch[1].trim() : '';

  if (
    lowerUrl.includes('accounts.google.com') ||
    lowerText.includes('accounts.google.com/servicelogin') ||
    lowerText.includes('sign in - google accounts')
  ) {
    return 'Google Apps Script redirected to Google Sign-In. Fix: In Apps Script click Deploy -> Manage deployments -> Edit -> set "Who has access" to "Anyone" (not "Only myself"), choose Version "New version", and click Deploy.';
  }

  if (
    lowerText.includes('script function not found') ||
    lowerText.includes('找不到以下指令碼函式') ||
    lowerText.includes(': doget') ||
    lowerText.includes(': dopost') ||
    /：doget|：dopost/i.test(text)
  ) {
    return 'Your live /exec Web App deployment is missing doGet/doPost (it is still running an older Code.gs). Copy the complete Code.gs into Extensions -> Apps Script, Save, then click Deploy -> Manage deployments -> Edit (pencil icon) -> Version: "New version" -> Deploy.';
  }

  if (
    lowerText.includes('authorization is required') ||
    lowerText.includes('you do not have permission') ||
    lowerText.includes('drive/permission')
  ) {
    return 'Apps Script does not have permission yet. Open Extensions -> Apps Script, select "testAndInitialize", click Run to authorize access, then Deploy -> Manage deployments -> Edit -> Version: "New version".';
  }

  if (status === 404 || lowerText.includes('page not found') || lowerText.includes('unable to open the file')) {
    return 'Google Apps Script URL returned Not Found. Check that you copied the active Web App "/exec" URL from Deploy -> Manage deployments.';
  }

  if (text.trim().startsWith('<')) {
    const detail = bodyError || htmlTitle;
    return `Google Apps Script returned HTML${detail ? ` ("${detail}")` : ''} instead of JSON. Paste the latest Code.gs, Run "testAndInitialize", and click Deploy -> Manage deployments -> Edit -> Version: "New version" with Who has access: "Anyone".`;
  }

  return 'Google Apps Script did not return valid JSON. Ensure the latest Code.gs is deployed as /exec with Version: "New version" and Who has access: "Anyone".';
}

function parseAppsScriptJson<T>(text: string, finalUrl: string, status: number): T & { ok?: boolean; error?: string } {
  const trimmed = text.trim();
  // Strip optional XSSI prefix if ever present
  const normalizedText = trimmed.startsWith(")]}'") ? trimmed.slice(4).trim() : trimmed;
  try {
    return JSON.parse(normalizedText) as T & { ok?: boolean; error?: string };
  } catch {
    throw new Error(diagnoseAppsScriptNonJsonError(text, finalUrl, status));
  }
}

async function callAppsScriptGet<T = Record<string, unknown>>(
  action: string,
  extraParams: Record<string, string> = {},
  overrideConfig?: CloudConfig
): Promise<T> {
  const cfg = overrideConfig ?? cloudConfig;
  if (!cfg.webAppUrl) {
    throw new Error('Google Sheets Apps Script Web App URL is not configured.');
  }
  const url = new URL(normalizeAppsScriptUrl(cfg.webAppUrl));
  url.searchParams.set('action', action);
  url.searchParams.set('spreadsheetId', cfg.spreadsheetId || DEFAULT_SPREADSHEET_ID);
  if (cfg.apiSecret) {
    url.searchParams.set('apiSecret', cfg.apiSecret);
  }
  for (const [k, v] of Object.entries(extraParams)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    redirect: 'follow',
    headers: { Accept: 'application/json, text/plain, */*' },
  });
  const text = await response.text();
  if (!response.ok) {
    if (text.trim().startsWith('{')) {
      const errJson = parseAppsScriptJson<T>(text, response.url, response.status);
      throw new Error(errJson.error || `Apps Script returned HTTP ${response.status}.`);
    }
    throw new Error(diagnoseAppsScriptNonJsonError(text, response.url, response.status));
  }
  const json = parseAppsScriptJson<T>(text, response.url, response.status);
  if (json && json.ok === false) {
    throw new Error(json.error || 'Google Apps Script error.');
  }
  return json;
}

async function callAppsScriptPost<T = Record<string, unknown>>(
  payload: Record<string, unknown>,
  overrideConfig?: CloudConfig
): Promise<T> {
  const cfg = overrideConfig ?? cloudConfig;
  if (!cfg.webAppUrl) {
    throw new Error('Google Sheets Apps Script Web App URL is not configured.');
  }

  const response = await fetch(normalizeAppsScriptUrl(cfg.webAppUrl), {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
      Accept: 'application/json, text/plain, */*',
    },
    body: JSON.stringify({
      ...payload,
      spreadsheetId: (payload.spreadsheetId as string) || cfg.spreadsheetId || DEFAULT_SPREADSHEET_ID,
      ...(cfg.apiSecret ? { apiSecret: cfg.apiSecret } : {}),
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    if (text.trim().startsWith('{')) {
      const errJson = parseAppsScriptJson<T>(text, response.url, response.status);
      throw new Error(errJson.error || `Apps Script returned HTTP ${response.status}.`);
    }
    throw new Error(diagnoseAppsScriptNonJsonError(text, response.url, response.status));
  }
  const json = parseAppsScriptJson<T>(text, response.url, response.status);
  if (json && json.ok === false) {
    throw new Error(json.error || 'Google Apps Script error.');
  }
  return json;
}

function broadcastVersion(version: number, updatedAt: string | null, sourceClientId = ''): void {
  if (version > lastKnownVersion) {
    lastKnownVersion = version;
  }
  if (updatedAt) {
    lastKnownUpdatedAt = updatedAt;
  }
  const payload = JSON.stringify({
    type: 'db_updated',
    version: lastKnownVersion,
    updatedAt: lastKnownUpdatedAt,
    sourceClientId,
  });
  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Background heartbeat: when SSE clients are listening and Sheets is configured, check _Meta.version every 4s
  setInterval(() => {
    if (sseClients.size === 0 || !cloudConfig.webAppUrl) return;
    if (Date.now() - lastVersionPollMs < 3500) return;
    lastVersionPollMs = Date.now();
    void callAppsScriptGet<{ version?: number; updatedAt?: string }>('version')
      .then((res) => {
        if (typeof res.version === 'number' && res.version > lastKnownVersion) {
          broadcastVersion(res.version, res.updatedAt ?? new Date().toISOString(), 'sheets-poll');
        }
      })
      .catch(() => {
        // swallow transient poll failures
      });
  }, 4000);

  // Public health check (contains zero customer PII)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      configured: Boolean(cloudConfig.webAppUrl),
      spreadsheetId: cloudConfig.spreadsheetId,
      version: lastKnownVersion,
      updatedAt: lastKnownUpdatedAt,
    });
  });

  // Authentication Routes
  app.get('/api/auth/me', (req: Request, res: Response) => {
    const user = extractAuthUser(req);
    res.json({
      ok: true,
      authenticated: Boolean(user),
      user: user ?? null,
      cloudConfigured: Boolean(cloudConfig.webAppUrl),
      spreadsheetId: cloudConfig.spreadsheetId,
    });
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { email, password } = (req.body || {}) as { email?: string; password?: string };
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPass = String(password || '');

    if (!cleanEmail || !cleanPass) {
      res.status(400).json({ ok: false, error: 'Email and password are required.' });
      return;
    }

    const bootstrapEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@himalayanhorizons.in').toLowerCase();
    const bootstrapPass = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'admin123';
    const isBootstrapMatch = cleanEmail === bootstrapEmail && cleanPass === bootstrapPass;

    let authedUser: AuthUser | null = null;

    if (cloudConfig.webAppUrl) {
      let cloudReachableWithSchema = false;
      try {
        const result = await callAppsScriptPost<{ ok: boolean; user?: AuthUser }>({
          action: 'login',
          email: cleanEmail,
          password: cleanPass,
        });
        if (result.user) {
          cloudReachableWithSchema = true;
          authedUser = result.user;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Google Sheets authentication failed.';
        // Only reject immediately if the sheet explicitly rejected credentials
        if (/invalid email or password|account is inactive/i.test(msg)) {
          res.status(401).json({ ok: false, error: msg });
          return;
        }
        if (!isBootstrapMatch) {
          res.status(401).json({ ok: false, error: msg });
          return;
        }
      }

      if (!cloudReachableWithSchema && isBootstrapMatch) {
        // Outdated Apps Script deployment does not implement `login` / `doGet` yet — allow Admin recovery sign-in
        authedUser = {
          id: 'USR-ADMIN',
          name: 'Agency Administrator',
          email: bootstrapEmail,
          role: 'admin',
          status: 'Active',
          avatar: '/src/assets/images/avatar_agency_manager_1794845749106.jpg',
        };
      } else if (!authedUser) {
        res.status(401).json({
          ok: false,
          error: 'Google Sheets Web App is running an older Code.gs without Users login. Admin must update Code.gs in Settings.',
        });
        return;
      }
    } else {
      // Before Google Sheets is connected, allow bootstrap admin sign-in to run setup & migration
      if (isBootstrapMatch) {
        authedUser = {
          id: 'USR-ADMIN',
          name: 'Agency Administrator',
          email: bootstrapEmail,
          role: 'admin',
          status: 'Active',
          avatar: '/src/assets/images/avatar_agency_manager_1794845749106.jpg',
        };
      } else {
        res.status(401).json({
          ok: false,
          error: 'Google Sheets is not connected yet. Sign in with the bootstrap administrator account to configure cloud sync.',
        });
        return;
      }
    }

    if (!authedUser) {
      res.status(401).json({ ok: false, error: 'Invalid credentials.' });
      return;
    }

    const token = signSessionToken(authedUser);
    res.setHeader(
      'Set-Cookie',
      `hh_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`
    );
    res.json({
      ok: true,
      user: authedUser,
      token,
    });
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.setHeader('Set-Cookie', 'hh_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ ok: true });
  });

  // Cloud Configuration & Connection Status (Requires Authenticated Session)
  app.get('/api/cloud/status', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
    if (!cloudConfig.webAppUrl) {
      res.json({
        configured: false,
        spreadsheetId: cloudConfig.spreadsheetId,
        webAppUrlPreview: '',
        hasApiSecret: Boolean(cloudConfig.apiSecret),
        connected: false,
        version: 0,
        updatedAt: null,
      });
      return;
    }
    try {
      const ping = await callAppsScriptGet<{ version?: number; updatedAt?: string; spreadsheetTitle?: string }>('ping');
      if (typeof ping.version !== 'number') {
        throw new Error(
          'Deployed Apps Script is outdated (missing schema version). Paste the latest Code.gs, Run "testAndInitialize", and click Deploy -> Manage deployments -> Edit -> Version: "New version" -> Deploy.'
        );
      }
      lastKnownVersion = ping.version;
      if (ping.updatedAt) {
        lastKnownUpdatedAt = ping.updatedAt;
      }
      res.json({
        configured: true,
        spreadsheetId: cloudConfig.spreadsheetId,
        webAppUrlPreview: maskUrlPreview(cloudConfig.webAppUrl),
        hasApiSecret: Boolean(cloudConfig.apiSecret),
        connected: true,
        version: ping.version ?? lastKnownVersion,
        updatedAt: ping.updatedAt ?? lastKnownUpdatedAt,
      });
    } catch (err) {
      res.json({
        configured: true,
        spreadsheetId: cloudConfig.spreadsheetId,
        webAppUrlPreview: maskUrlPreview(cloudConfig.webAppUrl),
        hasApiSecret: Boolean(cloudConfig.apiSecret),
        connected: false,
        version: lastKnownVersion,
        updatedAt: lastKnownUpdatedAt,
        error: err instanceof Error ? err.message : 'Unable to reach Google Apps Script Web App.',
      });
    }
  });

  app.post(
    '/api/cloud/config',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res: Response) => {
      const { webAppUrl, apiSecret, spreadsheetId } = (req.body || {}) as {
        webAppUrl?: string;
        apiSecret?: string;
        spreadsheetId?: string;
      };
      const normalizedUrl = normalizeAppsScriptUrl(String(webAppUrl || ''));
      const cleanId = String(spreadsheetId || DEFAULT_SPREADSHEET_ID).trim() || DEFAULT_SPREADSHEET_ID;
      const cleanSecret = typeof apiSecret === 'string' ? apiSecret.trim() : cloudConfig.apiSecret;

      if (!/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\//i.test(normalizedUrl)) {
        res.status(400).json({
          ok: false,
          error: 'Enter a valid Google Apps Script Web App URL (https://script.google.com/macros/s/.../exec). Do not paste a Google Sheets URL.',
        });
        return;
      }
      if (normalizedUrl.endsWith('/dev')) {
        res.status(400).json({
          ok: false,
          error: 'Please use the deployed Web App "/exec" URL (not the "/dev" test URL).',
        });
        return;
      }

      const candidateConfig: CloudConfig = {
        webAppUrl: normalizedUrl,
        apiSecret: cleanSecret,
        spreadsheetId: cleanId,
      };

      try {
        const initRes = await callAppsScriptPost<{
          ok: boolean;
          scriptVersion?: string;
          spreadsheetTitle?: string;
          version?: number;
          updatedAt?: string;
        }>({ action: 'init', spreadsheetId: cleanId }, candidateConfig);

        const pingRes = await callAppsScriptGet<{
          ok: boolean;
          scriptVersion?: string;
          spreadsheetTitle?: string;
          version?: number;
          updatedAt?: string;
        }>('ping', {}, candidateConfig);

        if (typeof initRes.version !== 'number' || typeof pingRes.version !== 'number') {
          throw new Error(
            'Connected Apps Script responded, but is running an older Code.gs without schema version support. Paste the latest Code.gs, Save, and click Deploy -> Manage deployments -> Edit -> Version: "New version" -> Deploy.'
          );
        }

        cloudConfig = candidateConfig;
        saveCloudConfig(candidateConfig);
        const version = pingRes.version ?? initRes.version ?? 1;
        const updatedAt = pingRes.updatedAt ?? initRes.updatedAt ?? new Date().toISOString();
        broadcastVersion(version, updatedAt, 'config-init');

        res.json({
          ok: true,
          spreadsheetTitle: initRes.spreadsheetTitle || pingRes.spreadsheetTitle || 'Connected Spreadsheet',
          spreadsheetId: cleanId,
          version,
          updatedAt,
        });
      } catch (err) {
        res.status(400).json({
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to verify & initialize Google Sheets.',
        });
      }
    }
  );

  // Read Shared Cloud Database from Google Sheets
  app.get('/api/cloud/db', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
    if (!cloudConfig.webAppUrl) {
      res.status(503).json({ ok: false, code: 'UNCONFIGURED', error: 'Google Sheets Web App is not connected yet.' });
      return;
    }
    try {
      const sheetRes = await callAppsScriptGet<{
        version: number;
        updatedAt: string;
        data: TourismDatabase;
      }>('readAll');
      if (typeof sheetRes.version === 'number') lastKnownVersion = sheetRes.version;
      if (sheetRes.updatedAt) lastKnownUpdatedAt = sheetRes.updatedAt;

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        version: sheetRes.version,
        updatedAt: sheetRes.updatedAt,
        data: sheetRes.data,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load data from Google Sheets.',
      });
    }
  });

  app.get('/api/cloud/version', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
    if (!cloudConfig.webAppUrl) {
      res.json({ ok: true, configured: false, version: 0, updatedAt: null });
      return;
    }
    try {
      if (Date.now() - lastVersionPollMs >= 2500) {
        lastVersionPollMs = Date.now();
        const vRes = await callAppsScriptGet<{ version?: number; updatedAt?: string }>('version');
        if (typeof vRes.version === 'number') lastKnownVersion = vRes.version;
        if (vRes.updatedAt) lastKnownUpdatedAt = vRes.updatedAt;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        configured: true,
        version: lastKnownVersion,
        updatedAt: lastKnownUpdatedAt,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to check Google Sheets version.',
      });
    }
  });

  // Cloud CRUD Mutations (All writes go straight to Google Sheets)
  const STAFF_ALLOWED_UPSERT_COLLECTIONS = new Set(['bookings', 'customers', 'payments', 'expenses', 'packages']);
  const ALL_COLLECTIONS = new Set(['bookings', 'customers', 'payments', 'expenses', 'packages', 'staff', 'partners']);

  app.post('/api/cloud/mutate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!cloudConfig.webAppUrl) {
      res.status(503).json({
        ok: false,
        error: 'Google Sheets database is not connected yet. Configure it in Settings first.',
      });
      return;
    }

    const { action, collection, record, records, id, cascadeBookingPayments, settings, clientId } = (req.body || {}) as {
      action?: 'upsert' | 'delete' | 'saveSettings';
      collection?: string;
      record?: unknown;
      records?: unknown[];
      id?: string;
      cascadeBookingPayments?: boolean;
      settings?: unknown;
      clientId?: string;
    };

    const userRole = req.authUser?.role ?? 'staff';

    if (action === 'saveSettings') {
      if (userRole !== 'admin') {
        res.status(403).json({ ok: false, error: 'Only Administrators can update agency settings.' });
        return;
      }
      try {
        const result = await callAppsScriptPost<{ version: number; updatedAt: string }>({
          action: 'saveSettings',
          settings,
        });
        broadcastVersion(result.version, result.updatedAt, clientId || '');
        res.json({ ok: true, version: result.version, updatedAt: result.updatedAt });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to save settings.' });
      }
      return;
    }

    if (!collection || !ALL_COLLECTIONS.has(collection)) {
      res.status(400).json({ ok: false, error: 'Invalid collection specified.' });
      return;
    }

    if (action === 'delete') {
      if (userRole !== 'admin') {
        res.status(403).json({ ok: false, error: 'Only Administrators can delete records.' });
        return;
      }
      if (!id) {
        res.status(400).json({ ok: false, error: 'Record ID is required for deletion.' });
        return;
      }
      try {
        const result = await callAppsScriptPost<{ version: number; updatedAt: string }>({
          action: 'delete',
          collection,
          id,
          cascadeBookingPayments: Boolean(cascadeBookingPayments),
        });
        broadcastVersion(result.version, result.updatedAt, clientId || '');
        res.json({ ok: true, version: result.version, updatedAt: result.updatedAt });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to delete record.' });
      }
      return;
    }

    if (action === 'upsert') {
      if (userRole !== 'admin' && !STAFF_ALLOWED_UPSERT_COLLECTIONS.has(collection)) {
        res.status(403).json({ ok: false, error: 'Only Administrators can modify staff or partner records.' });
        return;
      }
      try {
        const result = await callAppsScriptPost<{ version: number; updatedAt: string; added?: number; updated?: number }>({
          action: 'upsert',
          collection,
          ...(records ? { records } : { record }),
        });
        broadcastVersion(result.version, result.updatedAt, clientId || '');
        res.json({
          ok: true,
          added: result.added ?? 0,
          updated: result.updated ?? 0,
          version: result.version,
          updatedAt: result.updatedAt,
        });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to sync record.' });
      }
      return;
    }

    res.status(400).json({ ok: false, error: 'Unsupported mutation action.' });
  });

  // Verified Migration from Local Browser Storage to Google Sheets
  app.post(
    '/api/cloud/migrate',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res: Response) => {
      if (!cloudConfig.webAppUrl) {
        res.status(400).json({ ok: false, error: 'Connect Google Sheets Web App URL before migrating.' });
        return;
      }
      const { data, clientId } = (req.body || {}) as { data?: TourismDatabase; clientId?: string };
      if (!data || typeof data !== 'object') {
        res.status(400).json({ ok: false, error: 'Migration payload is missing.' });
        return;
      }
      try {
        const result = await callAppsScriptPost<{
          ok: boolean;
          verified: boolean;
          summary: Record<string, { added: number; updated: number }>;
          version: number;
          updatedAt: string;
        }>({
          action: 'migrate',
          data,
        });
        broadcastVersion(result.version, result.updatedAt, clientId || '');
        res.json(result);
      } catch (err) {
        res.status(502).json({
          ok: false,
          verified: false,
          error: err instanceof Error ? err.message : 'Google Sheets migration failed.',
        });
      }
    }
  );

  // Admin-only User & Role Management (backed by Users sheet in Google Sheets)
  app.get(
    '/api/cloud/users',
    requireAuth,
    requireRole(['admin']),
    async (_req: AuthenticatedRequest, res: Response) => {
      if (!cloudConfig.webAppUrl) {
        res.json({ ok: true, users: [] });
        return;
      }
      try {
        const result = await callAppsScriptGet<{ ok: boolean; users: AuthUser[] }>('readUsers');
        res.json({ ok: true, users: result.users || [] });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load users.' });
      }
    }
  );

  app.post(
    '/api/cloud/users',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res: Response) => {
      if (!cloudConfig.webAppUrl) {
        res.status(400).json({ ok: false, error: 'Connect Google Sheets first to manage cloud users.' });
        return;
      }
      try {
        const result = await callAppsScriptPost<{ ok: boolean; users: AuthUser[] }>({
          action: 'upsertUser',
          user: req.body,
        });
        res.json({ ok: true, users: result.users || [] });
      } catch (err) {
        res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to save user.' });
      }
    }
  );

  app.delete(
    '/api/cloud/users/:userId',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res: Response) => {
      if (!cloudConfig.webAppUrl) {
        res.status(400).json({ ok: false, error: 'Connect Google Sheets first.' });
        return;
      }
      const targetUserId = String(req.params.userId || '');
      if (targetUserId === req.authUser?.id) {
        res.status(400).json({ ok: false, error: 'You cannot delete the currently signed-in account.' });
        return;
      }
      try {
        const result = await callAppsScriptPost<{ ok: boolean; users: AuthUser[] }>({
          action: 'deleteUser',
          userId: targetUserId,
        });
        res.json({ ok: true, users: result.users || [] });
      } catch (err) {
        res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to delete user.' });
      }
    }
  );

  // Live SSE Stream for Real-Time Cross-User Synchronization
  app.get('/api/cloud/events', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    res.write(
      `data: ${JSON.stringify({
        type: 'init',
        version: lastKnownVersion,
        updatedAt: lastKnownUpdatedAt,
      })}\n\n`
    );

    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tourism Cloud Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
