import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';

const PORT = 3000;

// Master admin email (single valid master email)
export const MASTER_ADMIN_EMAIL = 'creationsdevelopment2026@gmail.com';

export function isMasterAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();
}

// Supabase and Postgres Configuration
const databaseUrl = process.env.DATABASE_URL || '';
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

// Postgres Connection Pool (for DDL setup and direct SQL)
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

// Supabase Service Role Client
let supabaseServer: SupabaseClient | null = null;
if (supabaseUrl && supabaseServiceKey) {
  try {
    supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.log('✓ Supabase server client configured with service role key');
  } catch (err) {
    console.warn('Warning: Could not create Supabase server client:', err);
  }
}

// Migration / Setup SQL Script
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

insert into poster_templates (
  id, name, description, image_url, width, height, photo_x, photo_y, photo_width, photo_height, photo_radius,
  name_x, name_y, name_width, name_height, name_font_family, name_font_weight, name_min_font_size, name_max_font_size,
  name_color, name_background_color, name_border_color, is_active, export_scale, created_at, updated_at
) values (
  'utq-20th-anniversary-default',
  'UTQ 20th Anniversary Official Poster',
  'Official 20th Anniversary celebration flyer and attendee badge template',
  '/poster.png',
  1536, 1536, 60, 505, 480, 715, 20,
  60, 1120, 480, 95, 'system-ui, -apple-system, sans-serif', 'bold', 14, 42,
  '#FFFFFF', '#0B2776', '#DEA303', true, 1, now(), now()
) on conflict (id) do nothing;

