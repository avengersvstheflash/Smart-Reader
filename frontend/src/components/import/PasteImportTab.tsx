import { useState, useMemo, useDeferredValue, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Layers,
  FolderPlus,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { useImportQueueStore } from '../../store/useImportQueueStore';
import { Book, normalizeBook, RawBook } from '../../types/domain';

interface PasteImportTabProps {
  onSuccess: (book: Book) => void;
}

const MIN_CHARS = 100;
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB technical ceiling

function fastCountWords(str: string): number {
  if (!str) return 0;
  let count = 0;
  let inWord = false;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 32) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      count++;
    }
  }
  return count;
}

interface RawDossier extends RawBook {
  isDossier?: boolean;
}

export function PasteImportTab({ onSuccess }: PasteImportTabProps) {
  const { enqueuePaste } = useImportQueueStore();

  // Wizard Step: 1: Text & Meta, 2: Dossier Selection, 3: Review & Confirm
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Text state
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');

  // Step 2: Dossier state
  const [dossierMode, setDossierMode] = useState<'existing' | 'new'>('new');
  const [selectedDossierId, setSelectedDossierId] = useState<string>('');
  const [newDossierTitle, setNewDossierTitle] = useState('');
  const [dossierSearch, setDossierSearch] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Query existing dossiers
  const { data: dossiersData, isLoading: loadingDossiers } = useQuery({
    queryKey: ['dossiers'],
    queryFn: async () => {
      const res = await apiClient<{ dossiers: RawDossier[] }>('/api/books/dossiers');
      return (res.dossiers || []).map(normalizeBook);
    },
  });

  const existingDossiers = dossiersData || [];

  // Filter existing dossiers
  const filteredDossiers = useMemo(() => {
    if (!dossierSearch.trim()) return existingDossiers;
    const q = dossierSearch.toLowerCase();
    return existingDossiers.filter(
      (d) => d.title.toLowerCase().includes(q) || (d.author && d.author.toLowerCase().includes(q))
    );
  }, [existingDossiers, dossierSearch]);

  // Live text metrics (debounced to keep large pastes 100% fluid)
  const deferredContent = useDeferredValue(content);
  const [metrics, setMetrics] = useState({
    charCount: 0,
    wordCount: 0,
    byteSize: 0,
  });

  useEffect(() => {
    const trimmed = deferredContent.trim();
    if (!trimmed) {
      setMetrics({ charCount: 0, wordCount: 0, byteSize: 0 });
      return;
    }
    const timer = setTimeout(() => {
      setMetrics({
        charCount: trimmed.length,
        wordCount: fastCountWords(trimmed),
        byteSize: new Blob([deferredContent]).size,
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [deferredContent]);

  const trimmedContent = content.trim();
  const charCount = metrics.charCount || trimmedContent.length;
  const wordCount = metrics.wordCount || fastCountWords(trimmedContent);
  const byteSize = metrics.byteSize || content.length;
  const sizeKB = Math.round(byteSize / 1024);
  const sizeMB = (byteSize / (1024 * 1024)).toFixed(2);
  const estReadTimeMins = Math.max(1, Math.round(wordCount / 220));
  const estTokens = Math.round(wordCount * 1.3);

  // Validation
  const isSizeExceeded = byteSize > MAX_BYTES;
  const isTextValid = title.trim().length > 0 && charCount >= MIN_CHARS && !isSizeExceeded;

  const isDossierValid = useMemo(() => {
    if (dossierMode === 'existing') {
      return Boolean(selectedDossierId);
    }
    return newDossierTitle.trim().length >= 3 && newDossierTitle.trim().length <= 100;
  }, [dossierMode, selectedDossierId, newDossierTitle]);

  // Check if entered new dossier title matches an existing dossier
  const matchingExistingDossier = useMemo(() => {
    if (dossierMode !== 'new' || !newDossierTitle.trim()) return null;
    const q = newDossierTitle.trim().toLowerCase();
    return existingDossiers.find((d) => d.title.trim().toLowerCase() === q) || null;
  }, [dossierMode, newDossierTitle, existingDossiers]);

  const resolvedDossierName = useMemo(() => {
    if (dossierMode === 'existing') {
      const found = existingDossiers.find((d) => d.id === selectedDossierId);
      return found ? found.title : 'Selected Dossier';
    }
    return newDossierTitle.trim() || 'New Research Dossier';
  }, [dossierMode, selectedDossierId, newDossierTitle, existingDossiers]);

  // Final submission into background queue
  const handleConfirmEnqueue = async () => {
    if (!isTextValid || !isDossierValid || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const task = await enqueuePaste({
        title: title.trim(),
        author: author.trim() || undefined,
        text: trimmedContent,
        isNewDossier: dossierMode === 'new',
        dossierId: dossierMode === 'existing' ? selectedDossierId : undefined,
        dossierTitle: dossierMode === 'new' ? newDossierTitle.trim() : undefined,
      });

      // Construct dummy/provisional book object for onSuccess callback
      const provisionalBook: Book = {
        id: task.bookId || `pending-${task.id}`,
        title: title.trim(),
        author: author.trim() || 'Pasted Research',
        description: `Enqueued into dossier "${resolvedDossierName}"`,
        contentType: 'research',
        chapterCount: 1,
        readChapterCount: 0,
        wordCount: wordCount,
        hasSmartContent: false,
        sourceFormat: 'paste',
      };

      onSuccess(provisionalBook);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enqueue import. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* ── Step Progress Indicator ── */}
      <div className="flex items-center justify-between border-b border-line pb-4 text-ui-sm select-none">
        <button
          type="button"
          onClick={() => setStep(1)}
          className={`flex items-center gap-2 font-medium transition-colors ${
            step === 1 ? 'text-brand' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono ${
              step === 1 ? 'bg-brand text-white' : 'bg-subtle text-ink-muted'
            }`}
          >
            1
          </span>
          <span>Content & Details</span>
        </button>

        <span className="w-8 h-px bg-line select-none" aria-hidden="true" />

        <button
          type="button"
          disabled={!isTextValid}
          onClick={() => isTextValid && setStep(2)}
          className={`flex items-center gap-2 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            step === 2 ? 'text-brand' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono ${
              step === 2 ? 'bg-brand text-white' : 'bg-subtle text-ink-muted'
            }`}
          >
            2
          </span>
          <span>Assign Dossier</span>
        </button>

        <span className="w-8 h-px bg-line select-none" aria-hidden="true" />

        <button
          type="button"
          disabled={!isTextValid || !isDossierValid}
          onClick={() => isTextValid && isDossierValid && setStep(3)}
          className={`flex items-center gap-2 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            step === 3 ? 'text-brand' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono ${
              step === 3 ? 'bg-brand text-white' : 'bg-subtle text-ink-muted'
            }`}
          >
            3
          </span>
          <span>Review & Confirm</span>
        </button>
      </div>

      {/* ── STEP 1: CONTENT & DETAILS ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="paste-title" className="text-ui-sm font-medium text-ink">
              Document Title <span className="text-err" aria-hidden="true">*</span>
            </label>
            <input
              id="paste-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Distributed Consensus Under Network Partitions"
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-line bg-panel text-ink text-ui-sm placeholder:text-ink-muted focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="paste-author" className="text-ui-sm font-medium text-ink">
              Author / Source Attribution <span className="text-caption text-ink-muted font-normal">(optional)</span>
            </label>
            <input
              id="paste-author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. Leslie Lamport, Turing Institute"
              className="w-full px-3.5 py-2.5 rounded-lg border border-line bg-panel text-ink text-ui-sm placeholder:text-ink-muted focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="paste-content" className="text-ui-sm font-medium text-ink">
                Pasted Text Content <span className="text-err" aria-hidden="true">*</span>
              </label>
              <div className="flex items-center gap-3 text-caption">
                <span
                  className={
                    charCount === 0
                      ? 'text-ink-muted'
                      : charCount < MIN_CHARS
                      ? 'text-err'
                      : 'text-ok font-medium'
                  }
                >
                  {charCount < MIN_CHARS
                    ? `${MIN_CHARS - charCount} more chars needed`
                    : `${charCount.toLocaleString()} characters`}
                </span>
                <span className="text-ink-muted font-mono">{sizeKB > 0 ? `${sizeKB} KB` : ''}</span>
              </div>
            </div>

            <textarea
              id="paste-content"
              rows={12}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste large text inputs here -- entire papers, long articles, lecture notes, or reference docs. Omnitome supports large multi-megabyte texts with automated sectioning and semantic indexing..."
              required
              className="w-full px-3.5 py-3 rounded-lg border border-line bg-panel text-ink text-ui-sm placeholder:text-ink-muted resize-y focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all font-sans leading-relaxed"
            />

            {/* Metrics feedback bar */}
            {charCount > 0 && (
              <div className="rounded-lg bg-surface/60 border border-line p-3 flex flex-wrap items-center justify-between gap-3 text-caption text-ink-muted">
                <div className="flex items-center gap-4 flex-wrap">
                  <span>
                    Words: <strong className="text-ink font-mono">{wordCount.toLocaleString()}</strong>
                  </span>
                  <span>
                    Reading time: <strong className="text-ink">~{estReadTimeMins} mins</strong>
                  </span>
                  <span>
                    Estimated tokens: <strong className="text-ink font-mono">~{estTokens.toLocaleString()}</strong>
                  </span>
                  <span>
                    Payload: <strong className="text-ink font-mono">{sizeKB < 1024 ? `${sizeKB} KB` : `${sizeMB} MB`}</strong>
                  </span>
                </div>
                <span className="text-ok font-medium">Safe for background processing</span>
              </div>
            )}

            {isSizeExceeded && (
              <div className="rounded-lg bg-err/10 border border-err/30 p-3 flex items-start gap-2.5 text-caption text-err">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  Pasted text exceeds the 50MB technical payload limit ({sizeMB} MB). For files of this size,
                  please save your content as a <code>.txt</code> or <code>.epub</code> file and upload via the File tab.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={!isTextValid}
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none shadow-sm"
            >
              <span>Next: Assign Dossier</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: DOSSIER ASSIGNMENT ── */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="space-y-1">
            <h3 className="font-display font-medium text-lg text-ink">Assign to Destination Dossier</h3>
            <p className="text-ui-sm text-ink-muted">
              Every pasted input must be assigned to a research dossier to preserve context and cross-reference citations.
            </p>
          </div>

          {/* Option Toggle */}
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Dossier destination type">
            <button
              type="button"
              role="radio"
              aria-checked={dossierMode === 'new'}
              onClick={() => setDossierMode('new')}
              className={`p-4 rounded-xl border text-left flex flex-col gap-2 transition-all ${
                dossierMode === 'new'
                  ? 'border-brand bg-brand/5 shadow-sm ring-1 ring-brand'
                  : 'border-line bg-card hover:bg-subtle/50'
              }`}
            >
              <div className="flex items-center gap-2 text-ui-sm font-semibold text-ink">
                <FolderPlus className="w-4 h-4 text-brand" />
                <span>Create New Dossier</span>
              </div>
              <p className="text-caption text-ink-muted">
                Create a dedicated research collection with this document as its first chapter.
              </p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={dossierMode === 'existing'}
              onClick={() => setDossierMode('existing')}
              className={`p-4 rounded-xl border text-left flex flex-col gap-2 transition-all ${
                dossierMode === 'existing'
                  ? 'border-brand bg-brand/5 shadow-sm ring-1 ring-brand'
                  : 'border-line bg-card hover:bg-subtle/50'
              }`}
            >
              <div className="flex items-center gap-2 text-ui-sm font-semibold text-ink">
                <Layers className="w-4 h-4 text-accent-ink" />
                <span>Existing Dossier</span>
              </div>
              <p className="text-caption text-ink-muted">
                Append this content to an existing research collection in your library.
              </p>
            </button>
          </div>

          {/* Option A: Existing Dossier Selector */}
          {dossierMode === 'existing' && (
            <div className="space-y-3 pt-2">
              <div className="relative">
                <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={dossierSearch}
                  onChange={(e) => setDossierSearch(e.target.value)}
                  placeholder="Search existing dossiers…"
                  className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-line bg-panel text-ink text-ui-sm focus:outline-none focus:border-brand"
                />
              </div>

              {loadingDossiers ? (
                <p className="text-caption text-ink-muted text-center py-4">Loading your dossiers…</p>
              ) : filteredDossiers.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-line rounded-lg text-ink-muted text-caption space-y-2">
                  <p>No existing dossiers found.</p>
                  <button
                    type="button"
                    onClick={() => setDossierMode('new')}
                    className="text-brand hover:underline font-medium"
                  >
                    Switch to creating a new dossier
                  </button>
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 rounded-xl border border-line bg-panel p-2">
                  {filteredDossiers.map((dossier) => {
                    const isSelected = selectedDossierId === dossier.id;
                    return (
                      <div
                        key={dossier.id}
                        onClick={() => setSelectedDossierId(dossier.id)}
                        className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                          isSelected
                            ? 'border-brand bg-brand/10 shadow-xs'
                            : 'border-line/60 hover:bg-subtle/60'
                        }`}
                      >
                        <div className="min-w-0">
                          <h4 className="text-ui-sm font-medium text-ink truncate">{dossier.title}</h4>
                          <p className="text-caption text-ink-muted truncate">
                            {dossier.chapterCount} {dossier.chapterCount === 1 ? 'source' : 'sources'} ·{' '}
                            {dossier.wordCount?.toLocaleString() || 0} words
                          </p>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Option B: New Dossier Input */}
          {dossierMode === 'new' && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="new-dossier-name" className="text-ui-sm font-medium text-ink">
                  New Dossier Title <span className="text-err">*</span>
                </label>
                <input
                  id="new-dossier-name"
                  type="text"
                  value={newDossierTitle}
                  onChange={(e) => setNewDossierTitle(e.target.value)}
                  placeholder="e.g. Distributed Consensus & Fault Tolerance"
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-line bg-panel text-ink text-ui-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
                <p className="text-caption text-ink-muted">
                  A new multi-source dossier will be created in your library to group this and future related papers.
                </p>
                {matchingExistingDossier && (
                  <div className="flex items-center gap-1.5 p-2 rounded-md bg-brand/10 border border-brand/20 text-brand text-caption">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      An existing dossier with this name was found ("{matchingExistingDossier.title}"). New content will be grouped into it as a new chapter.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-line">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-line bg-card hover:bg-subtle text-ink font-medium text-ui-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <button
              type="button"
              disabled={!isDossierValid}
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none shadow-sm"
            >
              <span>Next: Review & Confirm</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: REVIEW & CONFIRMATION ── */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="space-y-1">
            <h3 className="font-display font-medium text-lg text-ink">Review & Confirm Import</h3>
            <p className="text-ui-sm text-ink-muted">
              Confirm destination dossier and metrics. Once submitted, Omnitome will process this import in the
              background queue.
            </p>
          </div>

          {/* Review Card */}
          <div className="rounded-xl border border-line bg-panel p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-caption font-medium bg-brand/10 text-brand">
                {dossierMode === 'new' ? 'New Dossier Target' : 'Existing Dossier Target'}
              </span>
              <span className="text-ui-sm font-semibold text-ink">{resolvedDossierName}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 border-y border-line">
              <div>
                <span className="text-caption text-ink-muted">Characters</span>
                <p className="font-mono font-medium text-ink">{charCount.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-caption text-ink-muted">Words</span>
                <p className="font-mono font-medium text-ink">~{wordCount.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-caption text-ink-muted">Est. Read Time</span>
                <p className="font-medium text-ink">~{estReadTimeMins} mins</p>
              </div>
              <div>
                <span className="text-caption text-ink-muted">Storage Size</span>
                <p className="font-mono font-medium text-ink">{sizeKB} KB</p>
              </div>
            </div>

            <div>
              <span className="text-caption font-medium text-ink-muted">Document:</span>
              <p className="text-ui-sm font-semibold text-ink">{title}</p>
              {author && <p className="text-caption text-ink-muted">by {author}</p>}
            </div>

            {/* Preview snippet */}
            <div>
              <span className="text-caption font-medium text-ink-muted">Content Preview:</span>
              <div className="mt-1.5 p-3 rounded-lg bg-surface border border-line text-caption text-ink font-serif leading-relaxed max-h-36 overflow-y-auto">
                <p>{trimmedContent.slice(0, 500)}…</p>
              </div>
            </div>

            <div className="rounded-lg bg-ok/10 border border-ok/30 p-3 flex items-start gap-2 text-caption text-ok">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                Validation passed. Ingestion will parse sections, normalize typography, build semantic vectors, and
                persist to dossier "{resolvedDossierName}".
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-ui-sm text-err text-center">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-line bg-card hover:bg-subtle text-ink font-medium text-ui-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleConfirmEnqueue()}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-brand text-white font-medium hover:opacity-90 disabled:opacity-40 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none shadow-md shadow-brand/20 animate-button-glow"
            >
              <Sparkles className="w-4 h-4" />
              <span>{submitting ? 'Enqueueing…' : 'Confirm & Enqueue Import'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PasteImportTab;
