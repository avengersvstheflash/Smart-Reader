import React, { useEffect } from 'react';
import {
  Download,
  AlertTriangle,
  WifiOff,
  CheckCircle2,
  Loader2,
  HardDrive,
  XCircle,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import { useResourceStore } from '../../store/useResourceStore';
import { ModelResource } from '../../types/resources';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 1 ? 1 : 0)} ${sizes[i]}`;
}

function formatEta(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export const FirstRunScreen: React.FC = () => {
  const {
    status,
    isLoading,
    isDownloading,
    error,
    diskSpaceError,
    fetchStatus,
    startDownload,
    cancelDownload,
    clearError,
  } = useResourceStore();

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const models: ModelResource[] = status?.models || [];
  const isOffline = status?.isOffline ?? false;
  const freeDisk = status?.freeDiskSpaceBytes || 0;
  const requiredDisk = status?.requiredDiskSpaceBytes || 4500000000;
  const hasLowDiskSpace = freeDisk > 0 && freeDisk < requiredDisk;

  const totalSize = status?.totalSizeBytes || 3704712226;
  const overallProgress = status?.overallProgress || 0;

  const currentDownloadingModel = models.find((m) => m.status === 'downloading');
  const activeSpeed = currentDownloadingModel?.speedBps || 0;
  const activeEta = currentDownloadingModel?.etaSeconds || 0;
  const hasErrors = models.some((m) => m.status === 'error');

  return (
    <div className="min-h-screen bg-paper flex flex-col justify-center items-center p-6 text-ink selection:bg-accent/20">
      <div className="w-full max-w-2xl bg-paper-elevated border border-ink/10 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="p-8 border-b border-ink/5 bg-paper-subtle/40">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-accent/10 text-accent rounded-xl">
              <Cpu className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-ink">
                Omnitome Neural Setup
              </h1>
              <p className="text-sm text-ink-muted mt-0.5">
                Local-first intelligence engine dependencies
              </p>
            </div>
          </div>
          <p className="text-xs text-ink/70 mt-4 leading-relaxed">
            Omnitome runs 100% locally on your machine without cloud inference. To enable
            semantic search, neural comprehension, OCR, and voice synthesis, download the
            verified model weights below.
          </p>
        </div>

        {/* Content body */}
        <div className="p-8 space-y-6">
          {/* Offline Warning Banner */}
          {isOffline && (
            <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400">
              <WifiOff className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <span className="font-semibold">Internet Connection Required</span>
                <p className="text-xs text-ink/70 mt-0.5">
                  An active connection is required for this one-time download. Once installed,
                  Omnitome operates completely offline.
                </p>
              </div>
              <button
                onClick={() => {
                  clearError();
                  fetchStatus();
                }}
                className="text-xs px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 font-medium rounded-lg transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}

          {/* Disk Space Warning Banner */}
          {(hasLowDiskSpace || diskSpaceError) && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400">
              <HardDrive className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <span className="font-semibold">Insufficient Drive Space</span>
                <p className="text-xs text-ink/70 mt-0.5">
                  Requires at least {formatBytes(diskSpaceError?.requiredBytes || requiredDisk)} free space. Available:{' '}
                  {formatBytes(diskSpaceError?.availableBytes || freeDisk)}. Please free up disk space and try again.
                </p>
              </div>
            </div>
          )}

          {/* General Error Banner */}
          {error && !diskSpaceError && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <span className="font-semibold">Download Failed</span>
                <p className="text-xs text-ink/70 mt-0.5">{error}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    clearError();
                    startDownload();
                  }}
                  className="text-xs px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 font-medium rounded transition-colors flex items-center gap-1 text-red-600 dark:text-red-400"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </button>
                <button
                  onClick={clearError}
                  className="text-xs px-2 py-1 bg-red-500/10 hover:bg-red-500/20 rounded transition-colors text-red-600 dark:text-red-400"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Overall Progress Section (During download) */}
          {isDownloading && (
            <div className="p-4 bg-accent/5 border border-accent/15 rounded-xl space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="font-semibold text-ink flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-accent" />
                  Downloading Neural Models...
                </span>
                <span className="font-mono text-xs font-semibold text-accent">
                  {overallProgress.toFixed(1)}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-ink/10 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-accent h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, overallProgress))}%` }}
                />
              </div>

              <div className="flex justify-between items-center text-xs text-ink-muted">
                <span>Speed: {activeSpeed > 0 ? `${formatBytes(activeSpeed)}/s` : '--'}</span>
                <span>ETA: {formatEta(activeEta)}</span>
              </div>
            </div>
          )}

          {/* Model Inventory List */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold tracking-wider text-ink-muted uppercase">
              Required Models ({models.length})
            </h2>

            <div className="divide-y divide-ink/5 border border-ink/5 rounded-xl overflow-hidden bg-paper-subtle/20">
              {models.map((model) => (
                <div key={model.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-ink truncate">{model.name}</span>
                      <span className="text-[11px] font-mono text-ink-muted bg-ink/5 px-2 py-0.5 rounded">
                        {formatBytes(model.sizeBytes)}
                      </span>
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5 line-clamp-1">
                      {model.description}
                    </p>
                  </div>

                  {/* Status Indicator */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {model.status === 'installed' && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Installed
                      </span>
                    )}

                    {model.status === 'downloading' && (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-accent font-medium bg-accent/10 px-2.5 py-1 rounded-lg">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {model.progress.toFixed(0)}%
                        </span>
                      </div>
                    )}

                    {model.status === 'verifying' && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-sky-600 font-medium bg-sky-500/10 px-2.5 py-1 rounded-lg">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Unpacking...
                      </span>
                    )}

                    {model.status === 'missing' && (
                      <span className="text-xs text-ink-muted bg-ink/5 px-2.5 py-1 rounded-lg">
                        Pending
                      </span>
                    )}

                    {model.status === 'error' && (
                      <span
                        title={model.error || 'Download failed'}
                        className="inline-flex items-center gap-1.5 text-xs text-red-600 font-medium bg-red-500/10 px-2.5 py-1 rounded-lg"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Failed
                      </span>
                    )}

                    {model.status === 'canceled' && (
                      <span className="text-xs text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                        Canceled
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-paper-subtle/60 border-t border-ink/5 flex items-center justify-between">
          <div className="text-xs text-ink-muted">
            <span>Disk Space Available: </span>
            <span className="font-semibold text-ink">{formatBytes(freeDisk)}</span>
          </div>

          <div className="flex items-center gap-3">
            {isDownloading ? (
              <button
                onClick={() => cancelDownload()}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors"
              >
                Cancel Download
              </button>
            ) : (
              <button
                onClick={() => startDownload()}
                disabled={isLoading || isOffline || hasLowDiskSpace}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow transition-all flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking...
                  </>
                ) : hasErrors ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Retry Download ({formatBytes(totalSize)})
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download Models ({formatBytes(totalSize)})
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

