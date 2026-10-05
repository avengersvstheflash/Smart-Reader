import { useState, useRef, DragEvent, KeyboardEvent, ChangeEvent } from 'react';
import { Upload } from 'lucide-react';

export interface ImportDropzoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  compact?: boolean;
  hint?: string;
}

export const ImportDropzone: React.FC<ImportDropzoneProps> = ({
  onFiles,
  accept = '.txt,.epub,.pdf,.html,.htm,.md,.docx,.rtf',
  multiple = false,
  disabled = false,
  compact = false,
  hint = 'TXT Â· EPUB Â· PDF Â· HTML Â· Markdown',
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      onFiles(multiple ? droppedFiles : [droppedFiles[0]]);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (disabled || !e.target.files) return;
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
      onFiles(multiple ? selectedFiles : [selectedFiles[0]]);
    }
    // Reset file input so selecting the same file triggers change again
    e.target.value = '';
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-disabled={disabled}
      aria-label="Upload document dropzone. Enter or Space to open file picker."
      className={`relative w-full rounded-2xl border-2 transition-all duration-150 flex flex-col items-center justify-center text-center select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        compact ? 'p-6 min-h-[160px] max-h-[180px]' : 'p-8 md:p-12 min-h-[220px] max-h-[260px]'
      } ${
        disabled
          ? 'border-line bg-subtle/50 opacity-50 cursor-not-allowed'
          : isDragOver
          ? 'border-2 border-dashed border-[rgb(var(--accent))] shadow-[0_0_25px_rgb(var(--accent)/0.25)] bg-[rgb(var(--accent)/0.05)] scale-[1.005]'
          : 'border-2 border-dashed border-[rgb(var(--accent)/0.4)] bg-[rgb(var(--surface)/0.5)] hover:border-[rgb(var(--accent))] hover:shadow-[0_0_25px_rgb(var(--accent)/0.25)] hover:bg-[rgb(var(--accent)/0.05)]'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        onChange={handleFileInput}
        aria-hidden="true"
      />

      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-150 shadow-[0_0_15px_rgb(var(--accent)/0.2)] ${
          isDragOver
            ? 'bg-accent/20 text-[rgb(var(--accent))] -translate-y-[2px] shadow-[0_0_20px_rgb(var(--accent)/0.4)]'
            : 'bg-subtle text-[rgb(var(--accent))]'
        }`}
      >
        <Upload className="w-6 h-6 filter drop-shadow-[0_0_6px_rgb(var(--accent)/0.5)]" aria-hidden="true" />
      </div>

      <div className="mt-4 flex flex-col gap-1 items-center">
        <p className="font-ui font-medium text-ui text-ink">
          <span className="text-[rgb(var(--accent))] hover:underline">Choose a file</span> or drag and drop
        </p>
        <p className="text-caption text-ink-muted">{hint}</p>
        <p className="text-micro text-ink-light mt-0.5">Up to 50MB per file</p>
      </div>
    </div>
  );
};

export default ImportDropzone;

