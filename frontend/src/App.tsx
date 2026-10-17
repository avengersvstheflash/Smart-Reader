import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { ModalHost } from './components/shared/ModalHost';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { LibraryRoute } from './routes/LibraryRoute';
import BookDetailsRoute from './routes/BookDetailsRoute';
import ReaderRoute from './routes/ReaderRoute';
import { ImportRoute } from './routes/ImportRoute';
import { ResearchRoute } from './routes/ResearchRoute';
import ResearchViewerRoute from './routes/ResearchViewerRoute';
import { SettingsRoute } from './routes/SettingsRoute';
import { HelpRoute } from './routes/HelpRoute';
import { useEffect } from 'react';
import { ThemeDecor } from './components/decor/ThemeDecor';
import { useResourceStore } from './store/useResourceStore';
import { FirstRunScreen } from './components/resources/FirstRunScreen';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  const isTauri = typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined';
  const nodePort = (window as unknown as { __OMNITOME__?: { nodePort?: number } }).__OMNITOME__?.nodePort;

  const { status, isLoading, error, fetchStatus } = useResourceStore();

  useEffect(() => {
    console.log('[App] Calling fetchStatus()...');
    fetchStatus();
  }, [fetchStatus]);

  if (isTauri && !nodePort) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-paper bg-surface p-8 text-ink">
        <h1 className="text-xl font-bold text-red-600">Omnitome Boot Error</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Backend service port handshake failed during application launch.
        </p>
        <p className="mt-4 text-xs font-mono bg-subtle p-3 rounded">
          Check logs at: %LOCALAPPDATA%\Omnitome\logs\node.log
        </p>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-paper bg-surface p-8 text-ink selection:bg-accent/20">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="p-3 bg-red-500/10 text-red-500 rounded-xl">
            <svg
              className="w-8 h-8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight text-ink">
              Initialization Failed
            </h2>
            <p className="text-xs text-ink-muted leading-relaxed">
              {error}
            </p>
          </div>
          <button
            onClick={() => fetchStatus()}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-accent text-accent-contrast hover:opacity-90 transition-opacity"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !status) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-paper bg-surface p-8 text-ink selection:bg-accent/20">
        <div className="flex flex-col items-center gap-4 text-center">
<<<<<<< HEAD
          <div className="relative flex items-center justify-center">
=======
          <div className="relative flex items-center justify-center transition-opacity duration-700 ease-in-out">
>>>>>>> 960446f (fix(ui): finalize App.tsx loading state polish)
            <div className="absolute inset-0 rounded-full bg-accent/20 blur-md animate-pulse" />
            <svg
              className="w-12 h-12 relative select-none animate-pulse transition-opacity duration-700"
              viewBox="0 0 48 48"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="24" cy="24" r="22" stroke="#d8b4fe" strokeWidth="1.5" strokeDasharray="3 2" />
              <circle cx="24" cy="24" r="16" stroke="#c084fc" strokeWidth="1" />
              <rect x="10.5" y="10.5" width="27" height="27" stroke="#a855f7" strokeWidth="1.2" />
              <rect x="10.5" y="10.5" width="27" height="27" stroke="#a855f7" strokeWidth="1.2" transform="rotate(45 24 24)" />
              <circle cx="24" cy="24" r="7.5" stroke="#f472b6" strokeWidth="1.2" />
              <polygon points="24,19 28,24 24,29 20,24" fill="#ffffff" />
              <circle cx="24" cy="2" r="1.8" fill="#f472b6" />
              <circle cx="24" cy="46" r="1.8" fill="#f472b6" />
              <circle cx="2" cy="24" r="1.8" fill="#f472b6" />
              <circle cx="46" cy="24" r="1.8" fill="#f472b6" />
              <circle cx="8.4" cy="8.4" r="1.2" fill="#c084fc" />
              <circle cx="39.6" cy="8.4" r="1.2" fill="#c084fc" />
              <circle cx="8.4" cy="39.6" r="1.2" fill="#c084fc" />
              <circle cx="39.6" cy="39.6" r="1.2" fill="#c084fc" />
            </svg>
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight text-ink">
              Initializing Omnitome...
            </h2>
            <p className="text-xs text-ink-muted">
              Checking local neural models and system readiness
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!status.allInstalled) {
    return <FirstRunScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeDecor />
        <Layout>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<LibraryRoute />} />
              <Route path="/library" element={<Navigate to="/" replace />} />
              <Route path="/research" element={<ResearchRoute />} />
              <Route path="/research/:bookId" element={<ResearchViewerRoute />} />
              <Route path="/book/:bookId" element={<BookDetailsRoute />} />
              <Route path="/import" element={<ImportRoute />} />
              <Route path="/read/:bookId/:chapterId" element={<ReaderRoute />} />
              <Route path="/settings" element={<SettingsRoute />} />
              <Route path="/help" element={<HelpRoute />} />
            </Routes>
          </ErrorBoundary>
          <ModalHost />
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}