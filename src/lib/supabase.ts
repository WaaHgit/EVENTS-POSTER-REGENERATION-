import { createClient, User } from '@supabase/supabase-js';
import { DEFAULT_POSTER_TEMPLATE, type PosterTemplate, loadImage } from './canvasUtils';
import { type AppSettings, DEFAULT_APP_SETTINGS } from '../types';
import { normalizeContact, normalizeName } from './utils';

export const MASTER_ADMIN_EMAILS = [
  'creationsdevelopment2026@gmail.com',
  'creationsdevlopment2026@gmail.com'
];

export const MASTER_ADMIN_EMAIL = 'creationsdevelopment2026@gmail.com';

export function isMasterAdmin(email: string): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return MASTER_ADMIN_EMAILS.some(m => m.toLowerCase() === clean);
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured: boolean = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('http') && 
  supabaseAnonKey.length > 10
);

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);

export interface AdminProfile {
  id: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  is_master: boolean;
  created_at: string;
  approved_at?: string | null;
}

export interface LocalSubmission {
  id: string;
  fullName: string;
  contact: string;
  contactNormalized: string;
  status: string;
  otherStatus?: string;
  posterImageUrl: string;
  posterTemplateId?: string;
  posterTemplateName?: string;
  downloadCount?: number;
  lastDownloadedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

// Local Storage Keys
const LOCAL_STORAGE_SUBMISSIONS_KEY = 'utq_anniversary_submissions_v2';
const LOCAL_STORAGE_TEMPLATES_KEY = 'utq_poster_templates_v2';
const LOCAL_STORAGE_ADMINS_KEY = 'utq_admin_profiles_v2';
const LOCAL_STORAGE_SETTINGS_KEY = 'utq_app_settings_v2';

// ----------------------------------------------------
// APP SETTINGS (Thank You Note & Call To Action / Merch)
// ----------------------------------------------------

export function hasSettingsContent(s?: Partial<AppSettings> | null): boolean {
  if (!s) return false;
  const hasThankYou = Boolean(s.thankYouNote?.enabled || s.thankYouNote?.title?.trim() || s.thankYouNote?.message?.trim());
  const hasCta = Boolean(s.callToAction?.enabled || s.callToAction?.title?.trim() || s.callToAction?.subtitle?.trim() || s.callToAction?.phoneNumber?.trim());
  const hasProducts = Boolean(Array.isArray(s.callToAction?.products) && s.callToAction.products.length > 0);
  return hasThankYou || hasCta || hasProducts;
}

export function mergeAppSettings(primary: AppSettings, secondary: AppSettings): AppSettings {
  const thankYouEnabled = primary.thankYouNote.enabled || secondary.thankYouNote.enabled;
  const thankYouTitle = primary.thankYouNote.title.trim() || secondary.thankYouNote.title.trim();
  const thankYouMessage = primary.thankYouNote.message.trim() || secondary.thankYouNote.message.trim();

  const ctaEnabled = primary.callToAction.enabled || secondary.callToAction.enabled;
  const ctaTitle = primary.callToAction.title.trim() || secondary.callToAction.title.trim();
  const ctaSubtitle = primary.callToAction.subtitle.trim() || secondary.callToAction.subtitle.trim();
  const phoneNumber = primary.callToAction.phoneNumber.trim() || secondary.callToAction.phoneNumber.trim();
  const contactPerson = primary.callToAction.contactPerson.trim() || secondary.callToAction.contactPerson.trim();

  // Merge products by ID, prioritizing primary's details while preserving all items
  const primaryProducts = Array.isArray(primary.callToAction.products) ? primary.callToAction.products : [];
  const secondaryProducts = Array.isArray(secondary.callToAction.products) ? secondary.callToAction.products : [];
  
  const productMap = new Map<string, any>();
  secondaryProducts.forEach(p => productMap.set(p.id, p));
  primaryProducts.forEach(p => productMap.set(p.id, p));

  const mergedProducts = Array.from(productMap.values());
  const activePosterTemplateId = primary.activePosterTemplateId || secondary.activePosterTemplateId || DEFAULT_APP_SETTINGS.activePosterTemplateId;

  return {
    thankYouNote: {
      enabled: thankYouEnabled,
      title: thankYouTitle,
      message: thankYouMessage
    },
    callToAction: {
      enabled: ctaEnabled,
      title: ctaTitle,
      subtitle: ctaSubtitle,
      phoneNumber,
      contactPerson,
      products: mergedProducts
    },
    activePosterTemplateId
  };
}

export function getLocalAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        thankYouNote: {
          enabled: Boolean(parsed.thankYouNote?.enabled),
          title: parsed.thankYouNote?.title || '',
          message: parsed.thankYouNote?.message || ''
        },
        callToAction: {
          enabled: Boolean(parsed.callToAction?.enabled),
          title: parsed.callToAction?.title || '',
          subtitle: parsed.callToAction?.subtitle || '',
          phoneNumber: parsed.callToAction?.phoneNumber || '',
          contactPerson: parsed.callToAction?.contactPerson || '',
          products: Array.isArray(parsed.callToAction?.products) ? parsed.callToAction.products : []
        },
        activePosterTemplateId: parsed.activePosterTemplateId || DEFAULT_APP_SETTINGS.activePosterTemplateId
      };
    }
  } catch (err) {
    console.warn('Failed to read local app settings', err);
  }
  return DEFAULT_APP_SETTINGS;
}

