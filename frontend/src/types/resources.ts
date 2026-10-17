export type ModelStatus = 'installed' | 'missing' | 'downloading' | 'verifying' | 'error' | 'canceled';

export interface ModelResource {
  id: string;
  name: string;
  description: string;
  version: string;
  format: 'direct' | 'tar' | 'tar.gz' | 'zip';
  status: ModelStatus;
  sizeBytes: number;
  bytesDownloaded: number;
  progress: number;
  speedBps: number;
  etaSeconds: number;
  error: string | null;
  required: boolean;
  lockedSha256: string | null;
}

export interface ResourceStatusResponse {
  allInstalled: boolean;
  isOffline: boolean;
  freeDiskSpaceBytes: number;
  requiredDiskSpaceBytes: number;
  totalSizeBytes: number;
  totalDownloadedBytes: number;
  overallProgress: number;
  models: ModelResource[];
}

export interface ProgressEventPayload {
  modelId: string;
  status: ModelStatus;
  bytesDownloaded: number;
  totalBytes: number;
  progress: number;
  speedBps: number;
  etaSeconds: number;
  overallBytesDownloaded?: number;
  overallTotalBytes?: number;
  overallProgress?: number;
}

