import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import { createDemoDatabase } from './src/data/demoData.ts';
import type { TourismDatabase } from './src/types/tourism.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'tourism-db.json');

interface PersistedEnvelope {
  version: number;
  updatedAt: string;
  data: TourismDatabase;
}

const sseClients = new Set<Response>();

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function validateDatabaseShape(candidate: unknown): candidate is TourismDatabase {
  if (!candidate || typeof candidate !== 'object') return false;
  const db = candidate as Partial<TourismDatabase>;
  return (
    Array.isArray(db.customers) &&
    Array.isArray(db.packages) &&
    Array.isArray(db.bookings) &&
    Array.isArray(db.payments) &&
    Array.isArray(db.expenses) &&
    Array.isArray(db.staff) &&
    Array.isArray(db.partners) &&
    Boolean(db.settings && typeof db.settings === 'object')
  );
}

function readSharedEnvelope(): PersistedEnvelope {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    const initial: PersistedEnvelope = {
      version: 1,
      updatedAt: new Date().toISOString(),
      data: createDemoDatabase(),
    };
    writeSharedEnvelope(initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedEnvelope>;
    if (parsed && typeof parsed.version === 'number' && validateDatabaseShape(parsed.data)) {
      return {
        version: parsed.version,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        data: parsed.data,
      };
    }
  } catch (err) {
    console.error('Failed to read shared database file, recreating from demo seed:', err);
  }

  const fallback: PersistedEnvelope = {
    version: 1,
    updatedAt: new Date().toISOString(),
    data: createDemoDatabase(),
  };
  writeSharedEnvelope(fallback);
  return fallback;
}

function writeSharedEnvelope(envelope: PersistedEnvelope): void {
  ensureDataDir();
  const tmpFile = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(envelope, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

let currentEnvelope: PersistedEnvelope = readSharedEnvelope();

function broadcastUpdate(sourceClientId: string): void {
  const payload = JSON.stringify({
    type: 'db_updated',
    version: currentEnvelope.version,
    updatedAt: currentEnvelope.updatedAt,
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

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      version: currentEnvelope.version,
      updatedAt: currentEnvelope.updatedAt,
    });
  });

  app.get('/api/tourism-db', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(currentEnvelope);
  });

  app.put('/api/tourism-db', (req: Request, res: Response) => {
    const body = req.body as { data?: unknown; clientId?: string } | undefined;
    if (!body || !validateDatabaseShape(body.data)) {
      res.status(400).json({ ok: false, error: 'Invalid tourism database payload.' });
      return;
    }

    const nextEnvelope: PersistedEnvelope = {
      version: currentEnvelope.version + 1,
      updatedAt: new Date().toISOString(),
      data: body.data,
    };
    currentEnvelope = nextEnvelope;
    writeSharedEnvelope(nextEnvelope);

    const sourceClientId = typeof body.clientId === 'string' ? body.clientId : '';
    broadcastUpdate(sourceClientId);

    res.json({
      ok: true,
      version: nextEnvelope.version,
      updatedAt: nextEnvelope.updatedAt,
    });
  });

  app.get('/api/tourism-db/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    res.write(
      `data: ${JSON.stringify({
        type: 'init',
        version: currentEnvelope.version,
        updatedAt: currentEnvelope.updatedAt,
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
    console.log(`Tourism Management Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
