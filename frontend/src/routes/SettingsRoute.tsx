import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Eye,
  EyeOff,
  RotateCw,
  Check,
  AlertCircle,
  Shield,
  Sliders,
  Cpu,
  Cloud,
  CheckCircle2,
} from 'lucide-react';
import { useSettings, TestConnectionResult } from '../hooks/useSettings';

const OPENROUTER_MODEL_PRESETS = [
  { label: 'DeepSeek V4 Flash', model: 'deepseek/deepseek-v4-flash' },
  { label: 'Claude 3.5 Sonnet', model: 'anthropic/claude-3.5-sonnet' },
  { label: 'Llama 3.3 70B', model: 'meta-llama/llama-3.3-70b-instruct' },
];

export const SettingsRoute: React.FC = () => {
  const {
    settings,
    isLoading,
    isError,
    error,
    updateSettings,
    resetSettings,
    testConnection,
  } = useSettings();

  // Form state
  const [provider, setProvider] = useState<'openrouter' | 'local'>('openrouter');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [openrouterModel, setOpenrouterModel] = useState('deepseek/deepseek-v4-flash');
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false);

  const [localPreset, setLocalPreset] = useState<'ollama' | 'lmstudio' | 'custom'>('ollama');
  const [localBaseUrl, setLocalBaseUrl] = useState('http://localhost:11434/v1');
  const [localModel, setLocalModel] = useState('llama3');
  const [localApiKey, setLocalApiKey] = useState('');
  const [showLocalKey, setShowLocalKey] = useState(false);

  const [importSize, setImportSize] = useState<number>(50);

  // Diagnostic & Toast feedback state
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Populate form when settings are loaded or reset
  useEffect(() => {
    if (settings) {
      const p = settings.aiProvider === 'local' || settings.aiProvider === 'ollama' ? 'local' : 'openrouter';
      setProvider(p);

      if (settings.openrouter) {
        setOpenrouterApiKey(settings.openrouter.apiKey || '');
        setOpenrouterModel(settings.openrouter.model || 'deepseek/deepseek-v4-flash');
      }

      if (settings.local) {
        const rawPreset = (settings.local.preset || 'ollama').toLowerCase();
        const pVal = rawPreset === 'lmstudio' || rawPreset === 'custom' ? rawPreset : 'ollama';
        setLocalPreset(pVal as 'ollama' | 'lmstudio' | 'custom');
        setLocalBaseUrl(settings.local.baseUrl || 'http://localhost:11434/v1');
        setLocalModel(settings.local.model || 'llama3');
        setLocalApiKey(settings.local.apiKey || '');
      }

      if (typeof settings.importMaxSizeMB === 'number') {
        setImportSize(settings.importMaxSizeMB);
      }
    }
  }, [settings]);

  // Toast auto-dismiss
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleApplyLocalPreset = (preset: 'ollama' | 'lmstudio' | 'custom') => {
    setLocalPreset(preset);
    setTestResult(null);
    if (preset === 'ollama') {
      setLocalBaseUrl('http://localhost:11434/v1');
      setLocalModel('llama3');
    } else if (preset === 'lmstudio') {
      setLocalBaseUrl('http://localhost:1234/v1');
      setLocalModel('');
    }
  };

  const handleTestConnection = async () => {
    setTestResult(null);
    try {
      const payload =
        provider === 'openrouter'
          ? {
              provider: 'openrouter',
              apiKey: openrouterApiKey,
              model: openrouterModel,
              baseUrl: 'https://openrouter.ai/api/v1',
            }
          : {
              provider: 'local',
              baseUrl: localBaseUrl,
              apiKey: localApiKey,
              model: localModel,
            };

      const result = await testConnection.mutateAsync(payload);
      setTestResult(result);
    } catch (err: any) {
      setTestResult({
        success: false,
        latencyMs: 0,
        message: err.message || 'Connection test failed',
      });
    }
  };

  const handleSave = async () => {
    setToastMessage(null);
    try {
      await updateSettings.mutateAsync({
        aiProvider: provider,
        openrouter: {
          apiKey: openrouterApiKey,
          model: openrouterModel,
        },
        local: {
          preset: localPreset,
          baseUrl: localBaseUrl,
          model: localModel,
          apiKey: localApiKey,
        },
        importMaxSizeMB: importSize,
      });
      setToastMessage({ text: 'Settings saved successfully', type: 'ok' });
    } catch (err: any) {
      setToastMessage({ text: err.message || 'Failed to save settings', type: 'err' });
    }
  };

  const handleResetConfirm = async () => {
    setShowResetConfirm(false);
    setToastMessage(null);
    setTestResult(null);
    try {
      await resetSettings.mutateAsync();
      setToastMessage({ text: 'Settings reset to .env defaults', type: 'ok' });
    } catch (err: any) {
      setToastMessage({ text: err.message || 'Failed to reset settings', type: 'err' });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-3">
        <RotateCw className="w-6 h-6 animate-spin text-accent mx-auto" />
        <p className="text-ui-sm text-ink-muted">Loading settings from local storage…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-6 rounded-xl border border-err/30 bg-err/10 text-center">
        <AlertCircle className="w-8 h-8 text-err mx-auto mb-2" />
        <h2 className="text-lg font-semibold text-ink">Failed to load settings</h2>
        <p className="text-caption text-ink-muted mt-1">{error?.message || 'Server connection error'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 text-accent mb-2">
          <SettingsIcon className="w-6 h-6" />
          <span className="font-mono text-xs uppercase tracking-wider font-semibold">Preferences</span>
        </div>
        <h1 className="text-3xl font-display font-semibold text-ink">Settings & Diagnostics</h1>
        <p className="text-ui text-ink-muted mt-1">
          Configure model inference providers, memory bounds, and local AI runtimes.
        </p>
      </div>

      {/* Status Toast */}
      {toastMessage && (
        <div
          role="status"
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 shadow-sm ${
            toastMessage.type === 'ok'
              ? 'border-ok/30 bg-ok/10 text-ok'
              : 'border-err/30 bg-err/10 text-err'
          }`}
        >
          <div className="flex items-center gap-2.5 text-ui-sm font-medium">
            {toastMessage.type === 'ok' ? (
              <Check className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-xs font-semibold hover:opacity-75"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Section 1: AI Provider Selector ── */}
      <section className="bg-surface rounded-2xl border border-line p-6 shadow-xs space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Cpu className="w-5 h-5 text-accent" />
            <span>AI Model Provider</span>
          </h2>
          <p className="text-caption text-ink-muted mt-1">
            Select the inference engine used for generating Omni chapters and editorial compression.
          </p>
        </div>

        {/* Segmented Control */}
        <div className="inline-flex p-1 rounded-xl bg-subtle border border-line max-w-md w-full">
          <button
            type="button"
            onClick={() => {
              setProvider('openrouter');
              setTestResult(null);
            }}
            className={`flex-1 py-2 px-4 rounded-lg text-ui-sm font-medium transition-all flex items-center justify-center gap-2 ${
              provider === 'openrouter'
                ? 'bg-surface text-ink font-semibold shadow-xs border border-line/60'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Cloud className="w-4 h-4" />
            <span>OpenRouter (Cloud)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setProvider('local');
              setTestResult(null);
            }}
            className={`flex-1 py-2 px-4 rounded-lg text-ui-sm font-medium transition-all flex items-center justify-center gap-2 ${
              provider === 'local'
                ? 'bg-surface text-ink font-semibold shadow-xs border border-line/60'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Local (OpenAI-compatible)</span>
          </button>
        </div>

        {/* ── OpenRouter Panel ── */}
        {provider === 'openrouter' && (
          <div className="space-y-5 pt-2 border-t border-line/60">
            {/* API Key */}
            <div className="space-y-1.5">
              <label htmlFor="openrouter-api-key" className="text-ui-sm font-medium text-ink">
                OpenRouter API Key
              </label>
              <div className="relative max-w-xl">
                <input
                  id="openrouter-api-key"
                  type={showOpenrouterKey ? 'text' : 'password'}
                  value={openrouterApiKey}
                  onChange={(e) => {
                    setOpenrouterApiKey(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="sk-or-v1-..."
                  className="w-full pr-11 pl-3.5 py-2.5 bg-subtle/50 rounded-xl border border-line text-ui-sm font-mono text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenrouterKey((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink rounded transition-colors"
                  aria-label={showOpenrouterKey ? 'Hide API key' : 'Show API key'}
                  title={showOpenrouterKey ? 'Hide API key' : 'Show API key'}
                >
                  {showOpenrouterKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-micro text-ink-faint">
                Key is stored locally in <code>storage/settings.json</code> and never transmitted outside compression prompts.
              </p>
            </div>

            {/* Model Name & Presets */}
            <div className="space-y-2">
              <label htmlFor="openrouter-model" className="text-ui-sm font-medium text-ink">
                Model Name
              </label>
              <div className="max-w-xl">
                <input
                  id="openrouter-model"
                  type="text"
                  value={openrouterModel}
                  onChange={(e) => {
                    setOpenrouterModel(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="e.g. deepseek/deepseek-v4-flash"
                  className="w-full px-3.5 py-2.5 bg-subtle/50 rounded-xl border border-line text-ui-sm font-mono text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Preset buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-micro text-ink-muted mr-1 font-medium">Quick Presets:</span>
                {OPENROUTER_MODEL_PRESETS.map((p) => (
                  <button
                    key={p.model}
                    type="button"
                    onClick={() => {
                      setOpenrouterModel(p.model);
                      setTestResult(null);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      openrouterModel === p.model
                        ? 'bg-accent/15 border-accent text-accent-ink font-semibold'
                        : 'bg-surface border-line text-ink-muted hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Test Connection Button & Result */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-4">
              <button
                type="button"
                disabled={testConnection.isPending}
                onClick={handleTestConnection}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-ui-sm font-medium border border-line bg-surface hover:bg-subtle text-ink transition-all active:scale-95 disabled:opacity-50"
              >
                {testConnection.isPending ? (
                  <RotateCw className="w-4 h-4 animate-spin text-accent" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-accent" />
                )}
                <span>{testConnection.isPending ? 'Testing connection…' : 'Test Connection'}</span>
              </button>

              {testResult && (
                <div
                  className={`inline-flex items-center gap-2 text-ui-sm font-medium px-3.5 py-1.5 rounded-xl border ${
                    testResult.success
                      ? 'border-ok/30 bg-ok/10 text-ok'
                      : 'border-err/30 bg-err/10 text-err'
                  }`}
                >
                  <span className="text-sm">●</span>
                  <span>
                    {testResult.success
                      ? `${testResult.latencyMs}ms Connected`
                      : testResult.message}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Local Panel ── */}
        {provider === 'local' && (
          <div className="space-y-5 pt-2 border-t border-line/60">
            {/* Local Presets */}
            <div className="space-y-1.5">
              <span className="text-ui-sm font-medium text-ink">Local Provider Preset</span>
              <div className="flex flex-wrap gap-2 pt-1">
                {(['ollama', 'lmstudio', 'custom'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleApplyLocalPreset(preset)}
                    className={`text-xs px-3.5 py-1.5 rounded-full border transition-all uppercase tracking-wider font-semibold ${
                      localPreset === preset
                        ? 'bg-accent/15 border-accent text-accent-ink shadow-xs'
                        : 'bg-surface border-line text-ink-muted hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    {preset === 'ollama'
                      ? 'Ollama (Default)'
                      : preset === 'lmstudio'
                      ? 'LM Studio'
                      : 'Custom'}
                  </button>
                ))}
              </div>
            </div>

            {/* Base URL */}
            <div className="space-y-1.5">
              <label htmlFor="local-base-url" className="text-ui-sm font-medium text-ink">
                Base URL
              </label>
              <div className="max-w-xl">
                <input
                  id="local-base-url"
                  type="text"
                  value={localBaseUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLocalBaseUrl(val);
                    setTestResult(null);
                    if (localPreset === 'ollama' && val !== 'http://localhost:11434/v1') {
                      setLocalPreset('custom');
                    } else if (localPreset === 'lmstudio' && val !== 'http://localhost:1234/v1') {
                      setLocalPreset('custom');
                    }
                  }}
                  placeholder="http://localhost:11434/v1"
                  className="w-full px-3.5 py-2.5 bg-subtle/50 rounded-xl border border-line text-ui-sm font-mono text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            {/* Model Name */}
            <div className="space-y-1.5">
              <label htmlFor="local-model" className="text-ui-sm font-medium text-ink">
                Model Name
              </label>
              <div className="max-w-xl">
                <input
                  id="local-model"
                  type="text"
                  value={localModel}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLocalModel(val);
                    setTestResult(null);
                    if (localPreset === 'ollama' && val !== 'llama3') {
                      setLocalPreset('custom');
                    }
                  }}
                  placeholder="e.g. llama3, mistral, qwen2.5"
                  className="w-full px-3.5 py-2.5 bg-subtle/50 rounded-xl border border-line text-ui-sm font-mono text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            {/* Optional API Key for reverse proxies */}
            <div className="space-y-1.5">
              <label htmlFor="local-api-key" className="text-ui-sm font-medium text-ink">
                API Key <span className="text-ink-faint font-normal">(Optional for reverse proxies)</span>
              </label>
              <div className="relative max-w-xl">
                <input
                  id="local-api-key"
                  type={showLocalKey ? 'text' : 'password'}
                  value={localApiKey}
                  onChange={(e) => {
                    setLocalApiKey(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="Optional authentication token"
                  className="w-full pr-11 pl-3.5 py-2.5 bg-subtle/50 rounded-xl border border-line text-ui-sm font-mono text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowLocalKey((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink rounded transition-colors"
                  aria-label={showLocalKey ? 'Hide key' : 'Show key'}
                >
                  {showLocalKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Test Connection Button & Result */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-4">
              <button
                type="button"
                disabled={testConnection.isPending}
                onClick={handleTestConnection}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-ui-sm font-medium border border-line bg-surface hover:bg-subtle text-ink transition-all active:scale-95 disabled:opacity-50"
              >
                {testConnection.isPending ? (
                  <RotateCw className="w-4 h-4 animate-spin text-accent" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-accent" />
                )}
                <span>{testConnection.isPending ? 'Testing connection…' : 'Test Connection'}</span>
              </button>

              {testResult && (
                <div
                  className={`inline-flex items-center gap-2 text-ui-sm font-medium px-3.5 py-1.5 rounded-xl border ${
                    testResult.success
                      ? 'border-ok/30 bg-ok/10 text-ok'
                      : 'border-err/30 bg-err/10 text-err'
                  }`}
                >
                  <span className="text-sm">●</span>
                  <span>
                    {testResult.success
                      ? `${testResult.latencyMs}ms Connected`
                      : testResult.message}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Section 2: Import Size Limit ── */}
      <section className="bg-surface rounded-2xl border border-line p-6 shadow-xs space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Sliders className="w-5 h-5 text-accent" />
            <span>Import Memory & File Size Ceiling</span>
          </h2>
          <p className="text-caption text-ink-muted mt-1">
            Configures maximum file size for document ingestion (PDF, EPUB, DOCX).
          </p>
        </div>

        <div className="space-y-4 max-w-xl">
          <div className="flex items-center justify-between">
            <label htmlFor="import-size-input" className="text-ui-sm font-medium text-ink">
              Max File Size:
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="import-size-input"
                type="number"
                min={50}
                max={200}
                step={5}
                value={importSize}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    setImportSize(val);
                  }
                }}
                onBlur={() => {
                  setImportSize((prev) => Math.min(200, Math.max(50, prev || 50)));
                }}
                className="w-20 px-2 py-0.5 text-right font-mono text-ui font-semibold text-accent-ink bg-accent/10 border border-accent/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent"
                aria-label="Max import file size in megabytes"
              />
              <span className="font-mono text-ui font-semibold text-accent-ink">MB</span>
            </div>
          </div>

          <input
            type="range"
            min={50}
            max={200}
            step={5}
            value={importSize}
            onChange={(e) => setImportSize(parseInt(e.target.value, 10))}
            className="w-full accent-accent cursor-pointer h-2 bg-subtle rounded-lg"
          />

          <div className="flex justify-between text-micro font-mono text-ink-faint">
            <span>50 MB (Default)</span>
            <span>125 MB</span>
            <span>200 MB (Maximum)</span>
          </div>

          <p className="text-micro text-ink-faint leading-relaxed pt-1">
            Omnitome processes and chunks documents in memory. Keeping the import threshold between 50 and 200 MB preserves system responsiveness and prevents browser tab exhaustion during heavy parsing.
          </p>
        </div>
      </section>

      {/* ── Section 3: Privacy Disclosure Panel ── */}
      <section className="bg-surface/50 rounded-2xl border border-line p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 text-ok" />
          <h2 className="text-lg font-semibold text-ink">Privacy & Data Architecture</h2>
        </div>

        <p className="text-caption text-ink-muted">
          Omnitome operates under strict local-first guarantees:
        </p>

        <ul className="space-y-2.5 pl-1 text-ui-sm">
          <li className="flex items-start gap-2.5 text-ink-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-ok mt-2 shrink-0" />
            <div>
              <strong className="text-ink font-medium">Local provider</strong>: 100% offline, zero network egress.
            </div>
          </li>
          <li className="flex items-start gap-2.5 text-ink-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-ok mt-2 shrink-0" />
            <div>
              <strong className="text-ink font-medium">OpenRouter</strong>: Chapter prompt chunks sent over TLS; source files are never transmitted.
            </div>
          </li>
          <li className="flex items-start gap-2.5 text-ink-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-ok mt-2 shrink-0" />
            <div>
              <strong className="text-ink font-medium">BGE-M3 Embeddings</strong>: Computed 100% locally on port 8765.
            </div>
          </li>
          <li className="flex items-start gap-2.5 text-ink-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-ok mt-2 shrink-0" />
            <div>
              <strong className="text-ink font-medium">SQLite</strong>: Stored locally on disk. Zero analytics, telemetry, or tracking.
            </div>
          </li>
        </ul>
      </section>

      {/* ── Section 4: Action Controls ── */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-line/60">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={updateSettings.isPending}
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-ui-sm font-semibold bg-brand text-white hover:opacity-90 active:scale-95 transition-all shadow-sm disabled:opacity-50"
          >
            {updateSettings.isPending && <RotateCw className="w-4 h-4 animate-spin" />}
            <span>Save Settings</span>
          </button>
        </div>

        <div>
          {showResetConfirm ? (
            <div className="flex items-center gap-2 p-1.5 rounded-xl bg-subtle border border-line">
              <span className="text-xs text-ink-muted px-2">Reset all to .env defaults?</span>
              <button
                type="button"
                onClick={handleResetConfirm}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-err text-white hover:opacity-90 transition-opacity"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={resetSettings.isPending}
              onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 rounded-xl text-ui-sm font-medium text-ink-muted hover:text-err hover:bg-err/10 transition-colors"
            >
              Reset to Defaults
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsRoute;

