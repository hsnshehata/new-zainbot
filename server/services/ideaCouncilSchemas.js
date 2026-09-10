'use strict';

const Joi = require('joi');

const VERDICT_ENUM = ['VALIDATE_FIRST', 'PROCEED_WITH_CONDITIONS', 'REFINE', 'PIVOT', 'DO_NOT_BUILD_YET'];
const SEVEN_DAY_VERDICT_ENUM = ['YES', 'NO', 'CONDITIONAL'];
const TRUTH_TYPE_ENUM = ['ASSUMPTION', 'RISK', 'QUESTION', 'DEFERRED_ITEM', 'VALIDATION_STEP', 'POSITIVE_SIGNAL', 'DECISION'];
const EPISTEMIC_STATUS_ENUM = ['UNPROVEN', 'PARTIALLY_SUPPORTED', 'SUPPORTED', 'REFUTED', 'NOT_APPLICABLE'];
const PRIORITY_ENUM = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
const WORKFLOW_STATE_ENUM = ['OPEN', 'VALIDATING', 'VERIFIED', 'DISMISSED'];

const IDEA_STRUCTURER_SCHEMA = Joi.object({
  title: Joi.string().required().min(3).max(150),
  elevatorPitch: Joi.string().required().min(10).max(500),
  targetCustomer: Joi.string().required().min(3).max(300),
  problem: Joi.string().allow('', null).default(''),
  coreProblem: Joi.string().allow('', null).default(''),
  solution: Joi.string().allow('', null).default(''),
  proposedSolution: Joi.string().allow('', null).default(''),
  valueProposition: Joi.string().required().min(5).max(500),
  alternatives: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).default([]),
  currentAlternatives: Joi.string().allow('', null).default(''),
  targetMarket: Joi.string().allow('', null).default(null),
  revenueModel: Joi.string().allow('', null).default(null),
  initialAssumptions: Joi.array().items(Joi.string()).default([]),
  missingInformation: Joi.array().items(Joi.string()).default([]),
  coreEvaluationQuestion: Joi.string().required().min(5).max(300),
}).unknown(true);

const COLD_CUSTOMER_SCHEMA = Joi.object({
  rejectionReason: Joi.string().required(),
  switchingCost: Joi.string().required(),
  triggerToTry: Joi.string().required(),
  willingnessToPay: Joi.string().allow('', null).default(''),
  summary: Joi.string().required(),
});

const HARSH_AUDITOR_SCHEMA = Joi.object({
  top3Assumptions: Joi.array().items(Joi.string()).min(1).max(3).required(),
  hardQuestions: Joi.array().items(Joi.string()).min(1).max(3).required(),
  weakestLink: Joi.string().required(),
  summary: Joi.string().required(),
});

const EXECUTION_EXPERT_SCHEMA = Joi.object({
  complexityLevel: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'EXTREME').required(),
  mvpScope7Days: Joi.array().items(Joi.string()).min(1).required(),
  deferredItems: Joi.array().items(Joi.string()).default([]),
  technicalRisks: Joi.array().items(Joi.string()).default([]),
  summary: Joi.string().required(),
});

const MARKET_RESEARCHER_SCHEMA = Joi.object({
  marketCategory: Joi.string().required(),
  directAlternatives: Joi.array().items(Joi.string()).default([]),
  indirectAlternatives: Joi.array().items(Joi.string()).default([]),
  demandSignals: Joi.array().items(Joi.string()).default([]),
  marketSaturation: Joi.string().required(),
  summary: Joi.string().required(),
});

const DEVILS_ADVOCATE_SCHEMA = Joi.object({
  primaryFailureReason: Joi.string().required(),
  failureConditions: Joi.array().items(Joi.string()).min(1).required(),
  earlyWarningSigns: Joi.array().items(Joi.string()).min(1).required(),
  summary: Joi.string().required(),
});

const WEDGE_HUNTER_SCHEMA = Joi.object({
  uniqueWedge: Joi.string().required(),
  defensibility: Joi.string().required(),
  easeOfCopying: Joi.string().required(),
  summary: Joi.string().required(),
});

const UX_DESIGNER_SCHEMA = Joi.object({
  userJourney: Joi.string().required(),
  firstMomentOfValue60s: Joi.string().required(),
  biggestFriction: Joi.string().required(),
  summary: Joi.string().required(),
});

const CANDID_CHAMPION_SCHEMA = Joi.object({
  coreStrength: Joi.string().required(),
  reasonToProceed: Joi.string().required(),
  indispensableAsset: Joi.string().required(),
  summary: Joi.string().required(),
});

const VALIDATION_PLAN_SCHEMA = Joi.object({
  hypothesis: Joi.string().allow('', null).default(''),
  coreHypothesis: Joi.string().allow('', null).default(''),
  targetAudience: Joi.string().required(),
  testingSteps: Joi.array().items(Joi.string()).default([]),
  channel: Joi.string().allow('', null).default(''),
  testingChannel: Joi.string().allow('', null).default(''),
  suggestedDuration: Joi.string().required(),
  estimatedCost: Joi.string().allow('', null).default('0'),
  successMetric: Joi.string().required(),
  stopCondition: Joi.string().required(),
}).unknown(true);

const TRUTH_BOARD_ITEM_SCHEMA = Joi.object({
  id: Joi.string().required(),
  type: Joi.string().valid(...TRUTH_TYPE_ENUM).required(),
  epistemicStatus: Joi.string().valid(...EPISTEMIC_STATUS_ENUM).required(),
  priority: Joi.string().valid(...PRIORITY_ENUM).required(),
  statement: Joi.string().required(),
  rationale: Joi.string().required(),
  nextAction: Joi.string().required(),
  evidenceLinks: Joi.array().items(Joi.string()).default([]),
  workflowState: Joi.string().valid(...WORKFLOW_STATE_ENUM).default('OPEN'),
  userNotes: Joi.string().allow('', null).default(''),
});

