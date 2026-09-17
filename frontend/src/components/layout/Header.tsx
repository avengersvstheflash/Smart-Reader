import React, { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Palette, Settings, ArrowLeft } from 'lucide-react';
import { useThemeStore } from '../../store/useThemeStore';

export interface HeaderProps {
  title?: ReactNode;
  backTo?: string | null;
  contextual?: ReactNode;
  compact?: boolean;
  onBack?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  backTo = null,
  contextual = null,
  compact = false,
  onBack,
}) => {
  const navigate = useNavigate();
  const { theme, cycleTheme } = useThemeStore();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <header
      className={`sticky top-0 z-30 w-full border-b border-line bg-app/85 backdrop-blur transition-colors ${
        compact ? 'h-12' : 'h-14'
      }`}
    >
      <div className="max-w-6xl mx-auto h-full px-4 flex items-center justify-between gap-4">
        {/* Left: Wordmark or Back button + Title */}
        <div className="flex items-center gap-3 min-w-0">
          {backTo ? (
            <button
              type="button"
              onClick={handleBack}
              className="p-1.5 -ml-1.5 rounded-md text-ink hover:bg-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </button>
          ) : null}

          <Link
            to="/"
            className="flex items-center gap-2 text-ink hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded py-0.5"
          >
            <span className="text-accent text-lg select-none" aria-hidden="true">
              ◆
            </span>
            <span className="font-display font-semibold tracking-wide text-base md:text-lg select-none whitespace-nowrap">
              Smart Reader
            </span>
          </Link>

          {title && (
            <>
              <span className="text-line-strong select-none" aria-hidden="true">
                /
              </span>
              <div className="font-ui font-medium text-ui-sm text-ink-muted truncate" title={typeof title === 'string' ? title : undefined}>
                {title}
              </div>
            </>
          )}
        </div>

        {/* Center: Contextual slot */}
        {contextual && (
          <div className="hidden md:flex items-center justify-center flex-1 min-w-0 px-2">
            {contextual}
          </div>
        )}

        {/* Right: Actions (Theme cycle + Settings) */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={cycleTheme}
            className="p-2 rounded-md text-ink-muted hover:text-ink hover:bg-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title={`Theme: ${theme} (Click to cycle)`}
            aria-label={`Current theme: ${theme}. Click to cycle theme`}
          >
            <Palette className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            className="p-2 rounded-md text-ink-muted hover:text-ink hover:bg-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title="Settings"
            aria-label="Settings"
            onClick={() => {
              // placeholder for settings modal
            }}
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
};