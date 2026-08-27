import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Check, 
  Save, 
  Star, 
  Sparkles, 
  Layers, 
  Type, 
  Move, 
  Maximize2, 
  Sliders, 
  Image as ImageIcon,
  RefreshCw,
  AlertCircle,
  Trash2,
  ArrowLeft,
  CheckCircle2,
  FolderPlus
} from 'lucide-react';
import { 
  type PosterTemplate, 
  composePoster, 
  getImageDimensions,
  DEFAULT_POSTER_TEMPLATE 
} from '../lib/canvasUtils';
import { 
  fetchAllPosterTemplates, 
  savePosterTemplate, 
  setActivePosterTemplate,
  deletePosterTemplate,
  purgeInactivePosterTemplates,
  archivePosterTemplate
} from '../lib/supabase';
import { DottedLoader } from './DottedLoader';

interface PosterConfiguratorProps {
  initialTemplateId?: string;
  isCreateMode?: boolean;
  onTemplateActivated?: (template: PosterTemplate) => void;
  onClose?: () => void;
}

// Clean placeholder portrait image for configurator preview
const SAMPLE_PHOTO = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="%232563eb"/><circle cx="200" cy="220" r="90" fill="%23ffffff"/><path d="M70 540 C70 380, 330 380, 330 540 Z" fill="%23ffffff"/></svg>';

