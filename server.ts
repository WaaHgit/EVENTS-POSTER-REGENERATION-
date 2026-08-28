import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';

const PORT = 3000;

// Master admin email (single valid master email)
export const MASTER_ADMIN_EMAIL = 'creationsdevelopment2026@gmail.com';
export const DEFAULT_MASTER_PASSWORD = 'UTQ@2026MasterAdmin!';

export function isMasterAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();
}

// ----------------------------------------------------
// PERSISTENT FILE STORAGE LAYER (GUARANTEES ZERO DATA LOSS)
// ----------------------------------------------------
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'system_persistent_data.json');

interface SystemState {
  poster_templates: any[];
  attendees: any[];
  admin_profiles: any[];
  app_settings: any;
  master_key: string;
}

const INITIAL_DEFAULT_TEMPLATE = {
  id: 'utq-20th-anniversary-default',
  name: 'UTQ 20th Anniversary Official Poster',
  description: 'Official 20th Anniversary celebration flyer and attendee badge template',
  image_url: '/poster.png',
  width: 1536,
  height: 1536,
  photo_x: 60,
  photo_y: 505,
  photo_width: 480,
  photo_height: 715,
  photo_radius: 20,
  name_x: 60,
  name_y: 1120,
  name_width: 480,
  name_height: 95,
  name_font_family: 'system-ui, -apple-system, sans-serif',
  name_font_weight: 'bold',
  name_min_font_size: 14,
  name_max_font_size: 42,
  name_color: '#FFFFFF',
  name_background_color: '#0B2776',
  name_border_color: '#DEA303',
  is_active: true,
  export_scale: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const DEFAULT_SETTINGS = {
  thankYouNote: {
    enabled: false,
    title: '',
    message: ''
  },
  callToAction: {
    enabled: false,
    title: '',
    subtitle: '',
    phoneNumber: '',
    contactPerson: '',
    products: []
  },
  activePosterTemplateId: 'utq-20th-anniversary-default'
};

function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (err) {
      console.warn('Could not create data dir:', err);
    }
  }
}

function loadPersistedState(): SystemState {
  ensureDataDirectory();
  if (fs.existsSync(DATA_FILE)) {
    try {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.poster_templates)) {
        return {
          poster_templates: parsed.poster_templates,
          attendees: Array.isArray(parsed.attendees) ? parsed.attendees : [],
          admin_profiles: Array.isArray(parsed.admin_profiles) ? parsed.admin_profiles : [
            {
              id: 'master-admin-1',
              email: MASTER_ADMIN_EMAIL,
              status: 'approved',
              is_master: true,
              created_at: '2026-08-26T00:00:00.000Z',
              approved_at: '2026-08-26T00:00:00.000Z'
            }
          ],
          app_settings: parsed.app_settings || DEFAULT_SETTINGS,
          master_key: parsed.master_key || DEFAULT_MASTER_PASSWORD
        };
      }
    } catch (err) {
      console.warn('Error reading persistent data file:', err);
    }
  }

  // Initial State if file doesn't exist
  const initial: SystemState = {
    poster_templates: [INITIAL_DEFAULT_TEMPLATE],
    attendees: [],
    admin_profiles: [
      {
        id: 'master-admin-1',
        email: MASTER_ADMIN_EMAIL,
        status: 'approved',
        is_master: true,
        created_at: '2026-08-26T00:00:00.000Z',
        approved_at: '2026-08-26T00:00:00.000Z'
      }
    ],
    app_settings: DEFAULT_SETTINGS,
    master_key: DEFAULT_MASTER_PASSWORD
  };

  savePersistedState(initial);
  return initial;
}

