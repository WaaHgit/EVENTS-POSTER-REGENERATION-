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
  Trash2
} from 'lucide-react';
import { 
  type PosterTemplate, 
  composePoster, 
  getImageDimensions 
} from '../lib/canvasUtils';
import { 
  fetchAllPosterTemplates, 
  savePosterTemplate, 
  setActivePosterTemplate,
  deletePosterTemplate,
  purgeInactivePosterTemplates
} from '../lib/supabase';
import { DottedLoader } from './DottedLoader';

interface PosterConfiguratorProps {
  onTemplateActivated?: (template: PosterTemplate) => void;
}

// Clean placeholder portrait image for configurator preview
const SAMPLE_PHOTO = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="%232563eb"/><circle cx="200" cy="220" r="90" fill="%23ffffff"/><path d="M70 540 C70 380, 330 380, 330 540 Z" fill="%23ffffff"/></svg>';

export const PosterConfigurator: React.FC<PosterConfiguratorProps> = ({ onTemplateActivated }) => {
  const [templates, setTemplates] = useState<PosterTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<PosterTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'visual' | 'frame' | 'name' | 'general'>('visual');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load all templates on mount
  const loadTemplates = async () => {
    setLoading(true);
    try {
      const list = await fetchAllPosterTemplates();
      setTemplates(list);
      const active = list.find(t => t.is_active) || list[0];
      if (active) {
        setSelectedTemplate({ ...active });
      }
    } catch (err) {
      console.error('Failed to load poster templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

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

      const newTemplate: PosterTemplate = {
        id: `template-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'New Event Poster',
        description: `Uploaded on ${new Date().toLocaleDateString()}`,
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
      setTemplates(prev => [saved, ...prev]);
      setSelectedTemplate(saved);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to process the uploaded poster image.');
    } finally {
      setLoading(false);
    }
  };

  // Save current template changes
  const handleSave = async () => {
    if (!selectedTemplate) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const saved = await savePosterTemplate(selectedTemplate);
      setTemplates(prev => prev.map(t => t.id === saved.id ? saved : t));
      setSelectedTemplate(saved);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save poster configuration.');
    } finally {
      setLoading(false);
    }
  };

  // Set as active poster template
  const handleSetActive = async () => {
    if (!selectedTemplate) return;
    setLoading(true);
    try {
      await setActivePosterTemplate(selectedTemplate.id);
      const updatedList = templates.map(t => ({
        ...t,
        is_active: t.id === selectedTemplate.id
      }));
      setTemplates(updatedList);
      const activeObj = { ...selectedTemplate, is_active: true };
      setSelectedTemplate(activeObj);
      if (onTemplateActivated) {
        onTemplateActivated(activeObj);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to set template as active.');
    } finally {
      setLoading(false);
    }
  };

  // Delete current template
  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;
    if (templates.length <= 1) {
      setErrorMessage('Cannot delete the only remaining poster template.');
      return;
    }
    const confirmDelete = window.confirm(`Are you sure you want to delete "${selectedTemplate.name}"?`);
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
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to delete template.');
    } finally {
      setLoading(false);
    }
  };

  // Purge all inactive templates
  const handlePurgeInactive = async () => {
    const inactiveCount = templates.filter(t => !t.is_active).length;
    if (inactiveCount === 0) {
      setErrorMessage('There are no inactive poster templates to clean up.');
      return;
    }
    const confirmPurge = window.confirm(`Clean up all ${inactiveCount} inactive templates and keep only the current active poster?`);
    if (!confirmPurge) return;

    setLoading(true);
    try {
      const remaining = await purgeInactivePosterTemplates();
      setTemplates(remaining);
      const activeObj = remaining.find(t => t.is_active) || remaining[0];
      if (activeObj) setSelectedTemplate(activeObj);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to purge inactive templates.');
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
      <div className="p-8 text-center text-slate-400">
        <RefreshCw className="animate-spin w-6 h-6 mx-auto mb-2 text-slate-500" />
        <p className="text-sm">Loading poster configurations...</p>
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
                className="bg-slate-950 border border-slate-700 text-white font-semibold text-sm rounded-lg px-3 py-1.5 outline-none focus:border-[#DEA303] max-w-[280px] sm:max-w-xs truncate"
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.is_active ? '★ (Active)' : ''}
                  </option>
                ))}
              </select>

              {selectedTemplate.is_active && (
                <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                  <Check size={12} /> Active Public Poster
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Canvas Resolution: {selectedTemplate.width} × {selectedTemplate.height} px
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          <button
            id="btn-upload-new-poster"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
          >
            <Upload size={14} /> Upload Poster
          </button>

          {!selectedTemplate.is_active && (
            <button
              id="btn-set-active-poster"
              type="button"
              onClick={handleSetActive}
              disabled={loading}
              className="px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Star size={14} /> Set as Active
            </button>
          )}

          {templates.length > 1 && !selectedTemplate.is_active && (
            <button
              id="btn-delete-poster-template"
              type="button"
              onClick={handleDeleteTemplate}
              disabled={loading}
              className="px-3 py-2 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
              title="Delete this template"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}

          {templates.filter(t => !t.is_active).length > 0 && (
            <button
              id="btn-purge-inactive-templates"
              type="button"
              onClick={handlePurgeInactive}
              disabled={loading}
              className="px-2.5 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium transition flex items-center gap-1 border border-slate-700 cursor-pointer"
              title="Purge all inactive templates and keep only active"
            >
              Clean Inactive
            </button>
          )}

          <button
            id="btn-save-poster-config"
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-[#0B2776] hover:bg-[#12369c] text-white text-xs font-semibold transition flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center gap-1.5">
                <DottedLoader size="sm" color="#FFFFFF" />
                <span>Saving...</span>
              </div>
            ) : saveSuccess ? (
              <>
                <Check size={14} className="text-emerald-400" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Configurator Split Screen */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Live Composition Preview */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-3 text-xs text-slate-400">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-400" />
                Live Configuration Preview
              </span>
              <span>Aspect Ratio: {(selectedTemplate.width / selectedTemplate.height).toFixed(2)}</span>
            </div>

            <div className="relative w-full max-w-[420px] aspect-square rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shadow-xl flex items-center justify-center">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Poster Configuration Preview"
                  className="w-full h-full object-contain block"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="p-8 text-center text-slate-500">
                  <DottedLoader size="md" color="#DEA303" label="Rendering live preview..." />
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-500 mt-3 text-center">
              Preview uses sample attendee portrait & name to verify exact clipping and alignment.
            </p>
          </div>
        </div>

        {/* Right: Fine-tuning Configuration Controls */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
          {/* Sub-Tabs */}
          <div className="flex border-b border-slate-800 pb-2 gap-2">
            <button
              onClick={() => setActiveTab('frame')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
                activeTab === 'frame'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Maximize2 size={13} /> Photo Frame
            </button>
            <button
              onClick={() => setActiveTab('name')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
                activeTab === 'name'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Type size={13} /> Name & Typography
            </button>
            <button
              onClick={() => setActiveTab('general')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
                activeTab === 'general'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders size={13} /> General Details
            </button>
          </div>

          {/* Photo Frame Config */}
          {activeTab === 'frame' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium text-white">Attendee Photo Clipping Area</span>
                <span>Crop Ratio: {(selectedTemplate.photo_width / selectedTemplate.photo_height).toFixed(3)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cfg-photo-x" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    X Coordinate (px)
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
                    Y Coordinate (px)
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
                    Frame Width (px)
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
                    Frame Height (px)
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
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Corner Radius</span>
                  <span className="text-white font-mono">{selectedTemplate.photo_radius} px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.round(Math.min(selectedTemplate.photo_width, selectedTemplate.photo_height) / 2)}
                  value={selectedTemplate.photo_radius}
                  onChange={(e) => updateField('photo_radius', Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#DEA303]"
                />
              </div>
            </div>
          )}

          {/* Name & Typography Config */}
          {activeTab === 'name' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cfg-name-x" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Name X (px)
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
                    Name Y (px)
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
                    Name Width (px)
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
                    Name Height (px)
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

              {/* Styling Options */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label htmlFor="cfg-name-color" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Text Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="cfg-name-color"
                      type="color"
                      value={selectedTemplate.name_color}
                      onChange={(e) => updateField('name_color', e.target.value)}
                      className="w-8 h-8 rounded border border-slate-700 bg-slate-950 cursor-pointer"
                    />
                    <span className="text-xs font-mono text-slate-300">{selectedTemplate.name_color}</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="cfg-name-bg" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Pill Background
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="cfg-name-bg"
                      type="color"
                      value={selectedTemplate.name_background_color || '#0B2776'}
                      onChange={(e) => updateField('name_background_color', e.target.value)}
                      className="w-8 h-8 rounded border border-slate-700 bg-slate-950 cursor-pointer"
                    />
                    <span className="text-xs font-mono text-slate-300">{selectedTemplate.name_background_color}</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="cfg-name-border" className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Pill Border
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="cfg-name-border"
                      type="color"
                      value={selectedTemplate.name_border_color || '#DEA303'}
                      onChange={(e) => updateField('name_border_color', e.target.value)}
                      className="w-8 h-8 rounded border border-slate-700 bg-slate-950 cursor-pointer"
                    />
                    <span className="text-xs font-mono text-slate-300">{selectedTemplate.name_border_color}</span>
                  </div>
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

          {/* General Details Config */}
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
