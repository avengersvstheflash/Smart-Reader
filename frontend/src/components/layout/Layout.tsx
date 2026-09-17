import React, { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Nav } from './Nav';
import { useThemeStore } from '../../store/useThemeStore';

export interface LayoutProps {
  mode?: 'app' | 'reader';
  children?: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ mode = 'app', children }) => {
  // Subscribe to theme store so layout reflects theme changes
  useThemeStore((state) => state.theme);

  return (
    <div className="min-h-screen flex flex-col bg-app text-ink font-ui antialiased selection:bg-accent-wash selection:text-ink">
      {/* Skip Link for Accessibility */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand focus:text-white focus:rounded focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Sticky Header */}
      <Header compact={mode === 'reader'} />

      {/* Primary Navigation (hidden in reader mode) */}
      {mode === 'app' && <Nav />}

      {/* Scroll-restoring Main Content Shell */}
      <main
        id="main"
        tabIndex={-1}
        className={`flex-1 w-full mx-auto outline-none ${
          mode === 'reader' ? 'max-w-none p-0' : 'max-w-6xl px-4 md:px-6 py-6'
        }`}
      >
        {children || <Outlet />}
      </main>
    </div>
  );
};