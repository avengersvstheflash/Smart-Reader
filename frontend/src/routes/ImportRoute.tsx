import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, RotateCw } from 'lucide-react';
import { ImportDropzone } from '../components/import/ImportDropzone';
import { ImportProgress } from '../components/import/ImportProgress';
import { ImportSuccessPanel } from '../components/import/ImportSuccessPanel';
import { WebImportTab } from '../components/import/WebImportTab';
import { PasteImportTab } from '../components/import/PasteImportTab';
import { useJobs } from '../hooks/useJobs';
import { Book, normalizeBook, RawBook } from '../types/domain';

// ─── Tab config ──────────────────────────────────────────────────────────────

type TabKey = 'file' | 'web' | 'paste';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'file', label: 'File' },
  { key: 'web', label: 'Web' },
  { key: 'paste', label: 'Paste' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function ImportRoute() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Resolve active tab from URL param; default to 'file'
  const rawTab = searchParams.get('tab') as TabKey | null;
  const activeTab: TabKey = rawTab === 'web' || rawTab === 'paste' ? rawTab : 'file';

  // File-tab state
  const [uploading, setUploading] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [importedBook, setImportedBook] = useState<Book | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [selectedFilename, setSelectedFilename] = useState<string>('');

  const { activeJob, pipelineComplete, jobs } = useJobs(importedBook ? importedBook.id : null);

  // ─── Tab navigation ────────────────────────────────────────────────────────

  const setTab = (tab: TabKey) => {
    if (tab === 'file') {
      setSearchParams({}, { replace: false });
    } else {
      setSearchParams({ tab }, { replace: false });
    }
    // Reset result state when switching away
    setImportedBook(null);
    setError(null);
    setUploading(false);
    setProgressPct(0);
  };

  // Keyboard: ArrowLeft / ArrowRight on tablist
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

  // ─── File tab handlers ─────────────────────────────────────────────────────

  const handleUpload = useCallback((file: File) => {
    setError(null);
    setLastFile(file);
    setSelectedFilename(file.name);
    setUploading(true);
    setProgressPct(0);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/books/import');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgressPct(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText) as { book?: RawBook };
          if (response?.book) {
            const normalized = normalizeBook(response.book);
            setImportedBook(normalized);
            queryClient.invalidateQueries({ queryKey: ['books'] });
          } else {
            setError('Import completed but no book record was returned by the server.');
          }
        } catch {
          setError('Failed to parse server response.');
        }
      } else {
        let message = `Upload failed with status ${xhr.status}`;
        try {
          const errJson = JSON.parse(xhr.responseText) as { error?: string | { message?: string } };
          if (errJson?.error) {
            message =
              typeof errJson.error === 'string'
                ? errJson.error
                : (errJson.error.message ?? message);
          }
        } catch {
          // ignore
        }
        setError(message);
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setError('Network error encountered while uploading file.');
    };

    xhr.onabort = () => {
      setUploading(false);
      setError('Upload was cancelled.');
    };

    xhr.send(formData);
  }, [queryClient]);

  const handleFiles = (files: File[]) => {
    if (files.length > 0) handleUpload(files[0]);
  };

  const handleReset = () => {
    setImportedBook(null);
    setError(null);
    setProgressPct(0);
    setUploading(false);
    setLastFile(null);
    setSelectedFilename('');
  };

  const handleRetry = () => {
    if (lastFile) {
      handleUpload(lastFile);
    } else {
      handleReset();
    }
  };

  // ─── Web / Paste success ───────────────────────────────────────────────────

  const handleImportSuccess = (book: Book) => {
    setImportedBook(book);
    queryClient.invalidateQueries({ queryKey: ['books'] });
  };

  // ─── Reset imported book when tab changes (already handled in setTab) ──────

  // Sync: if user navigates back/forward and tab changes, clear result state
  const prevTabRef = useRef<TabKey>(activeTab);
  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      prevTabRef.current = activeTab;
      setImportedBook(null);
      setError(null);
      setUploading(false);
      setProgressPct(0);
    }
  }, [activeTab]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-4xl mx-auto py-2">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="font-display text-display-sm md:text-display font-semibold text-ink tracking-tight">
          Add to library
        </h1>
        <p className="text-ui-sm text-ink-muted mt-1">
          Import books, research papers, or articles for reading and synthesis.
        </p>
      </div>

      {/* Tab bar */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Import method"
        className="flex items-center gap-1 border-b border-line pb-0 mb-6"
        onKeyDown={handleTablistKeyDown}
      >
        {TABS.map((tab) => {
          const isCurrent = tab.key === activeTab;
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
              className={`px-4 py-2 text-ui-sm font-medium border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent select-none ${
                isCurrent
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-muted hover:text-ink hover:border-line-strong'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      <div id={`tabpanel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
        <div className="space-y-6">

          {/* ── Result panel (all tabs share this) ── */}
          {!uploading && importedBook && (
            <ImportSuccessPanel
              book={importedBook}
              jobs={jobs}
              activeJob={activeJob}
              pipelineComplete={pipelineComplete}
              onAddAnother={handleReset}
              onRetry={activeTab === 'file' ? handleRetry : undefined}
            />
          )}

          {/* ── File tab ── */}
          {activeTab === 'file' && !importedBook && (
            <>
              {/* Error panel */}
              {error && (
                <div
                  role="alert"
                  className="w-full max-w-xl mx-auto rounded-xl border border-err/30 bg-err/10 p-4 text-ink flex items-start gap-3 shadow-sm"
                >
                  <AlertCircle className="w-5 h-5 text-err shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex-1 text-ui-sm">
                    <p className="font-medium text-err">Import failed</p>
                    <p className="text-ink-muted mt-0.5">{error}</p>
                  </div>
                  {lastFile && (
                    <button
                      type="button"
                      onClick={() => handleUpload(lastFile)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-err text-white hover:opacity-90 transition-opacity select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-err"
                    >
                      <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Retry</span>
                    </button>
                  )}
                </div>
              )}

              {/* Uploading */}
              {uploading && (
                <ImportProgress
                  filename={selectedFilename}
                  progressPct={progressPct}
                  stage="Uploading"
                />
              )}

              {/* Dropzone (idle) */}
              {!uploading && (
                <div className="max-w-xl mx-auto">
                  <ImportDropzone onFiles={handleFiles} />
                </div>
              )}
            </>
          )}

          {/* ── Web tab ── */}
          {activeTab === 'web' && !importedBook && (
            <WebImportTab onSuccess={handleImportSuccess} />
          )}

          {/* ── Paste tab ── */}
          {activeTab === 'paste' && !importedBook && (
            <PasteImportTab onSuccess={handleImportSuccess} />
          )}
        </div>
      </div>
    </div>
  );
}

export default ImportRoute;
