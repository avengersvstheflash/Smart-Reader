const AIProvider = require('./aiProvider');
const config = require('../../config');

class OllamaProvider extends AIProvider {
  constructor(options = {}) {
    super();
    this.baseUrl = options.baseUrl || config.OLLAMA_BASE_URL;
    this.model = options.model || config.OLLAMA_MODEL;
    this.timeoutMs = options.timeoutMs || config.OLLAMA_TIMEOUT_MS;
  }

  getName() {
    return 'ollama';
  }

  async checkHealth() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          available: false,
          provider: this.getName(),
          model: this.model,
          message: `Ollama returned HTTP status ${res.status}`,
        };
      }

      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models.map((m) => m.name) : [];
      const hasModel = models.some((m) => m.startsWith(this.model));

      return {
        available: true,
        provider: this.getName(),
        model: this.model,
        installedModels: models,
        modelReady: hasModel,
        message: hasModel
          ? `Ollama online with model '${this.model}' ready.`
          : `Ollama online, but model '${this.model}' is not in [${models.join(', ')}]. Run 'ollama pull ${this.model}' to download it.`,
      };
    } catch (err) {
      let friendlyMsg = err.message;
      if (err.name === 'AbortError') {
        friendlyMsg = `Connection to Ollama at ${this.baseUrl} timed out.`;
      } else if (err.code === 'ECONNREFUSED' || err.message.includes('fetch failed')) {
        friendlyMsg = `Could not connect to Ollama at ${this.baseUrl}. Ensure Ollama daemon is running ('ollama serve' or 'ollama run ${this.model}').`;
      }

      return {
        available: false,
        provider: this.getName(),
        model: this.model,
        message: friendlyMsg,
      };
    }
  }

  async summarize({ text, title = '', options = {} }) {
    const startTime = Date.now();
    const modelToUse = options.model || this.model;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('No content provided for summarization.');
    }

    const systemPrompt = `You are an expert reading assistant and literary analyst for Smart Reader.
Your task is to provide a concise, engaging, and faithful summary of the provided chapter or reading passage.
Highlight the primary narrative progression, key character moments or concepts, and pivotal twists or insights.
Do not invent facts not present in the text.`;

    const userPrompt = `${title ? `Chapter / Passage Title: "${title}"\n\n` : ''}Text to summarize:\n"""\n${text.slice(0, 15000)}\n"""\n\nPlease provide:
1. Executive Summary: 2-3 engaging paragraphs explaining what happened.
2. Key Takeaways: 3-5 bullet points covering the most critical events, character choices, or concepts.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: modelToUse,
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          stream: false,
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Ollama API error (HTTP ${response.status}): ${errText || response.statusText}`);
      }

      const result = await response.json();
      const outputText = result.response ? result.response.trim() : '';

      if (!outputText) {
        throw new Error('Ollama returned an empty response.');
      }

      return {
        summary: outputText,
        model: modelToUse,
        provider: this.getName(),
        durationMs: Date.now() - startTime,
        metadata: {
          totalDuration: result.total_duration,
          loadDuration: result.load_duration,
          promptEvalCount: result.prompt_eval_count,
          evalCount: result.eval_count,
        },
      };
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error(`Ollama summarization request timed out after ${this.timeoutMs / 1000}s.`);
      }
      if (err.code === 'ECONNREFUSED' || err.message.includes('fetch failed')) {
        throw new Error(`Ollama is not reachable at ${this.baseUrl}. Please ensure Ollama is running ('ollama run ${this.model}') or verify your OLLAMA_BASE_URL configuration.`);
      }
      throw err;
    }
  }
}

module.exports = OllamaProvider;
