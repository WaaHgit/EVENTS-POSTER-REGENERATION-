import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'app_state.json');

// Ensure data directory exists for secondary cache
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Master admin emails
export const MASTER_ADMIN_EMAILS = [
  'creationsdevelopment2026@gmail.com',
  'creationsdevlopment2026@gmail.com'
];

export function isMasterAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return MASTER_ADMIN_EMAILS.some(m => m.toLowerCase() === clean);
}

// Supabase Server-side Client Initialization
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

const isServerSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseKey && 
  supabaseUrl.startsWith('http') && 
  supabaseKey.length > 10
);

let supabaseServer: SupabaseClient | null = null;
if (isServerSupabaseConfigured) {
  try {
    supabaseServer = createClient(supabaseUrl, supabaseKey);
    console.log('✓ Supabase server client successfully connected to:', supabaseUrl);
  } catch (err) {
    console.warn('Warning: Could not initialize Supabase server client:', err);
  }
}

// Approved default poster template asset (UTQ 20th Anniversary Official)
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

const INITIAL_SETTINGS = {
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

const INITIAL_ADMINS = [
  {
    id: 'master-admin-1',
    email: 'creationsdevelopment2026@gmail.com',
    status: 'approved',
    is_master: true,
    created_at: '2026-08-26T00:00:00.000Z',
    approved_at: '2026-08-26T00:00:00.000Z'
  },
  {
    id: 'master-admin-2',
    email: 'creationsdevlopment2026@gmail.com',
    status: 'approved',
    is_master: true,
    created_at: '2026-08-26T00:00:00.000Z',
    approved_at: '2026-08-26T00:00:00.000Z'
  }
];

interface ServerState {
  templates: any[];
  settings: typeof INITIAL_SETTINGS;
  admins: any[];
  attendees: any[];
}

function loadLocalCache(): ServerState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        templates: Array.isArray(parsed.templates) && parsed.templates.length > 0 
          ? parsed.templates 
          : [INITIAL_DEFAULT_TEMPLATE],
        settings: parsed.settings ? {
          thankYouNote: {
            enabled: Boolean(parsed.settings.thankYouNote?.enabled),
            title: parsed.settings.thankYouNote?.title || '',
            message: parsed.settings.thankYouNote?.message || ''
          },
          callToAction: {
            enabled: Boolean(parsed.settings.callToAction?.enabled),
            title: parsed.settings.callToAction?.title || '',
            subtitle: parsed.settings.callToAction?.subtitle || '',
            phoneNumber: parsed.settings.callToAction?.phoneNumber || '',
            contactPerson: parsed.settings.callToAction?.contactPerson || '',
            products: Array.isArray(parsed.settings.callToAction?.products)
              ? parsed.settings.callToAction.products
              : []
          },
          activePosterTemplateId: parsed.settings.activePosterTemplateId || 'utq-20th-anniversary-default'
        } : INITIAL_SETTINGS,
        admins: Array.isArray(parsed.admins) && parsed.admins.length > 0 ? parsed.admins : INITIAL_ADMINS,
        attendees: Array.isArray(parsed.attendees) ? parsed.attendees : []
      };
    }
  } catch (err) {
    console.error('Error reading local state cache:', err);
  }

  return {
    templates: [INITIAL_DEFAULT_TEMPLATE],
    settings: INITIAL_SETTINGS,
    admins: INITIAL_ADMINS,
    attendees: []
  };
}

function saveLocalCache(state: ServerState) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing state file:', err);
  }
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

