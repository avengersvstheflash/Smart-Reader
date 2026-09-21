import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, RotateCw, CheckCircle2, ArrowRight, PlusCircle, BookOpen } from 'lucide-react';
import { ImportDropzone } from '../components/import/ImportDropzone';
import { ImportProgress } from '../components/import/ImportProgress';
import { PipelineStepper } from '../components/import/PipelineStepper';
import { useJobs } from '../hooks/useJobs';
import { Book, normalizeBook, RawBook } from '../types/domain';

export function ImportRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [uploading, setUploading] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [importedBook, setImportedBook] = useState<Book | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [selectedFilename, setSelectedFilename] = useState<string>('');

  const { activeJob, pipelineComplete, jobs } = useJobs(importedBook ? importedBook.id : null);
  const failedJob = jobs.find((j) => j.status.toLowerCase() === 'failed');
  const interruptedJob = jobs.find((j) => j.status.toUpperCase() === 'INTERRUPTED');

  const handleUpload = (file: File) => {
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
        const pct = Math.round((event.loaded / event.total) * 100);
        setProgressPct(pct);
      }
    };

    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText) as { book?: RawBook };
          if (response && response.book) {
            const normalized = normalizeBook(response.book);
            setImportedBook(normalized);
            queryClient.invalidateQueries({ queryKey: ['books'] });
          } else {
            setError('Import completed but no book record was returned by server.');
          }
        } catch {
          setError('Failed to parse server response.');
        }
      } else {
        let message = `Upload failed with status ${xhr.status}`;
        try {
          const errJson = JSON.parse(xhr.responseText);
          if (errJson && errJson.error) {
            message = typeof errJson.error === 'string' ? errJson.error : (errJson.error.message || message);
          }
        } catch {
          // ignore parse error, use default status message
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
  };

  const handleFiles = (files: File[]) => {
    if (files.length > 0) {
      handleUpload(files[0]);
    }
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

  return (
    <div className="w-full max-w-4xl mx-auto py-2">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="font-display text-display-sm md:text-display font-semibold text-ink tracking-tight">
          Add to library
        </h1>
        <p className="text-ui-sm text-ink-muted mt-1">
          Import books, research papers, or articles for reading and synthesis.
        </p>
      </div>

      {/* Tab Row: [File] [Web] [Paste] */}
      <div className="flex items-center gap-2 border-b border-line pb-4 mb-6">
        <button
          type="button"
          className="px-4 py-1.5 rounded-md text-ui-sm font-medium bg-subtle text-ink border border-line-strong select-none cursor-default"
          aria-selected="true"
        >
          File
        </button>
        <button
          type="button"
          disabled
          title="Next session"
          className="px-4 py-1.5 rounded-md text-ui-sm font-medium text-ink-muted opacity-50 cursor-not-allowed select-none"
        >
          Web
        </button>
        <button
          type="button"
          disabled
          title="Next session"
          className="px-4 py-1.5 rounded-md text-ui-sm font-medium text-ink-muted opacity-50 cursor-not-allowed select-none"
        >
          Paste
        </button>
      </div>

      {/* Body */}
      <div className="space-y-6">
        {/* Error panel with retry */}
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

        {/* State 1: Uploading progress */}
        {uploading && (
          <ImportProgress
            filename={selectedFilename}
            progressPct={progressPct}
            stage="Uploading"
          />
        )}

        {/* State 2: Success result card with PipelineStepper */}
        {!uploading && importedBook && (
          <div
            className="w-full max-w-xl mx-auto rounded-xl border border-line bg-panel p-6 shadow-sm flex flex-col gap-5"
            role="status"
            aria-label="Import status"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-full bg-ok/15 text-ok flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-micro font-bold tracking-wider uppercase text-ok select-none">
                  Added to library
                </span>
                <h2 className="font-display font-semibold text-lg text-ink truncate mt-0.5" title={importedBook.title}>
                  {importedBook.title}
                </h2>
                {importedBook.author && (
                  <p className="text-ui-sm text-ink-muted truncate">
                    by {importedBook.author}
                  </p>
                )}
                <div className="flex items-center gap-3 text-caption text-ink-muted mt-2">
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                    {importedBook.chapterCount} {importedBook.chapterCount === 1 ? 'chapter' : 'chapters'}
                  </span>
                  {importedBook.sourceFormat && (
                    <span className="uppercase font-mono text-[11px] px-1.5 py-0.5 rounded bg-subtle text-ink-light">
                      {importedBook.sourceFormat}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Pipeline Stepper */}
            <div className="pt-3 pb-1 border-t border-line">
              <PipelineStepper jobs={jobs} activeJob={activeJob} />
            </div>

            {/* Background Job Error if any */}
            {failedJob && (
              <div
                role="alert"
                className="rounded-lg border border-err/30 bg-err/10 p-3 text-ink text-ui-sm flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-err shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-medium text-err">Processing error</p>
                  <p className="text-ink-muted mt-0.5">
                    {failedJob.error || 'A background processing job encountered an error.'}
                  </p>
                </div>
              </div>
            )}

            {/* Background Job Interrupted Notice */}
            {interruptedJob && (
              <div
                role="status"
                className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-ink text-ui-sm flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-ink">
                    Import was interrupted.{' '}
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="font-medium text-ink underline hover:text-accent-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    >
                      Retry import
                    </button>{' '}
                    to resume.
                  </p>
                </div>
              </div>
            )}

            {/* Actions and Caption */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-line">
              <div className="text-caption text-ink-muted select-none">
                {failedJob
                  ? 'Processing encountered an error'
                  : interruptedJob
                  ? 'Import was interrupted'
                  : pipelineComplete && !interruptedJob
                  ? 'Import complete'
                  : activeJob
                  ? 'Background processing…'
                  : 'Ready'}
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-line bg-card hover:bg-subtle text-ink font-medium text-ui-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none"
                >
                  <PlusCircle className="w-4 h-4 text-ink-muted" aria-hidden="true" />
                  <span>Add another</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate(`/book/${importedBook.id}`)}
                  className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium text-ui-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none ${
                    pipelineComplete && !interruptedJob
                      ? 'bg-brand text-white hover:opacity-90 shadow-sm'
                      : interruptedJob
                      ? 'border border-line bg-card text-ink hover:bg-subtle shadow-sm'
                      : 'border border-line bg-subtle/50 text-ink-muted hover:bg-subtle hover:text-ink'
                  }`}
                >
                  <span>Open book</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* State 3: Idle or retry (Dropzone visible) */}
        {!uploading && !importedBook && (
          <div className="max-w-xl mx-auto">
            <ImportDropzone onFiles={handleFiles} />
          </div>
        )}
      </div>
    </div>
  );
}

export default ImportRoute;