alter table poster_templates enable row level security;
alter table attendees enable row level security;
alter table admin_profiles enable row level security;
alter table app_settings enable row level security;
`;

async function runDatabaseMigration(): Promise<boolean> {
  if (pgPool) {
    try {
      console.log('Running automatic database schema setup via DATABASE_URL...');
      await pgPool.query(SETUP_SQL);
      console.log('✓ Database schema tables and RLS verified successfully in Supabase PostgreSQL.');
      return true;
    } catch (err) {
      console.error('Error executing database migration SQL:', err);
    }
  }
  return false;
}

// Approved default poster template fallback object
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

function normalizeNameServer(name: string): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Convert database row to frontend template format
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

// Convert database attendee row to frontend format
function formatAttendeeRow(row: any) {
  return {
    id: String(row.id),
    posterId: row.poster_template_id || row.poster_id || 'utq-20th-anniversary-default',
    posterTemplateId: row.poster_template_id || row.poster_id || 'utq-20th-anniversary-default',
    posterTemplateName: row.poster_template_name || undefined,
    fullName: row.full_name || 'Attendee',
    contact: row.contact || '',
    contactNormalized: row.contact_normalized || normalizeContactServer(row.contact || ''),
    status: row.role || 'Attendee',
    otherStatus: row.other_role || '',
    posterImageUrl: row.poster_url || row.poster_image_url || '',
    downloadCount: Number(row.download_count) || 1,
    lastDownloadedAt: row.last_downloaded_at || row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
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
      error
    });
  });

  app.get('/api/health', async (_req, res) => {
    let templatesCount = 0;
    let attendeesCount = 0;

    if (pgPool) {
      try {
        const tRes = await pgPool.query('SELECT COUNT(*)::int as count FROM poster_templates');
        const aRes = await pgPool.query('SELECT COUNT(*)::int as count FROM attendees');
        templatesCount = tRes.rows[0]?.count || 0;
        attendeesCount = aRes.rows[0]?.count || 0;
      } catch {}
    } else if (supabaseServer) {
      try {
        const { count: tc } = await supabaseServer.from('poster_templates').select('*', { count: 'exact', head: true });
        const { count: ac } = await supabaseServer.from('attendees').select('*', { count: 'exact', head: true });
        templatesCount = tc || 0;
        attendeesCount = ac || 0;
      } catch {}
    }

    res.json({
      status: 'ok',
      database: 'Supabase PostgreSQL (Single Source of Truth)',
      templatesCount,
      attendeesCount,
      timestamp: new Date().toISOString()
    });
  });

  // ========================================================
  // 1. POSTER TEMPLATES API (Multi-Poster Event Folders)
  // ========================================================
  
  // List all posters (both active and archived)
  const handleGetPosters = async (_req: any, res: any) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (pgPool) {
      try {
        const result = await pgPool.query('SELECT * FROM poster_templates ORDER BY created_at DESC');
        if (result.rows.length > 0) {
          const templates = result.rows.map(formatTemplateRow);
          return res.json({ templates, posters: templates });
        }
      } catch (err) {
        console.error('Error fetching poster_templates via pgPool:', err);
      }
    } else if (supabaseServer) {
      try {
        const { data, error } = await supabaseServer
          .from('poster_templates')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
          const templates = data.map(formatTemplateRow);
          return res.json({ templates, posters: templates });
        }
      } catch (err) {
        console.error('Error fetching poster_templates via Supabase:', err);
      }
    }

    return res.json({ templates: [INITIAL_DEFAULT_TEMPLATE], posters: [INITIAL_DEFAULT_TEMPLATE] });
  };
  app.get('/api/posters', handleGetPosters);
  app.get('/api/poster-templates', handleGetPosters);

  // Get current active poster template
  const handleGetActivePoster = async (_req: any, res: any) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (pgPool) {
      try {
        const result = await pgPool.query('SELECT * FROM poster_templates WHERE is_active = true LIMIT 1');
        if (result.rows.length > 0) {
          const active = formatTemplateRow(result.rows[0]);
          return res.json({ template: active, poster: active });
        }

        // Fallback to latest
        const latestResult = await pgPool.query('SELECT * FROM poster_templates ORDER BY created_at DESC LIMIT 1');
        if (latestResult.rows.length > 0) {
          const active = formatTemplateRow(latestResult.rows[0]);
          return res.json({ template: active, poster: active });
        }
      } catch (err) {
        console.error('Error fetching active poster via pgPool:', err);
      }
    } else if (supabaseServer) {
      try {
        const { data, error } = await supabaseServer
          .from('poster_templates')
          .select('*')
          .eq('is_active', true)
          .maybeSingle();

        if (!error && data) {
          const active = formatTemplateRow(data);
          return res.json({ template: active, poster: active });
        }
      } catch (err) {
        console.error('Error fetching active poster via Supabase:', err);
      }
    }

    return res.json({ template: INITIAL_DEFAULT_TEMPLATE, poster: INITIAL_DEFAULT_TEMPLATE });
  };
  app.get('/api/posters/active', handleGetActivePoster);
  app.get('/api/poster-template/active', handleGetActivePoster);

  // Save / Update Poster Template
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

    if (pgPool) {
      try {
        if (isActive) {
          await pgPool.query('UPDATE poster_templates SET is_active = false WHERE id != $1', [id]);
        }

        const query = `
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
            updated_at = EXCLUDED.updated_at
          RETURNING *;
        `;
        const resDb = await pgPool.query(query, [
          id, name, description, imageUrl, width, height,
          photoX, photoY, photoWidth, photoHeight, photoRadius,
          nameX, nameY, nameWidth, nameHeight,
          nameFontFamily, nameFontWeight, nameMinFontSize, nameMaxFontSize,
          nameColor, nameBgColor, nameBorderColor,
          isActive, exportScale, now, now
        ]);

        const saved = formatTemplateRow(resDb.rows[0]);
        return res.json({ success: true, template: saved, poster: saved });
      } catch (err: any) {
        console.error('Error saving poster template via pgPool:', err);
        return res.status(500).json({ error: err.message });
      }
    } else if (supabaseServer) {
      try {
        if (isActive) {
          await supabaseServer.from('poster_templates').update({ is_active: false }).neq('id', id);
        }

        const { data, error } = await supabaseServer
          .from('poster_templates')
          .upsert({
            id, name, description, image_url: imageUrl, width, height,
            photo_x: photoX, photo_y: photoY, photo_width: photoWidth, photo_height: photoHeight, photo_radius: photoRadius,
            name_x: nameX, name_y: nameY, name_width: nameWidth, name_height: nameHeight,
            name_font_family: nameFontFamily, name_font_weight: nameFontWeight, name_min_font_size: nameMinFontSize, name_max_font_size: nameMaxFontSize,
            name_color: nameColor, name_background_color: nameBgColor, name_border_color: nameBorderColor,
            is_active: isActive, export_scale: exportScale, updated_at: now
          })
          .select()
          .single();

        if (error) throw error;
        const saved = formatTemplateRow(data);
        return res.json({ success: true, template: saved, poster: saved });
      } catch (err: any) {
        console.error('Error saving poster template via Supabase:', err);
        return res.status(500).json({ error: err.message });
      }
    }

    res.status(500).json({ error: 'Database connection not available' });
  };
  app.post('/api/posters', handleSavePoster);
  app.post('/api/poster-template', handleSavePoster);

  // Activate specific poster event
  const handleActivatePoster = async (req: any, res: any) => {
    const templateId = req.body.templateId || req.body.posterId || req.body.id;
    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' });
    }

    if (pgPool) {
      try {
        await pgPool.query('UPDATE poster_templates SET is_active = false WHERE id != $1', [templateId]);
        const result = await pgPool.query('UPDATE poster_templates SET is_active = true, updated_at = NOW() WHERE id = $1 RETURNING *', [templateId]);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Poster template not found' });
        }
        const active = formatTemplateRow(result.rows[0]);
        return res.json({ success: true, template: active, poster: active });
      } catch (err: any) {
        console.error('Error activating poster template via pgPool:', err);
        return res.status(500).json({ error: err.message });
      }
    } else if (supabaseServer) {
      try {
        await supabaseServer.from('poster_templates').update({ is_active: false }).neq('id', templateId);
        const { data, error } = await supabaseServer
          .from('poster_templates')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq('id', templateId)
          .select()
          .single();

        if (error) throw error;
        const active = formatTemplateRow(data);
        return res.json({ success: true, template: active, poster: active });
      } catch (err: any) {
        console.error('Error activating poster template via Supabase:', err);
        return res.status(500).json({ error: err.message });
      }
    }

    res.status(500).json({ error: 'Database connection not available' });
  };
  app.post('/api/posters/active', handleActivatePoster);
  app.post('/api/poster-template/active', handleActivatePoster);

  // Archive specific poster
  app.post('/api/posters/:id/archive', async (req, res) => {
    const { id } = req.params;
    if (pgPool) {
      try {
        const result = await pgPool.query('UPDATE poster_templates SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Poster not found' });
        return res.json({ success: true, poster: formatTemplateRow(result.rows[0]) });
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    } else if (supabaseServer) {
      try {
        const { data, error } = await supabaseServer
          .from('poster_templates')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return res.json({ success: true, poster: formatTemplateRow(data) });
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }
    res.status(500).json({ error: 'Database connection not available' });
  });

  // Delete poster template
  const handleDeletePoster = async (req: any, res: any) => {
    const { id } = req.params;

    if (pgPool) {
      try {
        // Check total count
        const countRes = await pgPool.query('SELECT COUNT(*)::int as count FROM poster_templates');
        if ((countRes.rows[0]?.count || 0) <= 1) {
          return res.status(400).json({ error: 'Cannot delete the only poster in the system.' });
        }

        // Check if was active
        const checkRes = await pgPool.query('SELECT is_active FROM poster_templates WHERE id = $1', [id]);
        const wasActive = checkRes.rows[0]?.is_active;

        await pgPool.query('DELETE FROM poster_templates WHERE id = $1', [id]);

        if (wasActive) {
          await pgPool.query(`
            UPDATE poster_templates 
            SET is_active = true, updated_at = NOW() 
            WHERE id = (SELECT id FROM poster_templates ORDER BY created_at DESC LIMIT 1)
          `);
        }

        const allRes = await pgPool.query('SELECT * FROM poster_templates ORDER BY created_at DESC');
        const templates = allRes.rows.map(formatTemplateRow);
        const active = templates.find(t => t.is_active) || templates[0];
        return res.json({ success: true, templates, posters: templates, activeTemplate: active });
      } catch (err: any) {
        console.error('Error deleting poster template via pgPool:', err);
        return res.status(500).json({ error: err.message });
      }
    } else if (supabaseServer) {
      try {
        const { error } = await supabaseServer.from('poster_templates').delete().eq('id', id);
        if (error) throw error;
        const { data: allData } = await supabaseServer.from('poster_templates').select('*').order('created_at', { ascending: false });
        const templates = (allData || []).map(formatTemplateRow);
        return res.json({ success: true, templates, posters: templates });
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }

    res.status(500).json({ error: 'Database connection not available' });
  };
  app.delete('/api/posters/:id', handleDeletePoster);
  app.delete('/api/poster-template/:id', handleDeletePoster);

  // Purge archived posters
  app.post('/api/posters/purge-archived', async (_req, res) => {
    if (pgPool) {
      try {
        await pgPool.query('DELETE FROM poster_templates WHERE is_active = false');
        const allRes = await pgPool.query('SELECT * FROM poster_templates ORDER BY created_at DESC');
        const templates = allRes.rows.map(formatTemplateRow);
        return res.json({ success: true, templates, posters: templates });
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    } else if (supabaseServer) {
      try {
        await supabaseServer.from('poster_templates').delete().eq('is_active', false);
        const { data } = await supabaseServer.from('poster_templates').select('*').order('created_at', { ascending: false });
        const templates = (data || []).map(formatTemplateRow);
        return res.json({ success: true, templates, posters: templates });
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }
    res.status(500).json({ error: 'Database connection not available' });
  });

  // ========================================================
  // 2. SETTINGS API (Thank You Note & Merch Store CTA)
  // ========================================================
  app.get('/api/settings', async (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (pgPool) {
      try {
        const result = await pgPool.query("SELECT settings FROM app_settings WHERE id = 'global' LIMIT 1");
        if (result.rows.length > 0 && result.rows[0].settings) {
          return res.json({ settings: result.rows[0].settings });
        }
      } catch (err) {
        console.error('Error fetching settings via pgPool:', err);
      }
    } else if (supabaseServer) {
      try {
        const { data } = await supabaseServer.from('app_settings').select('settings').eq('id', 'global').maybeSingle();
        if (data && data.settings) {
          return res.json({ settings: data.settings });
        }
      } catch (err) {}
    }

    return res.json({ settings: DEFAULT_SETTINGS });
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
      activePosterTemplateId: newSettings.activePosterTemplateId || 'utq-20th-anniversary-default'
    };

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

        return res.json({ success: true, settings: payload });
      } catch (err: any) {
        console.error('Error saving settings via pgPool:', err);
        return res.status(500).json({ error: err.message });
      }
    } else if (supabaseServer) {
      try {
        await supabaseServer.from('app_settings').upsert({
          id: 'global',
          settings: payload,
          active_poster_id: payload.activePosterTemplateId,
          updated_at: new Date().toISOString()
        });
        return res.json({ success: true, settings: payload });
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }

    res.json({ success: true, settings: payload });
  });

  // ========================================================
  // 3. ATTENDEES & SUBMISSIONS API (Scoped Deduplication)
  // ========================================================
  const handleGetSubmissions = async (req: any, res: any) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    const { posterId } = req.query;

    if (pgPool) {
      try {
        let query = 'SELECT * FROM attendees';
        const params: any[] = [];

        if (posterId && posterId !== 'all') {
          query += ' WHERE poster_template_id = $1';
          params.push(posterId);
        }

        query += ' ORDER BY created_at DESC';
        const result = await pgPool.query(query, params);
        const attendees = result.rows.map(formatAttendeeRow);
        return res.json({ submissions: attendees, attendees, totalCount: attendees.length });
      } catch (err: any) {
        console.error('Error fetching attendees via pgPool:', err);
        return res.status(500).json({ error: err.message });
      }
    } else if (supabaseServer) {
      try {
        let query = supabaseServer.from('attendees').select('*').order('created_at', { ascending: false });
        if (posterId && posterId !== 'all') {
          query = query.eq('poster_template_id', posterId);
        }
        const { data, error } = await query;
        if (error) throw error;
        const attendees = (data || []).map(formatAttendeeRow);
        return res.json({ submissions: attendees, attendees, totalCount: attendees.length });
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }

    res.json({ submissions: [], attendees: [], totalCount: 0 });
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
    const targetPosterId = attendee.posterId || attendee.posterTemplateId || 'utq-20th-anniversary-default';
    const role = attendee.status || attendee.role || 'Attendee';
    const otherRole = attendee.otherStatus || attendee.otherRole || null;
    const posterUrl = attendee.posterImageUrl || attendee.posterUrl || null;
    const posterTemplateName = attendee.posterTemplateName || null;
    const now = new Date().toISOString();

    if (pgPool) {
      try {
        // Scoped lookup for existing attendee for this poster_template_id and contact_normalized
        const checkSql = `
          SELECT * FROM attendees 
          WHERE poster_template_id = $1 AND contact_normalized = $2
          LIMIT 1;
        `;
        const checkRes = await pgPool.query(checkSql, [targetPosterId, normContact]);

        let savedAttendee: any = null;

        if (checkRes.rows.length > 0) {
          const existing = checkRes.rows[0];
          const updateSql = `
            UPDATE attendees 
            SET 
              download_count = download_count + 1,
              last_downloaded_at = NOW(),
              poster_url = COALESCE($1, poster_url),
              full_name = COALESCE(NULLIF($2, ''), full_name),
              role = COALESCE($3, role),
              other_role = COALESCE($4, other_role),
              poster_template_name = COALESCE($5, poster_template_name),
              updated_at = NOW()
            WHERE id = $6
            RETURNING *;
          `;
          const updateRes = await pgPool.query(updateSql, [
            posterUrl,
            rawName,
            role,
            otherRole,
            posterTemplateName,
            existing.id
          ]);
          savedAttendee = formatAttendeeRow(updateRes.rows[0]);
        } else {
          const newId = attendee.id || `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const insertSql = `
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
              updated_at = NOW()
            RETURNING *;
          `;
          const insertRes = await pgPool.query(insertSql, [
            newId,
            rawName || 'Attendee',
            rawContact,
            normContact,
            role,
            otherRole,
            posterUrl,
            targetPosterId,
            posterTemplateName
          ]);
          savedAttendee = formatAttendeeRow(insertRes.rows[0]);
        }

        return res.json({ success: true, submission: savedAttendee, attendee: savedAttendee });
      } catch (err: any) {
        console.error('Error saving attendee via pgPool:', err);
        return res.status(500).json({ error: err.message });
      }
    } else if (supabaseServer) {
      try {
        const { data: existing } = await supabaseServer
          .from('attendees')
          .select('*')
          .eq('poster_template_id', targetPosterId)
          .eq('contact_normalized', normContact)
          .maybeSingle();

        if (existing) {
          const { data: updated, error: uErr } = await supabaseServer
            .from('attendees')
            .update({
              download_count: (existing.download_count || 1) + 1,
              last_downloaded_at: now,
              poster_url: posterUrl || existing.poster_url,
              full_name: rawName || existing.full_name,
              role: role || existing.role,
              other_role: otherRole,
              updated_at: now
            })
            .eq('id', existing.id)
            .select()
            .single();

          if (uErr) throw uErr;
          const formatted = formatAttendeeRow(updated);
          return res.json({ success: true, submission: formatted, attendee: formatted });
        } else {
          const newId = attendee.id || `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const { data: inserted, error: iErr } = await supabaseServer
            .from('attendees')
            .insert({
              id: newId,
              full_name: rawName || 'Attendee',
              contact: rawContact,
              contact_normalized: normContact,
              role,
              other_role: otherRole,
              poster_url: posterUrl,
              poster_template_id: targetPosterId,
              poster_template_name: posterTemplateName,
              download_count: 1,
              last_downloaded_at: now,
              created_at: now,
              updated_at: now
            })
            .select()
            .single();

          if (iErr) throw iErr;
          const formatted = formatAttendeeRow(inserted);
          return res.json({ success: true, submission: formatted, attendee: formatted });
        }
      } catch (err: any) {
        console.error('Error logging attendee download via Supabase:', err);
        return res.status(500).json({ error: err.message });
      }
    }

    res.status(500).json({ error: 'Database connection not available' });
  };
  app.post('/api/submissions/log-download', handleLogDownload);
  app.post('/api/submissions', handleLogDownload);
  app.post('/api/attendees/log-download', handleLogDownload);
  app.post('/api/attendees', handleLogDownload);

  // Delete attendee submission
  const handleDeleteSubmission = async (req: any, res: any) => {
    const { id } = req.params;

    if (pgPool) {
      try {
        const result = await pgPool.query('DELETE FROM attendees WHERE id = $1 RETURNING id', [id]);
        return res.json({ success: true, deleted: result.rowCount ? result.rowCount > 0 : true });
      } catch (err: any) {
        console.error('Error deleting attendee via pgPool:', err);
        return res.status(500).json({ error: err.message });
      }
    } else if (supabaseServer) {
      try {
        const { error } = await supabaseServer.from('attendees').delete().eq('id', id);
        if (error) throw error;
        return res.json({ success: true, deleted: true });
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }

    res.status(500).json({ error: 'Database connection not available' });
  };
  app.delete('/api/submissions/:id', handleDeleteSubmission);
  app.delete('/api/attendees/:id', handleDeleteSubmission);

  // ========================================================
  // 4. ADMIN PROFILES API (RBAC & Master Admin Authority)
  // ========================================================
  app.get('/api/admin-profiles', async (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (pgPool) {
      try {
        const result = await pgPool.query('SELECT * FROM admin_profiles ORDER BY created_at ASC');
        return res.json({ admins: result.rows });
      } catch (err: any) {
        console.error('Error fetching admin profiles via pgPool:', err);
      }
    } else if (supabaseServer) {
      try {
        const { data, error } = await supabaseServer.from('admin_profiles').select('*').order('created_at', { ascending: true });
        if (!error && Array.isArray(data)) {
          return res.json({ admins: data });
        }
      } catch (err) {}
    }

    // Default Master Admin fallback
    return res.json({
      admins: [
        {
          id: 'master-admin-1',
          email: MASTER_ADMIN_EMAIL,
          status: 'approved',
          is_master: true,
          created_at: '2026-08-26T00:00:00.000Z',
          approved_at: '2026-08-26T00:00:00.000Z'
        }
      ]
    });
  });

  app.post('/api/admin-profiles/request', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const cleanEmail = email.trim().toLowerCase();
    const isMaster = isMasterAdminEmail(cleanEmail);
    const now = new Date().toISOString();

    if (pgPool) {
      try {
        const checkRes = await pgPool.query('SELECT * FROM admin_profiles WHERE LOWER(email) = $1 LIMIT 1', [cleanEmail]);
        if (checkRes.rows.length > 0) {
          if (isMaster && checkRes.rows[0].status !== 'approved') {
            const upRes = await pgPool.query(`
              UPDATE admin_profiles 
              SET status = 'approved', is_master = true, approved_at = NOW() 
              WHERE LOWER(email) = $1 
              RETURNING *;
            `, [cleanEmail]);
            return res.json({ admin: upRes.rows[0] });
          }
          return res.json({ admin: checkRes.rows[0] });
        }

        const newId = `admin-${Date.now()}`;
        const status = isMaster ? 'approved' : 'pending';
        const insRes = await pgPool.query(`
          INSERT INTO admin_profiles (id, email, status, is_master, created_at, approved_at)
          VALUES ($1, $2, $3, $4, NOW(), $5)
          ON CONFLICT (email) DO UPDATE SET
            status = CASE WHEN $4 = true THEN 'approved' ELSE admin_profiles.status END,
            is_master = CASE WHEN $4 = true THEN true ELSE admin_profiles.is_master END
          RETURNING *;
        `, [newId, cleanEmail, status, isMaster, isMaster ? now : null]);

        return res.json({ admin: insRes.rows[0] });
      } catch (err: any) {
        console.error('Error in admin request via pgPool:', err);
        return res.status(500).json({ error: err.message });
      }
    } else if (supabaseServer) {
      try {
        const { data: existing } = await supabaseServer
          .from('admin_profiles')
          .select('*')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (existing) {
          if (isMaster && existing.status !== 'approved') {
            const { data: up } = await supabaseServer
              .from('admin_profiles')
              .update({ status: 'approved', is_master: true, approved_at: now })
              .eq('email', cleanEmail)
              .select()
              .single();
            return res.json({ admin: up });
          }
          return res.json({ admin: existing });
        }

        const newId = `admin-${Date.now()}`;
        const newProfile = {
          id: newId,
          email: cleanEmail,
          status: isMaster ? 'approved' : 'pending',
          is_master: isMaster,
          created_at: now,
          approved_at: isMaster ? now : null
        };

        const { data: ins, error } = await supabaseServer
          .from('admin_profiles')
          .insert(newProfile)
          .select()
          .single();

        if (error) throw error;
        return res.json({ admin: ins });
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }

    res.json({
      admin: {
        id: `admin-${Date.now()}`,
        email: cleanEmail,
        status: isMaster ? 'approved' : 'pending',
        is_master: isMaster,
        created_at: now,
        approved_at: isMaster ? now : undefined
      }
    });
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

    if (pgPool) {
      try {
        const result = await pgPool.query(`
          UPDATE admin_profiles 
          SET 
            status = $1,
            approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE NULL END
          WHERE LOWER(email) = $2
          RETURNING *;
        `, [status, cleanEmail]);

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Admin profile not found' });
        }

        return res.json({ success: true, admin: result.rows[0] });
      } catch (err: any) {
        console.error('Error updating admin status via pgPool:', err);
        return res.status(500).json({ error: err.message });
      }
    } else if (supabaseServer) {
      try {
        const { data, error } = await supabaseServer
          .from('admin_profiles')
          .update({
            status,
            approved_at: status === 'approved' ? new Date().toISOString() : null
          })
          .eq('email', cleanEmail)
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, admin: data });
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    }

    res.status(404).json({ error: 'Admin profile not found' });
  });

  // Vite Middleware for Frontend Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