export function saveLocalAppSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Failed to save app settings locally', err);
  }
}

export async function fetchAppSettings(): Promise<AppSettings> {
  const localSettings = getLocalAppSettings();
  const hasLocal = hasSettingsContent(localSettings);

  // 1. Try Express API (Server Persistence across all users/devices)
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (data && data.settings) {
        const serverSettings: AppSettings = data.settings;
        const hasServer = hasSettingsContent(serverSettings);

        if (!hasServer && hasLocal) {
          // If server was freshly initialized or empty, but local has configured admin settings,
          // restore and sync local settings to the server so they persist for everyone
          await saveAppSettings(localSettings);
          return localSettings;
        }

        // Merge server and local settings seamlessly
        const merged = mergeAppSettings(serverSettings, localSettings);
        saveLocalAppSettings(merged);
        return merged;
      }
    }
  } catch {
    // API server offline or browser network fallback
  }

  // 2. LocalStorage fallback
  return localSettings;
}

export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  // 1. Save local
  saveLocalAppSettings(settings);

  // 2. Sync to Express API
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.settings) {
        return data.settings;
      }
    }
  } catch (err) {
    console.warn('Could not sync settings to server API:', err);
  }

  return settings;
}

// ----------------------------------------------------
// SUBMISSIONS MANAGEMENT & DEDUPLICATION
// ----------------------------------------------------
export function getLocalSubmissions(): LocalSubmission[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SUBMISSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalSubmission(sub: LocalSubmission): void {
  const rawContact = (sub.contact || sub.contactNormalized || '').trim();
  const rawName = (sub.fullName || '').trim();
  const normContact = normalizeContact(rawContact);
  const normName = normalizeName(rawName);
  const targetPosterId = sub.posterTemplateId || 'utq-20th-anniversary-default';
  const now = new Date().toISOString();

  // 1. Save to local storage with intelligent per-poster deduplication
  try {
    const list = getLocalSubmissions();
    const existingIdx = list.findIndex(item => {
      const itemPosterId = item.posterTemplateId || 'utq-20th-anniversary-default';
      if (itemPosterId && targetPosterId && itemPosterId !== targetPosterId) {
        return false; // Different event folder!
      }
      const itemNormContact = normalizeContact(item.contact || item.contactNormalized || '');
      const itemNormName = normalizeName(item.fullName || '');
      const contactMatches = Boolean(normContact && itemNormContact && normContact === itemNormContact);
      const nameAndContactMatches = Boolean(normName && itemNormName && normName === itemNormName && normContact === itemNormContact);
      return contactMatches || nameAndContactMatches;
    });

    if (existingIdx >= 0) {
      const existing = list[existingIdx];
      const curDownloads = typeof existing.downloadCount === 'number' ? existing.downloadCount : 1;
      list[existingIdx] = {
        ...existing,
        ...sub,
        fullName: rawName || existing.fullName,
        contact: rawContact || existing.contact,
        contactNormalized: normContact || existing.contactNormalized,
        posterTemplateId: targetPosterId,
        posterTemplateName: sub.posterTemplateName || existing.posterTemplateName,
        downloadCount: curDownloads + 1,
        lastDownloadedAt: now,
        updatedAt: now
      };
    } else {
      list.unshift({
        ...sub,
        id: sub.id || `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        fullName: rawName || 'Attendee',
        contact: rawContact,
        contactNormalized: normContact,
        posterTemplateId: targetPosterId,
        posterTemplateName: sub.posterTemplateName,
        downloadCount: sub.downloadCount || 1,
        lastDownloadedAt: now,
        createdAt: sub.createdAt || now,
        updatedAt: now
      });
    }
    localStorage.setItem(LOCAL_STORAGE_SUBMISSIONS_KEY, JSON.stringify(list.slice(0, 1000)));
  } catch (err) {
    console.warn('Failed to save to local storage', err);
  }

  // 2. Sync to Server API (and Supabase backend)
  fetch('/api/attendees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...sub,
      fullName: rawName,
      contact: rawContact,
      contactNormalized: normContact,
      posterTemplateId: targetPosterId,
      isDownload: true
    })
  }).catch(err => console.warn('Could not sync attendee to server API:', err));
}

export async function recordAttendeeDownload(sub: {
  fullName: string;
  contact: string;
  status?: string;
  otherStatus?: string;
  posterImageUrl?: string;
  posterTemplateId?: string;
  posterTemplateName?: string;
}): Promise<void> {
  const rawContact = (sub.contact || '').trim();
  const rawName = (sub.fullName || '').trim();
  const normContact = normalizeContact(rawContact);
  const normName = normalizeName(rawName);
  const targetPosterId = sub.posterTemplateId || 'utq-20th-anniversary-default';
  const now = new Date().toISOString();

  // 1. Local Storage
  try {
    const list = getLocalSubmissions();
    const existingIdx = list.findIndex(item => {
      const itemPosterId = item.posterTemplateId || 'utq-20th-anniversary-default';
      if (itemPosterId && targetPosterId && itemPosterId !== targetPosterId) {
        return false;
      }
      const itemNormContact = normalizeContact(item.contact || item.contactNormalized || '');
      const itemNormName = normalizeName(item.fullName || '');
      const contactMatches = Boolean(normContact && itemNormContact && normContact === itemNormContact);
      const nameAndContactMatches = Boolean(normName && itemNormName && normName === itemNormName && normContact === itemNormContact);
      return contactMatches || nameAndContactMatches;
    });

    if (existingIdx >= 0) {
      const existing = list[existingIdx];
      const curDownloads = typeof existing.downloadCount === 'number' ? existing.downloadCount : 1;
      list[existingIdx] = {
        ...existing,
        downloadCount: curDownloads + 1,
        lastDownloadedAt: now,
        updatedAt: now,
        posterImageUrl: sub.posterImageUrl || existing.posterImageUrl,
        posterTemplateId: targetPosterId,
        posterTemplateName: sub.posterTemplateName || existing.posterTemplateName
      };
    } else {
      list.unshift({
        id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        fullName: rawName || 'Attendee',
        contact: rawContact,
        contactNormalized: normContact,
        status: sub.status || 'Attendee',
        otherStatus: sub.otherStatus || '',
        posterImageUrl: sub.posterImageUrl || '',
        posterTemplateId: targetPosterId,
        posterTemplateName: sub.posterTemplateName || '',
        downloadCount: 1,
        lastDownloadedAt: now,
        createdAt: now,
        updatedAt: now
      });
    }
    localStorage.setItem(LOCAL_STORAGE_SUBMISSIONS_KEY, JSON.stringify(list.slice(0, 1000)));
  } catch (err) {
    console.warn('Local download record error:', err);
  }

  // 2. Server API
  try {
    await fetch('/api/attendees/log-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sub,
        fullName: rawName,
        contact: rawContact,
        contactNormalized: normContact,
        posterTemplateId: targetPosterId
      })
    });
  } catch (err) {
    console.warn('Server download log error:', err);
  }
}

export async function deleteAttendee(id: string): Promise<void> {
  // 1. Delete locally
  try {
    const list = getLocalSubmissions().filter(a => a.id !== id);
    localStorage.setItem(LOCAL_STORAGE_SUBMISSIONS_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('Could not remove attendee from local storage:', err);
  }

  // 2. Delete on Server API
  try {
    await fetch(`/api/attendees/${id}`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.warn('Could not delete attendee on server:', err);
  }

  // 3. Delete from Supabase if configured
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('attendees').delete().eq('id', id);
    } catch (err) {
      console.warn('Could not delete attendee on Supabase:', err);
    }
  }
}

export async function fetchAllAttendees(): Promise<LocalSubmission[]> {
  const localList = getLocalSubmissions();
  let serverList: LocalSubmission[] = [];
  let supabaseList: LocalSubmission[] = [];

  // 1. Fetch from authoritative Server API
  try {
    const res = await fetch(`/api/attendees?t=${Date.now()}`, {
      cache: 'no-store'
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.attendees)) {
        serverList = data.attendees;
      }
    }
  } catch {
    // API server offline
  }

  // 2. Fetch from Supabase if configured
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('attendees')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        supabaseList = data.map((d: any) => ({
          id: String(d.id),
          fullName: d.full_name || d.fullName || 'Attendee',
          contact: d.contact || '',
          contactNormalized: normalizeContact(d.contact || ''),
          status: d.status || d.role || 'Attendee',
          otherStatus: d.other_role || d.other_status || d.otherStatus || '',
          posterImageUrl: d.poster_url || d.poster_image_url || d.posterUrl || '',
          posterTemplateId: d.poster_template_id || d.poster_id || d.posterTemplateId || 'utq-20th-anniversary-default',
          posterTemplateName: d.poster_template_name || d.posterTemplateName,
          downloadCount: Number(d.download_count || d.downloadCount) || 1,
          lastDownloadedAt: d.last_downloaded_at || d.lastDownloadedAt || d.created_at,
          createdAt: d.created_at || d.createdAt || new Date().toISOString(),
          updatedAt: d.updated_at || d.updatedAt
        }));
      }
    } catch (err) {
      console.warn('Supabase fetch error:', err);
    }
  }

  // Combine and deduplicate across serverList, supabaseList, and localList
  // Rule: deduplicate strictly per poster event folder!
  const combined: LocalSubmission[] = [];

  const addOrMerge = (item: LocalSubmission) => {
    const normC = normalizeContact(item.contact || item.contactNormalized || '');
    const normN = normalizeName(item.fullName || '');
    const itemPosterId = item.posterTemplateId || 'utq-20th-anniversary-default';

    const existingIdx = combined.findIndex(c => {
      const cPosterId = c.posterTemplateId || 'utq-20th-anniversary-default';
      if (cPosterId && itemPosterId && cPosterId !== itemPosterId) {
        return false; // Distinct event posters are kept independent
      }
      const cNormC = normalizeContact(c.contact || c.contactNormalized || '');
      const cNormN = normalizeName(c.fullName || '');
      const contactMatches = Boolean(normC && cNormC && normC === cNormC);
      const nameAndContactMatches = Boolean(normN && cNormN && normN === cNormN && normC === cNormC);
      return contactMatches || nameAndContactMatches;
    });

    if (existingIdx >= 0) {
      const exist = combined[existingIdx];
      const maxDownloads = Math.max(exist.downloadCount || 1, item.downloadCount || 1);
      const latestDownloadedAt = (new Date(item.lastDownloadedAt || 0) > new Date(exist.lastDownloadedAt || 0))
        ? (item.lastDownloadedAt || exist.lastDownloadedAt)
        : (exist.lastDownloadedAt || item.lastDownloadedAt);
      const latestImage = item.posterImageUrl || exist.posterImageUrl;
      const latestTemplateId = item.posterTemplateId || exist.posterTemplateId;
      const latestTemplateName = item.posterTemplateName || exist.posterTemplateName;

      combined[existingIdx] = {
        ...exist,
        fullName: item.fullName || exist.fullName,
        contact: item.contact || exist.contact,
        contactNormalized: normC || exist.contactNormalized,
        status: item.status || exist.status,
        otherStatus: item.otherStatus !== undefined ? item.otherStatus : exist.otherStatus,
        posterImageUrl: latestImage,
        posterTemplateId: latestTemplateId,
        posterTemplateName: latestTemplateName,
        downloadCount: maxDownloads,
        lastDownloadedAt: latestDownloadedAt
      };
    } else {
      combined.push({
        ...item,
        contactNormalized: normC,
        posterTemplateId: itemPosterId,
        downloadCount: item.downloadCount || 1
      });
    }
  };

  // Process server list first (most authoritative), then local, then supabase
  serverList.forEach(addOrMerge);
  localList.forEach(addOrMerge);
  supabaseList.forEach(addOrMerge);

  // Update local storage cache
  if (combined.length > 0) {
    try {
      localStorage.setItem(LOCAL_STORAGE_SUBMISSIONS_KEY, JSON.stringify(combined.slice(0, 1000)));
    } catch {}
  }

  return combined;
}

// ----------------------------------------------------
// DYNAMIC POSTER TEMPLATES MANAGEMENT
// ----------------------------------------------------
export function getLocalPosterTemplates(): PosterTemplate[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_TEMPLATES_KEY);
    if (raw) {
      const parsed: PosterTemplate[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to read local poster templates', err);
  }
  const initial = [DEFAULT_POSTER_TEMPLATE];
  saveLocalPosterTemplates(initial);
  return initial;
}

export function saveLocalPosterTemplates(templates: PosterTemplate[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_TEMPLATES_KEY, JSON.stringify(templates));
  } catch (err) {
    console.warn('Failed to save poster templates locally', err);
  }
}

export async function fetchActivePosterTemplate(): Promise<PosterTemplate> {
  // 1. Check Server API first (Authoritative source of truth for exact poster set by admin)
  try {
    const res = await fetch(`/api/poster-template/active?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.template) {
        const serverActive: PosterTemplate = data.template;

        // Immediately warm the in-memory image cache so render is instant
        loadImage(serverActive.image_url).catch(() => {});

        // Sync local storage with exact active template from server
        const locals = getLocalPosterTemplates();
        const updatedLocals = locals.map(t => ({
          ...t,
          is_active: t.id === serverActive.id
        }));
        const exists = updatedLocals.some(t => t.id === serverActive.id);
        if (!exists) {
          updatedLocals.unshift({ ...serverActive, is_active: true });
        } else {
          const idx = updatedLocals.findIndex(t => t.id === serverActive.id);
          if (idx >= 0) updatedLocals[idx] = { ...serverActive, is_active: true };
        }
        saveLocalPosterTemplates(updatedLocals);
        return serverActive;
      }
    }
  } catch {
    // Server API offline or initial startup
  }

  // 2. Supabase fallback if configured
  try {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('poster_templates')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        const template: PosterTemplate = {
          id: data.id,
          name: data.name,
          description: data.description,
          image_url: data.image_url,
          width: Number(data.width) || DEFAULT_POSTER_TEMPLATE.width,
          height: Number(data.height) || DEFAULT_POSTER_TEMPLATE.height,
          photo_x: Number(data.photo_x),
          photo_y: Number(data.photo_y),
          photo_width: Number(data.photo_width),
          photo_height: Number(data.photo_height),
          photo_radius: Number(data.photo_radius),
          name_x: Number(data.name_x),
          name_y: Number(data.name_y),
          name_width: Number(data.name_width),
          name_height: Number(data.name_height),
          name_font_family: data.name_font_family || DEFAULT_POSTER_TEMPLATE.name_font_family,
          name_font_weight: data.name_font_weight || DEFAULT_POSTER_TEMPLATE.name_font_weight,
          name_min_font_size: Number(data.name_min_font_size) || DEFAULT_POSTER_TEMPLATE.name_min_font_size,
          name_max_font_size: Number(data.name_max_font_size) || DEFAULT_POSTER_TEMPLATE.name_max_font_size,
          name_color: data.name_color || DEFAULT_POSTER_TEMPLATE.name_color,
          name_background_color: data.name_background_color || DEFAULT_POSTER_TEMPLATE.name_background_color,
          name_border_color: data.name_border_color || DEFAULT_POSTER_TEMPLATE.name_border_color,
          is_active: Boolean(data.is_active),
          export_scale: Number(data.export_scale) || DEFAULT_POSTER_TEMPLATE.export_scale,
          created_at: data.created_at,
          updated_at: data.updated_at
        };
        loadImage(template.image_url).catch(() => {});
        return template;
      }
    }
  } catch (err) {
    console.warn('Could not fetch active template from Supabase:', err);
  }

  // 3. Fallback to cached active template
  const locals = getLocalPosterTemplates();
  const localActive = locals.find(t => t.is_active) || locals[0];
  if (localActive) {
    loadImage(localActive.image_url).catch(() => {});
    return localActive;
  }
  return DEFAULT_POSTER_TEMPLATE;
}

