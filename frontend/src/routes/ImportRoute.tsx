import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Globe,
  Layers,
  ListOrdered,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { ImportDropzone } from '../components/import/ImportDropzone';
import { ImportCinematic } from '../components/import/ImportCinematic';
import { QueueManager } from '../components/import/QueueManager';
import { WebImportTab } from '../components/import/WebImportTab';
import { PasteImportTab } from '../components/import/PasteImportTab';
import { useImportQueueStore } from '../store/useImportQueueStore';
import { Book } from '../types/domain';

type TabKey = 'file' | 'web' | 'paste' | 'queue';

const TABS: { key: TabKey; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'file', label: 'File Upload', icon: FileText },
  { key: 'web', label: 'Web Discovery', icon: Globe },
  { key: 'paste', label: 'Paste Text', icon: Layers },
  { key: 'queue', label: 'Import Queue', icon: ListOrdered },
];

export function ImportRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    activeTask,
    pendingCount,
    enqueueFiles,
    cancelTask,
    retryTask,
    fetchQueue,
  } = useImportQueueStore();

  // Resolve active tab from URL param; default to 'file'
  const rawTab = searchParams.get('tab') as TabKey | null;
  const activeTab: TabKey =
    rawTab === 'web' || rawTab === 'paste' || rawTab === 'queue' ? rawTab : 'file';

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);

  // Poll queue upon mount
  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  const setTab = (tab: TabKey) => {
    if (tab === 'file') {
      setSearchParams({}, { replace: false });
    } else {
      setSearchParams({ tab }, { replace: false });
    }
    setUploadError(null);
  };

  // Keyboard navigation for tablist
  const tablistRef = useRef<HTMLDivElement>(null);
  const handleTablistKeyDown = (e: React.KeyboardEvent) => {
    const tabs = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    if (!tabs) return;
    const currentIndex = TABS.findIndex((t) => t.key === activeTab);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (currentIndex + 1) % TABS.length;
      setTab(TABS[next].key);
      tabs[next]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = (currentIndex - 1 + TABS.length) % TABS.length;
      setTab(TABS[prev].key);
      tabs[prev]?.focus();
    }
  };

  // Handle files dropped/selected
  const handleFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploadSuccessMessage(null);

    try {
      const tasks = await enqueueFiles(files);
      queryClient.invalidateQueries({ queryKey: ['books'] });
      setUploadSuccessMessage(
        tasks.length === 1
          ? `"${tasks[0].sourceTitle}" enqueued for sequential processing.`
          : `${tasks.length} files added to the import queue.`
      );
      // Auto clear message after 4s
      setTimeout(() => setUploadSuccessMessage(null), 4000);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to enqueue files.');
    }
  };

  const handleImportSuccess = (book: Book) => {
    queryClient.invalidateQueries({ queryKey: ['books'] });
    setUploadSuccessMessage(`Successfully enqueued "${book.title}". Omnitome is processing it in the background.`);
    setTimeout(() => setUploadSuccessMessage(null), 5000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-2 space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-display-sm md:text-display font-semibold text-ink tracking-tight">
            Add to library
          </h1>
          <p className="text-ui-sm text-ink-muted mt-1">
            Import books, papers, or articles into Omnitome's background ingestion pipeline.
          </p>
        </div>

        {pendingCount > 0 && (
          <button
            type="button"
            onClick={() => setTab('queue')}
            className="self-start sm:self-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand/30 bg-brand/10 text-brand text-caption font-medium hover:bg-brand/15 transition-colors select-none"
          >
            <span className="w-2 h-2 rounded-full bg-brand animate-ping" />
            <span>{pendingCount} {pendingCount === 1 ? 'task' : 'tasks'} processing in background</span>
          </button>
        )}
      </div>

      {/* ── Active Processing Cinematic Banner (Visible when task is running) ── */}
      {activeTask && (
        <div className="space-y-4">
          <ImportCinematic
            task={activeTask}
            onCancel={() => void cancelTask(activeTask.id)}
            onRetry={() => void retryTask(activeTask.id)}
          />

          {/* Quick link to view completed book if active task finished */}
          {activeTask.status === 'completed' && activeTask.bookId && (
            <div className="p-4 rounded-xl border border-ok/30 bg-ok/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0 text-ui-sm">
                <CheckCircle2 className="w-5 h-5 text-ok shrink-0" />
                <span className="font-medium text-ink truncate">
                  "{activeTask.sourceTitle}" is ready in library.
                </span>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/book/${activeTask.bookId}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand text-white text-ui-sm font-medium hover:opacity-90 shadow-sm"
              >
                <span>Open book</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Feedback Banner ── */}
      {uploadSuccessMessage && (
        <div
          role="status"
          className="rounded-xl border border-ok/30 bg-ok/10 p-3.5 flex items-center gap-2.5 text-ui-sm text-ink animate-tag-fade-in"
        >
          <CheckCircle2 className="w-4 h-4 text-ok shrink-0" />
          <span>{uploadSuccessMessage}</span>
        </div>
      )}

      {uploadError && (
        <div
          role="alert"
          className="rounded-xl border border-err/30 bg-err/10 p-3.5 flex items-center gap-2.5 text-ui-sm text-err"
        >
          <AlertCircle className="w-4 h-4 text-err shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* ── Tab Navigation Bar ── */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Import methods"
        className="flex items-center gap-1 border-b border-line pb-0"
        onKeyDown={handleTablistKeyDown}
      >
        {TABS.map((tab) => {
          const isCurrent = tab.key === activeTab;
          const Icon = tab.icon;
          const isQueueTab = tab.key === 'queue';

          return (
            <button
              key={tab.key}
              id={`tab-${tab.key}`}
              role="tab"
              aria-selected={isCurrent}
              aria-controls={`tabpanel-${tab.key}`}
              tabIndex={isCurrent ? 0 : -1}
              onClick={() => setTab(tab.key)}
              type="button"
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-ui-sm font-medium border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand select-none ${
                isCurrent
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-muted hover:text-ink hover:border-line-strong'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {isQueueTab && pendingCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-micro font-mono bg-brand text-white">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Panels ── */}
      <div id={`tabpanel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
        {/* TAB 1: FILE UPLOAD */}
        {activeTab === 'file' && (
          <div className="space-y-6 max-w-xl mx-auto pt-2">
            <ImportDropzone onFiles={handleFiles} multiple={true} />

            <div className="rounded-xl border border-line bg-surface/50 p-4 space-y-2 text-caption text-ink-muted">
              <span className="font-medium text-ink flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand" />
                <span>Multi-File Sequential Processing</span>
              </span>
              <p className="leading-relaxed">
                You can select or drop multiple files simultaneously. Omnitome stages and processes each document
                sequentially in the background, freeing you to continue exploring your library or reading existing books.
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: WEB DISCOVERY */}
        {activeTab === 'web' && <WebImportTab onSuccess={handleImportSuccess} />}

        {/* TAB 3: PASTE TEXT */}
        {activeTab === 'paste' && <PasteImportTab onSuccess={handleImportSuccess} />}

        {/* TAB 4: QUEUE MANAGER */}
        {activeTab === 'queue' && (
          <div className="pt-2">
            <QueueManager />
          </div>
        )}
      </div>
    </div>
  );
}

export default ImportRoute;
