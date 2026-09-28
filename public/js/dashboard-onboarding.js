(function (root, factory) {
  const guide = factory();
  if (typeof module === 'object' && module.exports) module.exports = guide;
  else root.ZainBotOnboarding = guide;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function progress(bot, rules, conversations) {
    const personalized = Boolean(bot && [bot.description, bot.customInstructions, bot.welcomeMessage]
      .some(value => typeof value === 'string' && value.trim()));
    const trained = Array.isArray(rules) && rules.some(rule =>
      rule?.type !== 'general' && rule?.isActive !== false &&
      String(rule?.content?.question || '').trim() && String(rule?.content?.answer || '').trim());
    // Opening/copying the chat URL is not evidence of a working reply.
    const tested = Array.isArray(conversations) && conversations.some(conv =>
      conv?.channel === 'web' && Array.isArray(conv.messages) &&
      conv.messages.some(msg => (msg.role || msg.sender) === 'user' && String(msg.content || msg.text || '').trim()) &&
      conv.messages.some(msg => (msg.role === 'assistant' || msg.sender === 'bot') && String(msg.content || msg.text || '').trim()));
    return { personalized, trained: Boolean(trained), tested };
  }

  return { progress };
});
