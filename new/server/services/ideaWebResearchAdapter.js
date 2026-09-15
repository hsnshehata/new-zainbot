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

  _extractDomainKeywords(structuredIdea = {}) {
    const rawText = [
      structuredIdea.coreProblem || structuredIdea.problem || '',
      structuredIdea.proposedSolution || structuredIdea.solution || '',
      structuredIdea.valueProposition || '',
      structuredIdea.category || '',
      structuredIdea.targetMarket || '',
    ].join(' ');

    const stopWords = new Set([
      'في', 'من', 'على', 'عن', 'إلى', 'مع', 'هذا', 'هذه', 'تم', 'التي', 'الذي', 'هو', 'هي', 'نحن', 'هم',
      'كان', 'كانت', 'يكون', 'تكون', 'ان', 'أن', 'أو', 'لا', 'ما', 'كل', 'بعد', 'قبل', 'حيث', 'ذلك',
      'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'of', 'for', 'with', 'to', 'is', 'are', 'was',
      'were', 'this', 'that', 'from', 'by', 'as', 'into', 'app', 'platform', 'idea', 'startup'
    ]);

    const words = rawText
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));

    return Array.from(new Set(words));
  }

  _generateSearchQueries(structuredIdea = {}, userQuery = null) {
    if (userQuery) {
      return [userQuery.trim()];
    }

    const title = (structuredIdea.title || '').trim();
    const market = (structuredIdea.targetMarket || '').trim();
    const keywords = this._extractDomainKeywords(structuredIdea);
    const domainSlice = keywords.slice(0, 4).join(' ');

    const queries = [];

    // Query 1: Functional domain query (avoids brand/name collisions like "آخر ساعة")
    if (domainSlice) {
      queries.push(`${domainSlice} ${market} تطبيق منصة بدائل منافسين`.trim());
    }

    // Query 2: Direct query with title and domain keywords
    if (title) {
      const shortKw = keywords.slice(0, 2).join(' ');
      queries.push(`${title} ${shortKw} ${market} شركات ناشئة`.trim());
    }

    // Query 3: Startup / marketplace competitor query
    if (keywords.length > 0) {
      queries.push(`${keywords.slice(0, 3).join(' ')} startup marketplace competitors`);
    }

    return queries.filter(Boolean).map((q) => q.replace(/\s+/g, ' ').trim());
  }

  async conductResearch({ query, structuredIdea = {}, language = 'ar' }) {
    const langPrompt = language === 'en' ? 'English' : 'Arabic';
    const keywords = this._extractDomainKeywords(structuredIdea);
    const searchQueries = this._generateSearchQueries(structuredIdea, query);

    let allSources = [];
    const seenUrls = new Set();

    // 1. Search with targeted queries (functional domain first)
    for (const sq of searchQueries.slice(0, 2)) {
      let qSources = await this._searchDuckDuckGo(sq, keywords);
      if (qSources.length === 0) {
        qSources = await this._searchDuckDuckGoHttp(sq, keywords);
      }
      for (const s of qSources) {
        if (!seenUrls.has(s.url)) {
          seenUrls.add(s.url);
          allSources.push(s);
        }
      }
      if (allSources.length >= this.maxSources) break;
    }

    // Fallback if needed
    if (allSources.length < 2 && structuredIdea.title) {
      const fallbackQuery = `${structuredIdea.title} ${structuredIdea.targetMarket || ''} app`;
      const fallbackSources = await this._searchDuckDuckGoHttp(fallbackQuery, keywords);
      for (const s of fallbackSources) {
        if (!seenUrls.has(s.url)) {
          seenUrls.add(s.url);
          allSources.push(s);
        }
      }
    }

    allSources.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
    let sources = allSources.slice(0, this.maxSources);

    // 2. Synthesize findings using LLM if apiKey is configured
    let findings = '';
    if (this.apiKey) {
      try {
        const sourcesContext = sources.map((s, idx) => `[${idx + 1}] ${s.title}\nURL: ${s.url}\nSummary: ${s.snippet || 'No snippet'}`).join('\n\n');
        const problemDesc = structuredIdea.coreProblem || structuredIdea.problem || 'N/A';
        const solutionDesc = structuredIdea.proposedSolution || structuredIdea.solution || 'N/A';
        const synthesisPrompt = `You are a live market intelligence researcher.
Analyze these real-world web search findings for the concept below.
Identify named direct competitors, comparable business models (regional or global), market saturation, and demand signals.
Language requirement: Respond entirely in ${langPrompt}. Be factual, concrete, and cite competitor names directly.

Concept Title: ${structuredIdea.title}
Problem: ${problemDesc}
Solution: ${solutionDesc}
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

  async _searchDuckDuckGo(query, keywords = []) {
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

      return this._normalizeResults(rawResults, keywords);
    } catch (err) {
      logger.warn('puppeteer_web_search_failed', { query, error: err.message });
      return [];
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  async _searchDuckDuckGoHttp(query, keywords = []) {
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
      return this._normalizeResults(rawResults, keywords);
    } catch (err) {
      logger.warn('http_web_search_failed', { query, error: err.message });
      return [];
    }
  }

  _normalizeResults(rawResults = [], keywords = []) {
    const hardExcludes = [
      'حادث', 'مصرع', 'إصابة', 'المرور', 'جنايات', 'حريق', 'طقس اليوم', 'وفاة',
      'تصادم', 'مباراة', 'ركلات ترجيح', 'سعر الدولار اليوم', 'أسعار الذهب اليوم',
      'زلزال', 'شهداء', 'قتيل', 'انتحار'
    ];

    const generalNewsDomains = new Set([
      'akhbarelyom.com', 'youm7.com', 'masrawy.com', 'almasryalyoum.com',
      'vetogate.com', 'dostor.org', 'elbalad.news', 'shorouknews.com',
      'alarabiya.net', 'aljazeera.net', 'skynewsarabia.com', 'cnn.com', 'bbc.com'
    ]);

    const startupTerms = ['تطبيق', 'منصة', 'شركة', 'ناشئة', 'فكرة', 'خدمة', 'مشروع', 'استثمار', 'startup', 'app', 'platform', 'marketplace', 'saas', 'tech'];

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
          domain = new URL(finalUrl).hostname.replace(/^www\./, '').toLowerCase();
        } catch (_) {}

        const textToScan = `${r.title || ''} ${r.snippet || ''}`.toLowerCase();

        // Check hard news excludes (accidents, crimes, weather, football)
        if (hardExcludes.some((term) => textToScan.includes(term))) {
          continue;
        }

        // Domain keyword match count
        let kwMatches = 0;
        for (const kw of keywords) {
          if (textToScan.includes(kw.toLowerCase())) {
            kwMatches++;
          }
        }

        const isGeneralNews = generalNewsDomains.has(domain);
        const hasStartupTerm = startupTerms.some((st) => textToScan.includes(st));

        // If from a general news domain, reject unless it matches business/startup context
        if (isGeneralNews && kwMatches < 1) {
          continue;
        }
        if (isGeneralNews && !hasStartupTerm && kwMatches < 2) {
          continue;
        }

        // Compute relevance quality score
        let qualityScore = 1;
        qualityScore += kwMatches * 2;
        if (hasStartupTerm) qualityScore += 2;
        if (!isGeneralNews) qualityScore += 1;

        sources.push({
          sourceId: `src-${sources.length + 1}`,
          title: r.title || domain || 'Web Source',
          url: finalUrl,
          domain,
          snippet: r.snippet || '',
          qualityScore,
          claimsSupported: [],
        });
      }
    }

    return sources.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
  }
}

module.exports = {
  OpenAiWebResearchAdapter,
};
