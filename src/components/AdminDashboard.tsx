import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Lock, 
  Mail, 
  Search, 
  Download, 
  RefreshCw, 
  ArrowLeft, 
  Users, 
  FileSpreadsheet,
  FileText,
  Eye,
  X,
  CheckCircle,
  AlertCircle,
  Clock,
  UserCheck,
  UserX,
  Layers,
  ChevronDown,
  LayoutDashboard,
  ShoppingBag,
  HeartHandshake,
  Plus,
  Trash2,
  Edit2,
  Phone,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Check,
  Upload,
  ZoomIn,
  ZoomOut,
  Move,
  RotateCcw,
  Sliders,
  Image as ImageIcon,
  DollarSign,
  Folder,
  FolderOpen,
  CheckCircle2,
  Trash,
  SlidersHorizontal,
  ExternalLink
} from 'lucide-react';
import { 
  supabase, 
  isSupabaseConfigured, 
  fetchAllAttendees,
  deleteAttendee,
  fetchAllPosterTemplates,
  fetchAdminProfileByEmail,
  fetchAllAdminProfiles,
  requestAdminAccess,
  updateAdminStatus,
  fetchActivePosterTemplate,
  fetchAppSettings,
  saveAppSettings,
  verifyMasterAdminCredentials,
  changeMasterAdminKey,
  MASTER_ADMIN_EMAIL,
  isMasterAdmin,
  type AdminProfile,
  type LocalSubmission 
} from '../lib/supabase';
import { STATUS_OPTIONS } from '../lib/utils';
import { exportToExcel, exportToPDF } from '../lib/exportUtils';
import { PosterConfigurator } from './PosterConfigurator';
import { type PosterTemplate } from '../lib/canvasUtils';
import { type AppSettings, type MerchandiseProduct, DEFAULT_APP_SETTINGS } from '../types';
import { DottedLoader } from './DottedLoader';

export interface AttendeeRecord {
  id: string;
  fullName: string;
  contact: string;
  contactNormalized?: string;
  role: string;
  otherRole?: string;
  posterUrl?: string;
  posterTemplateId?: string;
  posterTemplateName?: string;
  downloadCount?: number;
  lastDownloadedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

interface AdminDashboardProps {
  onBack: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  // Auth state
  const [currentUser, setCurrentUser] = useState<AdminProfile | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'request'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState<{ type: 'error' | 'pending' | 'success'; text: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'attendees' | 'poster' | 'settings' | 'admins'>('attendees');

  // Data states
  const [attendees, setAttendees] = useState<AttendeeRecord[]>([]);
  const [posterTemplates, setPosterTemplates] = useState<PosterTemplate[]>([]);
  const [adminProfiles, setAdminProfiles] = useState<AdminProfile[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<PosterTemplate | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Folder Filtering state ('all' or template.id)
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');

  // Delete attendee confirmation state
  const [attendeeToDelete, setAttendeeToDelete] = useState<AttendeeRecord | null>(null);
  const [isDeletingAttendee, setIsDeletingAttendee] = useState(false);

  // Master Admin Security Key Management State
  const [currMasterPass, setCurrMasterPass] = useState('');
  const [newMasterPass, setNewMasterPass] = useState('');
  const [confirmMasterPass, setConfirmMasterPass] = useState('');
  const [masterPassLoading, setMasterPassLoading] = useState(false);
  const [masterPassMsg, setMasterPassMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Product modal state
  const [editingProduct, setEditingProduct] = useState<MerchandiseProduct | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [imageUploadLoading, setImageUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag pan state for product image crop/axis positioning
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; initialOffsetX: number; initialOffsetY: number }>({ x: 0, y: 0, initialOffsetX: 0, initialOffsetY: 0 });

  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name' | 'downloads'>('newest');
  const [previewPoster, setPreviewPoster] = useState<{ url: string; name: string } | null>(null);

  // Check existing session
  useEffect(() => {
    const sessionEmail = sessionStorage.getItem('utq_admin_email');
    if (sessionEmail) {
      fetchAdminProfileByEmail(sessionEmail).then(profile => {
        if (profile && profile.status === 'approved') {
          setCurrentUser(profile);
        }
      });
    }
  }, []);

  // Fetch attendees, templates, admin profiles, and app settings
  const loadData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      // 1. Fetch active template & all templates for folders
      const [currentActive, allTemplates, currentSettings, allAttendees] = await Promise.all([
        fetchActivePosterTemplate(),
        fetchAllPosterTemplates(),
        fetchAppSettings(),
        fetchAllAttendees()
      ]);

      setActiveTemplate(currentActive);
      setPosterTemplates(allTemplates);
      setSettings(currentSettings);

      // 2. Map all attendees with template name resolution & deduplication details
      const templateMap = new Map<string, string>();
      allTemplates.forEach(t => {
        templateMap.set(t.id, t.name);
      });

      const mappedRecords: AttendeeRecord[] = allAttendees.map(item => {
        const resolvedTemplateName = item.posterTemplateName || 
          (item.posterTemplateId ? templateMap.get(item.posterTemplateId) : undefined) || 
          (currentActive ? currentActive.name : '20th Anniversary');

        return {
          id: item.id,
          fullName: item.fullName,
          contact: item.contact,
          contactNormalized: item.contactNormalized,
          role: item.status || 'Attendee',
          otherRole: item.otherStatus,
          posterUrl: item.posterImageUrl || undefined,
          posterTemplateId: item.posterTemplateId,
          posterTemplateName: resolvedTemplateName,
          downloadCount: typeof item.downloadCount === 'number' ? item.downloadCount : 1,
          lastDownloadedAt: item.lastDownloadedAt || item.createdAt,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        };
      });

      setAttendees(mappedRecords);

      // 3. If Master Admin, fetch all admin profiles
      if (currentUser?.is_master) {
        const admins = await fetchAllAdminProfiles();
        setAdminProfiles(admins);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  // Periodic background auto-sync so newly downloaded attendees appear live
  useEffect(() => {
    if (!currentUser) return;
    loadData(false);

    const interval = setInterval(() => {
      loadData(true);
    }, 8000);

    return () => clearInterval(interval);
  }, [currentUser]);

  // Auth Handler: Sign In
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthMessage(null);

    const cleanEmail = email.trim().toLowerCase();

    try {
      if (isMasterAdmin(cleanEmail)) {
        const verifyRes = await verifyMasterAdminCredentials(cleanEmail, password);
        if (!verifyRes.success && verifyRes.error) {
          setAuthMessage({
            type: 'error',
            text: 'Invalid Master Admin password. Please check your master key password.'
          });
          return;
        }

        let profile = await fetchAdminProfileByEmail(cleanEmail);
        if (!profile || profile.status !== 'approved' || !profile.is_master) {
          profile = await requestAdminAccess(cleanEmail);
        }
        setCurrentUser(profile);
        sessionStorage.setItem('utq_admin_email', cleanEmail);
        sessionStorage.setItem('utq_master_key', password);
        return;
      }

      if (isSupabaseConfigured && supabase) {
        try {
          const { error } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: password
          });
          if (error) throw error;
        } catch {
          // Continue to email verification check
        }
      }

      const profile = await fetchAdminProfileByEmail(cleanEmail);

      if (!profile) {
        setAuthMessage({
          type: 'error',
          text: 'No administrator profile found for this email. Please request access first.'
        });
        return;
      }

      if (profile.status === 'pending') {
        setAuthMessage({
          type: 'pending',
          text: 'Your administrator request is currently pending Master Admin approval.'
        });
        return;
      }

      if (profile.status === 'rejected') {
        setAuthMessage({
          type: 'error',
          text: 'Access request was declined or revoked by the Master Administrator.'
        });
        return;
      }

      setCurrentUser(profile);
      sessionStorage.setItem('utq_admin_email', cleanEmail);
    } catch (err: any) {
      console.error('Login error:', err);
      setAuthMessage({
        type: 'error',
        text: err?.message || 'Failed to sign in. Please verify your credentials.'
      });
    } finally {
      setAuthLoading(false);
    }
  };

  // Auth Handler: Request Access
  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthMessage(null);

    const cleanEmail = email.trim().toLowerCase();

    try {
      const profile = await requestAdminAccess(cleanEmail);

      if (profile.is_master || profile.status === 'approved') {
        setCurrentUser(profile);
        sessionStorage.setItem('utq_admin_email', cleanEmail);
      } else {
        setAuthMessage({
          type: 'pending',
          text: 'Access request submitted successfully. Awaiting Master Admin approval.'
        });
      }
    } catch (err: any) {
      setAuthMessage({
        type: 'error',
        text: err?.message || 'Failed to submit access request.'
      });
    } finally {
      setAuthLoading(false);
    }
  };