export const PosterConfigurator: React.FC<PosterConfiguratorProps> = ({ 
  initialTemplateId,
  isCreateMode = false,
  onTemplateActivated,
  onClose
}) => {
  const [templates, setTemplates] = useState<PosterTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<PosterTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'visual' | 'frame' | 'name' | 'general'>('visual');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load all templates on mount
  const loadTemplates = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const list = await fetchAllPosterTemplates();
      setTemplates(list);
      
      let target: PosterTemplate | undefined;
      if (initialTemplateId) {
        target = list.find(t => t.id === initialTemplateId);
      }
      if (!target) {
        target = list.find(t => t.is_active) || list[0] || DEFAULT_POSTER_TEMPLATE;
      }
      
      if (target) {
        setSelectedTemplate({ ...target });
      }
    } catch (err: any) {
      console.error('Failed to load poster templates:', err);
      setErrorMessage(err?.message || 'Failed to load poster templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [initialTemplateId]);

  // If in create mode on mount, trigger upload dialog automatically
  useEffect(() => {
    if (isCreateMode && fileInputRef.current) {
      const timer = setTimeout(() => {
        fileInputRef.current?.click();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isCreateMode]);

  // Update live preview when selected template settings change
  useEffect(() => {
    if (!selectedTemplate) return;

    let isMounted = true;
    const generatePreview = async () => {
      try {
        const url = await composePoster(
          {
            name: 'AHMED AL-HASSAN',
            photoUrl: SAMPLE_PHOTO
          },
          selectedTemplate,
          0.4 // Preview scale for instant responsiveness
        );
        if (isMounted) {
          setPreviewUrl(url);
        }
      } catch (err) {
        console.warn('Configurator preview generation error:', err);
      }
    };

    generatePreview();
    return () => {
      isMounted = false;
    };
  }, [selectedTemplate]);

  // Handle uploading a new poster template file
  const handleUploadPosterImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    e.target.value = '';

    setLoading(true);
    setErrorMessage(null);

    try {
      const { width, height, url } = await getImageDimensions(file);

      const rawLabel = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'New Event Poster';
      const formattedLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

      const newTemplate: PosterTemplate = {
        id: `poster-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: formattedLabel,
        description: `Created on ${new Date().toLocaleDateString()}`,
        image_url: url,
        width: width || 1536,
        height: height || 1536,
        // Default initial frame centered proportionally
        photo_x: Math.round(width * 0.05),
        photo_y: Math.round(height * 0.32),
        photo_width: Math.round(width * 0.32),
        photo_height: Math.round(height * 0.48),
        photo_radius: 20,
        // Default name position below photo
        name_x: Math.round(width * 0.05),
        name_y: Math.round(height * 0.73),
        name_width: Math.round(width * 0.32),
        name_height: Math.round(height * 0.062),
        name_font_family: 'system-ui, -apple-system, sans-serif',
        name_font_weight: 'bold',
        name_min_font_size: 14,
        name_max_font_size: 42,
        name_color: '#FFFFFF',
        name_background_color: '#0B2776',
        name_border_color: '#DEA303',
        is_active: false,
        export_scale: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const saved = await savePosterTemplate(newTemplate);
      setTemplates(prev => [saved, ...prev.filter(t => t.id !== saved.id)]);
      setSelectedTemplate(saved);
      setSuccessMessage('New poster template created successfully! Configure the frame and name styles below.');
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setSuccessMessage(null);
      }, 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to process the uploaded poster image.');
    } finally {
      setLoading(false);
    }
  };

  // Save current template changes (keeps current active/archived status)
  const handleSave = async () => {
    if (!selectedTemplate) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const saved = await savePosterTemplate(selectedTemplate);
      setTemplates(prev => prev.map(t => t.id === saved.id ? saved : t));
      setSelectedTemplate(saved);
      setSuccessMessage('Poster configuration saved successfully to persistent database!');
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setSuccessMessage(null);
      }, 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save poster configuration.');
    } finally {
      setLoading(false);
    }
  };

  // Save & Set as Active Live Public Poster (automatically archives all others)
  const handleSaveAndPublishActive = async () => {
    if (!selectedTemplate) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const activeObj: PosterTemplate = { ...selectedTemplate, is_active: true };
      const saved = await savePosterTemplate(activeObj);
      await setActivePosterTemplate(saved.id);

      const updatedList = templates.map(t => ({
        ...t,
        is_active: t.id === saved.id
      }));
      setTemplates(updatedList);
      setSelectedTemplate(saved);

      if (onTemplateActivated) {
        onTemplateActivated(saved);
      }
      setSuccessMessage('Poster published as the ACTIVE public event poster! Previous posters have been safely archived.');
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setSuccessMessage(null);
      }, 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to activate template.');
    } finally {
      setLoading(false);
    }
  };

  // Delete current template
  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;
    if (templates.length <= 1) {
      setErrorMessage('Cannot delete the only remaining poster in the system.');
      return;
    }
    const confirmDelete = window.confirm(`Are you sure you want to delete "${selectedTemplate.name}"? This action cannot be undone.`);
    if (!confirmDelete) return;

    setLoading(true);
    try {
      const remaining = await deletePosterTemplate(selectedTemplate.id);
      setTemplates(remaining);
      const nextActive = remaining.find(t => t.is_active) || remaining[0];
      if (nextActive) {
        setSelectedTemplate(nextActive);
        if (onTemplateActivated) onTemplateActivated(nextActive);
      }
      setSuccessMessage('Poster template deleted.');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to delete template.');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof PosterTemplate, value: any) => {
    if (!selectedTemplate) return;
    setSelectedTemplate(prev => prev ? { ...prev, [field]: value } : null);
  };

  if (!selectedTemplate) {
    return (
      <div className="p-12 text-center text-slate-400">
        <DottedLoader size="lg" color="#DEA303" label="Loading poster configurator..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleUploadPosterImage}
      />

      {/* Top Action Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer shrink-0"
              title="Return to Posters List"
            >
              <ArrowLeft size={16} />
            </button>
          )}

          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg shrink-0">
            <Layers size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <select
                id="select-poster-template"
                aria-label="Select Poster Template"
                value={selectedTemplate.id}
                onChange={(e) => {
                  const found = templates.find(t => t.id === e.target.value);
                  if (found) setSelectedTemplate({ ...found });
                }}
                className="bg-slate-950 border border-slate-700 text-white font-semibold text-sm rounded-lg px-3 py-1.5 outline-none focus:border-[#DEA303] max-w-[280px] sm:max-w-xs truncate cursor-pointer"
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.is_active ? '★ (Active Public Poster)' : '(Archived)'}
                  </option>
                ))}
              </select>

              {selectedTemplate.is_active ? (
                <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                  <Check size={12} /> Active Public Poster
                </span>
              ) : (
                <span className="bg-slate-800 text-slate-400 text-xs font-semibold px-2 py-0.5 rounded-full shrink-0">
                  Archived / Draft
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              {selectedTemplate.description || 'Canvas dimensions: ' + selectedTemplate.width + 'x' + selectedTemplate.height + 'px'}
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            id="btn-upload-new-poster-template"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Upload a new background flyer image to create a new poster event"
          >
            <FolderPlus size={14} className="text-amber-400" />
            <span>Upload New Poster Image</span>
          </button>

          {!selectedTemplate.is_active && (
            <button
              type="button"
              id="btn-set-active-poster"
              onClick={handleSaveAndPublishActive}
              disabled={loading}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              title="Publish as the live public poster (archives previously active poster)"
            >
              <Star size={14} />
              <span>Publish as Live Poster</span>
            </button>
          )}

          <button
            type="button"
            id="btn-save-poster-template"
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-[#DEA303] hover:bg-[#c99302] text-slate-950 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <DottedLoader size="sm" color="#020617" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span>Save Changes</span>
              </>
            )}
          </button>

          {templates.length > 1 && (
            <button
              type="button"
              onClick={handleDeleteTemplate}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition cursor-pointer"
              title="Delete this poster template"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Success Notification */}
      {saveSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
          <span>{successMessage || 'Poster configuration saved successfully!'}</span>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl text-xs flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
          <div className="flex-1">
            <p className="font-semibold">{errorMessage}</p>
            <p className="text-[11px] text-red-400/80 mt-0.5">
              Make sure Supabase database tables are initialized using the SQL setup in Admin Dashboard.
            </p>
          </div>
        </div>
      )}

      {/* Main Grid: Left is live composited preview, Right is tabbed configuration controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Live Visual Preview */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col items-center justify-between">
          <div className="w-full flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Sparkles size={14} className="text-amber-400" /> Live Composited Preview
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              {selectedTemplate.width} × {selectedTemplate.height} px
            </span>
          </div>

          <div className="relative w-full max-w-[340px] aspect-square rounded-lg overflow-hidden border border-slate-700 bg-slate-950 flex items-center justify-center shadow-lg">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Poster Live Preview"
                className="w-full h-full object-contain select-none"
              />
            ) : (
              <DottedLoader size="md" color="#DEA303" label="Rendering preview..." />
            )}
          </div>

          <p className="text-[11px] text-slate-400 text-center mt-4">
            Shows how attendee photos and customized attendee name badges will look on this poster.
          </p>
        </div>

        {/* Right: Tabbed Configuration Panels */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
          {/* Sub-tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('visual')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'visual'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders size={13} /> Visual Overview
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('frame')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'frame'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ImageIcon size={13} /> Photo Frame Position
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('name')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'name'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Type size={13} /> Name Badge Style
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'general'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Move size={13} /> General Details
            </button>
          </div>

          {/* TAB 1: Visual Overview & Quick Sliders */}
          {activeTab === 'visual' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Poster Template Label</span>
                  <span className="text-[11px] text-amber-400 font-medium">Editable</span>
                </div>
                <input
                  type="text"
                  value={selectedTemplate.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#DEA303]"
                  placeholder="e.g. UTQ 20th Anniversary"
                />
              </div>

              {/* Photo Frame summary slider */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Photo Frame Corner Radius</span>
                  <span className="text-amber-400 font-mono font-bold">{selectedTemplate.photo_radius}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={selectedTemplate.photo_radius}
                  onChange={(e) => updateField('photo_radius', Number(e.target.value))}
                  className="w-full accent-[#DEA303] cursor-pointer"
                />
              </div>

              {/* Badge Colors summary */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <span className="text-xs font-bold text-white block">Badge Theme Colors</span>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Text Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedTemplate.name_color}
                        onChange={(e) => updateField('name_color', e.target.value)}
                        className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                      />
                      <span className="text-[11px] text-slate-300 font-mono">{selectedTemplate.name_color}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Background</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedTemplate.name_background_color}
                        onChange={(e) => updateField('name_background_color', e.target.value)}
                        className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                      />
                      <span className="text-[11px] text-slate-300 font-mono">{selectedTemplate.name_background_color}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Border</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedTemplate.name_border_color || '#DEA303'}
                        onChange={(e) => updateField('name_border_color', e.target.value)}
                        className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                      />
                      <span className="text-[11px] text-slate-300 font-mono">{selectedTemplate.name_border_color || '#DEA303'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Photo Frame Position & Size */}
          {activeTab === 'frame' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cfg-photo-x" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Photo X Position (px)
                  </label>
                  <input
                    id="cfg-photo-x"
                    type="number"
                    value={selectedTemplate.photo_x}
                    onChange={(e) => updateField('photo_x', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303]"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-photo-y" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Photo Y Position (px)
                  </label>
                  <input
                    id="cfg-photo-y"
                    type="number"
                    value={selectedTemplate.photo_y}
                    onChange={(e) => updateField('photo_y', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303]"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-photo-w" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Photo Width (px)
                  </label>
                  <input
                    id="cfg-photo-w"
                    type="number"
                    value={selectedTemplate.photo_width}
                    onChange={(e) => updateField('photo_width', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303]"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-photo-h" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Photo Height (px)
                  </label>
                  <input
                    id="cfg-photo-h"
                    type="number"
                    value={selectedTemplate.photo_height}
                    onChange={(e) => updateField('photo_height', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cfg-photo-radius" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Photo Corner Radius (px)
                </label>
                <input
                  id="cfg-photo-radius"
                  type="number"
                  value={selectedTemplate.photo_radius}
                  onChange={(e) => updateField('photo_radius', Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303]"
                />
              </div>
            </div>
          )}

          {/* TAB 3: Name Badge Styling */}
          {activeTab === 'name' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cfg-name-x" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Name Box X (px)
                  </label>
                  <input
                    id="cfg-name-x"
                    type="number"
                    value={selectedTemplate.name_x}
                    onChange={(e) => updateField('name_x', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303]"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-name-y" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Name Box Y (px)
                  </label>
                  <input
                    id="cfg-name-y"
                    type="number"
                    value={selectedTemplate.name_y}
                    onChange={(e) => updateField('name_y', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303]"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-name-w" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Name Box Width (px)
                  </label>
                  <input
                    id="cfg-name-w"
                    type="number"
                    value={selectedTemplate.name_width}
                    onChange={(e) => updateField('name_width', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303]"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-name-h" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Name Box Height (px)
                  </label>
                  <input
                    id="cfg-name-h"
                    type="number"
                    value={selectedTemplate.name_height}
                    onChange={(e) => updateField('name_height', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cfg-max-font" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Max Font Size (px)
                  </label>
                  <input
                    id="cfg-max-font"
                    type="number"
                    value={selectedTemplate.name_max_font_size}
                    onChange={(e) => updateField('name_max_font_size', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303]"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-min-font" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Min Font Size (px)
                  </label>
                  <input
                    id="cfg-min-font"
                    type="number"
                    value={selectedTemplate.name_min_font_size}
                    onChange={(e) => updateField('name_min_font_size', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: General Details */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="cfg-template-name" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Template / Event Name
                </label>
                <input
                  id="cfg-template-name"
                  type="text"
                  value={selectedTemplate.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303]"
                />
              </div>

              <div>
                <label htmlFor="cfg-template-desc" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Description / Event Notes
                </label>
                <textarea
                  id="cfg-template-desc"
                  rows={3}
                  value={selectedTemplate.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label htmlFor="cfg-width" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Canvas Width (px)
                  </label>
                  <input
                    id="cfg-width"
                    type="number"
                    value={selectedTemplate.width}
                    onChange={(e) => updateField('width', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303]"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-height" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Canvas Height (px)
                  </label>
                  <input
                    id="cfg-height"
                    type="number"
                    value={selectedTemplate.height}
                    onChange={(e) => updateField('height', Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#DEA303]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
