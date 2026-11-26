'use strict';

// tests/assistant/assistantActionAudit.test.js
// Verifies reuse of AuditEvent.redactAuditText, deep before/after snapshot
// redaction, model pre-validate sanitization, and DI audit service behavior.

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const AuditEvent = require('../../server/models/AuditEvent');
const AssistantActionAudit = require('../../server/models/AssistantActionAudit');
const {
  createAssistantActionAuditService,
  sanitizeAuditPayload,
  sanitizeAuditSnapshot,
  redactAuditText,
} = require('../../server/services/assistantActionAuditService');

const MERCHANT_ID = new mongoose.Types.ObjectId();
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjM0NTY3OCJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

test('reuses AuditEvent.redactAuditText directly', () => {
  assert.equal(typeof AuditEvent.redactAuditText, 'function');
  assert.equal(redactAuditText, AuditEvent.redactAuditText);

  const cleaned = redactAuditText(`Bearer super-secret-tok api_key=sk-12345 jwt ${FAKE_JWT}`);
  assert.doesNotMatch(cleaned, /super-secret-tok/);
  assert.doesNotMatch(cleaned, /sk-12345/);
  assert.doesNotMatch(cleaned, /eyJhbGci/);
  assert.match(cleaned, /Bearer \[REDACTED\]/);
  assert.match(cleaned, /api_key=\[REDACTED\]/);
  assert.match(cleaned, /\[REDACTED_JWT\]/);
});

test('sanitizeAuditSnapshot redacts sensitive keys, embedded secrets, and caps depth/length', () => {
  const objId = new mongoose.Types.ObjectId();
  const created = new Date('2026-11-27T00:00:00.000Z');
  const snapshot = sanitizeAuditSnapshot({
    productId: objId,
    updatedAt: created,
    stock: 15,
    facebookApiKey: 'EAAB-real-token',
    whatsappLinkCodeHash: 'abc123hash',
    authorization: 'Bearer hidden',
    nested: {
      password: 'plain-password',
      note: `token=my-secret-val and ${FAKE_JWT}`,
    },
    longText: 'a'.repeat(700),
    deep: { a: { b: { c: { d: { e: { f: 'too-deep' } } } } } },
  });

  assert.equal(snapshot.productId, String(objId));
  assert.equal(snapshot.updatedAt, '2026-11-27T00:00:00.000Z');
  assert.equal(snapshot.stock, 15);
  assert.equal(snapshot.facebookApiKey, '[REDACTED]');
  assert.equal(snapshot.whatsappLinkCodeHash, '[REDACTED]');
  assert.equal(snapshot.authorization, '[REDACTED]');
  assert.equal(snapshot.nested.password, '[REDACTED]');
  assert.doesNotMatch(snapshot.nested.note, /my-secret-val|eyJhbGci/);
  assert.match(snapshot.nested.note, /token=\[REDACTED\]/);
  assert.match(snapshot.longText, /\.\.\.\[TRUNCATED\]$/);
  assert.equal(snapshot.deep.a.b.c.d.e, '[TRUNCATED_DEPTH]');
});

test('AssistantActionAudit pre-validate hook redacts secrets even on direct model validation', async () => {
  const doc = new AssistantActionAudit({
    eventType: 'write_tool.executed',
    merchantUserId: MERCHANT_ID,
    actorUserId: MERCHANT_ID,
    channel: 'whatsapp_platform',
    toolName: 'update_inventory',
    outcome: 'success',
    summary: `Updated stock using Bearer secret-xyz and password=p@ss`,
    beforeState: { stock: 5, apiKey: 'sk-live-secret' },
    afterState: { stock: 12, note: `jwt=${FAKE_JWT}` },
    errorCode: 'OK!@#',
  });

  await doc.validate();
  assert.doesNotMatch(doc.summary, /secret-xyz|p@ss/);
  assert.equal(doc.beforeState.apiKey, '[REDACTED]');
  assert.equal(doc.beforeState.stock, 5);
  assert.doesNotMatch(doc.afterState.note, /eyJhbGci/);
  assert.equal(doc.errorCode, 'OK');
});

test('createAssistantActionAuditService writes sanitized audits, handles failures safely, and scopes queries', async () => {
  const created = [];
  const loggedErrors = [];
  let shouldFailCreate = false;
  let capturedFindFilter = null;

  const FakeAuditModel = {
    async create(doc) {
      if (shouldFailCreate) throw new Error('disk full');
      created.push(doc);
      return { _id: 'audit-1', ...doc };
    },
    find(filter) {
      capturedFindFilter = filter;
      return {
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: async () => [{ _id: 'audit-1', eventType: 'write_tool.executed' }],
            }),
          }),
        }),
      };
    },
    async countDocuments(filter) {
      assert.deepEqual(filter, capturedFindFilter);
      return 1;
    },
  };

  const svc = createAssistantActionAuditService({
    AssistantActionAudit: FakeAuditModel,
    logger: { error: (msg, meta) => loggedErrors.push({ msg, meta }) },
  });

  const saved = await svc.recordAudit({
    eventType: 'write_tool.proposed',
    merchantUserId: MERCHANT_ID,
    channel: 'dashboard_assistant',
    toolName: 'create_order',
    outcome: 'proposed',
    summary: 'Proposed order with token=secret123',
    beforeState: { secret: 'hide-me', count: 1 },
    afterState: { count: 2 },
  });

  assert.equal(saved._id, 'audit-1');
  assert.equal(String(created[0].actorUserId), String(MERCHANT_ID));
  assert.doesNotMatch(created[0].summary, /secret123/);
  assert.equal(created[0].beforeState.secret, '[REDACTED]');

  // Fail-safe by default
  shouldFailCreate = true;
  const failedResult = await svc.recordAudit({
    eventType: 'write_tool.failed',
    merchantUserId: MERCHANT_ID,
    channel: 'system',
    outcome: 'error',
  });
  assert.equal(failedResult, null);
  assert.equal(loggedErrors.length, 1);

  // Explicit throwOnError rethrows
  await assert.rejects(
    () => svc.recordAudit({
      eventType: 'write_tool.failed',
      merchantUserId: MERCHANT_ID,
      channel: 'system',
      outcome: 'error',
    }, { throwOnError: true }),
    /disk full/
  );

  // Scoped listing with bounded pagination
  const listed = await svc.listMerchantAudits({
    merchantUserId: MERCHANT_ID,
    page: 2,
    limit: 500,
    eventType: 'write_tool.executed',
    outcome: 'success',
  });
  assert.equal(String(capturedFindFilter.merchantUserId), String(MERCHANT_ID));
  assert.equal(capturedFindFilter.eventType, 'write_tool.executed');
  assert.equal(capturedFindFilter.outcome, 'success');
  assert.equal(listed.pagination.limit, 100);
  assert.equal(listed.pagination.page, 2);
  assert.equal(listed.items.length, 1);

  const sanitized = sanitizeAuditPayload({
    eventType: 'copilot.draft.sent',
    merchantUserId: MERCHANT_ID,
    channel: 'dashboard_inbox',
    outcome: 'success',
  });
  assert.equal(sanitized.beforeState, null);
  assert.equal(sanitized.afterState, null);
});