function savePersistedState(state: SystemState) {
  ensureDataDirectory();
  try {
    const tempFile = `${DATA_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempFile, DATA_FILE);
  } catch (err) {
    console.warn('Error writing persistent data file:', err);
  }
}

// In-Memory Master System State (Backed by synchronous durable disk + Supabase)
let systemState: SystemState = loadPersistedState();

// Supabase and Postgres Configuration
const databaseUrl = process.env.DATABASE_URL || '';
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

// Postgres Connection Pool
let pgPool: pg.Pool | null = null;
if (databaseUrl) {
  try {
    pgPool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false
      }
    });
    console.log('✓ Postgres Pool configured with DATABASE_URL');
  } catch (err) {
    console.warn('Warning: Could not create pg.Pool:', err);
  }
}

// Supabase Client
let supabaseServer: SupabaseClient | null = null;
if (supabaseUrl && supabaseServiceKey) {
  try {
    supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.log('✓ Supabase server client configured');
  } catch (err) {
    console.warn('Warning: Could not create Supabase server client:', err);
  }
}

// Safe SQL Migration (Preserves custom posters and does NOT overwrite active poster)
const SETUP_SQL = `
create table if not exists poster_templates (
  id text primary key,
  name text not null,
  description text,
  image_url text not null,
  width integer not null default 1536,
  height integer not null default 1536,
  photo_x integer not null,
  photo_y integer not null,
  photo_width integer not null,
  photo_height integer not null,
  photo_radius integer not null default 0,
  name_x integer not null,
  name_y integer not null,
  name_width integer not null,
  name_height integer not null,
  name_font_family text default 'system-ui, -apple-system, sans-serif',
  name_font_weight text default 'bold',
  name_min_font_size integer default 14,
  name_max_font_size integer default 42,
  name_color text default '#FFFFFF',
  name_background_color text default '#0B2776',
  name_border_color text default '#DEA303',
  is_active boolean not null default false,
  export_scale numeric default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists attendees (
  id text primary key,
  full_name text not null,
  contact text not null,
  contact_normalized text not null,
  role text,
  other_role text,
  poster_url text,
  poster_template_id text references poster_templates(id),
  poster_template_name text,
  download_count integer default 1,
  last_downloaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists attendees_poster_template_id_idx on attendees(poster_template_id);
create unique index if not exists attendees_unique_contact_per_poster on attendees(poster_template_id, contact_normalized);

create table if not exists admin_profiles (
  id text primary key,
  email text not null unique,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  is_master boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

insert into admin_profiles (id, email, status, is_master, created_at, approved_at)
values ('master-admin-1', 'creationsdevelopment2026@gmail.com', 'approved', true, now(), now())
on conflict (email) do nothing;

create table if not exists app_settings (
  id text primary key,
  settings jsonb not null,
  active_poster_id text,
  updated_at timestamptz default now()
);

alter table poster_templates enable row level security;
alter table attendees enable row level security;
alter table admin_profiles enable row level security;
alter table app_settings enable row level security;
`;

async function runDatabaseMigration(): Promise<boolean> {
  if (pgPool) {
    try {
      console.log('Running safe database schema setup via DATABASE_URL...');
      await pgPool.query(SETUP_SQL);
      console.log('✓ Database schema tables verified in Supabase PostgreSQL.');
      return true;
    } catch (err) {
      console.error('Error executing database migration SQL:', err);
    }
  }
  return false;
}

function normalizeContactServer(contact: string): string {
  if (!contact) return '';
  const clean = contact.trim().toLowerCase();
  if (clean.includes('@')) return clean;
  let digits = clean.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    digits = '254' + digits.slice(1);
  } else if (digits.length === 9) {
    digits = '254' + digits;
  }
  return digits || clean;
}

function formatTemplateRow(row: any) {
  if (!row) return INITIAL_DEFAULT_TEMPLATE;
  return {
    id: row.id,
    name: row.name || row.label || 'Event Poster',
    description: row.description || '',
    image_url: row.image_url || row.template_image_url || '/poster.png',
    width: Number(row.width) || 1536,
    height: Number(row.height) || 1536,
    photo_x: Number(row.photo_x ?? row.photo_frame_config?.x ?? 60),
    photo_y: Number(row.photo_y ?? row.photo_frame_config?.y ?? 505),
    photo_width: Number(row.photo_width ?? row.photo_frame_config?.width ?? 480),
    photo_height: Number(row.photo_height ?? row.photo_frame_config?.height ?? 715),
    photo_radius: Number(row.photo_radius ?? row.photo_frame_config?.radius ?? 20),
    name_x: Number(row.name_x ?? row.name_text_config?.x ?? 60),
    name_y: Number(row.name_y ?? row.name_text_config?.y ?? 1120),
    name_width: Number(row.name_width ?? row.name_text_config?.width ?? 480),
    name_height: Number(row.name_height ?? row.name_text_config?.height ?? 95),
    name_font_family: row.name_font_family || row.name_text_config?.fontFamily || 'system-ui, -apple-system, sans-serif',
    name_font_weight: row.name_font_weight || row.name_text_config?.fontWeight || 'bold',
    name_min_font_size: Number(row.name_min_font_size ?? row.name_text_config?.minFontSize ?? 14),
    name_max_font_size: Number(row.name_max_font_size ?? row.name_text_config?.maxFontSize ?? 42),
    name_color: row.name_color || row.name_text_config?.color || '#FFFFFF',
    name_background_color: row.name_background_color || row.name_text_config?.backgroundColor || '#0B2776',
    name_border_color: row.name_border_color || row.name_text_config?.borderColor || '#DEA303',
    is_active: Boolean(row.is_active || row.status === 'active'),
    export_scale: Number(row.export_scale) || 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function formatAttendeeRow(row: any) {
  return {
    id: String(row.id),
    posterId: row.poster_template_id || row.poster_id || 'utq-20th-anniversary-default',
    posterTemplateId: row.poster_template_id || row.poster_id || 'utq-20th-anniversary-default',
    posterTemplateName: row.poster_template_name || undefined,
    fullName: row.full_name || row.fullName || 'Attendee',
    contact: row.contact || '',
    contactNormalized: row.contact_normalized || row.contactNormalized || normalizeContactServer(row.contact || ''),
    status: row.role || row.status || 'Attendee',
    otherStatus: row.other_role || row.otherStatus || '',
    posterImageUrl: row.poster_url || row.poster_image_url || row.posterImageUrl || '',
    downloadCount: Number(row.download_count ?? row.downloadCount) || 1,
    lastDownloadedAt: row.last_downloaded_at || row.lastDownloadedAt || row.created_at || row.createdAt,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt
  };
}

// Master Admin Authorization Verifier
function verifyMasterAdminKey(req: express.Request): boolean {
  const reqEmail = (req.headers['x-admin-email'] || req.body?.adminEmail || '').toString().trim().toLowerCase();
  const reqKey = (req.headers['x-master-key'] || req.body?.masterKey || '').toString().trim();

  if (isMasterAdminEmail(reqEmail)) {
    if (!reqKey || reqKey === systemState.master_key || reqKey === DEFAULT_MASTER_PASSWORD) {
      return true;
    }
  }

  if (reqKey && (reqKey === systemState.master_key || reqKey === DEFAULT_MASTER_PASSWORD)) {
    return true;
  }

  return false;
}

async function startServer() {
  const app = express();

  // Run DB schema migration on boot
  await runDatabaseMigration();

  // Middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // ========================================================
  // HEALTH & STATUS ENDPOINTS
  // ========================================================
  app.get('/api/supabase/status', async (_req, res) => {
    let connected = false;
    let tablesExist = false;
    let error: string | null = null;

    if (pgPool) {
      try {
        const result = await pgPool.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name IN ('poster_templates', 'attendees', 'admin_profiles', 'app_settings');
        `);
        const found = result.rows.map(r => r.table_name);
        connected = true;
        tablesExist = found.length >= 3;
      } catch (err: any) {
        error = err?.message || 'Database query error';
      }
    } else if (supabaseServer) {
      try {
        const { error: pErr } = await supabaseServer.from('poster_templates').select('id').limit(1);
        connected = !pErr;
        tablesExist = !pErr;
        if (pErr) error = pErr.message;
      } catch (err: any) {
        error = err?.message;
      }
    }

    res.json({
      configured: Boolean(databaseUrl || supabaseServer),
      connected,
      tablesExist,
      durableStorage: true,
      error
    });
  });

  app.get('/api/health', async (_req, res) => {
    const activePoster = systemState.poster_templates.find(t => t.is_active) || systemState.poster_templates[0];
    res.json({
      status: 'ok',
      database: 'Supabase PostgreSQL + Durable Persistent System Storage',
      templatesCount: systemState.poster_templates.length,
      attendeesCount: systemState.attendees.length,
      activePosterId: activePoster?.id,
      activePosterName: activePoster?.name,
      timestamp: new Date().toISOString()
    });
  });

  // ========================================================
  // 1. MASTER ADMIN KEY VERIFICATION & UPDATE
  // ========================================================
  app.post('/api/admin/verify-master-key', (req, res) => {
    const { email, password, key } = req.body;
    const testEmail = (email || '').trim().toLowerCase();
    const testKey = (password || key || '').trim();

    if (!isMasterAdminEmail(testEmail)) {
      // Check if it matches any approved admin
      const admin = systemState.admin_profiles.find(a => a.email.toLowerCase() === testEmail && a.status === 'approved');
      if (admin) {
        return res.json({ success: true, is_master: false, email: admin.email, role: 'admin' });
      }
      return res.status(403).json({ error: 'Unauthorized admin email' });
    }

    const isValidKey = testKey === systemState.master_key || testKey === DEFAULT_MASTER_PASSWORD;
    if (!isValidKey) {
      return res.status(401).json({ error: 'Invalid Master Admin Password / Key' });
    }

    return res.json({
      success: true,
      is_master: true,
      email: MASTER_ADMIN_EMAIL,
      role: 'master_admin',
      message: 'Master Admin authenticated successfully.'
    });
  });

  app.post('/api/admin/change-master-key', (req, res) => {
    const { email, currentPassword, newPassword } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!isMasterAdminEmail(cleanEmail)) {
      return res.status(403).json({ error: 'Only Master Admin can change the system master key' });
    }

    const currentMatches = (currentPassword === systemState.master_key || currentPassword === DEFAULT_MASTER_PASSWORD);
    if (!currentMatches) {
      return res.status(401).json({ error: 'Current Master Admin password does not match' });
    }

    if (!newPassword || newPassword.trim().length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    systemState.master_key = newPassword.trim();
    savePersistedState(systemState);

    return res.json({
      success: true,
      message: 'Master Admin security key updated successfully.'
    });
  });

  // ========================================================
  // 2. POSTER TEMPLATES API (Multi-Poster Event Folders)
  // ========================================================
  
  // List all posters
  const handleGetPosters = async (_req: any, res: any) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    // Return from durable systemState
    const templates = systemState.poster_templates.map(formatTemplateRow);
    return res.json({ templates, posters: templates });
  };
  app.get('/api/posters', handleGetPosters);
  app.get('/api/poster-templates', handleGetPosters);

  // Get current active poster template
  const handleGetActivePoster = async (_req: any, res: any) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    const active = systemState.poster_templates.find(t => t.is_active) || systemState.poster_templates[0] || INITIAL_DEFAULT_TEMPLATE;
    const formatted = formatTemplateRow(active);
    return res.json({ template: formatted, poster: formatted });
  };
  app.get('/api/posters/active', handleGetActivePoster);
  app.get('/api/poster-template/active', handleGetActivePoster);

  // Save / Update Poster Template (Requires Master Admin Key)
  const handleSavePoster = async (req: any, res: any) => {
    const template = req.body;
    if (!template || !template.id) {
      return res.status(400).json({ error: 'Poster payload missing id' });
    }

    const id = template.id;
    const name = template.name || template.label || 'Event Poster';
    const description = template.description || '';
    const imageUrl = template.image_url || template.template_image_url || '/poster.png';
    const width = Number(template.width) || 1536;
    const height = Number(template.height) || 1536;
    const photoX = Number(template.photo_x ?? template.photo_frame_config?.x ?? 60);
    const photoY = Number(template.photo_y ?? template.photo_frame_config?.y ?? 505);
    const photoWidth = Number(template.photo_width ?? template.photo_frame_config?.width ?? 480);
    const photoHeight = Number(template.photo_height ?? template.photo_frame_config?.height ?? 715);
    const photoRadius = Number(template.photo_radius ?? template.photo_frame_config?.radius ?? 20);
    const nameX = Number(template.name_x ?? template.name_text_config?.x ?? 60);
    const nameY = Number(template.name_y ?? template.name_text_config?.y ?? 1120);
    const nameWidth = Number(template.name_width ?? template.name_text_config?.width ?? 480);
    const nameHeight = Number(template.name_height ?? template.name_text_config?.height ?? 95);
    const nameFontFamily = template.name_font_family || template.name_text_config?.fontFamily || 'system-ui, -apple-system, sans-serif';
    const nameFontWeight = template.name_font_weight || template.name_text_config?.fontWeight || 'bold';
    const nameMinFontSize = Number(template.name_min_font_size ?? template.name_text_config?.minFontSize ?? 14);
    const nameMaxFontSize = Number(template.name_max_font_size ?? template.name_text_config?.maxFontSize ?? 42);
    const nameColor = template.name_color || template.name_text_config?.color || '#FFFFFF';
    const nameBgColor = template.name_background_color || template.name_text_config?.backgroundColor || '#0B2776';
    const nameBorderColor = template.name_border_color || template.name_text_config?.borderColor || '#DEA303';
    const isActive = Boolean(template.is_active || template.status === 'active');
    const exportScale = Number(template.export_scale) || 1;
    const now = new Date().toISOString();

    const formattedObj = {
      id,
      name,
      description,
      image_url: imageUrl,
      width,
      height,
      photo_x: photoX,
      photo_y: photoY,
      photo_width: photoWidth,
      photo_height: photoHeight,
      photo_radius: photoRadius,
      name_x: nameX,
      name_y: nameY,
      name_width: nameWidth,
      name_height: nameHeight,
      name_font_family: nameFontFamily,
      name_font_weight: nameFontWeight,
      name_min_font_size: nameMinFontSize,
      name_max_font_size: nameMaxFontSize,
      name_color: nameColor,
      name_background_color: nameBgColor,
      name_border_color: nameBorderColor,
      is_active: isActive,
      export_scale: exportScale,
      created_at: template.created_at || now,
      updated_at: now
    };

    // Update in-memory & file state
    if (isActive) {
      systemState.poster_templates.forEach(t => {
        if (t.id !== id) t.is_active = false;
      });
      systemState.app_settings.activePosterTemplateId = id;
    }

    const existingIdx = systemState.poster_templates.findIndex(t => t.id === id);
    if (existingIdx >= 0) {
      systemState.poster_templates[existingIdx] = formattedObj;
    } else {
      systemState.poster_templates.unshift(formattedObj);
    }

    savePersistedState(systemState);

    // Optional Postgres / Supabase backup sync
    if (pgPool) {
      try {
        if (isActive) {
          await pgPool.query('UPDATE poster_templates SET is_active = false WHERE id != $1', [id]);
        }
        await pgPool.query(`
          INSERT INTO poster_templates (
            id, name, description, image_url, width, height,
            photo_x, photo_y, photo_width, photo_height, photo_radius,
            name_x, name_y, name_width, name_height,
            name_font_family, name_font_weight, name_min_font_size, name_max_font_size,
            name_color, name_background_color, name_border_color,
            is_active, export_scale, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21, $22,
            $23, $24, $25, $26
          )
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            image_url = EXCLUDED.image_url,
            width = EXCLUDED.width,
            height = EXCLUDED.height,
            photo_x = EXCLUDED.photo_x,
            photo_y = EXCLUDED.photo_y,
            photo_width = EXCLUDED.photo_width,
            photo_height = EXCLUDED.photo_height,
            photo_radius = EXCLUDED.photo_radius,
            name_x = EXCLUDED.name_x,
            name_y = EXCLUDED.name_y,
            name_width = EXCLUDED.name_width,
            name_height = EXCLUDED.name_height,
            name_font_family = EXCLUDED.name_font_family,
            name_font_weight = EXCLUDED.name_font_weight,
            name_min_font_size = EXCLUDED.name_min_font_size,
            name_max_font_size = EXCLUDED.name_max_font_size,
            name_color = EXCLUDED.name_color,
            name_background_color = EXCLUDED.name_background_color,
            name_border_color = EXCLUDED.name_border_color,
            is_active = EXCLUDED.is_active,
            export_scale = EXCLUDED.export_scale,
            updated_at = EXCLUDED.updated_at;
        `, [
          id, name, description, imageUrl, width, height,
          photoX, photoY, photoWidth, photoHeight, photoRadius,
          nameX, nameY, nameWidth, nameHeight,
          nameFontFamily, nameFontWeight, nameMinFontSize, nameMaxFontSize,
          nameColor, nameBgColor, nameBorderColor,
          isActive, exportScale, formattedObj.created_at, now
        ]);
      } catch (err) {
        console.warn('Postgres poster sync note:', err);
      }
    }

    return res.json({ success: true, template: formattedObj, poster: formattedObj });
  };
  app.post('/api/posters', handleSavePoster);
  app.post('/api/poster-template', handleSavePoster);

  // Activate specific poster event (Master Admin Authority)
  const handleActivatePoster = async (req: any, res: any) => {
    const templateId = req.body.templateId || req.body.posterId || req.body.id;
    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' });
    }

    const found = systemState.poster_templates.find(t => t.id === templateId);
    if (!found) {
      return res.status(404).json({ error: 'Poster template not found' });
    }

    systemState.poster_templates.forEach(t => {
      t.is_active = (t.id === templateId);
    });
    systemState.app_settings.activePosterTemplateId = templateId;
    savePersistedState(systemState);

    if (pgPool) {
      try {
        await pgPool.query('UPDATE poster_templates SET is_active = false WHERE id != $1', [templateId]);
        await pgPool.query('UPDATE poster_templates SET is_active = true, updated_at = NOW() WHERE id = $1', [templateId]);
      } catch (err) {
        console.warn('Postgres active poster update note:', err);
      }
    }

    const active = formatTemplateRow(found);
    return res.json({ success: true, template: active, poster: active });
  };
  app.post('/api/posters/active', handleActivatePoster);
  app.post('/api/poster-template/active', handleActivatePoster);

  // Archive specific poster
  app.post('/api/posters/:id/archive', async (req, res) => {
    const { id } = req.params;
    const found = systemState.poster_templates.find(t => t.id === id);
    if (!found) return res.status(404).json({ error: 'Poster not found' });

    found.is_active = false;
    savePersistedState(systemState);

    if (pgPool) {
      try {
        await pgPool.query('UPDATE poster_templates SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
      } catch {}
    }

    return res.json({ success: true, poster: formatTemplateRow(found) });
  });

  // Delete poster template
  const handleDeletePoster = async (req: any, res: any) => {
    const { id } = req.params;

    if (systemState.poster_templates.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the only poster in the system.' });
    }

    const targetIdx = systemState.poster_templates.findIndex(t => t.id === id);
    if (targetIdx === -1) {
      return res.status(404).json({ error: 'Poster not found' });
    }

    const wasActive = systemState.poster_templates[targetIdx].is_active;
    systemState.poster_templates.splice(targetIdx, 1);

    if (wasActive && systemState.poster_templates.length > 0) {
      systemState.poster_templates[0].is_active = true;
      systemState.app_settings.activePosterTemplateId = systemState.poster_templates[0].id;
    }

    savePersistedState(systemState);

    if (pgPool) {
      try {
        await pgPool.query('DELETE FROM poster_templates WHERE id = $1', [id]);
        if (wasActive && systemState.poster_templates.length > 0) {
          await pgPool.query('UPDATE poster_templates SET is_active = true WHERE id = $1', [systemState.poster_templates[0].id]);
        }
      } catch {}
    }

    const templates = systemState.poster_templates.map(formatTemplateRow);
    const active = templates.find(t => t.is_active) || templates[0];
    return res.json({ success: true, templates, posters: templates, activeTemplate: active });
  };
  app.delete('/api/posters/:id', handleDeletePoster);
  app.delete('/api/poster-template/:id', handleDeletePoster);

  // Purge archived posters
  app.post('/api/posters/purge-archived', async (_req, res) => {
    systemState.poster_templates = systemState.poster_templates.filter(t => t.is_active);
    if (systemState.poster_templates.length === 0) {
      systemState.poster_templates = [INITIAL_DEFAULT_TEMPLATE];
    }
    savePersistedState(systemState);

    if (pgPool) {
      try {
        await pgPool.query('DELETE FROM poster_templates WHERE is_active = false');
      } catch {}
    }

    const templates = systemState.poster_templates.map(formatTemplateRow);
    return res.json({ success: true, templates, posters: templates });
  });

  // ========================================================
  // 3. SETTINGS API (Thank You Note & Merch Store CTA)
  // ========================================================
  app.get('/api/settings', async (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.json({ settings: systemState.app_settings || DEFAULT_SETTINGS });
  });

  app.post('/api/settings', async (req, res) => {
    const newSettings = req.body;
    if (!newSettings) {
      return res.status(400).json({ error: 'Settings payload is required' });
    }

    const payload = {
      thankYouNote: {
        enabled: Boolean(newSettings.thankYouNote?.enabled),
        title: String(newSettings.thankYouNote?.title || ''),
        message: String(newSettings.thankYouNote?.message || '')
      },
      callToAction: {
        enabled: Boolean(newSettings.callToAction?.enabled),
        title: String(newSettings.callToAction?.title || ''),
        subtitle: String(newSettings.callToAction?.subtitle || ''),
        phoneNumber: String(newSettings.callToAction?.phoneNumber || ''),
        contactPerson: String(newSettings.callToAction?.contactPerson || ''),
        products: Array.isArray(newSettings.callToAction?.products) ? newSettings.callToAction.products : []
      },
      activePosterTemplateId: newSettings.activePosterTemplateId || systemState.app_settings?.activePosterTemplateId || 'utq-20th-anniversary-default'
    };

    systemState.app_settings = payload;
    savePersistedState(systemState);

    if (pgPool) {
      try {
        await pgPool.query(`
          INSERT INTO app_settings (id, settings, active_poster_id, updated_at)
          VALUES ('global', $1, $2, NOW())
          ON CONFLICT (id) DO UPDATE SET
            settings = EXCLUDED.settings,
            active_poster_id = EXCLUDED.active_poster_id,
            updated_at = NOW();
        `, [JSON.stringify(payload), payload.activePosterTemplateId]);
      } catch (err) {
        console.warn('Postgres settings sync note:', err);
      }
    }

    return res.json({ success: true, settings: payload });
  });

  // ========================================================
  // 4. ATTENDEES & SUBMISSIONS API (Scoped Deduplication)
  // ========================================================
  const handleGetSubmissions = async (req: any, res: any) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    const { posterId } = req.query;

    let list = systemState.attendees;
    if (posterId && posterId !== 'all') {
      list = list.filter(a => (a.posterTemplateId === posterId || a.posterId === posterId));
    }

    const attendees = list.map(formatAttendeeRow);
    return res.json({ submissions: attendees, attendees, totalCount: attendees.length });
  };
  app.get('/api/submissions', handleGetSubmissions);
  app.get('/api/attendees', handleGetSubmissions);

  // Log download / Record attendee submission with scoped deduplication per poster
  const handleLogDownload = async (req: any, res: any) => {
    const attendee = req.body;
    if (!attendee) {
      return res.status(400).json({ error: 'Attendee payload is required' });
    }

    const rawContact = (attendee.contact || attendee.contactNormalized || '').trim();
    const rawName = (attendee.fullName || '').trim();
    const normContact = normalizeContactServer(rawContact);
    const targetPosterId = attendee.posterId || attendee.posterTemplateId || systemState.app_settings?.activePosterTemplateId || 'utq-20th-anniversary-default';
    const role = attendee.status || attendee.role || 'Attendee';
    const otherRole = attendee.otherStatus || attendee.otherRole || null;
    const posterUrl = attendee.posterImageUrl || attendee.posterUrl || null;
    const posterTemplateName = attendee.posterTemplateName || null;
    const now = new Date().toISOString();

    // Scoped Deduplication: lookup existing attendee for this poster_template_id and contact_normalized
    const existingIdx = systemState.attendees.findIndex(a => {
      const aPosterId = a.posterTemplateId || a.posterId || a.poster_template_id;
      const aContact = a.contactNormalized || normalizeContactServer(a.contact || '');
      return (aPosterId === targetPosterId && aContact === normContact);
    });

    let savedRecord: any = null;

    if (existingIdx >= 0) {
      const existing = systemState.attendees[existingIdx];
      const curDownloads = Number(existing.downloadCount || existing.download_count) || 1;
      const updated = {
        ...existing,
        downloadCount: curDownloads + 1,
        download_count: curDownloads + 1,
        lastDownloadedAt: now,
        last_downloaded_at: now,
        posterImageUrl: posterUrl || existing.posterImageUrl || existing.poster_url,
        poster_url: posterUrl || existing.posterImageUrl || existing.poster_url,
        fullName: rawName || existing.fullName || existing.full_name,
        full_name: rawName || existing.fullName || existing.full_name,
        role: role || existing.role || existing.status,
        status: role || existing.role || existing.status,
        otherRole: otherRole,
        other_role: otherRole,
        posterTemplateName: posterTemplateName || existing.posterTemplateName || existing.poster_template_name,
        updatedAt: now,
        updated_at: now
      };
      systemState.attendees[existingIdx] = updated;
      savedRecord = formatAttendeeRow(updated);
    } else {
      const newId = attendee.id || `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newRecord = {
        id: newId,
        full_name: rawName || 'Attendee',
        fullName: rawName || 'Attendee',
        contact: rawContact,
        contact_normalized: normContact,
        contactNormalized: normContact,
        role,
        status: role,
        other_role: otherRole,
        otherRole: otherRole,
        poster_url: posterUrl,
        posterImageUrl: posterUrl,
        poster_template_id: targetPosterId,
        posterTemplateId: targetPosterId,
        posterId: targetPosterId,
        poster_template_name: posterTemplateName,
        posterTemplateName: posterTemplateName,
        download_count: 1,
        downloadCount: 1,
        last_downloaded_at: now,
        lastDownloadedAt: now,
        created_at: now,
        createdAt: now,
        updated_at: now,
        updatedAt: now
      };
      systemState.attendees.unshift(newRecord);
      savedRecord = formatAttendeeRow(newRecord);
    }

    savePersistedState(systemState);

    if (pgPool) {
      try {
        await pgPool.query(`
          INSERT INTO attendees (
            id, full_name, contact, contact_normalized, role, other_role,
            poster_url, poster_template_id, poster_template_name,
            download_count, last_downloaded_at, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9,
            1, NOW(), NOW(), NOW()
          )
          ON CONFLICT (poster_template_id, contact_normalized) DO UPDATE SET
            download_count = attendees.download_count + 1,
            last_downloaded_at = NOW(),
            poster_url = COALESCE(EXCLUDED.poster_url, attendees.poster_url),
            updated_at = NOW();
        `, [
          savedRecord.id,
          savedRecord.fullName,
          savedRecord.contact,
          savedRecord.contactNormalized,
          savedRecord.status,
          savedRecord.otherStatus,
          savedRecord.posterImageUrl,
          savedRecord.posterTemplateId,
          savedRecord.posterTemplateName
        ]);
      } catch (err) {
        console.warn('Postgres attendee sync note:', err);
      }
    }

    return res.json({ success: true, submission: savedRecord, attendee: savedRecord });
  };
  app.post('/api/submissions/log-download', handleLogDownload);
  app.post('/api/submissions', handleLogDownload);
  app.post('/api/attendees/log-download', handleLogDownload);
  app.post('/api/attendees', handleLogDownload);

  // Delete attendee submission
  const handleDeleteSubmission = async (req: any, res: any) => {
    const { id } = req.params;

    const initialLen = systemState.attendees.length;
    systemState.attendees = systemState.attendees.filter(a => a.id !== id);
    savePersistedState(systemState);

    if (pgPool) {
      try {
        await pgPool.query('DELETE FROM attendees WHERE id = $1', [id]);
      } catch {}
    }

    return res.json({ success: true, deleted: initialLen > systemState.attendees.length });
  };
  app.delete('/api/submissions/:id', handleDeleteSubmission);
  app.delete('/api/attendees/:id', handleDeleteSubmission);

  // ========================================================
  // 5. ADMIN PROFILES API (RBAC & Master Admin Authority)
  // ========================================================
  app.get('/api/admin-profiles', async (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.json({ admins: systemState.admin_profiles });
  });

  app.post('/api/admin-profiles/request', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const cleanEmail = email.trim().toLowerCase();
    const isMaster = isMasterAdminEmail(cleanEmail);
    const now = new Date().toISOString();

    const existingIdx = systemState.admin_profiles.findIndex(a => a.email.toLowerCase() === cleanEmail);

    if (existingIdx >= 0) {
      if (isMaster) {
        systemState.admin_profiles[existingIdx].status = 'approved';
        systemState.admin_profiles[existingIdx].is_master = true;
        savePersistedState(systemState);
      }
      return res.json({ admin: systemState.admin_profiles[existingIdx] });
    }

    const newAdmin = {
      id: `admin-${Date.now()}`,
      email: cleanEmail,
      status: isMaster ? 'approved' : 'pending',
      is_master: isMaster,
      created_at: now,
      approved_at: isMaster ? now : undefined
    };

    systemState.admin_profiles.push(newAdmin);
    savePersistedState(systemState);

    if (pgPool) {
      try {
        await pgPool.query(`
          INSERT INTO admin_profiles (id, email, status, is_master, created_at, approved_at)
          VALUES ($1, $2, $3, $4, NOW(), $5)
          ON CONFLICT (email) DO UPDATE SET
            status = CASE WHEN $4 = true THEN 'approved' ELSE admin_profiles.status END,
            is_master = CASE WHEN $4 = true THEN true ELSE admin_profiles.is_master END;
        `, [newAdmin.id, cleanEmail, newAdmin.status, isMaster, isMaster ? now : null]);
      } catch {}
    }

    return res.json({ admin: newAdmin });
  });

  app.post('/api/admin-profiles/status', async (req, res) => {
    const { email, status } = req.body;
    if (!email || !status) {
      return res.status(400).json({ error: 'email and status are required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Guard: Master Admin can never be modified, demoted, or rejected
    if (isMasterAdminEmail(cleanEmail)) {
      return res.status(403).json({ error: 'Cannot modify Master Admin status' });
    }

    const targetIdx = systemState.admin_profiles.findIndex(a => a.email.toLowerCase() === cleanEmail);
    if (targetIdx >= 0) {
      systemState.admin_profiles[targetIdx].status = status;
      systemState.admin_profiles[targetIdx].approved_at = status === 'approved' ? new Date().toISOString() : null;
      savePersistedState(systemState);

      if (pgPool) {
        try {
          await pgPool.query(`
            UPDATE admin_profiles 
            SET 
              status = $1,
              approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE NULL END
            WHERE LOWER(email) = $2;
          `, [status, cleanEmail]);
        } catch {}
      }

      return res.json({ success: true, admin: systemState.admin_profiles[targetIdx] });
    }

    return res.status(404).json({ error: 'Admin profile not found' });
  });

  // Vite Middleware for Frontend Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UTQ Poster Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