function normalizeNameServer(name: string): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Asynchronous Supabase Sync helper
async function syncFromSupabase(state: ServerState): Promise<ServerState> {
  if (!supabaseServer) return state;

  try {
    // 1. Fetch poster templates from Supabase
    const { data: dbTemplates, error: tErr } = await supabaseServer
      .from('poster_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (!tErr && Array.isArray(dbTemplates) && dbTemplates.length > 0) {
      state.templates = dbTemplates.map(d => ({
        id: d.id,
        name: d.name,
        description: d.description || '',
        image_url: d.image_url,
        width: Number(d.width) || INITIAL_DEFAULT_TEMPLATE.width,
        height: Number(d.height) || INITIAL_DEFAULT_TEMPLATE.height,
        photo_x: Number(d.photo_x),
        photo_y: Number(d.photo_y),
        photo_width: Number(d.photo_width),
        photo_height: Number(d.photo_height),
        photo_radius: Number(d.photo_radius),
        name_x: Number(d.name_x),
        name_y: Number(d.name_y),
        name_width: Number(d.name_width),
        name_height: Number(d.name_height),
        name_font_family: d.name_font_family || INITIAL_DEFAULT_TEMPLATE.name_font_family,
        name_font_weight: d.name_font_weight || INITIAL_DEFAULT_TEMPLATE.name_font_weight,
        name_min_font_size: Number(d.name_min_font_size) || INITIAL_DEFAULT_TEMPLATE.name_min_font_size,
        name_max_font_size: Number(d.name_max_font_size) || INITIAL_DEFAULT_TEMPLATE.name_max_font_size,
        name_color: d.name_color || INITIAL_DEFAULT_TEMPLATE.name_color,
        name_background_color: d.name_background_color || INITIAL_DEFAULT_TEMPLATE.name_background_color,
        name_border_color: d.name_border_color || INITIAL_DEFAULT_TEMPLATE.name_border_color,
        is_active: Boolean(d.is_active),
        export_scale: Number(d.export_scale) || 1,
        created_at: d.created_at,
        updated_at: d.updated_at
      }));
    }

    // 2. Fetch App Settings from Supabase
    const { data: dbSettings, error: sErr } = await supabaseServer
      .from('app_settings')
      .select('*')
      .eq('id', 'global')
      .maybeSingle();

    if (!sErr && dbSettings && dbSettings.settings) {
      state.settings = dbSettings.settings;
    }

    // 3. Fetch Attendees from Supabase
    const { data: dbAttendees, error: aErr } = await supabaseServer
      .from('attendees')
      .select('*')
      .order('created_at', { ascending: false });

    if (!aErr && Array.isArray(dbAttendees)) {
      state.attendees = dbAttendees.map(d => ({
        id: String(d.id),
        fullName: d.full_name || d.fullName || 'Attendee',
        contact: d.contact || '',
        contactNormalized: d.contact_normalized || normalizeContactServer(d.contact || ''),
        status: d.role || d.status || 'Attendee',
        otherStatus: d.other_role || d.otherStatus || '',
        posterImageUrl: d.poster_url || d.poster_image_url || '',
        posterTemplateId: d.poster_template_id || d.poster_id || 'utq-20th-anniversary-default',
        posterTemplateName: d.poster_template_name || '',
        downloadCount: Number(d.download_count) || 1,
        lastDownloadedAt: d.last_downloaded_at || d.created_at,
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }));
    }

    // 4. Fetch Admin Profiles from Supabase
    const { data: dbAdmins, error: admErr } = await supabaseServer
      .from('admin_profiles')
      .select('*')
      .order('created_at', { ascending: true });

    if (!admErr && Array.isArray(dbAdmins) && dbAdmins.length > 0) {
      state.admins = dbAdmins.map(d => ({
        id: String(d.id),
        email: d.email,
        status: d.status,
        is_master: Boolean(d.is_master) || isMasterAdminEmail(d.email),
        created_at: d.created_at,
        approved_at: d.approved_at
      }));
    }

    saveLocalCache(state);
  } catch (err) {
    console.warn('Note: Background Supabase synchronization check:', err);
  }

  return state;
}

