import { createClient } from '@supabase/supabase-js';
import { DEFAULT_POSTER_TEMPLATE, type PosterTemplate, loadImage } from './canvasUtils';
import { type AppSettings, DEFAULT_APP_SETTINGS } from '../types';
import { normalizeContact, normalizeName } from './utils';

// Single Master Admin Email (no typos or duplicate accounts)
export const MASTER_ADMIN_EMAIL = 'creationsdevelopment2026@gmail.com';
export const MASTER_ADMIN_EMAILS = [MASTER_ADMIN_EMAIL];

export function isMasterAdmin(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured: boolean = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('http') && 
  supabaseAnonKey.length > 10
);

// Client-side Supabase client (used for optional client auth / sessions if needed)
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

export interface PhotoFrameConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export interface NameTextConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily: string;
  fontWeight: string;
  minFontSize: number;
  maxFontSize: number;
  color: string;
  backgroundColor: string;
  borderColor?: string;
}

export interface PosterRecord {
  id: string;
  label: string;
  template_image_url: string;
  width?: number;
  height?: number;
  photo_frame_config: PhotoFrameConfig;
  name_text_config: NameTextConfig;
  status: 'active' | 'archived';
  created_by?: string;
  created_at: string;
  updated_at?: string;
  description?: string;
  export_scale?: number;
}

