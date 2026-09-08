'use strict';

const axios = require('axios');
const logger = require('../logger');

class OpenAiWebResearchAdapter {
  constructor(deps = {}) {
    this.apiKey = deps.apiKey || process.env.OPENAI_API_KEY || null;
    this.baseUrl = deps.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.maxSearchCalls = deps.maxSearchCalls || 4;
    this.maxSources = deps.maxSources || 10;
    this.timeoutMs = deps.timeoutMs || 45000;
  }

  async conductResearch({ query, structuredIdea, language = 'ar' }) {
    const rawQuery = query || `${structuredIdea.title} ${structuredIdea.targetMarket || ''} ${structuredIdea.targetCustomer || ''} alternatives competitors`;
    const searchQuery = rawQuery.replace(/\s+/g, ' ').trim();
    const langPrompt = language === 'en' ? 'English' : 'Arabic';

    // 1. First attempt: Live web scraping via Puppeteer & DuckDuckGo
    let sources = await this._searchDuckDuckGo(searchQuery);

    // 1b. Fallback attempt with shorter query if no sources found
    if (sources.length < 2 && structuredIdea.title) {
      const shortQuery = `${structuredIdea.title} ${structuredIdea.targetMarket || ''} app`;
      const fallbackSources = await this._searchDuckDuckGo(shortQuery.trim());
      for (const s of fallbackSources) {
        if (!sources.some((existing) => existing.url === s.url)) {
          sources.push(s);
        }
      }
    }

    // 1c. HTTP fallback if Puppeteer is unavailable
    if (sources.length < 2) {
      const httpSources = await this._searchDuckDuckGoHttp(searchQuery);
      for (const s of httpSources) {
        if (!sources.some((existing) => existing.url === s.url)) {
          sources.push(s);
        }
      }
    }

    sources = sources.slice(0, this.maxSources);

    // 2. Synthesize findings using LLM if apiKey is configured
    let findings = '';
    if (this.apiKey) {
      try {
        const sourcesContext = sources.map((s, idx) => `[${idx + 1}] ${s.title}\nURL: ${s.url}\nSummary: ${s.snippet || 'No snippet'}`).join('\n\n');
        const synthesisPrompt = `You are a live market intelligence researcher.
Analyze these real-world web search findings for the concept below.
Identify named direct competitors, pricing models, market saturation, and demand signals.
Language requirement: Respond entirely in ${langPrompt}. Be factual, concrete, and cite competitor names directly.

Concept Title: ${structuredIdea.title}
Problem: ${structuredIdea.problem}
Target Customer: ${structuredIdea.targetCustomer || 'General'}
Market: ${structuredIdea.targetMarket || 'Global'}

Live Search Results:
${sourcesContext || 'No live search results retrieved.'}`;

        const response = await axios.post(
          `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`,
          {
            model: 'gpt-4o-mini',
            store: false,
            messages: [
              {
                role: 'system',
                content: `You are an expert startup market researcher. Synthesize live web findings into a crisp, factual report in ${langPrompt}. Ban fluff and textbook platitudes. Name actual competitors.`,
              },
              {
                role: 'user',
                content: synthesisPrompt,
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: this.timeoutMs,
          }
        );

        findings = response.data?.choices?.[0]?.message?.content || '';
      } catch (llmErr) {
        logger.warn('idea_research_synthesis_llm_failed', { error: llmErr.message });
        findings = `Live research identified ${sources.length} relevant competitor references.`;
      }
    } else {
      findings = `Live research identified ${sources.length} market sources.`;
    }

    return {
      status: sources.length >= 2 ? 'COMPLETED' : 'INSUFFICIENT_EVIDENCE',
      sources,
      findings,
    };
  }

  async _searchDuckDuckGo(query) {
    let browser = null;
    try {
      const puppeteer = require('puppeteer');
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || '/usr/bin/chromium';
      const launchOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      };
      if (executablePath) {
        launchOptions.executablePath = executablePath;
      }

      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

      const rawResults = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('.result').forEach((el) => {
          const titleEl = el.querySelector('.result__title a');
          const snippetEl = el.querySelector('.result__snippet');
          const urlEl = el.querySelector('.result__url');
          if (titleEl) {
            items.push({
              title: titleEl.innerText.trim(),
              rawHref: titleEl.getAttribute('href') || '',
              urlText: urlEl ? urlEl.innerText.trim() : '',
              snippet: snippetEl ? snippetEl.innerText.trim() : '',
            });
          }
        });
        return items;
      });

      return this._normalizeResults(rawResults);
    } catch (err) {
      logger.warn('puppeteer_web_search_failed', { query, error: err.message });
      return [];
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  async _searchDuckDuckGoHttp(query) {
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await axios.get(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        },
        timeout: 10000,
      });

      const html = res.data || '';
      const rawResults = [];
      const linkRegex = /<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      let match;
      while ((match = linkRegex.exec(html)) !== null && rawResults.length < 10) {
        rawResults.push({
          title: match[2].replace(/<[^>]+>/g, '').trim(),
          rawHref: match[1],
          urlText: '',
          snippet: '',
        });
      }
      return this._normalizeResults(rawResults);
    } catch (err) {
      logger.warn('http_web_search_failed', { query, error: err.message });
      return [];
    }
  }

  _normalizeResults(rawResults = []) {
    const sources = [];
    const seenUrls = new Set();

    for (const r of rawResults) {
      let finalUrl = r.rawHref;
      try {
        if (finalUrl.includes('uddg=')) {
          const parsed = new URL(finalUrl, 'https://duckduckgo.com');
          const uddg = parsed.searchParams.get('uddg');
          if (uddg) finalUrl = decodeURIComponent(uddg);
        }
      } catch (_) {}

      if (!finalUrl.startsWith('http') && r.urlText) {
        finalUrl = `https://${r.urlText}`;
      }

      if (finalUrl && finalUrl.startsWith('http') && !seenUrls.has(finalUrl)) {
        seenUrls.add(finalUrl);
        let domain = '';
        try {
          domain = new URL(finalUrl).hostname.replace(/^www\./, '');
        } catch (_) {}

        sources.push({
          sourceId: `src-${sources.length + 1}`,
          title: r.title || domain || 'Web Source',
          url: finalUrl,
          domain,
          snippet: r.snippet || '',
          qualityScore: 1,
          claimsSupported: [],
        });
      }
    }

    return sources;
  }
}

module.exports = {
  OpenAiWebResearchAdapter,
};
