import React, { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer = null,
  initialFocus,
  closeOnBackdrop = true,
  closeOnEsc = true,
  danger = false,
  children,
}: {
  open: boolean;
  onClose: (reason: 'esc' | 'backdrop' | 'action') => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
  initialFocus?: React.RefObject<HTMLElement> | string;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();
  const openerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Capture opener when modal opens; return focus to opener when modal closes
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null;

      // Lock body scroll and save previous style
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Initial focus
      requestAnimationFrame(() => {
        if (!panelRef.current) return;

        let elToFocus: HTMLElement | null = null;
        if (initialFocus) {
          if (typeof initialFocus === 'string') {
            elToFocus = panelRef.current.querySelector<HTMLElement>(initialFocus);
          } else if (initialFocus.current) {
            elToFocus = initialFocus.current;
          }
        }

        if (!elToFocus) {
          // Find first focusable element inside the dialog panel
          const focusables = panelRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusables.length > 0) {
            elToFocus = focusables[0];
          }
        }

        elToFocus?.focus();
      });

      return () => {
        document.body.style.overflow = prevOverflow;
        const opener = openerRef.current;
        requestAnimationFrame(() => {
          opener?.focus();
        });
      };
    }
  }, [open, initialFocus]);

  // Window Escape listener
  useEffect(() => {
    if (!open || !closeOnEsc) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose('esc');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, closeOnEsc, onClose]);

  if (!open) return null;

  // Focus trap sentinels
  const handleLeadingSentinelFocus = () => {
    if (!panelRef.current) return;
    const focusables = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);

    if (focusables.length > 0) {
      focusables[focusables.length - 1].focus();
    }
  };

  const handleTrailingSentinelFocus = () => {
    if (!panelRef.current) return;
    const focusables = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);

    if (focusables.length > 0) {
      focusables[0].focus();
    }
  };

  const sizeClasses = {
    sm: 'max-w-[400px]',
    md: 'max-w-[560px]',
    lg: 'max-w-[720px]',
  }[size];

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-40"
        aria-hidden="true"
        onClick={() => {
          if (closeOnBackdrop) {
            onClose('backdrop');
          }
        }}
      />

      {/* Dialog container */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Leading Sentinel */}
        <span
          tabIndex={0}
          aria-hidden="true"
          onFocus={handleLeadingSentinelFocus}
          className="sr-only"
        />

        {/* Dialog panel */}
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-title`}
          aria-describedby={description ? `${id}-desc` : undefined}
          className={`bg-surface border border-line rounded-lg shadow-lg w-full ${sizeClasses} max-h-[85vh] flex flex-col relative overflow-hidden transition-all duration-200 animate-fade-in`}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2
                id={`${id}-title`}
                className={`text-h3 font-semibold ${
                  danger ? 'text-err' : 'text-ink'
                }`}
              >
                {title}
              </h2>
              {description && (
                <p id={`${id}-desc`} className="text-caption text-ink-muted mt-1">
                  {description}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => onClose('action')}
              className="p-1.5 -mr-1.5 -mt-1 rounded-md text-ink-muted hover:text-ink hover:bg-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Close"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 overflow-y-auto flex-1 text-ui-sm text-ink">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="px-5 py-4 border-t border-line flex justify-end gap-2 bg-subtle/30">
              {footer}
            </div>
          )}
        </div>

        {/* Trailing Sentinel */}
        <span
          tabIndex={0}
          aria-hidden="true"
          onFocus={handleTrailingSentinelFocus}
          className="sr-only"
        />
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}