const UNIT_ECONOMICS_SCHEMA = Joi.object({
  currency: Joi.string().allow('', null).default('EGP'),
  averageOrderValue: Joi.number().allow(null).default(0),
  takeRatePercent: Joi.number().allow(null).default(15),
  grossRevenuePerUnit: Joi.number().allow(null).default(0),
  directCostsPerUnit: Joi.number().allow(null).default(0),
  netContributionPerUnit: Joi.number().allow(null).default(0),
  estimatedMonthlyFixedCosts: Joi.number().allow(null).default(0),
  monthlyBreakevenOrders: Joi.number().allow(null).default(0),
  targetDailyOrders: Joi.number().allow(null).default(0),
  paybackPeriodMonths: Joi.number().allow(null).default(null),
  keyFinancialRisk: Joi.string().allow('', null).default(''),
}).unknown(true).default(null);

const CHAIRPERSON_SYNTHESIS_SCHEMA = Joi.object({
  executiveSummary: Joi.string().required(),
  verdict: Joi.string().valid(...VERDICT_ENUM).required(),
  verdictExplanation: Joi.string().required(),
  sevenDayBuildVerdict: Joi.string().valid(...SEVEN_DAY_VERDICT_ENUM).required(),
  sevenDayBuildConditions: Joi.string().allow('', null).default(null),
  strongestOpportunity: Joi.string().required(),
  biggestRisk: Joi.string().required(),
  top3Assumptions: Joi.array().items(Joi.string()).min(1).max(3).required(),
  criticalQuestion: Joi.string().allow('', null).default(''),
  criticalQuestionToSettle: Joi.string().allow('', null).default(''),
  killOrDeferList: Joi.array().items(Joi.string()).default([]),
  cutListForV1: Joi.array().items(Joi.string()).default([]),
  validationPlan: VALIDATION_PLAN_SCHEMA.required(),
  unitEconomics: UNIT_ECONOMICS_SCHEMA,
  sevenDayMvpScope: Joi.alternatives().try(
    Joi.array().items(Joi.string()),
    Joi.object({
      coreFeatures: Joi.array().items(Joi.string()).default([]),
      uniqueWedge: Joi.string().allow('', null).default(''),
      firstMomentOfValue: Joi.string().allow('', null).default('')
    })
  ).required(),
  uniqueWedge: Joi.string().allow('', null).default(''),
  firstMomentOfValue: Joi.string().allow('', null).default(''),
  consensusPoints: Joi.array().items(Joi.string()).default([]),
  dissentPoints: Joi.array().items(Joi.string()).default([]),
  confidenceLevel: Joi.number().min(0).max(1).default(0.8),
  evidenceQuality: Joi.string().valid('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_EVIDENCE').default('MEDIUM'),
  truthBoardItems: Joi.array().items(TRUTH_BOARD_ITEM_SCHEMA).min(1).required(),
}).unknown(true);

const AGENT_SCHEMAS = {
  STRUCTURER: IDEA_STRUCTURER_SCHEMA,
  COLD_CUSTOMER: COLD_CUSTOMER_SCHEMA,
  HARSH_AUDITOR: HARSH_AUDITOR_SCHEMA,
  EXECUTION_EXPERT: EXECUTION_EXPERT_SCHEMA,
  MARKET_RESEARCHER: MARKET_RESEARCHER_SCHEMA,
  DEVILS_ADVOCATE: DEVILS_ADVOCATE_SCHEMA,
  WEDGE_HUNTER: WEDGE_HUNTER_SCHEMA,
  UX_DESIGNER: UX_DESIGNER_SCHEMA,
  CANDID_CHAMPION: CANDID_CHAMPION_SCHEMA,
  CHAIRPERSON: CHAIRPERSON_SYNTHESIS_SCHEMA,
};

function validateAgentOutput(role, data) {
  const schema = AGENT_SCHEMAS[role];
  if (!schema) {
    throw new Error(`Unknown role for schema validation: ${role}`);
  }
  const { error, value } = schema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    return { valid: false, error: error.message, value: null };
  }

  // Normalize structurer output field aliases
  if (role === 'STRUCTURER' && value) {
    value.problem = value.problem || value.coreProblem || '';
    value.coreProblem = value.coreProblem || value.problem || '';
    value.solution = value.solution || value.proposedSolution || '';
    value.proposedSolution = value.proposedSolution || value.solution || '';
    if (!value.alternatives && value.currentAlternatives) {
      value.alternatives = typeof value.currentAlternatives === 'string'
        ? value.currentAlternatives.split(',').map((s) => s.trim()).filter(Boolean)
        : value.currentAlternatives;
    }
    if (!value.currentAlternatives && value.alternatives) {
      value.currentAlternatives = Array.isArray(value.alternatives)
        ? value.alternatives.join(', ')
        : String(value.alternatives);
    }
  }

  return { valid: true, error: null, value };
}

module.exports = {
  VERDICT_ENUM,
  SEVEN_DAY_VERDICT_ENUM,
  TRUTH_TYPE_ENUM,
  EPISTEMIC_STATUS_ENUM,
  PRIORITY_ENUM,
  WORKFLOW_STATE_ENUM,
  AGENT_SCHEMAS,
  validateAgentOutput,
};