export interface LocalSubmission {
  id: string;
  posterId?: string;
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

// Convert PosterRecord <-> PosterTemplate (for canvas rendering & configurator compatibility)
export function posterRecordToTemplate(p: any): PosterTemplate {
  return {
    id: p.id,
    name: p.name || p.label || 'Event Poster',
    description: p.description || '',
    image_url: p.image_url || p.template_image_url || '/poster.png',
    width: Number(p.width) || DEFAULT_POSTER_TEMPLATE.width,
    height: Number(p.height) || DEFAULT_POSTER_TEMPLATE.height,
    photo_x: Number(p.photo_x ?? p.photo_frame_config?.x ?? DEFAULT_POSTER_TEMPLATE.photo_x),
    photo_y: Number(p.photo_y ?? p.photo_frame_config?.y ?? DEFAULT_POSTER_TEMPLATE.photo_y),
    photo_width: Number(p.photo_width ?? p.photo_frame_config?.width ?? DEFAULT_POSTER_TEMPLATE.photo_width),
    photo_height: Number(p.photo_height ?? p.photo_frame_config?.height ?? DEFAULT_POSTER_TEMPLATE.photo_height),
    photo_radius: Number(p.photo_radius ?? p.photo_frame_config?.radius ?? DEFAULT_POSTER_TEMPLATE.photo_radius),
    name_x: Number(p.name_x ?? p.name_text_config?.x ?? DEFAULT_POSTER_TEMPLATE.name_x),
    name_y: Number(p.name_y ?? p.name_text_config?.y ?? DEFAULT_POSTER_TEMPLATE.name_y),
    name_width: Number(p.name_width ?? p.name_text_config?.width ?? DEFAULT_POSTER_TEMPLATE.name_width),
    name_height: Number(p.name_height ?? p.name_text_config?.height ?? DEFAULT_POSTER_TEMPLATE.name_height),
    name_font_family: p.name_font_family || p.name_text_config?.fontFamily || DEFAULT_POSTER_TEMPLATE.name_font_family,
    name_font_weight: p.name_font_weight || p.name_text_config?.fontWeight || DEFAULT_POSTER_TEMPLATE.name_font_weight,
    name_min_font_size: Number(p.name_min_font_size ?? p.name_text_config?.minFontSize ?? DEFAULT_POSTER_TEMPLATE.name_min_font_size),
    name_max_font_size: Number(p.name_max_font_size ?? p.name_text_config?.maxFontSize ?? DEFAULT_POSTER_TEMPLATE.name_max_font_size),
    name_color: p.name_color || p.name_text_config?.color || DEFAULT_POSTER_TEMPLATE.name_color,
    name_background_color: p.name_background_color || p.name_text_config?.backgroundColor || DEFAULT_POSTER_TEMPLATE.name_background_color,
    name_border_color: p.name_border_color || p.name_text_config?.borderColor || DEFAULT_POSTER_TEMPLATE.name_border_color,
    is_active: Boolean(p.is_active || p.status === 'active'),
    export_scale: Number(p.export_scale) || 1,
    created_at: p.created_at,
    updated_at: p.updated_at
  };
}

export function templateToPosterRecord(t: PosterTemplate, createdBy?: string): PosterRecord {
  return {
    id: t.id,
    label: t.name,
    template_image_url: t.image_url,
    width: t.width,
    height: t.height,
    photo_frame_config: {
      x: t.photo_x,
      y: t.photo_y,
      width: t.photo_width,
      height: t.photo_height,
      radius: t.photo_radius
    },
    name_text_config: {
      x: t.name_x,
      y: t.name_y,
      width: t.name_width,
      height: t.name_height,
      fontFamily: t.name_font_family,
      fontWeight: t.name_font_weight,
      minFontSize: t.name_min_font_size,
      maxFontSize: t.name_max_font_size,
      color: t.name_color,
      backgroundColor: t.name_background_color,
      borderColor: t.name_border_color
    },
    status: t.is_active ? 'active' : 'archived',
    created_by: createdBy || 'admin',
    created_at: t.created_at || new Date().toISOString(),
    updated_at: t.updated_at || new Date().toISOString(),
    description: t.description || '',
    export_scale: t.export_scale || 1
  };
}

// ----------------------------------------------------
// SQL SETUP SCRIPT REFERENCE
// ----------------------------------------------------
export function getSupabaseSetupSQL(): string {
  return `-- UTQ Poster Generator Database Schema
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

alter table poster_templates enable row level security;
alter table attendees enable row level security;
alter table admin_profiles enable row level security;
`;
}

export interface SupabaseHealth {
  configured: boolean;
  connected: boolean;
  tablesExist: boolean;
  missingTables: string[];
  error?: string;
}

export async function checkSupabaseHealth(): Promise<SupabaseHealth> {
  try {
    const res = await fetch('/api/supabase/status', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return {
        configured: Boolean(data.configured),
        connected: Boolean(data.connected),
        tablesExist: Boolean(data.tablesExist),
        missingTables: data.missingTables || [],
        error: data.error
      };
    }
  } catch (err: any) {
    return {
      configured: isSupabaseConfigured,
      connected: false,
      tablesExist: false,
      missingTables: [],
      error: err?.message || 'Failed to check server database status.'
    };
  }

  return {
    configured: isSupabaseConfigured,
    connected: false,
    tablesExist: false,
    missingTables: []
  };
}

export function getAuthHeaders(): Record<string, string> {
  const email = typeof window !== 'undefined' ? (sessionStorage.getItem('utq_admin_email') || '') : '';
  const key = typeof window !== 'undefined' ? (sessionStorage.getItem('utq_master_key') || '') : '';
  return {
    'Content-Type': 'application/json',
    'x-admin-email': email,
    'x-master-key': key
  };
}

export async function verifyMasterAdminCredentials(email: string, password?: string): Promise<{ success: boolean; is_master: boolean; role?: string; error?: string }> {
  try {
    const res = await fetch('/api/admin/verify-master-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, is_master: false, error: data?.error || 'Verification failed' };
    }
    return { success: true, is_master: Boolean(data.is_master), role: data.role };
  } catch (err: any) {
    return { success: false, is_master: false, error: err?.message || 'Network error' };
  }
}

export async function changeMasterAdminKey(currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const email = typeof window !== 'undefined' ? (sessionStorage.getItem('utq_admin_email') || MASTER_ADMIN_EMAIL) : MASTER_ADMIN_EMAIL;
    const res = await fetch('/api/admin/change-master-key', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ email, currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.error || 'Failed to change master key' };
    }
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('utq_master_key', newPassword);
    }
    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

// ----------------------------------------------------
// POSTER TEMPLATE OPERATIONS (VIA SERVER API / SUPABASE)
// ----------------------------------------------------

/**
 * Fetches the current active poster directly from Server API (backed by Supabase).
 */
