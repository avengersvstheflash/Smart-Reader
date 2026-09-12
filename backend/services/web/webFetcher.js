/**
 * Web Fetcher for Smart Reader
 * Respects access boundaries, handles HTTP status codes gracefully,
 * and enforces security constraints (SSRF protection, content-type checks, timeout control).
 */

class WebFetcher {
  constructor() {
    this.timeoutMs = 12000;
  }

  /**
   * Fetches an accessible web source safely
   * @param {string} rawUrl
   * @returns {Promise<{ success: boolean, url: string, finalUrl: string, statusCode: number, html: string, contentType: string }>}
   */
  async fetch(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new Error('A valid web URL is required.');
    }

    const trimmedUrl = rawUrl.trim();

    // 1. URL syntax validation
    let parsedUrl;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      throw new Error(`Invalid URL format: "${trimmedUrl}". Must start with http:// or https://`);
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error(`Unsupported protocol: ${parsedUrl.protocol}. Only http:// and https:// are supported.`);
    }

    // 2. Security & SSRF Protection
    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('169.254.') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      throw new Error(`Access to local or private network address "${hostname}" is restricted for security.`);
    }

    // 3. Wikipedia endpoint optimization
    // Wikipedia provides a dedicated semantic HTML endpoint that delivers high-quality content without nav/ads
    let fetchUrl = trimmedUrl;
    const wikiMatch = trimmedUrl.match(/^https?:\/\/([a-z]+)\.wikipedia\.org\/wiki\/([^#?]+)/i);
    if (wikiMatch) {
      const lang = wikiMatch[1];
      const title = wikiMatch[2];
      const restUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/html/${title}`;
      try {
        const restResult = await this.executeFetch(restUrl);
        if (restResult.success) {
          return {
            ...restResult,
            url: trimmedUrl, // preserve user's canonical URL
          };
        }
      } catch {
        // Fall back to standard fetch below
      }
    }

    return this.executeFetch(fetchUrl);
  }

  async executeFetch(targetUrl) {
    let res;
    try {
      res = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'SmartReader/1.0 (Mozilla/5.0; Personal Research & Knowledge Acquisition)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new Error(`Connection timed out while reaching ${targetUrl}. The web server took too long to respond.`);
      }
      throw new Error(`Failed to reach ${targetUrl}: ${err.message}`);
    }

    // 4. HTTP Status Code Boundary Handling
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(`Access restricted (401 Unauthorized): "${targetUrl}" requires login credentials or membership.`);
      }
      if (res.status === 403) {
        throw new Error(`Access forbidden (403 Forbidden): The website at "${targetUrl}" restricts automated access.`);
      }
      if (res.status === 404) {
        throw new Error(`Page not found (404): The requested webpage address does not exist.`);
      }
      if (res.status === 429) {
        throw new Error(`Rate limited (429): The destination website has temporarily limited access. Please wait a moment.`);
      }
      if (res.status >= 500) {
        throw new Error(`Destination server error (${res.status}): The remote website is experiencing issues.`);
      }
      throw new Error(`HTTP Error ${res.status}: Unable to fetch webpage.`);
    }

    // 5. Content-Type Validation
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/pdf')) {
      throw new Error('This web link points directly to a PDF file. Please use the "Import File" tab to upload or process PDFs.');
    }
    if (contentType.includes('application/epub+zip')) {
      throw new Error('This web link points directly to an EPUB file. Please use the "Import File" tab to process EPUBs.');
    }
    if (
      !contentType.includes('text/html') &&
      !contentType.includes('text/plain') &&
      !contentType.includes('application/xhtml+xml') &&
      !contentType.includes('text/xml')
    ) {
      throw new Error(`Unsupported content type "${contentType}". Smart Reader acquires readable HTML web content.`);
    }

    const html = await res.text();
    if (!html || html.trim() === '') {
      throw new Error('The retrieved webpage was empty.');
    }

    // 6. Paywall & Login Detection in content
    const lowerHtml = html.toLowerCase();
    if (
      lowerHtml.includes('name="paywall" content="true"') ||
      lowerHtml.includes('article:content_tier" content="locked"') ||
      (lowerHtml.includes('this article is exclusive to subscribers') && html.length < 5000) ||
      (lowerHtml.includes('sign in to read the full story') && html.length < 4000)
    ) {
      throw new Error('Access boundary: This webpage appears to be behind a paywall or subscriber gate.');
    }

    return {
      success: true,
      url: targetUrl,
      finalUrl: res.url || targetUrl,
      statusCode: res.status,
      contentType,
      html,
    };
  }
}

module.exports = new WebFetcher();
