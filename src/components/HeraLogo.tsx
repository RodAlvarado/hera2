import React from 'react';

interface HeraLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'custom';
  className?: string;
  variant?: 'mark' | 'full' | 'icon';
  showSubtitle?: boolean;
}

export const HeraLogo: React.FC<HeraLogoProps> = ({
  size = 'md',
  className = '',
  variant = 'mark',
  showSubtitle = false,
}) => {
  const sizeClasses = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
    custom: '',
  };

  const currentSize = sizeClasses[size];

  if (variant === 'full') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {/* Official Hera Gold & Navy Crest */}
        <div className="w-10 h-10 rounded-xl overflow-hidden shadow-xs shrink-0 flex items-center justify-center relative">
          <img
            src="/logo.png"
            alt="HERA"
            className="w-full h-full object-contain"
            loading="eager"
          />
        </div>

        {/* Brand Name & Typography - Pure HERA, no 'SaaS ATS' */}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-serif font-extrabold text-lg tracking-wider text-[#07152B]">
              HERA
            </span>
          </div>
          {showSubtitle && (
            <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-500">
              Human Evaluation &amp; Recruitment AI
            </p>
          )}
        </div>
      </div>
    );
  }

  // Standalone Mark / Icon
  return (
    <div className={`${currentSize} rounded-xl overflow-hidden shadow-xs shrink-0 flex items-center justify-center relative ${className}`}>
      <img
        src="/logo.png"
        alt="HERA"
        className="w-full h-full object-contain"
        loading="eager"
      />
    </div>
  );
};

export default HeraLogo;
