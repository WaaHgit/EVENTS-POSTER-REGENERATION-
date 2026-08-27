import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'app_state.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial default poster template
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

function loadState(): ServerState {
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
    console.error('Error reading state file, initializing default:', err);
  }

  const initial: ServerState = {
    templates: [INITIAL_DEFAULT_TEMPLATE],
    settings: INITIAL_SETTINGS,
    admins: INITIAL_ADMINS,
    attendees: []
  };
  saveState(initial);
  return initial;
}

function saveState(state: ServerState) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing state file:', err);
  }
}

async function startServer() {
  const app = express();
  let state = loadState();

  // Middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Routes
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 1. Poster Templates API
  app.get('/api/poster-templates', (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    state = loadState();
    res.json({ templates: state.templates });
  });

  app.get('/api/poster-template/active', (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    state = loadState();
    const active = state.templates.find(t => t.is_active) || state.templates[0] || INITIAL_DEFAULT_TEMPLATE;
    res.json({ template: active });
  });

  app.post('/api/poster-template', (req, res) => {
    const template = req.body;
    if (!template || !template.id) {
      return res.status(400).json({ error: 'Template payload missing id' });
    }

    state = loadState();
    const existingIdx = state.templates.findIndex(t => t.id === template.id);
    const updated = {
      ...template,
      updated_at: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      state.templates[existingIdx] = updated;
    } else {
      state.templates.unshift(updated);
    }

    // If marked active, ensure other templates are set to is_active: false
    if (updated.is_active) {
      state.templates = state.templates.map(t => ({
        ...t,
        is_active: t.id === updated.id
      }));
      state.settings.activePosterTemplateId = updated.id;
    }

    saveState(state);
    res.json({ success: true, template: updated });
  });

  app.post('/api/poster-template/active', (req, res) => {
    const { templateId } = req.body;
    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' });
    }

    state = loadState();
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
    saveState(state);
    const active = state.templates.find(t => t.id === templateId);
    res.json({ success: true, template: active });
  });

  app.delete('/api/poster-template/:id', (req, res) => {
    const { id } = req.params;
    state = loadState();
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

    saveState(state);
    res.json({ success: true, templates: state.templates, activeTemplate: state.templates.find(t => t.is_active) });
  });

  app.post('/api/poster-templates/purge-inactive', (_req, res) => {
    state = loadState();
    const active = state.templates.find(t => t.is_active) || state.templates[0];
    if (active) {
      active.is_active = true;
      state.templates = [active];
      state.settings.activePosterTemplateId = active.id;
      saveState(state);
    }
    res.json({ success: true, templates: state.templates, activeTemplate: active });
  });

  // 2. Settings API (Thank You Note & Call To Action / Merch)
  app.get('/api/settings', (_req, res) => {
    state = loadState();
    res.json({ settings: state.settings });
  });

  app.post('/api/settings', (req, res) => {
    const newSettings = req.body;
    if (!newSettings) {
      return res.status(400).json({ error: 'Settings payload is required' });
    }

    state = loadState();
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
    saveState(state);
    res.json({ success: true, settings: state.settings });
  });

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

  // 3. Attendees API
  app.get('/api/attendees', (_req, res) => {
    state = loadState();
    res.json({ attendees: state.attendees, totalCount: state.attendees.length });
  });

  app.post('/api/attendees', (req, res) => {
    const attendee = req.body;
    if (!attendee || !attendee.contact) {
      return res.status(400).json({ error: 'Attendee contact is required' });
    }

    state = loadState();
    const normContact = normalizeContactServer(attendee.contact);
    const normName = normalizeNameServer(attendee.fullName || '');

    // Deduplication rule: If normalized email/phone match, OR normalized name + contact match, treat as ONE attendee
    const existingIdx = state.attendees.findIndex(a => {
      const existingContact = normalizeContactServer(a.contact || a.contactNormalized || '');
      const existingName = normalizeNameServer(a.fullName || '');
      return (
        (existingContact && existingContact === normContact) ||
        (existingName && normName && existingName === normName && existingContact === normContact)
      );
    });

    const now = new Date().toISOString();

    if (existingIdx >= 0) {
      const existing = state.attendees[existingIdx];
      const updated = {
        ...existing,
        fullName: attendee.fullName ? attendee.fullName.trim() : existing.fullName,
        contact: attendee.contact ? attendee.contact.trim() : existing.contact,
        contactNormalized: normContact,
        status: attendee.status || existing.status || 'Attendee',
        otherStatus: attendee.otherStatus !== undefined ? attendee.otherStatus : existing.otherStatus,
        posterImageUrl: attendee.posterImageUrl || existing.posterImageUrl,
        posterTemplateId: attendee.posterTemplateId || existing.posterTemplateId,
        downloadCount: (existing.downloadCount || 1) + (attendee.isDownload ? 1 : 0),
        lastDownloadedAt: attendee.isDownload ? now : (existing.lastDownloadedAt || now),
        updatedAt: now
      };
      state.attendees[existingIdx] = updated;
      saveState(state);
      return res.json({ success: true, attendee: updated, isDuplicate: true, totalCount: state.attendees.length });
    }

    const newRecord = {
      ...attendee,
      id: attendee.id || `att-${Date.now()}`,
      fullName: (attendee.fullName || 'Attendee').trim(),
      contact: (attendee.contact || '').trim(),
      contactNormalized: normContact,
      downloadCount: 1,
      lastDownloadedAt: now,
      createdAt: attendee.createdAt || now,
      updatedAt: now
    };

    state.attendees.unshift(newRecord);
    saveState(state);
    res.json({ success: true, attendee: newRecord, isDuplicate: false, totalCount: state.attendees.length });
  });

  // Dedicated download logging endpoint
  app.post('/api/attendees/log-download', (req, res) => {
    const attendee = req.body;
    if (!attendee) {
      return res.status(400).json({ error: 'Attendee payload is required' });
    }

    state = loadState();
    const normContact = normalizeContactServer(attendee.contact || '');
    const normName = normalizeNameServer(attendee.fullName || '');

    const existingIdx = state.attendees.findIndex(a => {
      const existingContact = normalizeContactServer(a.contact || a.contactNormalized || '');
      const existingName = normalizeNameServer(a.fullName || '');
      return (
        (existingContact && normContact && existingContact === normContact) ||
        (existingName && normName && existingName === normName && (!normContact || existingContact === normContact))
      );
    });

    const now = new Date().toISOString();

    if (existingIdx >= 0) {
      const existing = state.attendees[existingIdx];
      state.attendees[existingIdx] = {
        ...existing,
        downloadCount: (existing.downloadCount || 0) + 1,
        lastDownloadedAt: now,
        updatedAt: now,
        posterImageUrl: attendee.posterImageUrl || existing.posterImageUrl
      };
      saveState(state);
      return res.json({ success: true, attendee: state.attendees[existingIdx], totalCount: state.attendees.length });
    }

    const newRecord = {
      id: attendee.id || `att-${Date.now()}`,
      fullName: (attendee.fullName || 'Attendee').trim(),
      contact: (attendee.contact || '').trim(),
      contactNormalized: normContact,
      status: attendee.status || 'Attendee',
      otherStatus: attendee.otherStatus || '',
      posterImageUrl: attendee.posterImageUrl || '',
      posterTemplateId: attendee.posterTemplateId || state.settings.activePosterTemplateId,
      downloadCount: 1,
      lastDownloadedAt: now,
      createdAt: now,
      updatedAt: now
    };

    state.attendees.unshift(newRecord);
    saveState(state);
    res.json({ success: true, attendee: newRecord, totalCount: state.attendees.length });
  });

  // 4. Admin Profiles API
  app.get('/api/admin-profiles', (_req, res) => {
    state = loadState();
    res.json({ admins: state.admins });
  });

  app.post('/api/admin-profiles/request', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const cleanEmail = email.trim().toLowerCase();
    state = loadState();

    const isMaster = 
      cleanEmail === 'creationsdevelopment2026@gmail.com' ||
      cleanEmail === 'creationsdevlopment2026@gmail.com';

    const existingIdx = state.admins.findIndex(a => a.email.toLowerCase() === cleanEmail);

    if (existingIdx >= 0) {
      if (isMaster) {
        state.admins[existingIdx].status = 'approved';
        state.admins[existingIdx].is_master = true;
        saveState(state);
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
    saveState(state);
    res.json({ admin: newAdmin });
  });

  app.post('/api/admin-profiles/status', (req, res) => {
    const { email, status } = req.body;
    if (!email || !status) {
      return res.status(400).json({ error: 'email and status are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    state = loadState();

    const targetIdx = state.admins.findIndex(a => a.email.toLowerCase() === cleanEmail);
    if (targetIdx >= 0) {
      // Guard master admin
      if (state.admins[targetIdx].is_master) {
        return res.status(403).json({ error: 'Cannot modify Master Admin status' });
      }

      state.admins[targetIdx].status = status;
      if (status === 'approved') {
        state.admins[targetIdx].approved_at = new Date().toISOString();
      }
      saveState(state);
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
