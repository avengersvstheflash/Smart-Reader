const OllamaProvider = require('./ollamaProvider');
const GeminiProvider = require('./geminiProvider');
const aiNormalizer = require('./aiNormalizer');
const chapterRepository = require('../../repositories/chapterRepository');
const jobRepository = require('../../repositories/jobRepository');
const config = require('../../config');

class AIService {
  constructor() {
    this.providers = new Map();
    this.registerProvider(new OllamaProvider());
    this.registerProvider(new GeminiProvider());

    const rawConfig = String(config.AI_PROVIDER || '').toLowerCase();
    if (rawConfig.includes('ollama') || rawConfig === 'local') {
      this.activeProviderName = 'ollama';
    } else {
      this.activeProviderName = 'gemini';
    }
  }

  registerProvider(provider) {
    this.providers.set(provider.getName(), provider);
  }

  getActiveProvider() {
    let provider = this.providers.get(this.activeProviderName);
    if (!provider) {
      this.activeProviderName = 'gemini';
      provider = this.providers.get('gemini') || this.providers.get('ollama');
    }
    return provider;
  }

  setActiveProvider(name) {
    const resolvedName = this.resolveModeToProvider(name);
    if (!this.providers.has(resolvedName)) {
      throw new Error(`Cannot switch to unknown provider: ${resolvedName}`);
    }
    this.activeProviderName = resolvedName;
  }

  setProcessingMode(mode) {
    const providerName = this.resolveModeToProvider(mode);
    this.setActiveProvider(providerName);
    return {
      activeMode: providerName === 'ollama' ? 'local' : 'cloud',
      activeProvider: this.activeProviderName,
    };
  }

  resolveModeToProvider(modeOrProvider) {
    if (!modeOrProvider) return this.activeProviderName;
    const lower = String(modeOrProvider).toLowerCase().trim();
    if (lower === 'local' || lower === 'local ai' || lower.includes('ollama')) return 'ollama';
    if (lower === 'cloud' || lower === 'cloud ai' || lower.includes('gemini')) return 'gemini';
    if (this.providers.has(lower)) return lower;
    return this.activeProviderName;
  }

  async getStatus() {
    const results = {};
    for (const [name, provider] of this.providers.entries()) {
      results[name] = await provider.checkHealth().catch((err) => ({
        available: false,
        provider: name,
        message: err.message,
      }));
    }
    return {
      activeProvider: this.activeProviderName,
      activeMode: this.activeProviderName === 'ollama' ? 'local' : 'cloud',
      providers: results,
    };
  }

  /**
   * Summarizes a chapter, separates original content from generated representation,
   * normalizes output into canonical blocks, and tracks lifecycle via a ProcessingJob.
   */
  async summarizeChapter(chapterId, options = {}) {
    const chapter = chapterRepository.getById(chapterId);
    if (!chapter) {
      throw new Error(`Chapter not found with ID: ${chapterId}`);
    }

    const requested = options.mode || options.provider || this.activeProviderName;
    const providerName = this.resolveModeToProvider(requested);
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(
        `Requested AI Provider '${providerName}' is not registered. Available: ${[...this.providers.keys()].join(', ')}`
      );
    }

    const mode = providerName === 'ollama' ? 'local' : 'cloud';
    const startTime = Date.now();

    // 1. Create Processing Job
    const job = jobRepository.create({
      book_id: chapter.book_id,
      chapter_id: chapter.id,
      type: 'SUMMARIZE',
      status: 'PROCESSING',
      progress: 10,
    });

    try {
      // 2. Execute AI Provider Summarization
      const result = await provider.summarize({
        text: chapter.content,
        title: chapter.title,
        options,
      });

      const durationMs = result.durationMs || (Date.now() - startTime);

      // 3. Normalize AI output into canonical blocks (preventing raw markdown leakage)
      const canonicalBlocks = aiNormalizer.normalize(result.summary);

      // Token count estimates based on standard ~1.3 tokens/word heuristic
      const origWordCount = chapter.word_count || (chapter.content ? chapter.content.split(/\s+/).length : 0);
      const summaryWordCount = result.summary ? result.summary.split(/\s+/).length : 0;
      const inputTokensEst = Math.round(origWordCount * 1.35);
      const outputTokensEst = Math.round(summaryWordCount * 1.35);

      // 4. Save as distinct representation (Never overwriting original immutable content!)
      const representation = chapterRepository.saveRepresentation({
        chapterId: chapter.id,
        bookId: chapter.book_id,
        type: 'SUMMARY',
        content: result.summary,
        metadata: {
          provider: result.provider || providerName,
          model: result.model || (providerName === 'gemini' ? 'gemini-3.8-flash' : 'llama3'),
          mode,
          durationMs,
          jobId: job.id,
          generatedAt: new Date().toISOString(),
          originalWordCount: origWordCount,
          summaryWordCount,
          inputTokensEst,
          outputTokensEst,
          canonicalBlocks,
        },
      });

      // 5. Complete Job
      jobRepository.complete(job.id);

      return {
        representation,
        canonicalBlocks,
        mode,
        job: jobRepository.getById(job.id),
      };
    } catch (err) {
      // Record failure on job
      jobRepository.fail(job.id, err);
      // Explicit error preservation with context
      err.provider = providerName;
      err.mode = mode;
      throw err;
    }
  }

  /**
   * Standalone text summarization (supporting legacy /generate-summary and raw tests)
   */
  async summarizeText(text, title = '', options = {}) {
    const requested = options.mode || options.provider || this.activeProviderName;
    const providerName = this.resolveModeToProvider(requested);
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Requested AI Provider '${providerName}' is not registered.`);
    }
    const result = await provider.summarize({ text, title, options });
    return result;
  }
}

module.exports = new AIService();