export async function fetchAllPosterTemplates(): Promise<PosterTemplate[]> {
  const localTemplates = getLocalPosterTemplates();

  // 1. Check Server API
  try {
    const res = await fetch(`/api/poster-templates?t=${Date.now()}`, {
      cache: 'no-store'
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.templates) && data.templates.length > 0) {
        const serverTemplates: PosterTemplate[] = data.templates;

        const templateMap = new Map<string, PosterTemplate>();
        localTemplates.forEach(t => templateMap.set(t.id, t));
        serverTemplates.forEach(st => templateMap.set(st.id, st));

        const merged = Array.from(templateMap.values());
        saveLocalPosterTemplates(merged);
        return merged;
      }
    }
  } catch {
    // Server API offline
  }

  // 2. Supabase fallback
  try {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('poster_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          image_url: d.image_url,
          width: Number(d.width),
          height: Number(d.height),
          photo_x: Number(d.photo_x),
          photo_y: Number(d.photo_y),
          photo_width: Number(d.photo_width),
          photo_height: Number(d.photo_height),
          photo_radius: Number(d.photo_radius),
          name_x: Number(d.name_x),
          name_y: Number(d.name_y),
          name_width: Number(d.name_width),
          name_height: Number(d.name_height),
          name_font_family: d.name_font_family,
          name_font_weight: d.name_font_weight,
          name_min_font_size: Number(d.name_min_font_size),
          name_max_font_size: Number(d.name_max_font_size),
          name_color: d.name_color,
          name_background_color: d.name_background_color,
          name_border_color: d.name_border_color,
          is_active: Boolean(d.is_active),
          export_scale: Number(d.export_scale) || 1,
          created_at: d.created_at,
          updated_at: d.updated_at
        }));
      }
    }
  } catch (err) {
    console.warn('Could not fetch templates from Supabase, returning local list:', err);
  }

  return localTemplates;
}

