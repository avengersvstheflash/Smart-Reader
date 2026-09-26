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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
            </Routes>
          </ErrorBoundary>
          <ModalHost />
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}