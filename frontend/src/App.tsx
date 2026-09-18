import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { ModalHost } from './components/shared/ModalHost';
import { LibraryRoute } from './routes/LibraryRoute';
import BookDetailsRoute from './routes/BookDetailsRoute';
import ReaderRoute from './routes/ReaderRoute';

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
          <Routes>
            <Route path="/" element={<LibraryRoute />} />
            <Route path="/library" element={<Navigate to="/" replace />} />
            <Route path="/book/:bookId" element={<BookDetailsRoute />} />
            <Route path="/read/:bookId/:chapterId" element={<ReaderRoute />} />
          </Routes>
          <ModalHost />
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}