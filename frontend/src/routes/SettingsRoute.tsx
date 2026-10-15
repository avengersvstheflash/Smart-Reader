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
  Volume2,
  Trash2,
} from 'lucide-react';
import { useSettings, TestConnectionResult } from '../hooks/useSettings';

const OPENROUTER_MODEL_PRESETS = [
  { label: 'DeepSeek V4 Flash', model: 'deepseek/deepseek-v4-flash' },
  { label: 'Claude 3.5 Sonnet', model: 'anthropic/claude-3.5-sonnet' },
  { label: 'Llama 3.3 70B', model: 'meta-llama/llama-3.3-70b-instruct' },
];

const TTS_VOICE_OPTIONS = [
  { id: 'af_heart', name: 'Heart (American Female)' },
  { id: 'am_adam', name: 'Adam (American Male)' },
  { id: 'bf_alice', name: 'Alice (British Female)' },
  { id: 'bm_george', name: 'George (British Male)' },
];

const TTS_SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];

export const SettingsRoute: React.FC = () => {
  const {
    settings,
    isLoading,
    isError,
    error,
    updateSettings,
    resetSettings,
    testConnection,
    clearTtsCache,
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
  const [parallelBookSynthesis, setParallelBookSynthesis] = useState<boolean>(false);

  // TTS Form state
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(true);
  const [ttsDefaultVoice, setTtsDefaultVoice] = useState<string>('af_heart');
  const [ttsDefaultSpeed, setTtsDefaultSpeed] = useState<number>(1.0);
  const [ttsAutoScroll, setTtsAutoScroll] = useState<boolean>(true);
  const [ttsCacheMaxMB, setTtsCacheMaxMB] = useState<number>(500);
  const [ttsKeepLoaded, setTtsKeepLoaded] = useState<boolean>(false);
  const [showClearCacheConfirm, setShowClearCacheConfirm] = useState<boolean>(false);

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

      setParallelBookSynthesis(Boolean(settings.parallelBookSynthesis));

      if (settings.tts) {
        setTtsEnabled(settings.tts.enabled ?? true);
        setTtsDefaultVoice(settings.tts.defaultVoice || 'af_heart');
        setTtsDefaultSpeed(settings.tts.defaultSpeed ?? 1.0);
        setTtsAutoScroll(settings.tts.autoScroll ?? true);
        setTtsCacheMaxMB(settings.tts.cacheMaxMB ?? 500);
        setTtsKeepLoaded(Boolean(settings.tts.keepLoaded));
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
        parallelBookSynthesis,
        tts: {
          enabled: ttsEnabled,
          defaultVoice: ttsDefaultVoice,
          defaultSpeed: ttsDefaultSpeed,
          autoScroll: ttsAutoScroll,
          cacheMaxMB: ttsCacheMaxMB,
          keepLoaded: ttsKeepLoaded,
        },
      });
      setToastMessage({ text: 'Settings saved successfully', type: 'ok' });
    } catch (err: any) {
      setToastMessage({ text: err.message || 'Failed to save settings', type: 'err' });
    }
  };

  const handleClearCache = async () => {
    setShowClearCacheConfirm(false);
    setToastMessage(null);
    try {
      const res = await clearTtsCache.mutateAsync();
      const freedMB = (res.freedBytes / (1024 * 1024)).toFixed(1);
      setToastMessage({ text: `TTS cache cleared (${freedMB} MB freed)`, type: 'ok' });
    } catch (err: any) {
      setToastMessage({ text: err.message || 'Failed to clear TTS cache', type: 'err' });
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

      {/* ── Section: Performance ── */}
      <section className="bg-surface/50 rounded-2xl border border-line p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-2.5">
          <Cpu className="w-5 h-5 text-accent-ink" />
          <h2 className="text-lg font-semibold text-ink">Performance</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <label htmlFor="parallel-synthesis-toggle" className="text-ui font-medium text-ink cursor-pointer">
                Parallel book synthesis
              </label>
              <p className="text-caption text-ink-muted">
                Run background synthesis concurrently for imported queue items.
              </p>
            </div>
            <input
              id="parallel-synthesis-toggle"
              type="checkbox"
              checked={parallelBookSynthesis}
              onChange={(e) => setParallelBookSynthesis(e.target.checked)}
              className="w-5 h-5 rounded border-line text-brand focus:ring-accent cursor-pointer"
            />
          </div>

          <div className="rounded-xl bg-subtle/70 border border-line p-3.5 flex items-start gap-2.5 text-caption text-ink-muted">
            <AlertCircle className="w-4 h-4 text-accent-ink shrink-0 mt-0.5" aria-hidden="true" />
            <p className="leading-relaxed">
              Runs up to 2 books through the pipeline simultaneously. Uses significantly more CPU, RAM, and VRAM. Recommended only for machines with 16 GB RAM or more.
            </p>
          </div>
        </div>
      </section>

      {/* ── Section: Text-to-Speech (Kokoro) ── */}
      <section className="bg-surface rounded-2xl border border-line p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-accent" />
              <span>Text-to-Speech (Kokoro TTS)</span>
            </h2>
            <p className="text-caption text-ink-muted mt-1">
              On-device neural voice generation via Kokoro-82M in the Python sidecar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="tts-enabled-toggle" className="text-ui-sm font-medium text-ink cursor-pointer">
              Enable TTS
            </label>
            <input
              id="tts-enabled-toggle"
              type="checkbox"
              checked={ttsEnabled}
              onChange={(e) => setTtsEnabled(e.target.checked)}
              className="w-5 h-5 rounded border-line text-brand focus:ring-accent cursor-pointer"
            />
          </div>
        </div>

        {ttsEnabled && (
          <div className="space-y-5 pt-2 border-t border-line/50">
            {/* Voice & Speed Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="tts-default-voice" className="block text-ui-sm font-medium text-ink mb-1.5">
                  Default Voice
                </label>
                <select
                  id="tts-default-voice"
                  value={ttsDefaultVoice}
                  onChange={(e) => setTtsDefaultVoice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-ui-sm bg-subtle border border-line text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {TTS_VOICE_OPTIONS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <p className="text-micro text-ink-faint mt-1">
                  Default voice applied to newly opened books.
                </p>
              </div>

              <div>
                <label htmlFor="tts-default-speed" className="block text-ui-sm font-medium text-ink mb-1.5">
                  Default Speed
                </label>
                <select
                  id="tts-default-speed"
                  value={ttsDefaultSpeed}
                  onChange={(e) => setTtsDefaultSpeed(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl text-ui-sm bg-subtle border border-line text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {TTS_SPEED_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.toFixed(2)}x
                    </option>
                  ))}
                </select>
                <p className="text-micro text-ink-faint mt-1">
                  Playback rate multiplier (0.50x – 2.00x).
                </p>
              </div>
            </div>

            {/* Auto-scroll toggle */}
            <div className="flex items-center justify-between gap-4 pt-2">
              <div>
                <label htmlFor="tts-autoscroll-toggle" className="text-ui font-medium text-ink cursor-pointer">
                  Auto-scroll to active sentence
                </label>
                <p className="text-caption text-ink-muted">
                  Smoothly scrolls the reader view to center each sentence as it speaks.
                </p>
              </div>
              <input
                id="tts-autoscroll-toggle"
                type="checkbox"
                checked={ttsAutoScroll}
                onChange={(e) => setTtsAutoScroll(e.target.checked)}
                className="w-5 h-5 rounded border-line text-brand focus:ring-accent cursor-pointer"
              />
            </div>

            {/* Always keep TTS loaded (F88b) */}
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-line/40">
              <div>
                <label htmlFor="tts-keep-loaded-toggle" className="text-ui font-medium text-ink cursor-pointer">
                  Always keep TTS loaded (zero cold-start)
                </label>
                <p className="text-caption text-ink-muted">
                  Bypasses idle memory eviction for Kokoro TTS. Eliminates the 1.5–2s initial synthesis lag at the cost of ~450 MB background RAM.
                </p>
              </div>
              <input
                id="tts-keep-loaded-toggle"
                type="checkbox"
                checked={ttsKeepLoaded}
                onChange={(e) => setTtsKeepLoaded(e.target.checked)}
                className="w-5 h-5 rounded border-line text-brand focus:ring-accent cursor-pointer"
              />
            </div>

            {/* Cache limit slider & clear cache */}
            <div className="pt-2 border-t border-line/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="tts-cache-size-input" className="text-ui-sm font-medium text-ink">
                    TTS Audio Disk Cache Ceiling
                  </label>
                  <p className="text-caption text-ink-muted">
                    Maximum disk space for pre-rendered WAV sentences in storage/tts.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    id="tts-cache-size-input"
                    type="number"
                    min={100}
                    max={5000}
                    step={100}
                    value={ttsCacheMaxMB}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) setTtsCacheMaxMB(val);
                    }}
                    onBlur={() => {
                      setTtsCacheMaxMB((prev) => Math.min(5000, Math.max(100, prev || 500)));
                    }}
                    className="w-20 px-2 py-0.5 text-right font-mono text-ui font-semibold text-accent-ink bg-accent/10 border border-accent/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent"
                    aria-label="TTS cache size in megabytes"
                  />
                  <span className="font-mono text-ui font-semibold text-accent-ink">MB</span>
                </div>
              </div>

              <input
                type="range"
                min={100}
                max={5000}
                step={100}
                value={ttsCacheMaxMB}
                onChange={(e) => setTtsCacheMaxMB(parseInt(e.target.value, 10))}
                className="w-full accent-accent cursor-pointer h-2 bg-subtle rounded-lg"
              />

              <div className="flex justify-between text-micro font-mono text-ink-faint">
                <span>100 MB</span>
                <span>500 MB (Default)</span>
                <span>5,000 MB (5 GB)</span>
              </div>

              {/* Clear Cache Action */}
              <div className="pt-2 flex items-center justify-between">
                <p className="text-caption text-ink-muted">
                  Flushes pre-synthesized audio files to reclaim disk space.
                </p>
                {showClearCacheConfirm ? (
                  <div className="flex items-center gap-2 p-1.5 rounded-xl bg-subtle border border-line">
                    <span className="text-xs text-ink-muted px-2">Delete all cached TTS audio?</span>
                    <button
                      type="button"
                      disabled={clearTtsCache.isPending}
                      onClick={handleClearCache}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-err text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {clearTtsCache.isPending ? 'Clearing…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowClearCacheConfirm(false)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium text-ink-muted hover:text-ink"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={clearTtsCache.isPending}
                    onClick={() => setShowClearCacheConfirm(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-ui-sm font-medium text-ink-muted hover:text-err hover:bg-err/10 border border-line transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Clear TTS Cache</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
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
              <strong className="text-ink font-medium">Kokoro TTS</strong>: Synthesized 100% locally on port 8765. Zero audio egress.
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

