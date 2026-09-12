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

    let prompt = '';
    // If text is already a structured grounding prompt from ContextBuilder, use directly
    if (options.isPrompt || options.customPrompt || text.includes('GROUNDING DIRECTIVE') || text.includes('GROUNDED SOURCE MATERIAL')) {
      prompt = text;
    } else {
      const taskType = options.task || 'summary';
      const contentType = options.contentType || 'work';

      prompt = `You are Smart Reader's intelligent reading assistant.
Analyze the following ${contentType} material and provide an objective, grounded, and faithful ${taskType}.

Document Title: ${title || 'Untitled Section'}

Text:
"""
${text.slice(0, 32000)}
"""

Instructions:
- Ground your analysis strictly in the provided text.
- Do NOT hallucinate external facts or invent unmentioned details.
- Do NOT output raw HTML tags (e.g., <strong>, <em>, <b>, <i>, <p>, <br>).
- Do NOT output empty markdown markers (such as ### or *** alone).
- Use clear structural sections with markdown headers (## or ###) and bullet points where helpful.
- Avoid robotic or repetitive boilerplate phrases (e.g. "this document investigates", "in conclusion").`;
    }

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

