const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const dns = require('dns').promises;
const tar = require('tar');
const AdmZip = require('adm-zip');

class ResourceManager {
  constructor(customModelsDir = null) {
    this.modelsDir = customModelsDir || this._resolveDefaultModelsDir();
    this.manifestPath = path.join(__dirname, '..', 'config', 'models.json');
    this.manifest = this._loadManifest();
    this.lockfilePath = path.join(this.modelsDir, 'manifest.lock.json');
    this.activeDownloads = new Map(); // modelId -> { controller, fileStream, tmpPath }
    this.modelStates = new Map(); // modelId -> { status, bytesDownloaded, progress, speedBps, etaSeconds, error }
    this.sseClients = new Set();
    this.isDownloadingAll = false;
    this.cancelRequested = false;
  }

  _resolveDefaultModelsDir() {
    if (process.env.OMNITOME_MODEL_DIR) {
      return path.resolve(process.env.OMNITOME_MODEL_DIR);
    }
    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      return path.join(localAppData, 'Omnitome', 'models');
    }
    return path.join(os.homedir(), '.omnitome', 'models');
  }

  _loadManifest() {
    try {
      const raw = fs.readFileSync(this.manifestPath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error('[ResourceManager] Failed to load models.json manifest:', err.message);
      return {
        version: '1.0.0',
        minFreeDiskSpaceBytes: 4500000000,
        models: [],
      };
    }
  }

  _loadLockfile() {
    try {
      if (fs.existsSync(this.lockfilePath)) {
        const raw = fs.readFileSync(this.lockfilePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn('[ResourceManager] Could not read manifest.lock.json:', err.message);
    }
    return {
      manifestVersion: this.manifest.version || '1.0.0',
      lockedAt: new Date().toISOString(),
      models: {},
    };
  }

  _saveLockfile(lockdata) {
    try {
      fs.mkdirSync(path.dirname(this.lockfilePath), { recursive: true });
      fs.writeFileSync(this.lockfilePath, JSON.stringify(lockdata, null, 2), 'utf8');
    } catch (err) {
      console.error('[ResourceManager] Failed to write manifest.lock.json:', err.message);
    }
  }

  recordLockedHash(modelId, sha256, sizeBytes) {
    const lockdata = this._loadLockfile();
    if (!lockdata.models) lockdata.models = {};
    lockdata.models[modelId] = {
      sha256,
      sizeBytes,
      installedAt: new Date().toISOString(),
    };
    lockdata.lockedAt = new Date().toISOString();
    this._saveLockfile(lockdata);
  }

  async isOnline() {
    if (process.env.OFFLINE === '1' || process.env.OFFLINE === 'true') {
      return false;
    }
    const checkHost = (host) => {
      return new Promise((resolve) => {
        let settled = false;
        let timer = null;

        const onAbort = () => {
          if (!settled) {
            settled = true;
            if (timer) clearTimeout(timer);
            resolve(false);
          }
        };

        let signal = null;
        try {
          signal = AbortSignal.timeout(2000);
          signal.addEventListener('abort', onAbort, { once: true });
        } catch (_) {}

        timer = setTimeout(onAbort, 2000);

        dns.lookup(host)
          .then(() => {
            if (!settled) {
              settled = true;
              if (timer) clearTimeout(timer);
              resolve(true);
            }
          })
          .catch(() => {
            if (!settled) {
              settled = true;
              if (timer) clearTimeout(timer);
              resolve(false);
            }
          });
      });
    };

    try {
      const overallSignal = AbortSignal.timeout(2000);
      const pingPromise = Promise.any([
        checkHost('huggingface.co').then((ok) => (ok ? true : Promise.reject())),
        checkHost('github.com').then((ok) => (ok ? true : Promise.reject())),
      ]).catch(() => false);

      let overallTimer = null;
      const timeoutPromise = new Promise((resolve) => {
        overallSignal.addEventListener('abort', () => {
          if (overallTimer) clearTimeout(overallTimer);
          resolve(false);
        }, { once: true });
        overallTimer = setTimeout(() => resolve(false), 2000);
      });

      const result = await Promise.race([pingPromise, timeoutPromise]);
      if (overallTimer) clearTimeout(overallTimer);
      return result;
    } catch (_) {
      return false;
    }
  }

  async getDiskSpace() {
    let curr = path.resolve(this.modelsDir);
    while (!fs.existsSync(curr)) {
      const parent = path.dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }
    try {
      const stats = await fs.promises.statfs(curr);
      const bavail = BigInt(stats.bavail);
      const bsize = BigInt(stats.bsize);
      const freeBytes = Number(bavail * bsize);
      return {
        availableBytes: freeBytes,
        path: curr,
      };
    } catch (err) {
      console.warn('[ResourceManager] statfs check failed, fallback to 100GB:', err.message);
      return {
        availableBytes: 100 * 1024 * 1024 * 1024,
        path: curr,
      };
    }
  }

  async checkDiskSpace(requiredBytes = null) {
    const { availableBytes } = await this.getDiskSpace();
    const needed = requiredBytes !== null ? requiredBytes : (this.manifest.minFreeDiskSpaceBytes || 4500000000);
    return {
      availableBytes,
      requiredBytes: needed,
      hasSpace: availableBytes >= needed,
    };
  }

  isModelInstalled(model) {
    if (!model) return false;
    const targetDir = path.join(this.modelsDir, model.targetSubdir);

    if (model.format === 'direct') {
      const directFile = (model.markerFiles && model.markerFiles.length > 0)
        ? path.join(targetDir, model.markerFiles[0])
        : targetDir;
      return fs.existsSync(directFile);
    }

    if (!fs.existsSync(targetDir)) {
      return false;
    }

    if (Array.isArray(model.markerFiles) && model.markerFiles.length > 0) {
      for (const marker of model.markerFiles) {
        const markerPath = path.join(targetDir, marker);
        if (!fs.existsSync(markerPath)) {
          return false;
        }
      }
    }

    return true;
  }

  areAllInstalled() {
    for (const model of this.manifest.models) {
      if (model.required && !this.isModelInstalled(model)) {
        return false;
      }
    }
    return true;
  }

  async getStatus() {
    let isOnline = false;
    try {
      const statusSignal = AbortSignal.timeout(2000);
      const pingPromise = this.isOnline();
      let timer = null;
      const timeoutPromise = new Promise((resolve) => {
        statusSignal.addEventListener('abort', () => {
          if (timer) clearTimeout(timer);
          resolve(false);
        }, { once: true });
        timer = setTimeout(() => resolve(false), 2000);
      });
      isOnline = await Promise.race([pingPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);
    } catch (_) {
      isOnline = false;
    }
    const { availableBytes } = await this.getDiskSpace();
    const lockdata = this._loadLockfile();

    let totalSizeBytes = 0;
    let totalDownloadedBytes = 0;

    const modelsStatus = this.manifest.models.map((model) => {
      const installed = this.isModelInstalled(model);
      const activeState = this.modelStates.get(model.id) || {};
      totalSizeBytes += model.sizeBytes || 0;

      let status = 'missing';
      let bytesDownloaded = 0;
      let progress = 0.0;
      let error = activeState.error || null;

      if (installed) {
        status = 'installed';
        bytesDownloaded = model.sizeBytes || 0;
        progress = 100.0;
        totalDownloadedBytes += bytesDownloaded;
      } else if (activeState.status) {
        status = activeState.status;
        bytesDownloaded = activeState.bytesDownloaded || 0;
        progress = activeState.progress || 0.0;
        totalDownloadedBytes += bytesDownloaded;
      }

      return {
        id: model.id,
        name: model.name,
        description: model.description,
        version: model.version,
        format: model.format,
        status,
        sizeBytes: model.sizeBytes,
        bytesDownloaded,
        progress,
        speedBps: activeState.speedBps || 0,
        etaSeconds: activeState.etaSeconds || 0,
        error,
        required: !!model.required,
        lockedSha256: lockdata.models?.[model.id]?.sha256 || null,
      };
    });

    const allInstalled = modelsStatus.every((m) => !m.required || m.status === 'installed');
    const overallProgress = totalSizeBytes > 0
      ? Number(((totalDownloadedBytes / totalSizeBytes) * 100).toFixed(1))
      : 0.0;

    return {
      allInstalled,
      isOffline: !isOnline,
      freeDiskSpaceBytes: availableBytes,
      requiredDiskSpaceBytes: this.manifest.minFreeDiskSpaceBytes || 4500000000,
      totalSizeBytes,
      totalDownloadedBytes,
      overallProgress,
      models: modelsStatus,
    };
  }

  addSSEClient(res) {
    this.sseClients.add(res);
  }

  removeSSEClient(res) {
    this.sseClients.delete(res);
  }

  broadcastSSE(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch (_) {
        this.sseClients.delete(client);
      }
    }
  }

  cancelDownload(modelId = null) {
    if (modelId) {
      const active = this.activeDownloads.get(modelId);
      if (active) {
        active.controller.abort();
      }
      this.modelStates.set(modelId, {
        status: 'missing',
        bytesDownloaded: 0,
        progress: 0.0,
        error: 'Download canceled by user',
      });
      this.broadcastSSE('progress', {
        modelId,
        status: 'canceled',
        message: 'Download canceled by user',
      });
    } else {
      this.cancelRequested = true;
      for (const [id, active] of this.activeDownloads.entries()) {
        try {
          active.controller.abort();
        } catch (_) {}
        this.modelStates.set(id, {
          status: 'missing',
          bytesDownloaded: 0,
          progress: 0.0,
          error: 'Download canceled by user',
        });
      }
      this.activeDownloads.clear();
      this.broadcastSSE('all_canceled', { message: 'All active downloads canceled' });
    }
  }

  async downloadModel(model, overallContext = { totalBytes: 0, priorDownloaded: 0 }) {
    if (this.isModelInstalled(model)) {
      this.modelStates.set(model.id, { status: 'installed', progress: 100.0, bytesDownloaded: model.sizeBytes });
      return;
    }

    const downloadDir = path.join(this.modelsDir, '.downloading');
    await fs.promises.mkdir(downloadDir, { recursive: true });
    const tmpPath = path.join(downloadDir, `${model.id}.tmp`);

    const controller = new AbortController();
    let fileStream = null;

    try {
      fileStream = fs.createWriteStream(tmpPath);
      fileStream.on('error', () => {
        // Prevent uncaught exception crash on stream close/unlink
      });
      this.activeDownloads.set(model.id, { controller, fileStream, tmpPath });

      this.modelStates.set(model.id, {
        status: 'downloading',
        bytesDownloaded: 0,
        progress: 0.0,
        speedBps: 0,
        etaSeconds: 0,
        error: null,
      });

      const response = await fetch(model.url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Omnitome-ResourceManager/1.0' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = Number(response.headers.get('content-length')) || model.sizeBytes;
      let downloadedBytes = 0;
      const hash = crypto.createHash('sha256');

      let lastTime = Date.now();
      let lastBytes = 0;
      let speedBps = 0;
      let etaSeconds = 0;

      for await (const chunk of response.body) {
        if (controller.signal.aborted || this.cancelRequested) {
          const abortErr = new Error('AbortError');
          abortErr.name = 'AbortError';
          throw abortErr;
        }

        downloadedBytes += chunk.length;
        hash.update(chunk);

        if (!fileStream.write(chunk)) {
          await new Promise((resolve) => fileStream.once('drain', resolve));
        }

        const now = Date.now();
        const deltaMs = now - lastTime;
        if (deltaMs >= 200) {
          const deltaBytes = downloadedBytes - lastBytes;
          speedBps = Math.round((deltaBytes / deltaMs) * 1000);
          const remainingBytes = Math.max(0, contentLength - downloadedBytes);
          etaSeconds = speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0;
          lastTime = now;
          lastBytes = downloadedBytes;

          const progress = Number(((downloadedBytes / contentLength) * 100).toFixed(1));
          const overallDownloaded = (overallContext.priorDownloaded || 0) + downloadedBytes;
          const overallTotal = overallContext.totalBytes || contentLength;
          const overallProgress = Number(((overallDownloaded / overallTotal) * 100).toFixed(1));

          this.modelStates.set(model.id, {
            status: 'downloading',
            bytesDownloaded: downloadedBytes,
            totalBytes: contentLength,
            progress,
            speedBps,
            etaSeconds,
            error: null,
          });

          this.broadcastSSE('progress', {
            modelId: model.id,
            status: 'downloading',
            bytesDownloaded: downloadedBytes,
            totalBytes: contentLength,
            progress,
            speedBps,
            etaSeconds,
            overallBytesDownloaded: overallDownloaded,
            overallTotalBytes: overallTotal,
            overallProgress,
          });
        }
      }

      await new Promise((resolve, reject) => {
        fileStream.on('error', reject);
        fileStream.on('close', resolve);
        fileStream.end();
      });

      const computedSha256 = hash.digest('hex');
      const lockdata = this._loadLockfile();
      const expectedSha256 = model.sha256 || lockdata.models?.[model.id]?.sha256;

      if (expectedSha256 && expectedSha256 !== computedSha256) {
        throw new Error(`Checksum mismatch for ${model.id}: expected ${expectedSha256}, got ${computedSha256}`);
      }

      this.recordLockedHash(model.id, computedSha256, downloadedBytes);

      this.modelStates.set(model.id, {
        status: 'verifying',
        bytesDownloaded: downloadedBytes,
        totalBytes: contentLength,
        progress: 100.0,
        speedBps: 0,
        etaSeconds: 0,
        error: null,
      });

      this.broadcastSSE('verifying', {
        modelId: model.id,
        status: 'verifying',
        message: 'Validating and unpacking...',
      });

      await this._unpackAndPromote(model, tmpPath);

      this.modelStates.set(model.id, {
        status: 'installed',
        bytesDownloaded: downloadedBytes,
        totalBytes: contentLength,
        progress: 100.0,
        error: null,
      });

      this.broadcastSSE('model_complete', {
        modelId: model.id,
        status: 'installed',
      });

    } catch (err) {
      if (fileStream && !fileStream.destroyed) {
        try { fileStream.destroy(); } catch (_) {}
      }
      try {
        if (fs.existsSync(tmpPath)) {
          fs.rmSync(tmpPath, { force: true });
        }
      } catch (_) {}

      const isAborted = err.name === 'AbortError' || err.message === 'AbortError' || controller.signal.aborted || this.cancelRequested;
      if (isAborted) {
        this.modelStates.set(model.id, {
          status: 'missing',
          bytesDownloaded: 0,
          progress: 0.0,
          error: 'Download canceled',
        });
        const abortErr = new Error('AbortError');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      this.modelStates.set(model.id, {
        status: 'error',
        bytesDownloaded: 0,
        progress: 0.0,
        error: err.message,
      });

      this.broadcastSSE('error', {
        modelId: model.id,
        code: 'DOWNLOAD_FAILED',
        error: err.message,
      });

      throw err;
    } finally {
      this.activeDownloads.delete(model.id);
    }
  }

  async _unpackAndPromote(model, tmpFilePath) {
    const destinationDir = path.join(this.modelsDir, model.targetSubdir);

    if (model.format === 'direct') {
      await fs.promises.mkdir(destinationDir, { recursive: true });
      const targetFileName = (model.markerFiles && model.markerFiles.length > 0)
        ? model.markerFiles[0]
        : path.basename(tmpFilePath);
      const destFile = path.join(destinationDir, targetFileName);
      if (fs.existsSync(destFile)) {
        fs.rmSync(destFile, { force: true });
      }
      await fs.promises.rename(tmpFilePath, destFile).catch(async () => {
        await fs.promises.copyFile(tmpFilePath, destFile);
        await fs.promises.unlink(tmpFilePath);
      });
      return;
    }

    const stagingBase = path.join(this.modelsDir, '.staging');
    await fs.promises.mkdir(stagingBase, { recursive: true });
    const stagingDir = path.join(stagingBase, `${model.id}_unpacked`);
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
    await fs.promises.mkdir(stagingDir, { recursive: true });

    try {
      if (model.format === 'tar' || model.format === 'tar.gz') {
        await tar.x({
          file: tmpFilePath,
          cwd: stagingDir,
          strip: 0,
        });
      } else if (model.format === 'zip') {
        const zip = new AdmZip(tmpFilePath);
        zip.extractAllTo(stagingDir, true);
      } else {
        throw new Error(`Unsupported model archive format: ${model.format}`);
      }

      let unpackSource = stagingDir;
      if (Array.isArray(model.markerFiles) && model.markerFiles.length > 0) {
        const rootHasAll = model.markerFiles.every((m) => fs.existsSync(path.join(stagingDir, m)));
        if (!rootHasAll) {
          const entries = await fs.promises.readdir(stagingDir);
          for (const entry of entries) {
            const candidate = path.join(stagingDir, entry);
            const stat = await fs.promises.stat(candidate);
            if (stat.isDirectory()) {
              const subHasAll = model.markerFiles.every((m) => fs.existsSync(path.join(candidate, m)));
              if (subHasAll) {
                unpackSource = candidate;
                break;
              }
            }
          }
        }

        for (const marker of model.markerFiles) {
          if (!fs.existsSync(path.join(unpackSource, marker))) {
            throw new Error(`Verification failed: missing expected marker file '${marker}' after extraction`);
          }
        }
      }

      await fs.promises.mkdir(path.dirname(destinationDir), { recursive: true });
      if (fs.existsSync(destinationDir)) {
        fs.rmSync(destinationDir, { recursive: true, force: true });
      }

      try {
        await fs.promises.rename(unpackSource, destinationDir);
      } catch (_) {
        fs.cpSync(unpackSource, destinationDir, { recursive: true, force: true });
      }

    } finally {
      try {
        if (fs.existsSync(stagingDir)) {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        }
      } catch (_) {}
      try {
        if (fs.existsSync(tmpFilePath)) {
          fs.rmSync(tmpFilePath, { force: true });
        }
      } catch (_) {}
    }
  }

  async startDownloads(modelIds = null) {
    if (this.isDownloadingAll) {
      const activeTargets = this.manifest.models.filter((m) => {
        if (modelIds && modelIds.length > 0) return modelIds.includes(m.id);
        return m.required && !this.isModelInstalled(m);
      });
      return {
        success: true,
        queue: activeTargets.map((m) => m.id),
        message: 'Downloads already in progress.',
      };
    }

    this.isDownloadingAll = true;
    this.cancelRequested = false;

    try {
      const isOnline = await this.isOnline();
      if (!isOnline) {
        const err = new Error('Cannot download models without an active internet connection.');
        err.code = 'OFFLINE';
        throw err;
      }

      const targets = this.manifest.models.filter((m) => {
        if (modelIds && modelIds.length > 0) {
          return modelIds.includes(m.id);
        }
        return m.required && !this.isModelInstalled(m);
      });

      if (targets.length === 0) {
        this.isDownloadingAll = false;
        return { success: true, queue: [], message: 'No missing models to download.' };
      }

      let requiredBytes = 0;
      for (const m of targets) {
        requiredBytes += m.sizeBytes || 0;
      }

      const { hasSpace, availableBytes } = await this.checkDiskSpace(requiredBytes + 500 * 1024 * 1024);
      if (!hasSpace) {
        const err = new Error(
          `Insufficient disk space. Required: ${Math.round(requiredBytes / 1e9 * 10) / 10} GB, Available: ${Math.round(availableBytes / 1e9 * 10) / 10} GB`
        );
        err.code = 'INSUFFICIENT_DISK_SPACE';
        err.requiredBytes = requiredBytes;
        err.availableBytes = availableBytes;
        throw err;
      }

      const queue = targets.map((m) => m.id);

    (async () => {
      try {
        let priorDownloaded = 0;
        const overallContext = { totalBytes: requiredBytes, priorDownloaded: 0 };

        for (const model of targets) {
          if (this.cancelRequested) {
            console.log('[ResourceManager] Queue processing aborted by cancel request.');
            return;
          }

          try {
            await this.downloadModel(model, overallContext);
            if (this.cancelRequested) {
              console.log('[ResourceManager] Queue processing aborted by cancel request.');
              return;
            }
            priorDownloaded += model.sizeBytes || 0;
            overallContext.priorDownloaded = priorDownloaded;
          } catch (downloadErr) {
            if (downloadErr.name === 'AbortError' || this.cancelRequested) {
              console.log(`[ResourceManager] Download of ${model.id} was aborted.`);
              return;
            }
            console.error(`[ResourceManager] Error downloading model ${model.id}:`, downloadErr.message);
            return;
          }
        }

        if (!this.cancelRequested && this.areAllInstalled()) {
          this.broadcastSSE('all_complete', {
            allInstalled: true,
            message: 'All requested models ready.',
          });

          this._triggerSidecarWarmup();
        }
      } finally {
        this.isDownloadingAll = false;
        this.cancelRequested = false;
      }
    })();

    return {
      success: true,
      message: 'Model downloads initiated.',
      queue,
    };
  } catch (err) {
    this.isDownloadingAll = false;
    throw err;
  }
}

  async _triggerSidecarWarmup() {
    try {
      let sidecarUrl = process.env.PYTHON_SIDECAR_URL;
      if (!sidecarUrl) {
        try {
          const config = require('../config');
          sidecarUrl = config.PYTHON_SIDECAR_URL;
        } catch (_) {}
      }
      if (!sidecarUrl) {
        sidecarUrl = process.env.OMNITOME_SIDECAR_PORT
          ? `http://127.0.0.1:${process.env.OMNITOME_SIDECAR_PORT}`
          : 'http://127.0.0.1:8765';
      }
      const response = await fetch(`${sidecarUrl}/v1/lifecycle/warm?model=embed`, {
        method: 'POST',
      });
      if (response.ok) {
        console.log('[ResourceManager] Post-download warmup triggered for embed model.');
      }
    } catch (_) {
      // Non-blocking; sidecar may not be running yet or in test environment
    }
  }
}

const defaultManager = new ResourceManager();
module.exports = defaultManager;
module.exports.ResourceManager = ResourceManager;