export async function deletePosterTemplate(templateId: string): Promise<PosterTemplate[]> {
  // 1. Remove from local storage
  const locals = getLocalPosterTemplates().filter(t => t.id !== templateId);
  if (locals.length > 0 && !locals.some(t => t.is_active)) {
    locals[0].is_active = true;
  }
  saveLocalPosterTemplates(locals);

  // 2. Call server API
  try {
    const res = await fetch(`/api/poster-template/${templateId}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.templates)) {
        saveLocalPosterTemplates(data.templates);
        return data.templates;
      }
    }
  } catch (err) {
    console.warn('Error deleting template on server:', err);
  }

  return locals;
}

export async function purgeInactivePosterTemplates(): Promise<PosterTemplate[]> {
  try {
    const res = await fetch('/api/poster-templates/purge-inactive', {
      method: 'POST'
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.templates)) {
        saveLocalPosterTemplates(data.templates);
        return data.templates;
      }
    }
  } catch (err) {
    console.warn('Error purging inactive templates:', err);
  }
  const locals = getLocalPosterTemplates();
  const activeOnly = locals.filter(t => t.is_active);
  saveLocalPosterTemplates(activeOnly.length > 0 ? activeOnly : locals);
  return activeOnly;
}

export async function savePosterTemplate(template: PosterTemplate): Promise<PosterTemplate> {
  const updated: PosterTemplate = {
    ...template,
    updated_at: new Date().toISOString()
  };

  // 1. Update local storage
  const locals = getLocalPosterTemplates();
  const existingIdx = locals.findIndex(t => t.id === template.id);
  if (existingIdx >= 0) {
    locals[existingIdx] = updated;
  } else {
    locals.unshift(updated);
  }
  saveLocalPosterTemplates(locals);

  // 2. Sync to Server API
  try {
    await fetch('/api/poster-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
  } catch (err) {
    console.warn('Could not save template to server API:', err);
  }

  // 3. Sync to Supabase if configured
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('poster_templates').upsert({
        id: updated.id,
        name: updated.name,
        description: updated.description,
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
        is_active: updated.is_active,
        export_scale: updated.export_scale || 1,
        updated_at: updated.updated_at
      });
    } catch (err) {
      console.warn('Could not upsert template to Supabase:', err);
    }
  }

  return updated;
}

export async function setActivePosterTemplate(templateId: string): Promise<void> {
  // 1. Update local storage
  const locals = getLocalPosterTemplates();
  const updated = locals.map(t => ({
    ...t,
    is_active: t.id === templateId,
    updated_at: t.id === templateId ? new Date().toISOString() : t.updated_at
  }));
  saveLocalPosterTemplates(updated);

  // 2. Sync to Server API (Permanent server state for all users)
  try {
    await fetch('/api/poster-template/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId })
    });
  } catch (err) {
    console.warn('Could not set active template in server API:', err);
  }

  // 3. Sync to Supabase if configured
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('poster_templates').update({ is_active: false }).neq('id', '___none___');
      await supabase.from('poster_templates').update({ is_active: true, updated_at: new Date().toISOString() }).eq('id', templateId);
    } catch (err) {
      console.warn('Could not update active template in Supabase:', err);
    }
  }
}

// ----------------------------------------------------
// RBAC & ADMIN PROFILES MANAGEMENT
// ----------------------------------------------------
export function getLocalAdminProfiles(): AdminProfile[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_ADMINS_KEY);
    if (raw) {
      const list: AdminProfile[] = JSON.parse(raw);
      let modified = false;
      const updated = list.map(item => {
        if (isMasterAdmin(item.email) && (item.status !== 'approved' || !item.is_master)) {
          modified = true;
          return { ...item, status: 'approved' as const, is_master: true, approved_at: item.approved_at || new Date().toISOString() };
        }
        return item;
      });
      if (modified) {
        saveLocalAdminProfiles(updated);
      }
      return updated;
    }
  } catch (err) {
    console.warn('Failed to read local admin profiles', err);
  }

  const initialList: AdminProfile[] = [
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
  saveLocalAdminProfiles(initialList);
  return initialList;
}

export function saveLocalAdminProfiles(profiles: AdminProfile[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_ADMINS_KEY, JSON.stringify(profiles));
  } catch (err) {
    console.warn('Failed to save local admin profiles', err);
  }
}

export async function fetchAdminProfileByEmail(email: string): Promise<AdminProfile | null> {
  const normalizedEmail = email.trim().toLowerCase();

  // If this is a Master Admin email, always bootstrap/return as approved master
  if (isMasterAdmin(normalizedEmail)) {
    const master: AdminProfile = {
      id: 'master-admin-bootstrap',
      email: normalizedEmail,
      status: 'approved',
      is_master: true,
      created_at: '2026-08-26T00:00:00.000Z',
      approved_at: '2026-08-26T00:00:00.000Z'
    };

    const locals = getLocalAdminProfiles();
    const existingIdx = locals.findIndex(a => a.email.toLowerCase() === normalizedEmail);
    if (existingIdx >= 0) {
      locals[existingIdx] = {
        ...locals[existingIdx],
        status: 'approved',
        is_master: true,
        approved_at: locals[existingIdx].approved_at || new Date().toISOString()
      };
      saveLocalAdminProfiles(locals);
    } else {
      locals.unshift(master);
      saveLocalAdminProfiles(locals);
    }

    return master;
  }

  // 1. Try Server API
  try {
    const res = await fetch('/api/admin-profiles');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.admins)) {
        const found = data.admins.find((a: AdminProfile) => a.email.toLowerCase() === normalizedEmail);
        if (found) return found;
      }
    }
  } catch {
    // API offline
  }

  // 2. Supabase fallback
  try {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('admin_profiles')
        .select('*')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          email: data.email,
          status: data.status,
          is_master: Boolean(data.is_master),
          created_at: data.created_at,
          approved_at: data.approved_at
        };
      }
    }
  } catch (err) {
    console.warn('Could not fetch admin profile from Supabase:', err);
  }

  // 3. Fallback to local storage
  const locals = getLocalAdminProfiles();
  return locals.find(a => a.email.toLowerCase() === normalizedEmail) || null;
}

export async function fetchAllAdminProfiles(): Promise<AdminProfile[]> {
  // 1. Check Server API
  try {
    const res = await fetch('/api/admin-profiles');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.admins) && data.admins.length > 0) {
        return data.admins;
      }
    }
  } catch {
    // API offline
  }

  // 2. Supabase fallback
  try {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('admin_profiles')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          email: d.email,
          status: d.status,
          is_master: Boolean(d.is_master) || isMasterAdmin(d.email),
          created_at: d.created_at,
          approved_at: d.approved_at
        }));
      }
    }
  } catch (err) {
    console.warn('Could not fetch all admin profiles from Supabase:', err);
  }

  return getLocalAdminProfiles();
}

export async function requestAdminAccess(email: string): Promise<AdminProfile> {
  const normalizedEmail = email.trim().toLowerCase();
  const isMaster = isMasterAdmin(normalizedEmail);

  // 1. Sync to Server API
  try {
    const res = await fetch('/api/admin-profiles/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.admin) {
        return data.admin;
      }
    }
  } catch {
    // Server API offline
  }

  const newProfile: AdminProfile = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    email: normalizedEmail,
    status: isMaster ? 'approved' : 'pending',
    is_master: isMaster,
    created_at: new Date().toISOString(),
    approved_at: isMaster ? new Date().toISOString() : undefined
  };

  const locals = getLocalAdminProfiles();
  const existingIdx = locals.findIndex(a => a.email.toLowerCase() === normalizedEmail);
  if (existingIdx >= 0) {
    locals[existingIdx] = {
      ...locals[existingIdx],
      status: isMaster ? 'approved' : locals[existingIdx].status,
      is_master: isMaster ? true : locals[existingIdx].is_master,
      approved_at: isMaster ? (locals[existingIdx].approved_at || new Date().toISOString()) : locals[existingIdx].approved_at
    };
  } else {
    locals.push(newProfile);
  }
  saveLocalAdminProfiles(locals);

  return newProfile;
}

export async function updateAdminStatus(
  email: string, 
  status: 'approved' | 'rejected'
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  
  // Guard: Master Admin cannot be demoted or rejected
  if (isMasterAdmin(normalizedEmail)) {
    return;
  }

  // 1. Server API
  try {
    await fetch('/api/admin-profiles/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, status })
    });
  } catch (err) {
    console.warn('Could not update admin status in server API:', err);
  }

  // 2. Local Storage
  const locals = getLocalAdminProfiles();
  const idx = locals.findIndex(a => a.email.toLowerCase() === normalizedEmail);
  if (idx >= 0) {
    locals[idx] = {
      ...locals[idx],
      status,
      approved_at: status === 'approved' ? new Date().toISOString() : null
    };
    saveLocalAdminProfiles(locals);
  }

  // 3. Supabase fallback
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase
        .from('admin_profiles')
        .update({
          status,
          approved_at: status === 'approved' ? new Date().toISOString() : null
        })
        .eq('email', normalizedEmail);
    } catch (err) {
      console.warn('Could not update admin status in Supabase:', err);
    }
  }
}
