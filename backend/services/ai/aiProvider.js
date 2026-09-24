/**
 * Base AI Provider interface
 * All concrete providers (Ollama, Gemini, etc.) must extend this class.
 */
class AIProvider {
  constructor() {
    this.providerType = 'cloud';
  }

  /**
   * @returns {string} Provider identifier
   */
  getName() {
    throw new Error('getName() must be implemented by provider subclass');
  }

  /**
   * Checks if the provider endpoint and model are reachable
   * @returns {Promise<{ available: boolean, provider: string, model: string, message?: string }>}
   */
  async checkHealth() {
    throw new Error('checkHealth() must be implemented by provider subclass');
  }

  /**
   * Generates a chapter or content summary
   * @param {Object} params
   * @param {string} params.text - The chapter or passage text to summarize
   * @param {string} [params.title] - Title of the chapter/book
   * @param {Object} [params.options] - Provider-specific options
   * @returns {Promise<{ summary: string, keyPoints: string[], model: string, durationMs: number }>}
   */
  async summarize(params) {
    throw new Error('summarize() must be implemented by provider subclass');
  }
}

module.exports = AIProvider;
