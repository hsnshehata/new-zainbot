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
    if (!this.apiKey) {
      logger.warn('idea_research_skipped_no_api_key');
      return {
        status: 'INSUFFICIENT_EVIDENCE',
        sources: [],
        findings: 'No external web search key configured; relying on internal knowledge.',
      };
    }

    const searchQuery = query || `${structuredIdea.title} ${structuredIdea.targetMarket || ''} alternatives competitors`;
    const langPrompt = language === 'en' ? 'English' : 'Arabic';

    try {
      // Calling OpenAI Responses API or chat completion with web search tool
      // If responses API is supported:
      const payload = {
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search_preview' }],
        store: false,
        input: [
          {
            role: 'system',
            content: `You are a live market intelligence researcher. Search the web for actual direct/indirect competitors, market signals, and demand indicators for this product concept. Output your findings in ${langPrompt}. Be factual and cite sources.`,
          },
          {
            role: 'user',
            content: `Research this concept:
Title: ${structuredIdea.title}
Problem: ${structuredIdea.problem}
Market: ${structuredIdea.targetMarket || 'Global'}
Alternatives: ${(structuredIdea.alternatives || []).join(', ')}

Query: ${searchQuery}`,
          },
        ],
      };

      const response = await axios.post(
        `${this.baseUrl.replace(/\/+$/, '')}/responses`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeoutMs,
        }
      ).catch(async (respErr) => {
        // Fallback to standard chat completions if /responses is not available or previews
        return axios.post(
          `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`,
          {
            model: 'gpt-4o-mini',
            store: false,
            messages: [
              {
                role: 'system',
                content: `You are a market researcher. Search and analyze actual competitors and demand signals for this idea in ${langPrompt}. Output concise structured text with sources where available.`,
              },
              {
                role: 'user',
                content: `Concept: ${structuredIdea.title}. Query: ${searchQuery}`,
              },
            ],
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: this.timeoutMs,
          }
        );
      });

      const responseData = response.data;
      const sources = this._extractSources(responseData);

      return {
        status: sources.length >= 3 ? 'COMPLETED' : 'INSUFFICIENT_EVIDENCE',
        sources: sources.slice(0, this.maxSources),
        findings: responseData.output_text || responseData.choices?.[0]?.message?.content || '',
      };
    } catch (error) {
      logger.warn('idea_research_call_failed', { error: error.message });
      return {
        status: 'INSUFFICIENT_EVIDENCE',
        sources: [],
        findings: 'Market research could not reach live web sources due to provider network failure.',
      };
    }
  }

  _extractSources(responseData) {
    const sources = [];
    const seenUrls = new Set();

    // Check responses API citations or web_search tool output
    const outputItems = responseData.output || [];
    for (const item of outputItems) {
      if (item.type === 'citation' || item.citations) {
        const cites = item.citations || [item];
        for (const c of cites) {
          const rawUrl = c.url || c.link;
          if (rawUrl && rawUrl.startsWith('https://') && !seenUrls.has(rawUrl)) {
            seenUrls.add(rawUrl);
            let domain = '';
            try {
              domain = new URL(rawUrl).hostname;
            } catch (_) {}
            sources.push({
              sourceId: `src-${sources.length + 1}`,
              title: c.title || domain || 'Source',
              url: rawUrl,
              domain,
              publishedDate: c.published_date || null,
              accessedDate: new Date(),
              qualityScore: 1,
              isPrimary: false,
              claimsSupported: c.claims || [],
            });
          }
        }
      }
    }

    return sources;
  }
}

module.exports = {
  OpenAiWebResearchAdapter,
};
