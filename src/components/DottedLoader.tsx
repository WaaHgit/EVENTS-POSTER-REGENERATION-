import React from 'react';

interface DottedLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: string; // Tailwind class or hex
  className?: string;
  label?: string;
}

/**
 * High-performance animated Dotted Circle Loop loader component
 */
export const DottedLoader: React.FC<DottedLoaderProps> = ({
  size = 'md',
  color = '#0B2776',
  className = '',
  label
}) => {
  const sizePx = size === 'sm' ? 20 : size === 'md' ? 32 : size === 'lg' ? 48 : 64;
  const strokeWidth = size === 'sm' ? 3 : size === 'md' ? 3.5 : size === 'lg' ? 4 : 4.5;
  const radius = (sizePx - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={`inline-flex flex-col items-center justify-center gap-2.5 ${className}`}>
      <div 
        className="relative flex items-center justify-center"
        style={{ width: sizePx, height: sizePx }}
      >
        <svg
          className="animate-spin"
          style={{ animationDuration: '1.2s' }}
          width={sizePx}
          height={sizePx}
          viewBox={`0 0 ${sizePx} ${sizePx}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Subtle background track circle */}
          <circle
            cx={sizePx / 2}
            cy={sizePx / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="opacity-15"
            strokeDasharray="2 6"
            strokeLinecap="round"
          />
          {/* High-visibility rotating dotted foreground arc */}
          <circle
            cx={sizePx / 2}
            cy={sizePx / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference * 0.25} ${circumference * 0.15}`}
            strokeLinecap="round"
          />
        </svg>

        {/* Pulsing center micro-dot */}
        <div 
          className="absolute rounded-full animate-ping opacity-60"
          style={{ 
            width: Math.max(3, sizePx * 0.14), 
            height: Math.max(3, sizePx * 0.14),
            backgroundColor: color 
          }}
        />
      </div>

      {label && (
        <span className="text-xs font-medium text-slate-500 animate-pulse">
          {label}
        </span>
      )}
    </div>
  );
};
