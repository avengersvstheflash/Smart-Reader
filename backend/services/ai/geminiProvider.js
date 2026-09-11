const { GoogleGenAI } = require('@google/genai');
const AIProvider = require('./aiProvider');

/**
 * Server-Side Gemini Provider for Smart Reader
 * Integrates Google's Gemini models via the official @google/genai SDK.
 * Summaries, insights, and representations are generated server-side.
 */
class GeminiProvider extends AIProvider {
  constructor(options = {}) {
    super();
    this.model = options.model || 'gemini-3.8-flash';
  }

  getName() {
    return 'gemini';
  }

  getApiKey() {
    return process.env.GEMINI_API_KEY || '';
  }

  getClient() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Gemini API key is not configured. Please set the GEMINI_API_KEY environment variable to use the Gemini provider.'
      );
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  async checkHealth() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        available: false,
        provider: this.getName(),
        model: this.model,
        message: 'GEMINI_API_KEY is not configured in server environment.',
      };
    }

    return {
      available: true,
      provider: this.getName(),
      model: this.model,
      message: 'Gemini Cloud API configured and ready.',
    };
  }

  async summarize({ text, title = '', options = {} }) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Gemini API key is not configured. Please configure GEMINI_API_KEY in the server environment.'
      );
    }

    if (!text || text.trim() === '') {
      throw new Error('No readable text provided for summarization.');
    }

    const ai = this.getClient();
    const startTime = Date.now();

    const prompt = `You are Smart Reader's intelligent reading assistant.
Provide a clear, engaging, and faithful summary of the following document/chapter.

Document Title: ${title || 'Untitled Section'}

Text:
"""
${text.slice(0, 32000)}
"""

Format your response cleanly:
1. Executive Summary: 2-3 sentences capturing the core thesis or narrative progression.
2. Key Ideas & Takeaways: 3-5 concise bullet points highlighting critical points, discoveries, or character developments.
3. Notable Details or Concepts: 1-2 key terms, arguments, or data points worth remembering.

Ensure the summary is objective, clear, and faithful to the source material without generic filler.`;

    try {
      const response = await ai.models.generateContent({
        model: this.model,
        contents: prompt,
      });

      const summaryText = response.text ? response.text.trim() : '';
      if (!summaryText) {
        throw new Error('Gemini model returned an empty response.');
      }

      const durationMs = Date.now() - startTime;

      return {
        summary: summaryText,
        provider: this.getName(),
        model: this.model,
        durationMs,
      };
    } catch (err) {
      throw new Error(`Gemini summarization failed: ${err.message}`);
    }
  }
}

module.exports = GeminiProvider;