export async function fetchActivePosterTemplate(): Promise<PosterTemplate> {
  try {
    const res = await fetch(`/api/posters/active?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.template || data.poster)) {
        const template = posterRecordToTemplate(data.template || data.poster);
        loadImage(template.image_url).catch(() => {});
        return template;
      }
    }
  } catch (err) {
    console.warn('Error fetching active poster template from API:', err);
  }

  return DEFAULT_POSTER_TEMPLATE;
}

/**
 * Fetches all posters (active and archived) from Server API (backed by Supabase).
 */
export async function fetchAllPosterTemplates(): Promise<PosterTemplate[]> {
  try {
    const res = await fetch(`/api/posters?t=${Date.now()}`, { 
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      const data = await res.json();
      const list = data.templates || data.posters;
      if (Array.isArray(list) && list.length > 0) {
        return list.map(posterRecordToTemplate);
      }
    }
  } catch (err) {
    console.warn('Error fetching all poster templates from API:', err);
  }

  return [DEFAULT_POSTER_TEMPLATE];
}

/**
 * Saves a poster template configuration via Server API (persisted to Supabase).
 */
export async function savePosterTemplate(template: PosterTemplate, createdBy = 'admin'): Promise<PosterTemplate> {
  const updated: PosterTemplate = {
    ...template,
    updated_at: new Date().toISOString()
  };

  const res = await fetch('/api/posters', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(updated)
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error || 'Failed to save poster template.');
  }

  const data = await res.json();
  return posterRecordToTemplate(data.template || data.poster || updated);
}

/**
 * Sets a poster template as the active campaign poster.
 */
export async function setActivePosterTemplate(posterId: string): Promise<void> {
  const res = await fetch('/api/posters/active', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ templateId: posterId, posterId })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error || 'Failed to activate poster template.');
  }
}

/**
 * Archives a poster template.
 */
export async function archivePosterTemplate(posterId: string): Promise<void> {
  await fetch(`/api/posters/${encodeURIComponent(posterId)}/archive`, { 
    method: 'POST',
    headers: getAuthHeaders()
  });
}

/**
 * Deletes a poster template from Supabase via Server API.
 */
export async function deletePosterTemplate(posterId: string): Promise<PosterTemplate[]> {
  const res = await fetch(`/api/posters/${encodeURIComponent(posterId)}`, { 
    method: 'DELETE',
    headers: getAuthHeaders()
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error || 'Failed to delete poster template.');
  }

  const data = await res.json();
  if (Array.isArray(data.templates || data.posters)) {
    return (data.templates || data.posters).map(posterRecordToTemplate);
  }

  return fetchAllPosterTemplates();
}

/**
 * Purges all archived poster templates.
 */
export async function purgeInactivePosterTemplates(): Promise<PosterTemplate[]> {
  const res = await fetch('/api/posters/purge-archived', { 
    method: 'POST',
    headers: getAuthHeaders()
  });

  if (res.ok) {
    const data = await res.json();
    if (Array.isArray(data.templates || data.posters)) {
      return (data.templates || data.posters).map(posterRecordToTemplate);
    }
  }

  return fetchAllPosterTemplates();
}

// ----------------------------------------------------
// ATTENDEE / SUBMISSION OPERATIONS (VIA SERVER API)
// ----------------------------------------------------

/**
 * Records an attendee submission or download directly to Supabase via Server API.
 * Deduplication is scoped strictly per poster_id.
 */
export async function recordAttendeeDownload(sub: {
  fullName: string;
  contact: string;
  status?: string;
  otherStatus?: string;
  posterImageUrl?: string;
  posterTemplateId?: string;
  posterId?: string;
  posterTemplateName?: string;
}): Promise<void> {
  const rawContact = (sub.contact || '').trim();
  const rawName = (sub.fullName || '').trim();
  const normContact = normalizeContact(rawContact);
  const targetPosterId = sub.posterId || sub.posterTemplateId || 'utq-20th-anniversary-default';

  try {
    const res = await fetch('/api/attendees/log-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: rawName,
        contact: rawContact,
        contactNormalized: normContact,
        status: sub.status || 'Attendee',
        otherStatus: sub.otherStatus,
        posterImageUrl: sub.posterImageUrl,
        posterId: targetPosterId,
        posterTemplateId: targetPosterId,
        posterTemplateName: sub.posterTemplateName
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn('Attendee download log response error:', errData);
    }
  } catch (err) {
    console.warn('Server API submission log error:', err);
  }
}

export function saveLocalSubmission(sub: LocalSubmission): void {
  recordAttendeeDownload({
    fullName: sub.fullName,
    contact: sub.contact,
    status: sub.status,
    otherStatus: sub.otherStatus,
    posterImageUrl: sub.posterImageUrl,
    posterId: sub.posterId || sub.posterTemplateId,
    posterTemplateName: sub.posterTemplateName
  }).catch(() => {});
}

/**
 * Fetches all attendees/submissions from Supabase via Server API (optionally filtered by poster).
 */
export async function fetchAllAttendees(posterId?: string): Promise<LocalSubmission[]> {
  try {
    const url = posterId && posterId !== 'all' 
      ? `/api/attendees?posterId=${encodeURIComponent(posterId)}&t=${Date.now()}`
      : `/api/attendees?t=${Date.now()}`;

    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const list = data.submissions || data.attendees;
      if (Array.isArray(list)) {
        return list.map((d: any) => ({
          id: String(d.id),
          posterId: d.posterId || d.poster_template_id || d.poster_id || 'utq-20th-anniversary-default',
          posterTemplateId: d.posterTemplateId || d.poster_template_id || d.poster_id || 'utq-20th-anniversary-default',
          fullName: d.fullName || d.full_name || 'Attendee',
          contact: d.contact || '',
          contactNormalized: d.contactNormalized || d.contact_normalized || normalizeContact(d.contact || ''),
          status: d.status || d.role || 'Attendee',
          otherStatus: d.otherStatus || d.other_role || '',
          posterImageUrl: d.posterImageUrl || d.poster_url || d.poster_image_url || '',
          posterTemplateName: d.posterTemplateName || d.poster_template_name,
          downloadCount: Number(d.downloadCount || d.download_count) || 1,
          lastDownloadedAt: d.lastDownloadedAt || d.last_downloaded_at || d.createdAt || d.created_at,
          createdAt: d.createdAt || d.created_at || new Date().toISOString(),
          updatedAt: d.updatedAt || d.updated_at
        }));
      }
    }
  } catch (err) {
    console.warn('Error fetching attendees from API:', err);
  }

  return [];
}

/**
 * Deletes an attendee submission from Supabase via Server API.
 */
export async function deleteAttendee(id: string): Promise<void> {
  const res = await fetch(`/api/attendees/${encodeURIComponent(id)}`, { 
    method: 'DELETE',
    headers: getAuthHeaders()
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error || 'Failed to delete attendee record.');
  }
}

// ----------------------------------------------------
// APP SETTINGS OPERATIONS (STORE & THANK YOU NOTE)
// ----------------------------------------------------
export async function fetchAppSettings(): Promise<AppSettings> {
  try {
    const res = await fetch(`/api/settings?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.settings) return data.settings;
    }
  } catch (err) {
    console.warn('Error fetching app settings from API:', err);
  }

  return DEFAULT_APP_SETTINGS;
}