  // Log Out
  const handleLogout = () => {
    sessionStorage.removeItem('utq_admin_email');
    sessionStorage.removeItem('utq_master_key');
    setCurrentUser(null);
    setEmail('');
    setPassword('');
    setAuthMessage(null);
  };

  // Change Master Admin Password / Key
  const handleChangeMasterPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMasterPass !== confirmMasterPass) {
      setMasterPassMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newMasterPass.length < 6) {
      setMasterPassMsg({ type: 'error', text: 'Password must be at least 6 characters long.' });
      return;
    }

    setMasterPassLoading(true);
    setMasterPassMsg(null);
    try {
      const res = await changeMasterAdminKey(currMasterPass, newMasterPass);
      if (res.success) {
        setMasterPassMsg({ type: 'success', text: 'Master Admin security key updated and permanently locked.' });
        setCurrMasterPass('');
        setNewMasterPass('');
        setConfirmMasterPass('');
        setTimeout(() => setMasterPassMsg(null), 4000);
      } else {
        setMasterPassMsg({ type: 'error', text: res.error || 'Failed to update Master Admin password.' });
      }
    } catch (err: any) {
      setMasterPassMsg({ type: 'error', text: err?.message || 'Failed to update Master Admin password.' });
    } finally {
      setMasterPassLoading(false);
    }
  };

  // Admin Approval Action (Master Admin only)
  const handleAdminApproval = async (targetEmail: string, status: 'approved' | 'rejected') => {
    try {
      await updateAdminStatus(targetEmail, status);
      setAdminProfiles(prev => prev.map(a => 
        a.email.toLowerCase() === targetEmail.toLowerCase()
          ? { ...a, status, approved_at: status === 'approved' ? new Date().toISOString() : null }
          : a
      ));
    } catch (err) {
      console.error('Failed to update admin status:', err);
    }
  };

  // Save Settings (Thank you note & CTA Store)
  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setSettingsSuccess(false);
    try {
      const saved = await saveAppSettings(settings);
      setSettings(saved);
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3500);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSettingsSaving(false);
    }
  };

  // Product Catalog Handlers
  const handleOpenAddProduct = () => {
    setEditingProduct({
      id: `prod-${Date.now()}`,
      name: '',
      description: '',
      price: '',
      imageUrl: '',
      inStock: true,
      zoom: 1,
      offsetX: 0,
      offsetY: 0
    });
    setIsProductModalOpen(true);
  };

  const handleSaveProductModal = () => {
    if (!editingProduct || !editingProduct.name.trim()) return;

    setSettings(prev => {
      const products = prev.callToAction.products || [];
      const idx = products.findIndex(p => p.id === editingProduct.id);
      let updated;
      if (idx >= 0) {
        updated = products.map(p => p.id === editingProduct.id ? editingProduct : p);
      } else {
        updated = [...products, editingProduct];
      }
      return {
        ...prev,
        callToAction: {
          ...prev.callToAction,
          products: updated
        }
      };
    });

    setIsProductModalOpen(false);
    setEditingProduct(null);
  };

  const handleDeleteProduct = (productId: string) => {
    setSettings(prev => ({
      ...prev,
      callToAction: {
        ...prev.callToAction,
        products: prev.callToAction.products.filter(p => p.id !== productId)
      }
    }));
  };

  // Image Upload handler for merchandise
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingProduct) return;

    setImageUploadLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setEditingProduct({
        ...editingProduct,
        imageUrl: result
      });
      setImageUploadLoading(false);
    };
    reader.onerror = () => {
      setImageUploadLoading(false);
    };
    reader.readAsDataURL(file);
  };

  // Interactive Pan / Drag handlers for merchandise image framing
  const handleImageMouseDown = (e: React.MouseEvent) => {
    if (!editingProduct) return;
    setIsDraggingImage(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialOffsetX: editingProduct.offsetX || 0,
      initialOffsetY: editingProduct.offsetY || 0
    };
  };

  const handleImageMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingImage || !editingProduct) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    // Sensitivity factor (convert pixels to % offset)
    const factor = 0.4;
    const newOffsetX = Math.max(-100, Math.min(100, Math.round(dragStartRef.current.initialOffsetX + (dx * factor))));
    const newOffsetY = Math.max(-100, Math.min(100, Math.round(dragStartRef.current.initialOffsetY + (dy * factor))));

    setEditingProduct({
      ...editingProduct,
      offsetX: newOffsetX,
      offsetY: newOffsetY
    });
  };

  const handleImageMouseUp = () => {
    setIsDraggingImage(false);
  };

  // Filter and sort attendees
  const filteredAttendees = attendees
    .filter(a => {
      // 1. Poster Folder filtering
      if (selectedFolderId !== 'all') {
        const matchesFolder = 
          a.posterTemplateId === selectedFolderId || 
          (posterTemplates.find(t => t.id === selectedFolderId)?.name && 
           a.posterTemplateName?.toLowerCase() === posterTemplates.find(t => t.id === selectedFolderId)?.name.toLowerCase());
        if (!matchesFolder) return false;
      }

      // 2. Search query filtering
      const query = searchQuery.toLowerCase().trim();
      if (query) {
        const matchesSearch = 
          a.fullName.toLowerCase().includes(query) ||
          a.contact.toLowerCase().includes(query) ||
          a.role.toLowerCase().includes(query) ||
          (a.otherRole && a.otherRole.toLowerCase().includes(query)) ||
          (a.posterTemplateName && a.posterTemplateName.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      // 3. Role filter
      const matchesRole = selectedRole === 'all' || a.role === selectedRole;
      return matchesRole;
    })
    .sort((a, b) => {
      if (sortOrder === 'newest') {
        const timeA = new Date(a.lastDownloadedAt || a.createdAt).getTime();
        const timeB = new Date(b.lastDownloadedAt || b.createdAt).getTime();
        return timeB - timeA;
      }
      if (sortOrder === 'oldest') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortOrder === 'name') {
        return a.fullName.localeCompare(b.fullName);
      }
      if (sortOrder === 'downloads') {
        return (b.downloadCount || 1) - (a.downloadCount || 1);
      }
      return 0;
    });

  // Export handlers (respects active folder filter)
  const currentFolderName = selectedFolderId === 'all' 
    ? (activeTemplate?.name || 'UTQ 20th Anniversary')
    : (posterTemplates.find(t => t.id === selectedFolderId)?.name || 'Event Folder');

  const handleExportExcel = () => {
    const dataToExport = filteredAttendees.length > 0 ? filteredAttendees : attendees;
    exportToExcel(dataToExport, currentFolderName);
  };

  const handleExportPDF = () => {
    const dataToExport = filteredAttendees.length > 0 ? filteredAttendees : attendees;
    exportToPDF(dataToExport, currentFolderName);
  };

  // Delete attendee handler
  const handleConfirmDeleteAttendee = async () => {
    if (!attendeeToDelete) return;
    setIsDeletingAttendee(true);
    try {
      await deleteAttendee(attendeeToDelete.id);
      setAttendees(prev => prev.filter(a => a.id !== attendeeToDelete.id));
      setAttendeeToDelete(null);
    } catch (err) {
      console.error('Failed to delete attendee:', err);
    } finally {
      setIsDeletingAttendee(false);
    }
  };

  // ==========================================
  // VIEW: UNAPPROVED / LOGIN INTERFACE
  // ==========================================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={onBack}
              className="text-xs font-medium text-slate-400 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
            >
              <ArrowLeft size={14} /> Back to Website
            </button>
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
              <Shield size={20} />
            </div>
          </div>

          <h2 className="text-xl font-bold text-white mb-1.5">
            {authMode === 'signin' ? 'Administrator Login' : 'Request Admin Access'}
          </h2>
          <p className="text-xs text-slate-400 mb-6">
            {authMode === 'signin'
              ? 'Sign in with your authorized administrator credentials.'
              : 'Submit an administrator request for Master Admin approval.'}
          </p>

          {/* Form */}
          <form onSubmit={authMode === 'signin' ? handleSignIn : handleRequestAccess} className="space-y-4">
            <div>
              <label htmlFor="admin-email-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <input
                  id="admin-email-input"
                  type="email"
                  required
                  autoFocus
                  placeholder="creationsdevelopment2026@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 outline-none focus:border-[#DEA303] text-sm transition"
                />
                <Mail size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password-input"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 outline-none focus:border-[#DEA303] text-sm transition"
                />
                <Lock size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
              </div>
            </div>

            {/* Auth status messages */}
            {authMessage && (
              <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                authMessage.type === 'error'
                  ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                  : authMessage.type === 'pending'
                  ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
              }`}>
                {authMessage.type === 'error' && <AlertCircle size={15} className="shrink-0 mt-0.5" />}
                {authMessage.type === 'pending' && <Clock size={15} className="shrink-0 mt-0.5" />}
                {authMessage.type === 'success' && <CheckCircle size={15} className="shrink-0 mt-0.5" />}
                <span>{authMessage.text}</span>
              </div>
            )}

            <button
              id="btn-admin-auth-submit"
              type="submit"
              disabled={authLoading}
              className="w-full py-3 bg-[#DEA303] hover:bg-[#c99302] text-slate-950 font-bold rounded-xl text-sm transition shadow flex items-center justify-center gap-2 disabled:opacity-50 mt-2 cursor-pointer"
            >
              {authLoading ? (
                <div className="flex items-center gap-2">
                  <DottedLoader size="sm" color="#020617" />
                  <span>Verifying...</span>
                </div>
              ) : (
                <span>{authMode === 'signin' ? 'Sign In as Administrator' : 'Submit Access Request'}</span>
              )}
            </button>

            {/* Toggle auth mode */}
            <div className="text-center pt-3 border-t border-slate-800">
              {authMode === 'signin' ? (
                <p className="text-xs text-slate-400">
                  Need access?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('request');
                      setAuthMessage(null);
                    }}
                    className="text-amber-400 hover:underline font-semibold cursor-pointer"
                  >
                    Request Administrator Access
                  </button>
                </p>
              ) : (
                <p className="text-xs text-slate-400">
                  Already have access?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signin');
                      setAuthMessage(null);
                    }}
                    className="text-amber-400 hover:underline font-semibold cursor-pointer"
                  >
                    Sign In
                  </button>
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: MAIN ADMIN DASHBOARD
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Return to Public Website"
            >
              <ArrowLeft size={18} />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">Event Administration</h1>
                {currentUser.is_master ? (
                  <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                    Master Admin
                  </span>
                ) : (
                  <span className="bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate max-w-xs">{currentUser.email}</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full md:w-auto overflow-x-auto">
            <button
              id="tab-admin-dashboard"
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard size={14} /> Dashboard
            </button>

            <button
              id="tab-admin-attendees"
              onClick={() => setActiveTab('attendees')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'attendees'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users size={14} /> Attendees ({attendees.length})
            </button>

            <button
              id="tab-admin-poster"
              onClick={() => setActiveTab('poster')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'poster'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers size={14} /> Poster Configurator
            </button>

            <button
              id="tab-admin-settings"
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShoppingBag size={14} /> Store & Thank You
            </button>

            {currentUser.is_master && (
              <button
                id="tab-admin-profiles"
                onClick={() => setActiveTab('admins')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  activeTab === 'admins'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Shield size={14} /> Administrators
              </button>
            )}

            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition ml-auto shrink-0 cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Master Admin Permanent Authority Banner */}
      {currentUser.is_master && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 sm:px-8 py-2.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5 text-amber-300 font-medium">
              <Shield size={16} className="text-[#DEA303] shrink-0" />
              <span>
                <strong className="text-amber-200">Master Admin Key Active:</strong> All changes to posters, merchandise, and site settings are permanently locked with your Master Password. The system will never revert or reset.
              </span>
            </div>
            <span className="text-[11px] text-amber-400 font-mono bg-amber-500/20 px-2.5 py-1 rounded-full border border-amber-500/30 font-semibold">
              🔒 Master Key Protected
            </span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* =========================================
            TAB 1: OVERVIEW DASHBOARD
        ========================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">Total Registered</span>
                  <Users className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">{attendees.length}</div>
                <p className="text-[11px] text-slate-500 mt-1">Confirmed participants</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">Posters Generated</span>
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">
                  {attendees.filter(a => a.posterUrl).length}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Badge downloads completed</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">Store Products</span>
                  <ShoppingBag className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">
                  {settings.callToAction.products?.length || 0}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Store Status: {settings.callToAction.enabled ? 'Active' : 'Disabled'}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">Active Template</span>
                  <Layers className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-sm font-bold text-white mt-2 truncate">
                  {activeTemplate?.name || 'Default Poster'}
                </div>
                <p className="text-[11px] text-emerald-400 mt-1">Live Global Template</p>
              </div>
            </div>

            {/* Quick Actions & Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h4 className="text-sm font-bold text-white mb-3">Quick Navigation</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setActiveTab('attendees')}
                    className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition cursor-pointer"
                  >
                    <Users size={18} className="text-amber-400 mb-2" />
                    <p className="text-xs font-bold text-white">Attendee Directory</p>
                    <p className="text-[10px] text-slate-400">Export PDF & Excel</p>
                  </button>

                  <button
                    onClick={() => setActiveTab('settings')}
                    className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition cursor-pointer"
                  >
                    <ShoppingBag size={18} className="text-purple-400 mb-2" />
                    <p className="text-xs font-bold text-white">Merchandise Store</p>
                    <p className="text-[10px] text-slate-400">Edit items, crop & zoom</p>
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h4 className="text-sm font-bold text-white mb-3">Live System Status</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Server Synchronization:</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      Real-Time Active
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Thank You Note:</span>
                    <span className={settings.thankYouNote.enabled ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                      {settings.thankYouNote.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-400">Store Order Hotline:</span>
                    <span className="text-amber-400 font-mono font-semibold">{settings.callToAction.phoneNumber}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================
            TAB 2: ATTENDEES DIRECTORY & POSTER FOLDERS
        ========================================== */}
        {activeTab === 'attendees' && (
          <div className="space-y-6">
            {/* Poster Event Folders Section Header */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Folder className="w-4 h-4 text-amber-400" />
                    <span>Event & Poster Folders</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Attendees and download records are categorized by poster event to prevent mix-ups during multi-poster campaigns.
                  </p>
                </div>
                <div className="text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 font-mono">
                  Active Folder: <span className="text-amber-400 font-semibold">{currentFolderName}</span>
                </div>
              </div>

              {/* Folder Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* "All Folders" Master Card */}
                <button
                  type="button"
                  onClick={() => setSelectedFolderId('all')}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                    selectedFolderId === 'all'
                      ? 'bg-amber-500/10 border-amber-500/40 shadow-xs'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderOpen className={`w-4 h-4 ${selectedFolderId === 'all' ? 'text-amber-400' : 'text-slate-400'}`} />
                      <span className="text-xs font-bold text-white">All Event Folders</span>
                    </div>
                    {selectedFolderId === 'all' && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-white">{attendees.length}</span>
                    <span className="text-[11px] text-slate-400">
                      {attendees.reduce((acc, a) => acc + (a.downloadCount || 1), 0)} downloads
                    </span>
                  </div>
                </button>

                {/* Specific Template Folders */}
                {posterTemplates.map(tmpl => {
                  const folderAttendees = attendees.filter(a => 
                    a.posterTemplateId === tmpl.id || 
                    a.posterTemplateName?.toLowerCase() === tmpl.name.toLowerCase()
                  );
                  const folderDownloads = folderAttendees.reduce((acc, a) => acc + (a.downloadCount || 1), 0);
                  const isSelected = selectedFolderId === tmpl.id;

                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => setSelectedFolderId(tmpl.id)}
                      className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/40 shadow-xs'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex items-center gap-2 truncate">
                          <Folder className={`w-4 h-4 shrink-0 ${isSelected ? 'text-amber-400' : 'text-blue-400'}`} />
                          <span className="text-xs font-bold text-white truncate" title={tmpl.name}>
                            {tmpl.name}
                          </span>
                        </div>
                        {tmpl.is_active && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold uppercase tracking-wider shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-lg font-bold text-white">{folderAttendees.length}</span>
                        <span className="text-[11px] text-slate-400">
                          {folderDownloads} downloads
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div className="flex flex-wrap items-center gap-2.5 flex-1">
                {/* Search input */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    id="search-attendees-input"
                    type="text"
                    placeholder="Search name, contact, role, or poster..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-[#DEA303]"
                  />
                </div>

                {/* Folder filter dropdown */}
                <select
                  id="filter-folder-select"
                  value={selectedFolderId}
                  onChange={(e) => setSelectedFolderId(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-300 outline-none focus:border-[#DEA303] font-medium"
                >
                  <option value="all">📁 All Folders ({attendees.length})</option>
                  {posterTemplates.map(tmpl => {
                    const count = attendees.filter(a => 
                      a.posterTemplateId === tmpl.id || 
                      a.posterTemplateName?.toLowerCase() === tmpl.name.toLowerCase()
                    ).length;
                    return (
                      <option key={tmpl.id} value={tmpl.id}>
                        📁 {tmpl.name} ({count})
                      </option>
                    );
                  })}
                </select>

                {/* Role filter */}
                <select
                  id="filter-role-select"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-[#DEA303]"
                >
                  <option value="all">All Roles</option>
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>

                {/* Sort selector */}
                <select
                  id="sort-attendees-select"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-[#DEA303]"
                >
                  <option value="newest">Sort: Recent Downloads</option>
                  <option value="oldest">Sort: Oldest Registered</option>
                  <option value="name">Sort: Name (A-Z)</option>
                  <option value="downloads">Sort: Most Downloads</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  id="btn-refresh-attendees"
                  onClick={() => loadData(false)}
                  disabled={loading}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer"
                  title="Sync latest attendees & downloads"
                >
                  {loading ? <DottedLoader size="sm" color="#DEA303" /> : <RefreshCw size={15} />}
                </button>

                <button
                  id="btn-export-excel"
                  onClick={handleExportExcel}
                  className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title={`Export ${currentFolderName} attendees to Excel`}
                >
                  <FileSpreadsheet size={14} /> Export Excel
                </button>

                <button
                  id="btn-export-pdf"
                  onClick={handleExportPDF}
                  className="px-3.5 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title={`Export ${currentFolderName} attendees to PDF`}
                >
                  <FileText size={14} /> Export PDF
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/90 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3.5">Full Name</th>
                      <th className="px-4 py-3.5">Contact Number</th>
                      <th className="px-4 py-3.5">Designation / Role</th>
                      <th className="px-4 py-3.5">Poster Folder</th>
                      <th className="px-4 py-3.5 text-center">Downloads</th>
                      <th className="px-4 py-3.5">Registered On</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-16 text-center">
                          <DottedLoader size="lg" color="#DEA303" label="Loading attendee records..." />
                        </td>
                      </tr>
                    ) : filteredAttendees.length > 0 ? (
                      filteredAttendees.map((att) => (
                        <tr key={att.id} className="hover:bg-slate-800/40 transition">
                          <td className="px-4 py-3.5 font-semibold text-white">
                            {att.fullName}
                          </td>
                          <td className="px-4 py-3.5 font-mono text-xs text-slate-300">
                            {att.contact ? (
                              <a 
                                href={`tel:${att.contact}`} 
                                className="text-slate-300 hover:text-amber-300 transition flex items-center gap-1"
                              >
                                <Phone size={11} className="text-slate-500" />
                                {att.contact}
                              </a>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-block bg-slate-800 text-slate-200 border border-slate-700 text-[11px] px-2.5 py-0.5 rounded-full">
                              {att.role === 'Other' && att.otherRole
                                ? `Other: ${att.otherRole}`
                                : att.role}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[11px]">
                              <Folder size={10} />
                              <span className="truncate max-w-[140px]">{att.posterTemplateName || '20th Anniversary'}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            <span 
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-[11px]"
                              title={`Last downloaded: ${att.lastDownloadedAt ? new Date(att.lastDownloadedAt).toLocaleString() : 'N/A'}`}
                            >
                              <Sparkles size={10} />
                              {typeof att.downloadCount === 'number' ? att.downloadCount : 1}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-400 whitespace-nowrap">
                            {new Date(att.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </td>
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              {att.posterUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewPoster({ url: att.posterUrl!, name: att.fullName })}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-amber-300 rounded-lg transition border border-slate-700 font-medium cursor-pointer"
                                  title="View Generated Poster"
                                >
                                  <Eye size={12} /> View
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-600 mr-2">No Image</span>
                              )}

                              <button
                                type="button"
                                onClick={() => setAttendeeToDelete(att)}
                                className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer"
                                title="Remove attendee record"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                          No attendees found in {currentFolderName}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================
            TAB 3: DYNAMIC POSTER CONFIGURATION
        ========================================== */}
        {activeTab === 'poster' && (
          <PosterConfigurator
            onTemplateActivated={(t) => {
              setActiveTemplate(t);
            }}
          />
        )}

        {/* =========================================
            TAB 4: SETTINGS, THANK YOU NOTE & STORE CTA
        ========================================== */}
        {activeTab === 'settings' && (
          <div className="space-y-8">
            {/* Top Save Bar */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-amber-400" />
                  <span>Thank You Note & Merchandise Store Settings</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Configure the pre-download thank you message and post-registration merchandise call-to-action.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {settingsSuccess && (
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                    <Check size={14} /> Saved Globally!
                  </span>
                )}
                <button
                  type="button"
                  id="btn-save-app-settings"
                  onClick={handleSaveSettings}
                  disabled={settingsSaving}
                  className="px-5 py-2.5 bg-[#DEA303] hover:bg-[#c99302] text-slate-950 font-bold text-xs rounded-xl shadow transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {settingsSaving ? (
                    <>
                      <DottedLoader size="sm" color="#020617" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Save All Settings</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* SECTION 0: MASTER ADMIN KEY & SYSTEM PERMANENCE (Master Admin only) */}
            {currentUser.is_master && (
              <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-6 space-y-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-[#DEA303] to-amber-600" />
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      <Lock className="w-5 h-5 text-[#DEA303]" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        Master Admin Security Key & System Permanence
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 font-mono font-semibold">
                          Permanent Lock
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Posters, merchandise items, contact numbers, and thank-you notes saved by the Master Admin are permanently locked into the system. The site has no power to revert to any default or empty state.
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleChangeMasterPassword} className="space-y-4 max-w-2xl">
                  <p className="text-xs font-semibold text-slate-300">
                    Update Master Admin Password (Key to authorize all system changes):
                  </p>

                  {masterPassMsg && (
                    <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      masterPassMsg.type === 'success' 
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' 
                        : 'bg-red-500/10 text-red-300 border border-red-500/30'
                    }`}>
                      {masterPassMsg.type === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}
                      <span>{masterPassMsg.text}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                        Current Master Key
                      </label>
                      <input
                        type="password"
                        value={currMasterPass}
                        onChange={(e) => setCurrMasterPass(e.target.value)}
                        placeholder="Current password"
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 outline-none focus:border-[#DEA303] text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                        New Master Key
                      </label>
                      <input
                        type="password"
                        value={newMasterPass}
                        onChange={(e) => setNewMasterPass(e.target.value)}
                        placeholder="New password (min 6 chars)"
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 outline-none focus:border-[#DEA303] text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                        Confirm New Key
                      </label>
                      <input
                        type="password"
                        value={confirmMasterPass}
                        onChange={(e) => setConfirmMasterPass(e.target.value)}
                        placeholder="Re-type new password"
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 outline-none focus:border-[#DEA303] text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={masterPassLoading || !currMasterPass || !newMasterPass || !confirmMasterPass}
                      className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold text-xs rounded-xl transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {masterPassLoading ? (
                        <>
                          <DottedLoader size="sm" color="#f59e0b" />
                          <span>Updating Master Key...</span>
                        </>
                      ) : (
                        <>
                          <Lock size={13} />
                          <span>Update Master Password</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* SECTION 1: THANK YOU NOTE */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <HeartHandshake className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Thank You Note (Pre-Download)</h4>
                    <p className="text-xs text-slate-400">Displays right before the attendee downloads their generated poster badge.</p>
                  </div>
                </div>

                {/* Toggle On/Off */}
                <button
                  type="button"
                  id="toggle-thank-you-note"
                  onClick={() => setSettings(prev => ({
                    ...prev,
                    thankYouNote: {
                      ...prev.thankYouNote,
                      enabled: !prev.thankYouNote.enabled
                    }
                  }))}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    settings.thankYouNote.enabled
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {settings.thankYouNote.enabled ? (
                    <>
                      <ToggleRight className="w-5 h-5 text-emerald-400" />
                      <span>Note Active</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-5 h-5 text-slate-500" />
                      <span>Note Inactive</span>
                    </>
                  )}
                </button>
              </div>

              {settings.thankYouNote.enabled && (
                <div className="space-y-4 pt-2">
                  <div>
                    <label htmlFor="thank-you-title" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Thank You Title
                    </label>
                    <input
                      id="thank-you-title"
                      type="text"
                      value={settings.thankYouNote.title}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        thankYouNote: { ...prev.thankYouNote, title: e.target.value }
                      }))}
                      placeholder="Thank You for Registering!"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 outline-none focus:border-[#DEA303] text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="thank-you-message" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Thank You Message Body
                    </label>
                    <textarea
                      id="thank-you-message"
                      rows={3}
                      value={settings.thankYouNote.message}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        thankYouNote: { ...prev.thankYouNote, message: e.target.value }
                      }))}
                      placeholder="Type the message that attendees will see right before downloading..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 outline-none focus:border-[#DEA303] text-sm resize-none"
                    />
                  </div>

                  {/* Live Preview of Note */}
                  <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-left">
                    <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-1">Live Preview (As seen by attendee):</p>
                    <h5 className="text-base font-bold text-white">{settings.thankYouNote.title || 'Thank You!'}</h5>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">{settings.thankYouNote.message}</p>
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 2: CALL TO ACTION & MERCHANDISE STORE */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Call to Action / Merchandise Store</h4>
                    <p className="text-xs text-slate-400">Promotes merchandise after poster creation with one-click direct phone calls to the coordinator.</p>
                  </div>
                </div>

                {/* Toggle On/Off */}
                <button
                  type="button"
                  id="toggle-merchandise-cta"
                  onClick={() => setSettings(prev => ({
                    ...prev,
                    callToAction: {
                      ...prev.callToAction,
                      enabled: !prev.callToAction.enabled
                    }
                  }))}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    settings.callToAction.enabled
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {settings.callToAction.enabled ? (
                    <>
                      <ToggleRight className="w-5 h-5 text-emerald-400" />
                      <span>Store Active</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-5 h-5 text-slate-500" />
                      <span>Store Inactive</span>
                    </>
                  )}
                </button>
              </div>

              {settings.callToAction.enabled && (
                <div className="space-y-6 pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="cta-title" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Store Section Title
                      </label>
                      <input
                        id="cta-title"
                        type="text"
                        value={settings.callToAction.title}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          callToAction: { ...prev.callToAction, title: e.target.value }
                        }))}
                        placeholder="Official 20th Anniversary Merchandise"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 outline-none focus:border-[#DEA303] text-sm"
                      />
                    </div>

                    <div>
                      <label htmlFor="cta-phone" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Coordinator Phone Number (Auto-Dialed on Buy)
                      </label>
                      <div className="relative">
                        <input
                          id="cta-phone"
                          type="text"
                          value={settings.callToAction.phoneNumber}
                          onChange={(e) => setSettings(prev => ({
                            ...prev,
                            callToAction: { ...prev.callToAction, phoneNumber: e.target.value }
                          }))}
                          placeholder="+256 700 000 000"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 outline-none focus:border-[#DEA303] text-sm pl-10"
                        />
                        <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="cta-contact-person" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Contact Person / Desk Title
                      </label>
                      <input
                        id="cta-contact-person"
                        type="text"
                        value={settings.callToAction.contactPerson}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          callToAction: { ...prev.callToAction, contactPerson: e.target.value }
                        }))}
                        placeholder="Merchandise Desk / Coordinator"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 outline-none focus:border-[#DEA303] text-sm"
                      />
                    </div>

                    <div>
                      <label htmlFor="cta-subtitle" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Lead Subtitle
                      </label>
                      <input
                        id="cta-subtitle"
                        type="text"
                        value={settings.callToAction.subtitle}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          callToAction: { ...prev.callToAction, subtitle: e.target.value }
                        }))}
                        placeholder="Celebrate and support by ordering official items..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 outline-none focus:border-[#DEA303] text-sm"
                      />
                    </div>
                  </div>

                  {/* Product Catalog List */}
                  <div className="pt-4 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h5 className="text-sm font-bold text-white">Merchandise Product Catalog</h5>
                        <p className="text-xs text-slate-400">Full editing capabilities: Title, description, price, image upload, crop, zoom, and axis positioning.</p>
                      </div>
                      <button
                        type="button"
                        id="btn-add-product"
                        onClick={handleOpenAddProduct}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-bold rounded-xl transition border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Plus size={14} /> Add Product
                      </button>
                    </div>

                    {(settings.callToAction.products || []).length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(settings.callToAction.products || []).map((product) => {
                          const zoom = product.zoom || 1;
                          const offsetX = product.offsetX || 0;
                          const offsetY = product.offsetY || 0;

                          return (
                            <div 
                              key={product.id} 
                              className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition"
                            >
                              <div>
                                <div className="aspect-video w-full rounded-lg overflow-hidden bg-slate-900 mb-3 relative flex items-center justify-center">
                                  {product.imageUrl ? (
                                    <img 
                                      src={product.imageUrl} 
                                      alt={product.name}
                                      style={{
                                        transform: `scale(${zoom}) translate(${offsetX}%, ${offsetY}%)`,
                                        transformOrigin: 'center center'
                                      }}
                                      className="w-full h-full object-cover select-none pointer-events-none"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className="flex flex-col items-center justify-center text-slate-600 text-xs">
                                      <ImageIcon size={20} className="mb-1 text-slate-500" />
                                      <span>No Photo</span>
                                    </div>
                                  )}
                                  <div className="absolute top-2 right-2 flex items-center gap-1">
                                    {product.inStock === false && (
                                      <span className="px-2 py-0.5 rounded bg-red-600/90 text-white font-bold text-[10px] uppercase">
                                        Sold Out
                                      </span>
                                    )}
                                    {product.price && (
                                      <span className="px-2 py-0.5 rounded bg-black/80 text-amber-300 font-bold text-xs">
                                        {product.price}
                                      </span>
                                    )}
                                  </div>

                                  {(zoom !== 1 || offsetX !== 0 || offsetY !== 0) && (
                                    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-slate-900/80 text-[10px] text-slate-300 flex items-center gap-1">
                                      <Sliders size={10} className="text-amber-400" />
                                      <span>Zoom {zoom.toFixed(1)}x • ({offsetX}%, {offsetY}%)</span>
                                    </div>
                                  )}
                                </div>
                                <h6 className="font-bold text-white text-sm">{product.name || 'Untitled Product'}</h6>
                                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{product.description || 'No description provided.'}</p>
                              </div>

                              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                                <span className="text-xs font-mono text-amber-400">{product.price || 'Price on inquiry'}</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingProduct({
                                        ...product,
                                        zoom: product.zoom ?? 1,
                                        offsetX: product.offsetX ?? 0,
                                        offsetY: product.offsetY ?? 0,
                                        inStock: product.inStock !== false
                                      });
                                      setIsProductModalOpen(true);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                                    title="Edit full product details"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteProduct(product.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                                    title="Delete product"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-slate-950 rounded-xl border border-dashed border-slate-800">
                        <ShoppingBag className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="text-xs font-semibold text-slate-300">No merchandise items added yet</p>
                        <p className="text-[11px] text-slate-500 mt-1">Click "+ Add Product" above to add new event items.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================
            TAB 5: ADMINISTRATORS (Master Admin Only)
        ========================================== */}
        {activeTab === 'admins' && currentUser.is_master && (
          <div className="space-y-6">
            {/* Pending Requests */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Pending Access Requests</h3>
                </div>
                <span className="text-xs text-slate-400">
                  {adminProfiles.filter(a => a.status === 'pending').length} pending
                </span>
              </div>

              <div className="divide-y divide-slate-800">
                {adminProfiles.filter(a => a.status === 'pending').length > 0 ? (
                  adminProfiles.filter(a => a.status === 'pending').map(admin => (
                    <div key={admin.id} className="p-4 sm:px-5 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-white">{admin.email}</p>
                        <p className="text-xs text-slate-500">
                          Requested: {new Date(admin.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAdminApproval(admin.email, 'approved')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1 cursor-pointer"
                        >
                          <UserCheck size={13} /> Approve
                        </button>
                        <button
                          onClick={() => handleAdminApproval(admin.email, 'rejected')}
                          className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-semibold rounded-lg transition flex items-center gap-1 cursor-pointer"
                        >
                          <UserX size={13} /> Reject
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No pending administrator requests.
                  </div>
                )}
              </div>
            </div>

            {/* Approved & Active Administrators */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">Authorized Administrators</h3>
              </div>

              <div className="divide-y divide-slate-800">
                {adminProfiles.filter(a => a.status === 'approved').map(admin => (
                  <div key={admin.id} className="p-4 sm:px-5 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">{admin.email}</p>
                        {admin.is_master ? (
                          <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-semibold px-2 py-0.2 rounded-full">
                            Master Admin
                          </span>
                        ) : (
                          <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.2 rounded-full">
                            Regular Admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Authorized: {admin.approved_at ? new Date(admin.approved_at).toLocaleDateString() : 'Master Initial'}
                      </p>
                    </div>

                    {!admin.is_master && (
                      <button
                        onClick={() => handleAdminApproval(admin.email, 'rejected')}
                        className="text-xs text-slate-400 hover:text-red-400 transition cursor-pointer"
                      >
                        Revoke Access
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* =========================================================================
          ADVANCED MERCHANDISE PRODUCT EDIT MODAL WITH CROP, ZOOM & AXIS POSITION
      ========================================================================== */}
      {isProductModalOpen && editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 text-left shadow-2xl my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-amber-400" />
                <h4 className="font-bold text-white text-base">
                  {editingProduct.name ? 'Edit Merchandise Item & Image Framing' : 'Add New Merchandise Item'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsProductModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-5 max-h-[75vh] overflow-y-auto pr-1">
              {/* Product Basic Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Product Title / Name
                  </label>
                  <input
                    type="text"
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    placeholder="e.g. UTQ 20th Anniversary Gold Cap"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white text-sm outline-none focus:border-[#DEA303]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Price (with Currency)
                  </label>
                  <input
                    type="text"
                    value={editingProduct.price}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })}
                    placeholder="e.g. UGX 35,000 or $15"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white text-sm outline-none focus:border-[#DEA303]"
                  />
                </div>
              </div>

              {/* Stock Status & Description */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div>
                    <span className="text-xs font-semibold text-white block">Stock Availability</span>
                    <span className="text-[11px] text-slate-400">Toggle whether this merchandise item is currently in stock.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingProduct({ ...editingProduct, inStock: !editingProduct.inStock })}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      editingProduct.inStock !== false
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {editingProduct.inStock !== false ? (
                      <>
                        <Check size={12} /> In Stock
                      </>
                    ) : (
                      <>
                        <X size={12} /> Sold Out
                      </>
                    )}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={editingProduct.description}
                    onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                    placeholder="Brief details about material, colors, or sizes..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white text-sm outline-none focus:border-[#DEA303] resize-none"
                  />
                </div>
              </div>

              {/* Product Image Source (Upload File or URL) */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon size={14} className="text-amber-400" />
                    Product Image Source
                  </span>

                  {/* Hidden File Input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageFileUpload}
                    accept="image/*"
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageUploadLoading}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {imageUploadLoading ? (
                      <DottedLoader size="sm" color="#DEA303" />
                    ) : (
                      <>
                        <Upload size={13} />
                        <span>Upload Custom Photo</span>
                      </>
                    )}
                  </button>
                </div>

                <div>
                  <input
                    type="text"
                    value={editingProduct.imageUrl}
                    onChange={(e) => setEditingProduct({ ...editingProduct, imageUrl: e.target.value })}
                    placeholder="https://... (or upload image above)"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-[#DEA303]"
                  />
                </div>
              </div>

              {/* Interactive Live Image Crop, Zoom & Axis (X / Y) Positioning */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Sliders size={14} className="text-amber-400" />
                      Image Crop, Zoom & Position (X / Y Axis)
                    </span>
                    <span className="text-[11px] text-slate-400">Click & drag the preview image or adjust sliders below.</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditingProduct({
                      ...editingProduct,
                      zoom: 1,
                      offsetX: 0,
                      offsetY: 0
                    })}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs rounded-lg border border-slate-800 flex items-center gap-1 transition cursor-pointer"
                    title="Reset framing to centered default"
                  >
                    <RotateCcw size={12} /> Reset Framing
                  </button>
                </div>

                {/* Live Interactive Viewport */}
                <div 
                  className={`relative aspect-4/3 w-full max-w-sm mx-auto rounded-xl overflow-hidden bg-black border border-slate-700 ${
                    editingProduct.imageUrl ? (isDraggingImage ? 'cursor-grabbing ring-2 ring-amber-400' : 'cursor-grab') : 'cursor-default'
                  }`}
                  onMouseDown={editingProduct.imageUrl ? handleImageMouseDown : undefined}
                  onMouseMove={editingProduct.imageUrl ? handleImageMouseMove : undefined}
                  onMouseUp={editingProduct.imageUrl ? handleImageMouseUp : undefined}
                  onMouseLeave={editingProduct.imageUrl ? handleImageMouseUp : undefined}
                >
                  <div className="w-full h-full flex items-center justify-center overflow-hidden pointer-events-none">
                    {editingProduct.imageUrl ? (
                      <img 
                        src={editingProduct.imageUrl} 
                        alt="Product Framing Preview"
                        style={{
                          transform: `scale(${editingProduct.zoom || 1}) translate(${editingProduct.offsetX || 0}%, ${editingProduct.offsetY || 0}%)`,
                          transformOrigin: 'center center'
                        }}
                        className="w-full h-full object-cover select-none"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-6 text-center text-slate-500">
                        <ImageIcon size={32} className="text-slate-600 mb-2" />
                        <p className="text-xs font-semibold text-slate-400">No Image Uploaded Yet</p>
                        <p className="text-[11px] text-slate-600 mt-1">Upload a photo or paste a URL above to preview and adjust framing.</p>
                      </div>
                    )}
                  </div>

                  {/* Framing Grid Overlay */}
                  {editingProduct.imageUrl && (
                    <>
                      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none border border-amber-400/20">
                        <div className="border-r border-b border-white/10"></div>
                        <div className="border-r border-b border-white/10"></div>
                        <div className="border-b border-white/10"></div>
                        <div className="border-r border-b border-white/10"></div>
                        <div className="border-r border-b border-white/10"></div>
                        <div className="border-b border-white/10"></div>
                        <div className="border-r border-white/10"></div>
                        <div className="border-r border-white/10"></div>
                        <div></div>
                      </div>

                      <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/80 text-[10px] text-amber-300 font-mono pointer-events-none">
                        Zoom: {(editingProduct.zoom || 1).toFixed(2)}x | X: {editingProduct.offsetX || 0}% | Y: {editingProduct.offsetY || 0}%
                      </div>
                    </>
                  )}
                </div>

                {/* Controls Sliders */}
                <div className="space-y-3 pt-2">
                  {/* Zoom Slider */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400 flex items-center gap-1">
                        <ZoomIn size={12} className="text-amber-400" /> Zoom Level:
                      </span>
                      <span className="text-white font-mono font-bold">
                        {Math.round((editingProduct.zoom || 1) * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingProduct({
                          ...editingProduct,
                          zoom: Math.max(1, ((editingProduct.zoom || 1) - 0.1))
                        })}
                        className="p-1 rounded bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                      >
                        <ZoomOut size={14} />
                      </button>
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.05"
                        value={editingProduct.zoom || 1}
                        onChange={(e) => setEditingProduct({
                          ...editingProduct,
                          zoom: parseFloat(e.target.value)
                        })}
                        className="flex-1 accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() => setEditingProduct({
                          ...editingProduct,
                          zoom: Math.min(3, ((editingProduct.zoom || 1) + 0.1))
                        })}
                        className="p-1 rounded bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                      >
                        <ZoomIn size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Horizontal Position (X-Axis) */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Move size={12} className="text-blue-400" /> Horizontal Position (X-Axis):
                      </span>
                      <span className="text-white font-mono font-bold">
                        {editingProduct.offsetX || 0}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      step="1"
                      value={editingProduct.offsetX || 0}
                      onChange={(e) => setEditingProduct({
                        ...editingProduct,
                        offsetX: parseInt(e.target.value, 10)
                      })}
                      className="w-full accent-blue-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Vertical Position (Y-Axis) */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Move size={12} className="text-emerald-400" /> Vertical Position (Y-Axis):
                      </span>
                      <span className="text-white font-mono font-bold">
                        {editingProduct.offsetY || 0}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      step="1"
                      value={editingProduct.offsetY || 0}
                      onChange={(e) => setEditingProduct({
                        ...editingProduct,
                        offsetY: parseInt(e.target.value, 10)
                      })}
                      className="w-full accent-emerald-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsProductModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProductModal}
                className="px-5 py-2.5 rounded-xl bg-[#DEA303] hover:bg-[#c99302] text-slate-950 font-bold text-xs shadow cursor-pointer flex items-center gap-1.5"
              >
                <Check size={14} />
                <span>Save Product Details</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendee Delete Confirmation Modal */}
      {attendeeToDelete && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-left shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl">
                <Trash2 size={22} />
              </div>
              <div>
                <h4 className="font-bold text-white text-base">Remove Attendee Record</h4>
                <p className="text-xs text-slate-400">This will remove this attendee from attendance logs.</p>
              </div>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5 text-xs mb-5">
              <div className="flex justify-between">
                <span className="text-slate-400">Name:</span>
                <span className="text-white font-semibold">{attendeeToDelete.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Contact:</span>
                <span className="text-slate-200 font-mono">{attendeeToDelete.contact || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Role / Folder:</span>
                <span className="text-amber-400">{attendeeToDelete.role} • {attendeeToDelete.posterTemplateName || '20th Anniversary'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Downloads:</span>
                <span className="text-emerald-400 font-bold">{attendeeToDelete.downloadCount || 1}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAttendeeToDelete(null)}
                disabled={isDeletingAttendee}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAttendee}
                disabled={isDeletingAttendee}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow transition cursor-pointer flex items-center gap-1.5"
              >
                {isDeletingAttendee ? (
                  <DottedLoader size="sm" color="#ffffff" />
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Poster Preview Modal */}
      {previewPoster && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-lg w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 p-4">
            <button
              onClick={() => setPreviewPoster(null)}
              className="absolute top-6 right-6 p-2 rounded-full bg-black/60 hover:bg-black text-white transition z-10 cursor-pointer"
            >
              <X size={18} />
            </button>
            <h4 className="text-sm font-bold text-white mb-2">{previewPoster.name}</h4>
            <div className="aspect-square w-full rounded-xl overflow-hidden bg-slate-950 mb-4 border border-slate-800">
              <img
                src={previewPoster.url}
                alt="Generated Poster Preview"
                className="w-full h-full object-cover block"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="flex justify-end gap-2">
              <a
                href={previewPoster.url}
                download={`${previewPoster.name.replace(/[^a-z0-9]/gi, '_')}_Poster.png`}
                className="px-4 py-2 bg-[#0B2776] hover:bg-[#12369c] text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={14} /> Download Image
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
