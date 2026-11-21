'use strict';

// server/services/aiCredentialLabels.js
// Shared label helpers for AiCredential metadata that has no dedicated schema
// field (defaultModel, priority, last4). Used by the admin keys controller and
// the ProviderKey migration script so both produce credentials the admin UI
// can display identically.

const MODEL_LABEL = 'model:';
const PRIORITY_LABEL = 'priority:';
const LAST4_LABEL = 'last4:';

function readLabel(labels, prefix) {
  const found = (labels || []).find((label) => typeof label === 'string' && label.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}

function buildCredentialLabels({ defaultModel, priority, last4 }) {
  const labels = [];
  if (defaultModel) labels.push((MODEL_LABEL + String(defaultModel)).slice(0, 50));
  labels.push((PRIORITY_LABEL + String(priority ?? 1)).slice(0, 50));
  if (last4) labels.push((LAST4_LABEL + String(last4)).slice(0, 50));
  return labels;
}

module.exports = {
  MODEL_LABEL,
  PRIORITY_LABEL,
  LAST4_LABEL,
  readLabel,
  buildCredentialLabels,
};