export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(settings)
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error || 'Failed to save app settings.');
  }

  const data = await res.json();
  return data.settings || settings;
}

// ----------------------------------------------------
// ADMIN PROFILES & RBAC (VIA SERVER API)
// ----------------------------------------------------
export async function fetchAdminProfileByEmail(email: string): Promise<AdminProfile | null> {
  const cleanEmail = email.trim().toLowerCase();

  // Master Admin direct check
  if (isMasterAdmin(cleanEmail)) {
    return {
      id: 'master-admin-1',
      email: cleanEmail,
      status: 'approved',
      is_master: true,
      created_at: '2026-08-26T00:00:00.000Z',
      approved_at: '2026-08-26T00:00:00.000Z'
    };
  }

  try {
    const res = await fetch(`/api/admin-profiles?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.admins)) {
        const found = data.admins.find((a: AdminProfile) => a.email.toLowerCase() === cleanEmail);
        if (found) return found;
      }
    }
  } catch (err) {
    console.warn('Error fetching admin profile from API:', err);
  }

  return null;
}

export async function fetchAllAdminProfiles(): Promise<AdminProfile[]> {
  try {
    const res = await fetch(`/api/admin-profiles?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.admins)) {
        return data.admins.map((d: any) => ({
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
    console.warn('Error fetching all admin profiles from API:', err);
  }

  return [
    {
      id: 'master-admin-1',
      email: MASTER_ADMIN_EMAIL,
      status: 'approved',
      is_master: true,
      created_at: '2026-08-26T00:00:00.000Z',
      approved_at: '2026-08-26T00:00:00.000Z'
    }
  ];
}

export async function requestAdminAccess(email: string): Promise<AdminProfile> {
  const cleanEmail = email.trim().toLowerCase();
  const isMaster = isMasterAdmin(cleanEmail);

  try {
    const res = await fetch('/api/admin-profiles/request', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ email: cleanEmail })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.admin) return data.admin;
    }
  } catch (err) {
    console.warn('Error requesting admin access:', err);
  }

  return {
    id: `adm-${Date.now()}`,
    email: cleanEmail,
    status: isMaster ? 'approved' : 'pending',
    is_master: isMaster,
    created_at: new Date().toISOString(),
    approved_at: isMaster ? new Date().toISOString() : undefined
  };
}

export async function updateAdminStatus(email: string, status: 'approved' | 'rejected'): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (isMasterAdmin(cleanEmail)) return; // Guard master admin

  const res = await fetch('/api/admin-profiles/status', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ email: cleanEmail, status })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error || 'Failed to update admin status.');
  }
}
