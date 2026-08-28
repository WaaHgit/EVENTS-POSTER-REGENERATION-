import React, { useEffect, useState } from 'react';
import { Sparkles, Layers, Image as ImageIcon, Type, CheckCircle2, ShieldCheck } from 'lucide-react';

interface PosterGenerationProgressProps {
  isOpen: boolean;
  progress?: number; // 0 to 100
  stageText?: string;
  posterName?: string;
}

const GENERATION_STAGES = [
  { id: 'template', label: 'Loading base official event template', icon: Layers, minPercent: 15 },
  { id: 'photo', label: 'Processing & aligning high-res portrait', icon: ImageIcon, minPercent: 45 },
  { id: 'badge', label: 'Styling attendee badge & gold typography', icon: Type, minPercent: 75 },
  { id: 'render', label: 'Synthesizing 1536×1536 HD canvas artwork', icon: Sparkles, minPercent: 95 },
  { id: 'complete', label: 'Finalizing high-resolution badge file', icon: ShieldCheck, minPercent: 100 }
];

export const PosterGenerationProgress: React.FC<PosterGenerationProgressProps> = ({
  isOpen,
  progress: externalProgress,
  stageText: externalStageText,
  posterName = 'Official 20th Anniversary Poster'
}) => {
  const [internalProgress, setInternalProgress] = useState(10);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);

  // Smooth realistic progress animation loop when external progress is not fixed
  useEffect(() => {
    if (!isOpen) {
      setInternalProgress(10);
      setCurrentStageIndex(0);
      return;
    }

    if (typeof externalProgress === 'number') {
      setInternalProgress(externalProgress);
      const stageIdx = GENERATION_STAGES.findIndex(s => externalProgress <= s.minPercent);
      setCurrentStageIndex(stageIdx === -1 ? GENERATION_STAGES.length - 1 : stageIdx);
      return;
    }

    // Indeterminate simulated progress curve for heavy canvas rendering
    let current = 12;
    setInternalProgress(12);

    const interval = setInterval(() => {
      current += Math.random() * 12 + 6;
      if (current > 92) {
        current = 92; // Hold at 92% until canvas completes and component unmounts
      }
      setInternalProgress(Math.floor(current));

      if (current < 30) setCurrentStageIndex(0);
      else if (current < 55) setCurrentStageIndex(1);
      else if (current < 80) setCurrentStageIndex(2);
      else setCurrentStageIndex(3);
    }, 180);

    return () => clearInterval(interval);
  }, [isOpen, externalProgress]);

  if (!isOpen) return null;

  const currentPercent = Math.min(100, Math.max(5, externalProgress ?? internalProgress));
  const activeStage = GENERATION_STAGES[currentStageIndex] || GENERATION_STAGES[0];
  const ActiveIcon = activeStage.icon;

  return (
    <div 
      id="poster-generation-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md transition-all duration-300 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generation-progress-title"
    >
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 relative">
        {/* Subtle Top Accent Gradient Line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0B2776] via-[#DEA303] to-[#0B2776]" />

        {/* Header with Title & Animated Spinner / Icon */}
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0B2776]/40 to-[#DEA303]/20 border border-[#DEA303]/40 shrink-0">
            {/* Indeterminate rotating outer ring */}
            <svg 
              className="absolute inset-0 w-full h-full animate-spin text-[#DEA303]" 
              viewBox="0 0 56 56" 
              fill="none"
              style={{ animationDuration: '2s' }}
            >
              <circle 
                cx="28" 
                cy="28" 
                r="24" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                strokeDasharray="30 80" 
                strokeLinecap="round" 
              />
            </svg>
            <ActiveIcon className="w-6 h-6 text-[#DEA303] animate-pulse" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 id="generation-progress-title" className="text-base sm:text-lg font-bold text-white truncate">
                Generating High-Resolution Poster
              </h3>
              <span className="text-sm font-extrabold text-[#DEA303] font-mono shrink-0">
                {Math.round(currentPercent)}%
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              {posterName}
            </p>
          </div>
        </div>

        {/* Dynamic Multi-Stage Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center gap-1.5 font-medium text-amber-300">
              <Sparkles size={13} className="text-[#DEA303] animate-spin" style={{ animationDuration: '3s' }} />
              {externalStageText || activeStage.label}
            </span>
            <span className="text-slate-400 font-mono text-[11px]">
              Step {currentStageIndex + 1} of {GENERATION_STAGES.length}
            </span>
          </div>

          {/* Linear Progress Bar Track */}
          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800 relative">
            {/* Animated Gradient Bar */}
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#0B2776] via-[#DEA303] to-[#F59E0B] transition-all duration-300 ease-out relative overflow-hidden"
              style={{ width: `${currentPercent}%` }}
            >
              {/* Indeterminate Shimmer Light Sweep */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-shimmer" />
            </div>
          </div>
        </div>

        {/* Step-by-Step Task Checklist */}
        <div className="bg-slate-950/60 rounded-xl border border-slate-800/80 p-3.5 space-y-2.5">
          {GENERATION_STAGES.map((stage, idx) => {
            const isCompleted = idx < currentStageIndex;
            const isCurrent = idx === currentStageIndex;
            const Icon = stage.icon;

            return (
              <div 
                key={stage.id} 
                className={`flex items-center gap-3 text-xs transition-colors duration-200 ${
                  isCompleted 
                    ? 'text-emerald-400 font-medium' 
                    : isCurrent 
                      ? 'text-amber-200 font-semibold' 
                      : 'text-slate-500'
                }`}
              >
                <div className="shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 size={15} className="text-emerald-400" />
                  ) : isCurrent ? (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-[#DEA303] border-t-transparent animate-spin" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-slate-700 bg-slate-900" />
                  )}
                </div>
                <span className="flex-1 truncate">{stage.label}</span>
                {isCurrent && (
                  <span className="text-[10px] uppercase font-mono tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    Processing
                  </span>
                )}
                {isCompleted && (
                  <span className="text-[10px] text-emerald-500 font-mono">
                    Done
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Quality Guarantee Footer Note */}
        <div className="flex items-center gap-2.5 pt-1 text-[11px] text-slate-400">
          <div className="w-1.5 h-1.5 rounded-full bg-[#DEA303] shrink-0 animate-ping" />
          <span>Synthesizing uncompressed 1536×1536 native artwork for crisp print & social badge resolution.</span>
        </div>
      </div>
    </div>
  );
};
