import React, { useState } from 'react';
import { Modal } from '../shared/Modal';
import { ImportDropzone } from '../import/ImportDropzone';
import { useAttachSource } from '../../hooks/useAttachSource';
import { FileUp, Globe, Clipboard, Loader2, AlertCircle, FileText } from 'lucide-react';

export interface AttachSourceModalProps {
  open: boolean;
  onClose: (reason?: 'esc' | 'backdrop' | 'action') => void;
  dossierId: string;
  onSuccessToast?: (message: string) => void;
}

type TabType = 'file' | 'web' | 'paste';

export function AttachSourceModal({
  open,
  onClose,
  dossierId,
  onSuccessToast,
}: AttachSourceModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('file');

  // File tab state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [fileAuthor, setFileAuthor] = useState('');

  // Web tab state
  const [webUrl, setWebUrl] = useState('');
  const [webTitle, setWebTitle] = useState('');
  const [webAuthor, setWebAuthor] = useState('');

  // Paste tab state
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteAuthor, setPasteAuthor] = useState('');
  const [pasteText, setPasteText] = useState('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const attachSourceMutation = useAttachSource(dossierId);

  const resetForm = () => {
    setSelectedFile(null);
    setFileTitle('');
    setFileAuthor('');
    setWebUrl('');
    setWebTitle('');
    setWebAuthor('');
    setPasteTitle('');
    setPasteAuthor('');
    setPasteText('');
    setErrorMessage(null);
  };

  const handleClose = (reason: 'esc' | 'backdrop' | 'action' = 'action') => {
    resetForm();
    onClose(reason);
  };

  const handleSuccess = () => {
    handleClose('action');
    if (onSuccessToast) {
      onSuccessToast('Source added — processing in background');
    }
  };

  const handleFileDrop = (files: File[]) => {
    if (files.length > 0) {
      const f = files[0];
      setSelectedFile(f);
      const cleanName = f.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setFileTitle(cleanName);
      setErrorMessage(null);
    }
  };

  const submitFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage('Please select a file to attach.');
      return;
    }
    setErrorMessage(null);
    try {
      await attachSourceMutation.mutateAsync({
        sourceType: 'file',
        file: selectedFile,
        title: fileTitle.trim() || undefined,
        author: fileAuthor.trim() || undefined,
      });
      handleSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to attach file');
    }
  };

  const submitWeb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webUrl.trim()) {
      setErrorMessage('Please enter a valid URL.');
      return;
    }
    setErrorMessage(null);
    try {
      await attachSourceMutation.mutateAsync({
        sourceType: 'web',
        url: webUrl.trim(),
        title: webTitle.trim() || undefined,
        author: webAuthor.trim() || undefined,
      });
      handleSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to attach web source');
    }
  };

  const submitPaste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteTitle.trim()) {
      setErrorMessage('Title is required.');
      return;
    }
    if (pasteText.trim().length < 200) {
      setErrorMessage('Text content must be at least 200 characters.');
      return;
    }
    setErrorMessage(null);
    try {
      await attachSourceMutation.mutateAsync({
        sourceType: 'paste',
        title: pasteTitle.trim(),
        author: pasteAuthor.trim() || undefined,
        text: pasteText.trim(),
      });
      handleSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to attach pasted content');
    }
  };

  const isPending = attachSourceMutation.isPending;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Attach Source to Dossier"
      description="Add a new file, web page, or text excerpt into this research dossier."
      size="md"
    >
      <div className="space-y-4 pt-1">
        {/* Tab Navigation */}
        <div className="flex border-b border-line gap-2" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'file'}
            onClick={() => {
              setActiveTab('file');
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 px-3 py-2 text-ui-sm font-medium border-b-2 transition-colors ${
              activeTab === 'file'
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <FileUp className="w-4 h-4" />
            <span>File</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'web'}
            onClick={() => {
              setActiveTab('web');
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 px-3 py-2 text-ui-sm font-medium border-b-2 transition-colors ${
              activeTab === 'web'
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Web</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'paste'}
            onClick={() => {
              setActiveTab('paste');
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 px-3 py-2 text-ui-sm font-medium border-b-2 transition-colors ${
              activeTab === 'paste'
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <Clipboard className="w-4 h-4" />
            <span>Paste</span>
          </button>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="p-3 text-xs rounded-md bg-danger/10 border border-danger/20 text-danger flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* ── FILE TAB ── */}
        {activeTab === 'file' && (
          <form onSubmit={submitFile} className="space-y-4">
            <ImportDropzone
              onFiles={handleFileDrop}
              accept=".pdf,.epub,.docx,.rtf,.txt,.md"
              multiple={false}
              disabled={isPending}
              compact={Boolean(selectedFile)}
              hint="PDF · EPUB · DOCX · RTF · TXT · MD"
            />

            {selectedFile && (
              <div className="p-3 rounded-lg border border-line bg-card/60 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-brand shrink-0" />
                  <span className="text-xs font-medium text-ink truncate">{selectedFile.name}</span>
                  <span className="text-[11px] text-ink-muted shrink-0">
                    ({(selectedFile.size / 1024).toFixed(0)} KB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  disabled={isPending}
                  className="text-xs text-danger hover:underline ml-2 shrink-0"
                >
                  Change
                </button>
              </div>
            )}

            {selectedFile && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-caption text-ink-muted mb-1 font-medium">
                    Title (optional)
                  </label>
                  <input
                    type="text"
                    value={fileTitle}
                    onChange={(e) => setFileTitle(e.target.value)}
                    placeholder="Document title"
                    disabled={isPending}
                    className="w-full text-ui-sm bg-subtle border border-line rounded px-3 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="block text-caption text-ink-muted mb-1 font-medium">
                    Author (optional)
                  </label>
                  <input
                    type="text"
                    value={fileAuthor}
                    onChange={(e) => setFileAuthor(e.target.value)}
                    placeholder="Author name"
                    disabled={isPending}
                    className="w-full text-ui-sm bg-subtle border border-line rounded px-3 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleClose('action')}
                disabled={isPending}
                className="px-3.5 py-1.5 text-ui-sm rounded border border-line hover:bg-subtle text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedFile || isPending}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-ui-sm font-medium rounded bg-brand text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Attach file</span>
              </button>
            </div>
          </form>
        )}

        {/* ── WEB TAB ── */}
        {activeTab === 'web' && (
          <form onSubmit={submitWeb} className="space-y-4">
            <div>
              <label className="block text-caption text-ink-muted mb-1 font-medium">
                Web URL <span className="text-danger">*</span>
              </label>
              <input
                type="url"
                required
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                placeholder="https://arxiv.org/abs/... or https://en.wikipedia.org/wiki/..."
                disabled={isPending}
                className="w-full text-ui-sm bg-subtle border border-line rounded px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-caption text-ink-muted mb-1 font-medium">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={webTitle}
                  onChange={(e) => setWebTitle(e.target.value)}
                  placeholder="Custom article title"
                  disabled={isPending}
                  className="w-full text-ui-sm bg-subtle border border-line rounded px-3 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-caption text-ink-muted mb-1 font-medium">
                  Author (optional)
                </label>
                <input
                  type="text"
                  value={webAuthor}
                  onChange={(e) => setWebAuthor(e.target.value)}
                  placeholder="Author or publication"
                  disabled={isPending}
                  className="w-full text-ui-sm bg-subtle border border-line rounded px-3 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleClose('action')}
                disabled={isPending}
                className="px-3.5 py-1.5 text-ui-sm rounded border border-line hover:bg-subtle text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!webUrl.trim() || isPending}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-ui-sm font-medium rounded bg-brand text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Fetch</span>
              </button>
            </div>
          </form>
        )}

        {/* ── PASTE TAB ── */}
        {activeTab === 'paste' && (
          <form onSubmit={submitPaste} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-caption text-ink-muted mb-1 font-medium">
                  Title <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="e.g. Research Notes or Excerpt"
                  disabled={isPending}
                  className="w-full text-ui-sm bg-subtle border border-line rounded px-3 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-caption text-ink-muted mb-1 font-medium">
                  Author (optional)
                </label>
                <input
                  type="text"
                  value={pasteAuthor}
                  onChange={(e) => setPasteAuthor(e.target.value)}
                  placeholder="Author name"
                  disabled={isPending}
                  className="w-full text-ui-sm bg-subtle border border-line rounded px-3 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-caption text-ink-muted font-medium">
                  Text content <span className="text-danger">*</span>
                </label>
                <span
                  className={`text-[11px] font-mono ${
                    pasteText.trim().length >= 200 ? 'text-accent' : 'text-ink-muted'
                  }`}
                >
                  {pasteText.trim().length} / 200 chars min
                </span>
              </div>
              <textarea
                required
                rows={6}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste research text here (minimum 200 characters)..."
                disabled={isPending}
                className="w-full text-ui-sm font-sans bg-subtle border border-line rounded px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-brand resize-y"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleClose('action')}
                disabled={isPending}
                className="px-3.5 py-1.5 text-ui-sm rounded border border-line hover:bg-subtle text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!pasteTitle.trim() || pasteText.trim().length < 200 || isPending}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-ui-sm font-medium rounded bg-brand text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Attach paste</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
