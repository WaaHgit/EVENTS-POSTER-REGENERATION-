import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Upload, 
  Download, 
  RotateCcw, 
  Check, 
  AlertCircle,
  Crop,
  Shield,
  HeartHandshake,
  Sparkles
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { AttendeeForm, type FormData } from './components/AttendeeForm';
import { PhotoEditor } from './components/PhotoEditor';
import { AdminDashboard } from './components/AdminDashboard';
import { MerchandiseShowcase } from './components/MerchandiseShowcase';
import { 
  composePoster, 
  type CropArea, 
  type PosterTemplate, 
  DEFAULT_POSTER_TEMPLATE,
  optimizeUploadImage 
} from './lib/canvasUtils';
import { normalizeContact, generateDownloadFilename } from './lib/utils';
import { 
  supabase, 
  isSupabaseConfigured, 
  saveLocalSubmission,
  recordAttendeeDownload,
  fetchActivePosterTemplate,
  fetchAppSettings 
} from './lib/supabase';
import { type AppSettings, DEFAULT_APP_SETTINGS } from './types';
import { DottedLoader } from './components/DottedLoader';

export default function App() {
  // Simple client-side route tracking
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname === '/admin' || window.location.hash === '#admin') {
        return '/admin';
      }
    }
    return '/';
  });

  // Dynamic Active Poster Configuration & Global App Settings
  const [activeTemplate, setActiveTemplate] = useState<PosterTemplate | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [isTemplateLoading, setIsTemplateLoading] = useState(true);

  const [step, setStep] = useState<'form' | 'success'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ 
    fullName: '', 
    contact: '', 
    status: '', 
    otherStatus: '' 
  });
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [cropData, setCropData] = useState<CropArea | null>(null);
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [finalPosterUrl, setFinalPosterUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Sync route on browser navigation
  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === '/admin' || window.location.hash === '#admin') {
        setCurrentPath('/admin');
      } else {
        setCurrentPath('/');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
    }
  };

  // Fetch active dynamic poster template and app settings on boot & whenever returning from admin
  useEffect(() => {
    let isMounted = true;
    setIsTemplateLoading(true);
    setPreviewUrl(null);

    const loadGlobalConfig = async () => {
      try {
        const [template, settings] = await Promise.all([
          fetchActivePosterTemplate(),
          fetchAppSettings()
        ]);
        if (isMounted) {
          if (template) setActiveTemplate(template);
          if (settings) setAppSettings(settings);
        }
      } catch (err) {
        console.warn('Config load note:', err);
      } finally {
        if (isMounted) setIsTemplateLoading(false);
      }
    };

    loadGlobalConfig();
    return () => {
      isMounted = false;
    };
  }, [currentPath]);

  // Process uploaded image file
  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setRawImage(reader.result as string);
      setCropData(null);
      setIsCropperOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImageFile(e.target.files[0]);
    }
    e.target.value = '';
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  // Ultra-fast debounced live preview generation
  useEffect(() => {
    if (!activeTemplate) return;
    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const url = await composePoster(
          { 
            name: formData.fullName || '', 
            photoUrl: rawImage || '', 
            crop: cropData || undefined
          },
          activeTemplate,
          0.38 // Optimized scale for instantaneous real-time preview (60fps)
        );

        if (isMounted) {
          setPreviewUrl(url);
        }
      } catch (err) {
        console.error('Preview composition error:', err);
      }
    }, 30);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [formData.fullName, rawImage, cropData, activeTemplate]);

  // Handle Form Submission & Poster Generation
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!activeTemplate) {
      setError('Please wait while the official poster is loading.');
      return;
    }
    if (!rawImage) {
      setError('Please add your photo before creating the poster.');
      return;
    }
    if (!formData.fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!formData.contact.trim()) {
      setError('Please enter your contact information.');
      return;
    }
    if (!formData.status) {
      setError('Please select your status or role.');
      return;
    }
    if (formData.status === 'Other' && !formData.otherStatus.trim()) {
      setError('Please specify your status.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Generate full native resolution poster using active dynamic template
      const scale = activeTemplate.export_scale || 1;
      const highResDataUrl = await composePoster(
        {
          name: formData.fullName,
          photoUrl: rawImage,
          crop: cropData || undefined
        },
        activeTemplate,
        scale
      );

      setFinalPosterUrl(highResDataUrl);

      // 2. Persist registration record
      const cleanedContact = normalizeContact(formData.contact);
      const selectedRole = formData.status === 'Other' ? formData.otherStatus.trim() : formData.status;

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('attendees').upsert({
            full_name: formData.fullName.trim(),
            contact: cleanedContact,
            role: selectedRole,
            other_role: formData.status === 'Other' ? formData.otherStatus.trim() : null,
            poster_url: highResDataUrl,
            poster_template_id: activeTemplate.id,
            updated_at: new Date().toISOString()
          }, { onConflict: 'contact' });
        } catch (dbErr) {
          console.warn('Supabase sync note:', dbErr);
        }
      }

      // Local & Server API storage sync
      saveLocalSubmission({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        fullName: formData.fullName.trim(),
        contact: formData.contact.trim(),
        contactNormalized: cleanedContact,
        status: selectedRole,
        otherStatus: formData.status === 'Other' ? formData.otherStatus.trim() : undefined,
        posterImageUrl: highResDataUrl,
        posterTemplateId: activeTemplate.id,
        createdAt: new Date().toISOString()
      });

      // Celebration effect
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      setStep('success');
      // Scroll to top smoothly
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Submission error:', err);
      setError('Failed to generate your poster. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Download high-resolution PNG
  const handleDownload = () => {
    if (!finalPosterUrl) return;
    const filename = generateDownloadFilename(formData.fullName, activeTemplate?.name);

    try {
      // Decode the data: URL into a Blob synchronously (no await before the
      // click). Triggering the download after an async gap (e.g. fetch/await)
      // lets some mobile browsers, especially iOS Safari, silently drop the
      // action because the "user activation" from the tap has already expired.
      const [header, base64] = finalPosterUrl.split(',');
      const mimeMatch = header.match(/data:(.*?);base64/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mime });
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (err) {
      console.error('Poster download failed, opening image as a fallback:', err);
      // Fallback: open the poster in a new tab so the user can long-press / right-click to save it manually
      window.open(finalPosterUrl, '_blank');
    }
  };

  const handleReset = () => {
    setStep('form');
  };

  // Render Admin View if path is /admin
  if (currentPath === '/admin') {
    return <AdminDashboard onBack={() => navigateTo('/')} />;
  }

  // Dynamic Aspect Ratio for Photo Crop
  const cropAspectRatio = activeTemplate && activeTemplate.photo_width > 0 && activeTemplate.photo_height > 0
    ? activeTemplate.photo_width / activeTemplate.photo_height
    : (480 / 715);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col items-center justify-start py-6 px-4 sm:px-6 lg:px-8 relative">
      {/* Hidden inputs for camera capture and file selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={onFileChange}
      />

      {/* Cropper Modal with Dynamic Aspect Ratio & Radius */}
      {isCropperOpen && rawImage && (
        <PhotoEditor
          image={rawImage}
          aspectRatio={cropAspectRatio}
          photoRadius={activeTemplate?.photo_radius || 0}
          onConfirm={(cropArea) => {
            setCropData(cropArea);
            setIsCropperOpen(false);
          }}
          onCancel={() => {
            setIsCropperOpen(false);
          }}
        />
      )}

      {/* Main Container */}
      <main className="w-full max-w-5xl mx-auto">
        {step === 'form' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left/Top: Hero Poster Preview */}
            <div className="lg:col-span-6 flex flex-col items-center">
              <div 
                id="poster-preview-card"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  aspectRatio: activeTemplate ? `${activeTemplate.width} / ${activeTemplate.height}` : '1080 / 1350'
                }}
                className={`relative w-full max-w-[500px] rounded-2xl overflow-hidden shadow-xl bg-white border transition ${
                  isDragging ? 'border-[#0B2776] ring-4 ring-[#0B2776]/20' : 'border-slate-200'
                }`}
              >
                {isTemplateLoading || !activeTemplate || !previewUrl ? (
                  <div className="w-full h-full min-h-[420px] flex flex-col items-center justify-center bg-slate-50 text-slate-500 p-8">
                    <DottedLoader size="lg" color="#0B2776" label="Loading official event poster..." />
                  </div>
                ) : (
                  <>
                    <img
                      id="live-poster-image"
                      src={previewUrl}
                      alt={activeTemplate.name || "Event Poster"}
                      className="w-full h-full object-cover block"
                      referrerPolicy="no-referrer"
                    />

                    {/* Quick overlay to re-crop if photo exists */}
                    {rawImage && (
                      <button
                        id="btn-recrop-photo"
                        type="button"
                        onClick={() => setIsCropperOpen(true)}
                        className="absolute top-3 right-3 bg-black/70 hover:bg-black/90 text-white text-xs font-medium px-3 py-1.5 rounded-lg backdrop-blur-sm transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Crop size={14} /> Adjust Crop
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right/Bottom: Inputs Form */}
            <div className="lg:col-span-6 bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Photo Selection Section */}
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 mb-3">Your Photo</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      id="btn-take-photo"
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium transition active:scale-[0.98] cursor-pointer"
                    >
                      <Camera size={18} className="text-[#0B2776]" />
                      <span>Take Photo</span>
                    </button>

                    <button
                      id="btn-choose-gallery"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium transition active:scale-[0.98] cursor-pointer"
                    >
                      <Upload size={18} className="text-[#0B2776]" />
                      <span>Choose from Gallery</span>
                    </button>
                  </div>

                  {rawImage && (
                    <div className="mt-2.5 flex items-center justify-between text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                      <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                        <Check size={14} /> Photo selected
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsCropperOpen(true)}
                        className="text-[#0B2776] hover:underline font-medium cursor-pointer"
                      >
                        Adjust crop
                      </button>
                    </div>
                  )}
                </div>

                {/* Attendee Details Section */}
                <div className="pt-2 border-t border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-900 mb-3">Your Details</h2>
                  <AttendeeForm formData={formData} setFormData={setFormData} />
                </div>

                {/* Error Message Display */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  id="btn-create-poster"
                  type="submit"
                  disabled={loading || isTemplateLoading}
                  className="w-full bg-[#0B2776] hover:bg-[#12369c] text-white font-semibold py-3.5 px-6 rounded-xl transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 text-base cursor-pointer"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <DottedLoader size="sm" color="#FFFFFF" />
                      <span>Generating Poster...</span>
                    </div>
                  ) : (
                    <span>Create My Poster</span>
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* =======================================================
             SUCCESS / GENERATED POSTER & MERCHANDISE VIEW
             ======================================================= */
          <div className="max-w-2xl mx-auto flex flex-col items-center text-center space-y-6">
            {/* 1. THANK YOU NOTE (Right before download if enabled) */}
            {appSettings.thankYouNote.enabled && (appSettings.thankYouNote.title || appSettings.thankYouNote.message) && (
              <div 
                id="thank-you-note-banner"
                className="w-full bg-gradient-to-r from-amber-50 via-white to-amber-50 rounded-2xl border border-amber-200/90 p-5 sm:p-6 shadow-sm text-left relative overflow-hidden"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-500/20 shrink-0 mt-0.5">
                    <HeartHandshake className="w-5 h-5" />
                  </div>
                  <div>
                    {appSettings.thankYouNote.title && (
                      <h3 className="text-base sm:text-lg font-bold text-slate-900">
                        {appSettings.thankYouNote.title}
                      </h3>
                    )}
                    {appSettings.thankYouNote.message && (
                      <p className="mt-1 text-slate-600 text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                        {appSettings.thankYouNote.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 2. GENERATED POSTER PREVIEW */}
            <div 
              id="final-poster-card"
              style={{
                aspectRatio: `${activeTemplate.width} / ${activeTemplate.height}`
              }}
              className="w-full rounded-2xl overflow-hidden shadow-2xl bg-white border border-slate-200"
            >
          aspectRatio={cropAspectRatio}
          photoRadius={activeTemplate?.photo_radius || 0}
          onConfirm={(cropArea) => {
            setCropData(cropArea);
            setIsCropperOpen(false);
          }}
          onCancel={() => {
            setIsCropperOpen(false);
          }}
        />
      )}

      {/* Main Container */}
      <main className="w-full max-w-5xl mx-auto">
        {step === 'form' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left/Top: Hero Poster Preview */}
            <div className="lg:col-span-6 flex flex-col items-center">
              <div 
                id="poster-preview-card"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  aspectRatio: activeTemplate ? `${activeTemplate.width} / ${activeTemplate.height}` : '1080 / 1350'
                }}
                className={`relative w-full max-w-[500px] rounded-2xl overflow-hidden shadow-xl bg-white border transition ${
                  isDragging ? 'border-[#0B2776] ring-4 ring-[#0B2776]/20' : 'border-slate-200'
                }`}
              >
                {isTemplateLoading || !activeTemplate || !previewUrl ? (
                  <div className="w-full h-full min-h-[420px] flex flex-col items-center justify-center bg-slate-50 text-slate-500 p-8">
                    <DottedLoader size="lg" color="#0B2776" label="Loading official event poster..." />
                  </div>
                ) : (
                  <>
                    <img
                      id="live-poster-image"
                      src={previewUrl}
                      alt={activeTemplate.name || "Event Poster"}
                      className="w-full h-full object-cover block"
                      referrerPolicy="no-referrer"
                    />

                    {/* Quick overlay to re-crop if photo exists */}
                    {rawImage && (
                      <button
                        id="btn-recrop-photo"
                        type="button"
                        onClick={() => setIsCropperOpen(true)}
                        className="absolute top-3 right-3 bg-black/70 hover:bg-black/90 text-white text-xs font-medium px-3 py-1.5 rounded-lg backdrop-blur-sm transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Crop size={14} /> Adjust Crop
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right/Bottom: Inputs Form */}
            <div className="lg:col-span-6 bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Photo Selection Section */}
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 mb-3">Your Photo</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      id="btn-take-photo"
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium transition active:scale-[0.98] cursor-pointer"
                    >
                      <Camera size={18} className="text-[#0B2776]" />
                      <span>Take Photo</span>
                    </button>

                    <button
                      id="btn-choose-gallery"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium transition active:scale-[0.98] cursor-pointer"
                    >
                      <Upload size={18} className="text-[#0B2776]" />
                      <span>Choose from Gallery</span>
                    </button>
                  </div>

                  {rawImage && (
                    <div className="mt-2.5 flex items-center justify-between text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                      <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                        <Check size={14} /> Photo selected
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsCropperOpen(true)}
                        className="text-[#0B2776] hover:underline font-medium cursor-pointer"
                      >
                        Adjust crop
                      </button>
                    </div>
                  )}
                </div>

                {/* Attendee Details Section */}
                <div className="pt-2 border-t border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-900 mb-3">Your Details</h2>
                  <AttendeeForm formData={formData} setFormData={setFormData} />
                </div>

                {/* Error Message Display */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  id="btn-create-poster"
                  type="submit"
                  disabled={loading || isTemplateLoading}
                  className="w-full bg-[#0B2776] hover:bg-[#12369c] text-white font-semibold py-3.5 px-6 rounded-xl transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 text-base cursor-pointer"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <DottedLoader size="sm" color="#FFFFFF" />
                      <span>Generating Poster...</span>
                    </div>
                  ) : (
                    <span>Create My Poster</span>
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* =======================================================
             SUCCESS / GENERATED POSTER & MERCHANDISE VIEW
             ======================================================= */
          <div className="max-w-2xl mx-auto flex flex-col items-center text-center space-y-6">
            {/* 1. THANK YOU NOTE (Right before download if enabled) */}
            {appSettings.thankYouNote.enabled && (appSettings.thankYouNote.title || appSettings.thankYouNote.message) && (
              <div 
                id="thank-you-note-banner"
                className="w-full bg-gradient-to-r from-amber-50 via-white to-amber-50 rounded-2xl border border-amber-200/90 p-5 sm:p-6 shadow-sm text-left relative overflow-hidden"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-500/20 shrink-0 mt-0.5">
                    <HeartHandshake className="w-5 h-5" />
                  </div>
                  <div>
                    {appSettings.thankYouNote.title && (
                      <h3 className="text-base sm:text-lg font-bold text-slate-900">
                        {appSettings.thankYouNote.title}
                      </h3>
                    )}
                    {appSettings.thankYouNote.message && (
                      <p className="mt-1 text-slate-600 text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                        {appSettings.thankYouNote.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 2. GENERATED POSTER PREVIEW */}
            <div 
              id="final-poster-card"
              style={{
                aspectRatio: `${activeTemplate.width} / ${activeTemplate.height}`
              }}
              className="w-full rounded-2xl overflow-hidden shadow-2xl bg-white border border-slate-200"
            >
              {finalPosterUrl && (
                <img
                  id="final-poster-image"
                  src={finalPosterUrl}
                  alt="Your Personalized Poster"
                  className="w-full h-full object-cover block"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>

            {/* 3. DOWNLOAD & EDIT ACTION BUTTONS */}
            <div className="w-full flex flex-col sm:flex-row gap-3 justify-center">
              <button
                id="btn-download-poster"
                type="button"
                onClick={handleDownload}
                className="flex-1 bg-[#0B2776] hover:bg-[#12369c] text-white font-semibold py-3.5 px-6 rounded-xl transition shadow flex items-center justify-center gap-2 text-base cursor-pointer"
              >
                <Download size={18} />
                <span>Download Poster Badge</span>
              </button>

              <button
                id="btn-edit-poster"
                type="button"
                onClick={handleReset}
                className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium py-3.5 px-5 rounded-xl transition flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                <RotateCcw size={16} />
                <span>Make Changes</span>
              </button>
            </div>

            {/* 4. CALL TO ACTION / MERCHANDISE STORE (Right after details & download) */}
            {appSettings.callToAction.enabled && (
              <div className="w-full">
                <MerchandiseShowcase settings={appSettings.callToAction} />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Discreet Fixed Admin Shield Icon in Bottom-Right Corner */}
      <a
        id="btn-admin-access"
        href="/admin"
        onClick={(e) => {
          e.preventDefault();
          navigateTo('/admin');
        }}
        aria-label="Admin"
        title="Admin"
        className="fixed bottom-4 right-4 z-40 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-900/60 hover:bg-slate-900 text-slate-400 hover:text-white backdrop-blur-md border border-slate-700/50 shadow-md flex items-center justify-center transition-all opacity-40 hover:opacity-100 hover:scale-105"
      >
        <Shield size={16} aria-hidden="true" />
        <span className="sr-only">Admin</span>
      </a>
    </div>
  );
}

  RotateCcw, 
  Check, 
  AlertCircle,
  Crop,
  Shield,
  HeartHandshake,
  Sparkles
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { AttendeeForm, type FormData } from './components/AttendeeForm';
import { PhotoEditor } from './components/PhotoEditor';
import { AdminDashboard } from './components/AdminDashboard';
import { MerchandiseShowcase } from './components/MerchandiseShowcase';
import { 
  composePoster, 
  type CropArea, 
  type PosterTemplate, 
  DEFAULT_POSTER_TEMPLATE,
  optimizeUploadImage 
} from './lib/canvasUtils';
import { normalizeContact, generateDownloadFilename } from './lib/utils';
import { 
  supabase, 
  isSupabaseConfigured, 
  saveLocalSubmission,
  recordAttendeeDownload,
  fetchActivePosterTemplate,
  fetchAppSettings 
} from './lib/supabase';
import { type AppSettings, DEFAULT_APP_SETTINGS } from './types';
import { DottedLoader } from './components/DottedLoader';

export default function App() {
  // Simple client-side route tracking
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname === '/admin' || window.location.hash === '#admin') {
        return '/admin';
      }
    }
    return '/';
  });

  // Dynamic Active Poster Configuration & Global App Settings
  const [activeTemplate, setActiveTemplate] = useState<PosterTemplate | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [isTemplateLoading, setIsTemplateLoading] = useState(true);

  const [step, setStep] = useState<'form' | 'success'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ 
    fullName: '', 
    contact: '', 
    status: '', 
    otherStatus: '' 
  });
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [cropData, setCropData] = useState<CropArea | null>(null);
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [finalPosterUrl, setFinalPosterUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Sync route on browser navigation
  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === '/admin' || window.location.hash === '#admin') {
        setCurrentPath('/admin');
      } else {
        setCurrentPath('/');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
    }
  };

  // Fetch active dynamic poster template and app settings on boot & whenever returning from admin
  useEffect(() => {
    let isMounted = true;
    setIsTemplateLoading(true);
    setPreviewUrl(null);

    const loadGlobalConfig = async () => {
      try {
        const [template, settings] = await Promise.all([
          fetchActivePosterTemplate(),
          fetchAppSettings()
        ]);
        if (isMounted) {
          if (template) setActiveTemplate(template);
          if (settings) setAppSettings(settings);
        }
      } catch (err) {
        console.warn('Config load note:', err);
      } finally {
        if (isMounted) setIsTemplateLoading(false);
      }
    };

    loadGlobalConfig();
    return () => {
      isMounted = false;
    };
  }, [currentPath]);

  // Process uploaded image file
  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setRawImage(reader.result as string);
      setCropData(null);
      setIsCropperOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImageFile(e.target.files[0]);
    }
    e.target.value = '';
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  // Ultra-fast debounced live preview generation
  useEffect(() => {
    if (!activeTemplate) return;
    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const url = await composePoster(
          { 
            name: formData.fullName || '', 
            photoUrl: rawImage || '', 
            crop: cropData || undefined
          },
          activeTemplate,
          0.38 // Optimized scale for instantaneous real-time preview (60fps)
        );

        if (isMounted) {
          setPreviewUrl(url);
        }
      } catch (err) {
        console.error('Preview composition error:', err);
      }
    }, 30);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [formData.fullName, rawImage, cropData, activeTemplate]);

  // Handle Form Submission & Poster Generation
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!activeTemplate) {
      setError('Please wait while the official poster is loading.');
      return;
    }
    if (!rawImage) {
      setError('Please add your photo before creating the poster.');
      return;
    }
    if (!formData.fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!formData.contact.trim()) {
      setError('Please enter your contact information.');
      return;
    }
    if (!formData.status) {
      setError('Please select your status or role.');
      return;
    }
    if (formData.status === 'Other' && !formData.otherStatus.trim()) {
      setError('Please specify your status.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Generate full native resolution poster using active dynamic template
      const scale = activeTemplate.export_scale || 1;
      const highResDataUrl = await composePoster(
        {
          name: formData.fullName,
          photoUrl: rawImage,
          crop: cropData || undefined
        },
        activeTemplate,
        scale
      );

      setFinalPosterUrl(highResDataUrl);

      // 2. Persist registration record
      const cleanedContact = normalizeContact(formData.contact);
      const selectedRole = formData.status === 'Other' ? formData.otherStatus.trim() : formData.status;

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('attendees').upsert({
            full_name: formData.fullName.trim(),
            contact: cleanedContact,
            role: selectedRole,
            other_role: formData.status === 'Other' ? formData.otherStatus.trim() : null,
            poster_url: highResDataUrl,
            poster_template_id: activeTemplate.id,
            updated_at: new Date().toISOString()
          }, { onConflict: 'contact' });
        } catch (dbErr) {
          console.warn('Supabase sync note:', dbErr);
        }
      }

      // Local & Server API storage sync
      saveLocalSubmission({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        fullName: formData.fullName.trim(),
        contact: formData.contact.trim(),
        contactNormalized: cleanedContact,
        status: selectedRole,
        otherStatus: formData.status === 'Other' ? formData.otherStatus.trim() : undefined,
        posterImageUrl: highResDataUrl,
        posterTemplateId: activeTemplate.id,
        createdAt: new Date().toISOString()
      });

      // Celebration effect
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      setStep('success');
      // Scroll to top smoothly
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Submission error:', err);
      setError('Failed to generate your poster. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Download high-resolution PNG
  const handleDownload = async () => {
    if (!finalPosterUrl) return;
    const filename = `${sanitizeFilename(activeTemplate?.name || 'Poster')}_${sanitizeFilename(formData.fullName || 'attendee')}.png`;

    try {
      // Convert the data: URL into a Blob/Object URL first. Linking an <a download>
      // directly to a data: URI is unreliable on many mobile browsers (notably iOS
      // Safari), which often silently ignore the download attribute for data URIs.
      // Object URLs are downloaded far more consistently.
      const response = await fetch(finalPosterUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Release the object URL once the download has had time to start
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (err) {
      console.error('Poster download failed, opening image as a fallback:', err);
      // Fallback: open the poster in a new tab so the user can long-press / right-click to save it manually
      window.open(finalPosterUrl, '_blank');
    }
  };

  const handleReset = () => {
    setStep('form');
  };

  // Render Admin View if path is /admin
  if (currentPath === '/admin') {
    return <AdminDashboard onBack={() => navigateTo('/')} />;
  }

  // Dynamic Aspect Ratio for Photo Crop
  const cropAspectRatio = activeTemplate && activeTemplate.photo_width > 0 && activeTemplate.photo_height > 0
    ? activeTemplate.photo_width / activeTemplate.photo_height
    : (480 / 715);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col items-center justify-start py-6 px-4 sm:px-6 lg:px-8 relative">
      {/* Hidden inputs for camera capture and file selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={onFileChange}
      />

      {/* Cropper Modal with Dynamic Aspect Ratio & Radius */}
      {isCropperOpen && rawImage && (
        <PhotoEditor
          image={rawImage}
          aspectRatio={cropAspectRatio}
          photoRadius={activeTemplate?.photo_radius || 0}
          onConfirm={(cropArea) => {
            setCropData(cropArea);
            setIsCropperOpen(false);
          }}
          onCancel={() => {
            setIsCropperOpen(false);
          }}
        />
      )}

      {/* Main Container */}
      <main className="w-full max-w-5xl mx-auto">
        {step === 'form' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left/Top: Hero Poster Preview */}
            <div className="lg:col-span-6 flex flex-col items-center">
              <div 
                id="poster-preview-card"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  aspectRatio: activeTemplate ? `${activeTemplate.width} / ${activeTemplate.height}` : '1080 / 1350'
                }}
                className={`relative w-full max-w-[500px] rounded-2xl overflow-hidden shadow-xl bg-white border transition ${
                  isDragging ? 'border-[#0B2776] ring-4 ring-[#0B2776]/20' : 'border-slate-200'
                }`}
              >
                {isTemplateLoading || !activeTemplate || !previewUrl ? (
                  <div className="w-full h-full min-h-[420px] flex flex-col items-center justify-center bg-slate-50 text-slate-500 p-8">
                    <DottedLoader size="lg" color="#0B2776" label="Loading official event poster..." />
                  </div>
                ) : (
                  <>
                    <img
                      id="live-poster-image"
                      src={previewUrl}
                      alt={activeTemplate.name || "Event Poster"}
                      className="w-full h-full object-cover block"
                      referrerPolicy="no-referrer"
                    />

                    {/* Quick overlay to re-crop if photo exists */}
                    {rawImage && (
                      <button
                        id="btn-recrop-photo"
                        type="button"
                        onClick={() => setIsCropperOpen(true)}
                        className="absolute top-3 right-3 bg-black/70 hover:bg-black/90 text-white text-xs font-medium px-3 py-1.5 rounded-lg backdrop-blur-sm transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Crop size={14} /> Adjust Crop
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right/Bottom: Inputs Form */}
            <div className="lg:col-span-6 bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Photo Selection Section */}
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 mb-3">Your Photo</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      id="btn-take-photo"
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium transition active:scale-[0.98] cursor-pointer"
                    >
                      <Camera size={18} className="text-[#0B2776]" />
                      <span>Take Photo</span>
                    </button>

                    <button
                      id="btn-choose-gallery"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium transition active:scale-[0.98] cursor-pointer"
                    >
                      <Upload size={18} className="text-[#0B2776]" />
                      <span>Choose from Gallery</span>
                    </button>
                  </div>

                  {rawImage && (
                    <div className="mt-2.5 flex items-center justify-between text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                      <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                        <Check size={14} /> Photo selected
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsCropperOpen(true)}
                        className="text-[#0B2776] hover:underline font-medium cursor-pointer"
                      >
                        Adjust crop
                      </button>
                    </div>
                  )}
                </div>

                {/* Attendee Details Section */}
                <div className="pt-2 border-t border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-900 mb-3">Your Details</h2>
                  <AttendeeForm formData={formData} setFormData={setFormData} />
                </div>

                {/* Error Message Display */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  id="btn-create-poster"
                  type="submit"
                  disabled={loading || isTemplateLoading}
                  className="w-full bg-[#0B2776] hover:bg-[#12369c] text-white font-semibold py-3.5 px-6 rounded-xl transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 text-base cursor-pointer"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <DottedLoader size="sm" color="#FFFFFF" />
                      <span>Generating Poster...</span>
                    </div>
                  ) : (
                    <span>Create My Poster</span>
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* =======================================================
             SUCCESS / GENERATED POSTER & MERCHANDISE VIEW
             ======================================================= */
          <div className="max-w-2xl mx-auto flex flex-col items-center text-center space-y-6">
            {/* 1. THANK YOU NOTE (Right before download if enabled) */}
            {appSettings.thankYouNote.enabled && (appSettings.thankYouNote.title || appSettings.thankYouNote.message) && (
              <div 
                id="thank-you-note-banner"
                className="w-full bg-gradient-to-r from-amber-50 via-white to-amber-50 rounded-2xl border border-amber-200/90 p-5 sm:p-6 shadow-sm text-left relative overflow-hidden"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-500/20 shrink-0 mt-0.5">
                    <HeartHandshake className="w-5 h-5" />
                  </div>
                  <div>
                    {appSettings.thankYouNote.title && (
                      <h3 className="text-base sm:text-lg font-bold text-slate-900">
                        {appSettings.thankYouNote.title}
                      </h3>
                    )}
                    {appSettings.thankYouNote.message && (
                      <p className="mt-1 text-slate-600 text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                        {appSettings.thankYouNote.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 2. GENERATED POSTER PREVIEW */}
            <div 
              id="final-poster-card"
              style={{
                aspectRatio: `${activeTemplate.width} / ${activeTemplate.height}`
              }}
              className="w-full rounded-2xl overflow-hidden shadow-2xl bg-white border border-slate-200"
            >
              {finalPosterUrl && (
                <img
                  id="final-poster-image"
                  src={finalPosterUrl}
                  alt="Your Personalized Poster"
                  className="w-full h-full object-cover block"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>

            {/* 3. DOWNLOAD & EDIT ACTION BUTTONS */}
            <div className="w-full flex flex-col sm:flex-row gap-3 justify-center">
              <button
                id="btn-download-poster"
                type="button"
                onClick={handleDownload}
                className="flex-1 bg-[#0B2776] hover:bg-[#12369c] text-white font-semibold py-3.5 px-6 rounded-xl transition shadow flex items-center justify-center gap-2 text-base cursor-pointer"
              >
                <Download size={18} />
                <span>Download Poster Badge</span>
              </button>

              <button
                id="btn-edit-poster"
                type="button"
                onClick={handleReset}
                className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium py-3.5 px-5 rounded-xl transition flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                <RotateCcw size={16} />
                <span>Make Changes</span>
              </button>
            </div>

            {/* 4. CALL TO ACTION / MERCHANDISE STORE (Right after details & download) */}
            {appSettings.callToAction.enabled && (
              <div className="w-full">
                <MerchandiseShowcase settings={appSettings.callToAction} />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Discreet Fixed Admin Shield Icon in Bottom-Right Corner */}
      <a
        id="btn-admin-access"
        href="/admin"
        onClick={(e) => {
          e.preventDefault();
          navigateTo('/admin');
        }}
        aria-label="Admin"
        title="Admin"
        className="fixed bottom-4 right-4 z-40 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-900/60 hover:bg-slate-900 text-slate-400 hover:text-white backdrop-blur-md border border-slate-700/50 shadow-md flex items-center justify-center transition-all opacity-40 hover:opacity-100 hover:scale-105"
      >
        <Shield size={16} aria-hidden="true" />
        <span className="sr-only">Admin</span>
      </a>
    </div>
  );
}
