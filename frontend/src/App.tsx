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

  const { status, fetchStatus } = useResourceStore();

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (isTauri && !nodePort) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-paper p-8 text-ink">
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

  if (!status) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-paper p-8 text-ink">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
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