async function startServer() {
  const app = express();
  let state = loadLocalCache();

  // Initial non-blocking hydration from Supabase
  syncFromSupabase(state).then(synced => {
    state = synced;
  });

  // Middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Health check
  app.get('/api/health', (_req, res) => {
    res.json({ 
      status: 'ok', 
      supabaseConnected: Boolean(supabaseServer),
      templatesCount: state.templates.length,
      attendeesCount: state.attendees.length,
      timestamp: new Date().toISOString() 
    });
  });

  // ========================================================
  // 1. POSTER TEMPLATES / EVENTS API (Persistent & Multi-Poster)
  // ========================================================
  app.get('/api/poster-templates', async (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    state = await syncFromSupabase(state);
    res.json({ templates: state.templates });
  });

  app.get('/api/poster-template/active', async (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    state = await syncFromSupabase(state);
    const active = state.templates.find(t => t.is_active) || state.templates[0] || INITIAL_DEFAULT_TEMPLATE;
    res.json({ template: active });
  });

  // Save / Update Poster Event
  app.post('/api/poster-template', async (req, res) => {
    const template = req.body;
    if (!template || !template.id) {
      return res.status(400).json({ error: 'Template payload missing id' });
    }

    const updated = {
      ...template,
      updated_at: new Date().toISOString()
    };

    const existingIdx = state.templates.findIndex(t => t.id === template.id);
    if (existingIdx >= 0) {
      state.templates[existingIdx] = updated;
    } else {
      state.templates.unshift(updated);
    }

    // If marked active, archive all other templates non-destructively
    if (updated.is_active) {
      state.templates = state.templates.map(t => ({
        ...t,
        is_active: t.id === updated.id
      }));
      state.settings.activePosterTemplateId = updated.id;
    }

    saveLocalCache(state);

    // Persist to Supabase if connected
    if (supabaseServer) {
      try {
        if (updated.is_active) {
          await supabaseServer.from('poster_templates').update({ is_active: false }).neq('id', updated.id);
        }
        await supabaseServer.from('poster_templates').upsert({
          id: updated.id,
          name: updated.name,
          description: updated.description || '',
          image_url: updated.image_url,
          width: updated.width,
          height: updated.height,
          photo_x: updated.photo_x,
          photo_y: updated.photo_y,
          photo_width: updated.photo_width,
          photo_height: updated.photo_height,
          photo_radius: updated.photo_radius,
          name_x: updated.name_x,
          name_y: updated.name_y,
          name_width: updated.name_width,
          name_height: updated.name_height,
          name_font_family: updated.name_font_family,
          name_font_weight: updated.name_font_weight,
          name_min_font_size: updated.name_min_font_size,
          name_max_font_size: updated.name_max_font_size,
          name_color: updated.name_color,
          name_background_color: updated.name_background_color,
          name_border_color: updated.name_border_color,
          is_active: Boolean(updated.is_active),
          export_scale: updated.export_scale || 1,
          updated_at: updated.updated_at
        });
      } catch (dbErr) {
        console.warn('Supabase template upsert note:', dbErr);
      }
    }

    res.json({ success: true, template: updated });
  });

  // Activate a specific poster event (Archives previous active, deletes nothing)
  app.post('/api/poster-template/active', async (req, res) => {
    const { templateId } = req.body;
    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' });
    }

    let found = false;
    state.templates = state.templates.map(t => {
      if (t.id === templateId) {
        found = true;
        return { ...t, is_active: true, updated_at: new Date().toISOString() };
      }
      return { ...t, is_active: false };
    });

    if (!found) {
      return res.status(404).json({ error: 'Template not found' });
    }

    state.settings.activePosterTemplateId = templateId;
    saveLocalCache(state);

    if (supabaseServer) {
      try {
        await supabaseServer.from('poster_templates').update({ is_active: false }).neq('id', templateId);
        await supabaseServer.from('poster_templates').update({ is_active: true, updated_at: new Date().toISOString() }).eq('id', templateId);
      } catch (dbErr) {
        console.warn('Supabase activation note:', dbErr);
      }
    }

    const active = state.templates.find(t => t.id === templateId);
    res.json({ success: true, template: active });
  });

  // Delete non-active template with safety guards
  app.delete('/api/poster-template/:id', async (req, res) => {
    const { id } = req.params;
    const templateToDelete = state.templates.find(t => t.id === id);
    if (!templateToDelete) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (state.templates.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the only template in the system.' });
    }

    const wasActive = templateToDelete.is_active;
    state.templates = state.templates.filter(t => t.id !== id);

    if (wasActive && state.templates.length > 0) {
      state.templates[0].is_active = true;
      state.settings.activePosterTemplateId = state.templates[0].id;
    }

    saveLocalCache(state);

    if (supabaseServer) {
      try {
        await supabaseServer.from('poster_templates').delete().eq('id', id);
        if (wasActive && state.templates.length > 0) {
          await supabaseServer.from('poster_templates').update({ is_active: true }).eq('id', state.templates[0].id);
        }
      } catch (dbErr) {
        console.warn('Supabase template delete note:', dbErr);
      }
    }

    res.json({ success: true, templates: state.templates, activeTemplate: state.templates.find(t => t.is_active) });
  });

  // ========================================================
  // 2. SETTINGS API (Thank You Note & Call To Action / Merch)
  // ========================================================
  app.get('/api/settings', async (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    state = await syncFromSupabase(state);
    res.json({ settings: state.settings });
  });

  app.post('/api/settings', async (req, res) => {
    const newSettings = req.body;
    if (!newSettings) {
      return res.status(400).json({ error: 'Settings payload is required' });
    }

    state.settings = {
      thankYouNote: {
        enabled: typeof newSettings.thankYouNote?.enabled === 'boolean' 
          ? newSettings.thankYouNote.enabled 
          : state.settings.thankYouNote.enabled,
        title: typeof newSettings.thankYouNote?.title === 'string'
          ? newSettings.thankYouNote.title
          : (state.settings.thankYouNote.title || ''),
        message: typeof newSettings.thankYouNote?.message === 'string'
          ? newSettings.thankYouNote.message
          : (state.settings.thankYouNote.message || '')
      },
      callToAction: {
        enabled: typeof newSettings.callToAction?.enabled === 'boolean'
          ? newSettings.callToAction.enabled
          : state.settings.callToAction.enabled,
        title: typeof newSettings.callToAction?.title === 'string'
          ? newSettings.callToAction.title
          : (state.settings.callToAction.title || ''),
        subtitle: typeof newSettings.callToAction?.subtitle === 'string'
          ? newSettings.callToAction.subtitle
          : (state.settings.callToAction.subtitle || ''),
        phoneNumber: typeof newSettings.callToAction?.phoneNumber === 'string'
          ? newSettings.callToAction.phoneNumber
          : (state.settings.callToAction.phoneNumber || ''),
        contactPerson: typeof newSettings.callToAction?.contactPerson === 'string'
          ? newSettings.callToAction.contactPerson
          : (state.settings.callToAction.contactPerson || ''),
        products: Array.isArray(newSettings.callToAction?.products)
          ? newSettings.callToAction.products
          : (state.settings.callToAction.products || [])
      },
      activePosterTemplateId: newSettings.activePosterTemplateId || state.settings.activePosterTemplateId || 'utq-20th-anniversary-default'
    };

    saveLocalCache(state);

    if (supabaseServer) {
      try {
        await supabaseServer.from('app_settings').upsert({
          id: 'global',
          settings: state.settings,
          active_poster_template_id: state.settings.activePosterTemplateId,
          updated_at: new Date().toISOString()
        });
      } catch (dbErr) {
        console.warn('Supabase settings save note:', dbErr);
      }
    }

    res.json({ success: true, settings: state.settings });
  });

  // ========================================================
  // 3. ATTENDEES & SUBMISSIONS API (Scoped per Poster Event)
  // ========================================================
  app.get('/api/attendees', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    state = await syncFromSupabase(state);

    const { posterId } = req.query;
    let list = state.attendees;

    if (posterId && posterId !== 'all') {
      list = list.filter(a => a.posterTemplateId === posterId);
    }

    res.json({ attendees: list, totalCount: list.length });
  });

  app.post('/api/attendees', async (req, res) => {
    const attendee = req.body;
    if (!attendee || (!attendee.contact && !attendee.fullName)) {
      return res.status(400).json({ error: 'Attendee contact or name is required' });
    }

    const rawContact = (attendee.contact || attendee.contactNormalized || '').trim();
    const rawName = (attendee.fullName || '').trim();
    const normContact = normalizeContactServer(rawContact);
    const normName = normalizeNameServer(rawName);

    // Resolve target poster event ID
    const targetPosterId = attendee.posterTemplateId || state.settings.activePosterTemplateId || 'utq-20th-anniversary-default';

    // Resolve template title from state
    let templateName = attendee.posterTemplateName || '';
    if (!templateName && targetPosterId) {
      const foundTemplate = state.templates.find(t => t.id === targetPosterId);
      if (foundTemplate) templateName = foundTemplate.name;
    }
    if (!templateName) {
      const activeT = state.templates.find(t => t.is_active) || state.templates[0];
      templateName = activeT?.name || 'Official Event Poster';
    }

    // Deduplication rule:
    // Scoped strictly WITHIN the specific poster/event (targetPosterId)!
    // The same person can register for different events without collision.
    const existingIdx = state.attendees.findIndex(a => {
      const aPosterId = a.posterTemplateId || a.poster_template_id;
      if (aPosterId && targetPosterId && aPosterId !== targetPosterId) {
        return false; // Different event poster folder!
      }

      const existingContact = normalizeContactServer(a.contact || a.contactNormalized || '');
      const existingName = normalizeNameServer(a.fullName || '');
      
      const contactMatches = Boolean(normContact && existingContact && normContact === existingContact);
      const nameAndContactMatches = Boolean(normName && existingName && normName === existingName && normContact === existingContact);
      
      return contactMatches || nameAndContactMatches;
    });

    const now = new Date().toISOString();
    const isDownload = Boolean(attendee.isDownload);

    let savedRecord: any = null;

    if (existingIdx >= 0) {
      const existing = state.attendees[existingIdx];
      const currentDownloads = typeof existing.downloadCount === 'number' ? existing.downloadCount : 1;
      
      const updated = {
        ...existing,
        fullName: rawName || existing.fullName,
        contact: rawContact || existing.contact,
        contactNormalized: normContact || existing.contactNormalized,
        status: attendee.status || attendee.role || existing.status || 'Attendee',
        otherStatus: attendee.otherStatus !== undefined ? attendee.otherStatus : (attendee.otherRole !== undefined ? attendee.otherRole : existing.otherStatus),
        posterImageUrl: attendee.posterImageUrl || attendee.posterUrl || existing.posterImageUrl,
        posterTemplateId: targetPosterId,
        posterTemplateName: templateName || existing.posterTemplateName,
        downloadCount: isDownload ? currentDownloads + 1 : currentDownloads,
        lastDownloadedAt: isDownload ? now : (existing.lastDownloadedAt || now),
        updatedAt: now
      };
      state.attendees[existingIdx] = updated;
      savedRecord = updated;
    } else {
      const newRecord = {
        id: attendee.id || `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        fullName: rawName || 'Attendee',
        contact: rawContact,
        contactNormalized: normContact,
        status: attendee.status || attendee.role || 'Attendee',
        otherStatus: attendee.otherStatus || attendee.otherRole || '',
        posterImageUrl: attendee.posterImageUrl || attendee.posterUrl || '',
        posterTemplateId: targetPosterId,
        posterTemplateName: templateName,
        downloadCount: 1,
        lastDownloadedAt: now,
        createdAt: attendee.createdAt || now,
        updatedAt: now
      };
      state.attendees.unshift(newRecord);
      savedRecord = newRecord;
    }

    saveLocalCache(state);

    // Persist to Supabase if connected
    if (supabaseServer) {
      try {
        await supabaseServer.from('attendees').upsert({
          id: savedRecord.id,
          full_name: savedRecord.fullName,
          contact: savedRecord.contact,
          contact_normalized: savedRecord.contactNormalized,
          role: savedRecord.status,
          other_role: savedRecord.otherStatus || null,
          poster_url: savedRecord.posterImageUrl,
          poster_template_id: savedRecord.posterTemplateId,
          poster_template_name: savedRecord.posterTemplateName,
          download_count: savedRecord.downloadCount,
          last_downloaded_at: savedRecord.lastDownloadedAt,
          updated_at: savedRecord.updatedAt
        });
      } catch (dbErr) {
        console.warn('Supabase attendee upsert note:', dbErr);
      }
    }

    res.json({ 
      success: true, 
      attendee: savedRecord, 
      isDuplicate: existingIdx >= 0, 
      totalCount: state.attendees.length 
    });
  });

  // Dedicated download logging endpoint (scoped per poster event)
  app.post('/api/attendees/log-download', async (req, res) => {
    const attendee = req.body;
    if (!attendee) {
      return res.status(400).json({ error: 'Attendee payload is required' });
    }

    const rawContact = (attendee.contact || attendee.contactNormalized || '').trim();
    const rawName = (attendee.fullName || '').trim();
    const normContact = normalizeContactServer(rawContact);
    const normName = normalizeNameServer(rawName);
    const targetPosterId = attendee.posterTemplateId || state.settings.activePosterTemplateId || 'utq-20th-anniversary-default';

    let templateName = attendee.posterTemplateName || '';
    if (!templateName && targetPosterId) {
      const foundTemplate = state.templates.find(t => t.id === targetPosterId);
      if (foundTemplate) templateName = foundTemplate.name;
    }
    if (!templateName) {
      const activeT = state.templates.find(t => t.is_active) || state.templates[0];
      templateName = activeT?.name || 'Official Event Poster';
    }

    const existingIdx = state.attendees.findIndex(a => {
      const aPosterId = a.posterTemplateId || a.poster_template_id;
      if (aPosterId && targetPosterId && aPosterId !== targetPosterId) {
        return false;
      }

      const existingContact = normalizeContactServer(a.contact || a.contactNormalized || '');
      const existingName = normalizeNameServer(a.fullName || '');
      
      const contactMatches = Boolean(normContact && existingContact && normContact === existingContact);
      const nameAndContactMatches = Boolean(normName && existingName && normName === existingName && normContact === existingContact);

      return contactMatches || nameAndContactMatches;
    });

    const now = new Date().toISOString();
    let savedRecord: any = null;

    if (existingIdx >= 0) {
      const existing = state.attendees[existingIdx];
      const currentDownloads = typeof existing.downloadCount === 'number' ? existing.downloadCount : 1;
      const updated = {
        ...existing,
        downloadCount: currentDownloads + 1,
        lastDownloadedAt: now,
        updatedAt: now,
        posterImageUrl: attendee.posterImageUrl || attendee.posterUrl || existing.posterImageUrl,
        posterTemplateId: targetPosterId,
        posterTemplateName: templateName || existing.posterTemplateName
      };
      state.attendees[existingIdx] = updated;
      savedRecord = updated;
    } else {
      const newRecord = {
        id: attendee.id || `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        fullName: rawName || 'Attendee',
        contact: rawContact,
        contactNormalized: normContact,
        status: attendee.status || attendee.role || 'Attendee',
        otherStatus: attendee.otherStatus || attendee.otherRole || '',
        posterImageUrl: attendee.posterImageUrl || attendee.posterUrl || '',
        posterTemplateId: targetPosterId,
        posterTemplateName: templateName,
        downloadCount: 1,
        lastDownloadedAt: now,
        createdAt: now,
        updatedAt: now
      };
      state.attendees.unshift(newRecord);
      savedRecord = newRecord;
    }

    saveLocalCache(state);

    if (supabaseServer) {
      try {
        await supabaseServer.from('attendees').upsert({
          id: savedRecord.id,
          full_name: savedRecord.fullName,
          contact: savedRecord.contact,
          contact_normalized: savedRecord.contactNormalized,
          role: savedRecord.status,
          other_role: savedRecord.otherStatus || null,
          poster_url: savedRecord.posterImageUrl,
          poster_template_id: savedRecord.posterTemplateId,
          poster_template_name: savedRecord.posterTemplateName,
          download_count: savedRecord.downloadCount,
          last_downloaded_at: savedRecord.lastDownloadedAt,
          updated_at: savedRecord.updatedAt
        });
      } catch (dbErr) {
        console.warn('Supabase download log note:', dbErr);
      }
    }

    res.json({ success: true, attendee: savedRecord, totalCount: state.attendees.length });
  });

  // Delete attendee by id endpoint
  app.delete('/api/attendees/:id', async (req, res) => {
    const { id } = req.params;
    const initialLen = state.attendees.length;
    state.attendees = state.attendees.filter(a => a.id !== id);
    saveLocalCache(state);

    if (supabaseServer) {
      try {
        await supabaseServer.from('attendees').delete().eq('id', id);
      } catch (dbErr) {
        console.warn('Supabase attendee delete note:', dbErr);
      }
    }

    res.json({ success: true, deleted: initialLen > state.attendees.length, totalCount: state.attendees.length });
  });

  // ========================================================
  // 4. ADMIN PROFILES API (RBAC & Master Admin Authority)
  // ========================================================
  app.get('/api/admin-profiles', async (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    state = await syncFromSupabase(state);
    res.json({ admins: state.admins });
  });

  app.post('/api/admin-profiles/request', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const cleanEmail = email.trim().toLowerCase();
    const isMaster = isMasterAdminEmail(cleanEmail);

    const existingIdx = state.admins.findIndex(a => a.email.toLowerCase() === cleanEmail);

    if (existingIdx >= 0) {
      if (isMaster) {
        state.admins[existingIdx].status = 'approved';
        state.admins[existingIdx].is_master = true;
        saveLocalCache(state);
      }
      return res.json({ admin: state.admins[existingIdx] });
    }

    const newAdmin = {
      id: `admin-${Date.now()}`,
      email: cleanEmail,
      status: isMaster ? 'approved' : 'pending',
      is_master: isMaster,
      created_at: new Date().toISOString(),
      approved_at: isMaster ? new Date().toISOString() : undefined
    };

    state.admins.push(newAdmin);
    saveLocalCache(state);

    if (supabaseServer) {
      try {
        await supabaseServer.from('admin_profiles').upsert({
          id: newAdmin.id,
          email: newAdmin.email,
          status: newAdmin.status,
          is_master: newAdmin.is_master,
          approved_at: newAdmin.approved_at
        });
      } catch (dbErr) {
        console.warn('Supabase admin request note:', dbErr);
      }
    }

    res.json({ admin: newAdmin });
  });

  app.post('/api/admin-profiles/status', async (req, res) => {
    const { email, status } = req.body;
    if (!email || !status) {
      return res.status(400).json({ error: 'email and status are required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Guard: Master Admin can never be demoted or rejected
    if (isMasterAdminEmail(cleanEmail)) {
      return res.status(403).json({ error: 'Cannot modify Master Admin status' });
    }

    const targetIdx = state.admins.findIndex(a => a.email.toLowerCase() === cleanEmail);
    if (targetIdx >= 0) {
      state.admins[targetIdx].status = status;
      if (status === 'approved') {
        state.admins[targetIdx].approved_at = new Date().toISOString();
      }
      saveLocalCache(state);

      if (supabaseServer) {
        try {
          await supabaseServer
            .from('admin_profiles')
            .update({
              status,
              approved_at: status === 'approved' ? new Date().toISOString() : null
            })
            .eq('email', cleanEmail);
        } catch (dbErr) {
          console.warn('Supabase admin status note:', dbErr);
        }
      }

      return res.json({ success: true, admin: state.admins[targetIdx] });
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

