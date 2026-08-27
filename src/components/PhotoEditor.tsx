import React, { useState, useCallback } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { ZoomIn, ZoomOut, RotateCw, Check, X, RefreshCw } from 'lucide-react';

interface PhotoEditorProps {
  image: string;
  aspectRatio?: number;
  photoRadius?: number;
  onConfirm: (croppedAreaPixels: Area) => void;
  onCancel: () => void;
}

export const PhotoEditor: React.FC<PhotoEditorProps> = ({ 
  image, 
  aspectRatio = (480 / 715),
  photoRadius = 20,
  onConfirm, 
  onCancel 
}) => {
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };

  const handleConfirm = () => {
    if (croppedAreaPixels) {
      onConfirm(croppedAreaPixels);
    } else {
      onConfirm({ x: 0, y: 0, width: 480, height: Math.round(480 / aspectRatio) });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col justify-between" id="photo-cropper-modal">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/90 text-white">
        <div>
          <h3 className="font-semibold text-base text-slate-100">Adjust & Crop Photo</h3>
          <p className="text-xs text-slate-400">Position and zoom your photo to fit the poster frame</p>
        </div>
        <button
          id="btn-close-cropper"
          onClick={onCancel}
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          title="Cancel"
          aria-label="Close photo editor"
        >
          <X size={20} />
        </button>
      </div>

      {/* Cropper Area */}
      <div className="relative flex-1 w-full bg-black">
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspectRatio > 0 ? aspectRatio : 1}
          onCropChange={setCrop}
          onCropComplete={onCropComplete}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          showGrid={true}
          cropShape="rect"
          style={{
            containerStyle: { background: '#070B14' },
            cropAreaStyle: {
              border: '2px solid #DEA303',
              boxShadow: '0 0 0 9999em rgba(0, 0, 0, 0.78)',
              borderRadius: `${Math.min(photoRadius, 24)}px`
            }
          }}
        />
      </div>

      {/* Controls Footer */}
      <div className="p-4 sm:p-5 bg-slate-900 border-t border-slate-800 text-white flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1 max-w-lg flex-wrap">
          <button
            id="btn-zoom-out"
            type="button"
            onClick={() => setZoom(prev => Math.max(1, +(prev - 0.2).toFixed(2)))}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>

          <input
            id="crop-zoom-slider"
            type="range"
            value={zoom}
            min={1}
            max={3}
            step={0.02}
            aria-label="Zoom Level"
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 min-w-[120px] h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-[#DEA303]"
          />

          <button
            id="btn-zoom-in"
            type="button"
            onClick={() => setZoom(prev => Math.min(3, +(prev + 0.2).toFixed(2)))}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>

          <span className="text-xs font-mono text-slate-400 shrink-0 w-10 text-right">{Math.round(zoom * 100)}%</span>

          <div className="h-4 w-px bg-slate-700 mx-1 hidden sm:block"></div>

          <button
            id="btn-rotate-photo"
            type="button"
            onClick={handleRotate}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg transition border border-slate-700 shrink-0 cursor-pointer"
          >
            <RotateCw size={14} /> Rotate
          </button>

          <button
            id="btn-reset-crop"
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 px-2.5 py-2 rounded-lg transition border border-slate-700/60 shrink-0 cursor-pointer"
            title="Reset position and zoom"
          >
            <RefreshCw size={13} /> Reset
          </button>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <button
            id="btn-cancel-crop"
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            id="btn-confirm-crop"
            type="button"
            onClick={handleConfirm}
            className="flex items-center justify-center gap-2 bg-[#0B2776] hover:bg-[#12369c] text-white px-6 py-2.5 rounded-xl font-medium text-sm transition shadow cursor-pointer"
          >
            <Check size={16} />
            <span>Apply Photo</span>
          </button>
        </div>
      </div>
    </div>
  );
};
