const AIProvider = require('./aiProvider');
const config = require('../../config');

/**
 * Server-Side OpenRouter Provider for Smart Reader
 * Integrates OpenRouter's OpenAI-compatible completions API using native fetch.
 * Default model: deepseek/deepseek-v4-flash
 */
class OpenRouterProvider extends AIProvider {
  constructor(options = {}) {
    super();
    this.providerType = 'cloud';
    this.model = options.model || config.OPENROUTER_MODEL;
    this.apiKey = options.apiKey || config.OPENROUTER_API_KEY;
    this.timeoutMs = options.timeoutMs || config.OPENROUTER_TIMEOUT_MS;
  }

  getName() {
    return 'openrouter';
  }

  isAvailable() {
    return Boolean(this.apiKey);
  }

  async checkHealth() {
    if (!this.apiKey) {
      return {
        available: false,
        provider: this.getName(),
        providerType: this.providerType,
        model: this.model,
        message: 'OPENROUTER_API_KEY is not configured in server environment.',
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          available: false,
          provider: this.getName(),
          providerType: this.providerType,
          model: this.model,
          message: `OpenRouter returned HTTP status ${res.status}`,
        };
      }

      return {
        available: true,
        provider: this.getName(),
        providerType: this.providerType,
        model: this.model,
        message: `OpenRouter Cloud API configured and ready with model '${this.model}'.`,
      };
    } catch (err) {
      return {
        available: true, // Key is configured; network/timeout on check does not prevent attempts
        provider: this.getName(),
        providerType: this.providerType,
        model: this.model,
        message: `OpenRouter key configured (${err.message}).`,
      };
    }
  }

  async summarize({ text, title = '', options = {} }) {
    if (!this.apiKey) {
      throw new Error(
        'OpenRouter API key is not configured. Please configure OPENROUTER_API_KEY in the server environment.'
      );
    }

    if (!text || text.trim() === '') {
      throw new Error('No readable text provided for summarization.');
    }

    const modelToUse = options.model || this.model;
    const startTime = Date.now();

    let systemPrompt = '';
    let userPrompt = '';

    if (options.isPrompt || options.customPrompt || text.includes('GROUNDING DIRECTIVE') || text.includes('GROUNDED SOURCE MATERIAL')) {
      systemPrompt = 'You are Smart Reader\'s intelligent reading assistant. Follow instructions precisely.';
      userPrompt = text;
    } else {
      const taskType = options.task || 'summary';
      const contentType = options.contentType || 'work';

      systemPrompt = `You are Smart Reader's intelligent reading assistant.
Analyze the following ${contentType} material and provide an objective, grounded, and faithful ${taskType}.

Instructions:
- Ground your analysis strictly in the provided text.
- Do NOT hallucinate external facts or invent unmentioned details.
- Do NOT output raw HTML tags (e.g., <strong>, <em>, <b>, <i>, <p>, <br>).
- Do NOT output empty markdown markers (such as ### or *** alone).
- Use clear structural sections with markdown headers (## or ###) and bullet points where helpful.
- Avoid robotic or repetitive boilerplate phrases (e.g. "this document investigates", "in conclusion").`;

      userPrompt = `${title ? `Document Title: ${title}\n\n` : ''}Text:\n"""\n${text.slice(0, 32000)}\n"""`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/avengersvstheflash/Smart-Reader',
          'X-OpenRouter-Title': 'Smart Reader',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: modelToUse,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 4096,
          ...(options.reasoning ? { reasoning: options.reasoning } : {}),
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const err = await response.text().catch(() => '');
        throw new Error(`OpenRouter ${response.status}: ${err}`);
      }

      const data = await response.json();
      const choice = data.choices && data.choices[0];
      const summaryText = choice?.message?.content ? choice.message.content.trim() : '';

      if (!summaryText) {
        throw new Error('OpenRouter model returned an empty response.');
      }

      const durationMs = Date.now() - startTime;

      return {
        summary: summaryText,
        provider: this.getName(),
        model: data.model || modelToUse,
        finish_reason: choice?.finish_reason || 'stop',
        usage: data.usage,
        durationMs,
      };
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error(`OpenRouter request timed out after ${this.timeoutMs}ms`);
      }
      throw new Error(`OpenRouter summarization failed: ${err.message}`);
    }
  }
}

module.exports = OpenRouterProvider;

