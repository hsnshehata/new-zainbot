'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateAgentOutput,
  VERDICT_ENUM,
} = require('../../server/services/ideaCouncilSchemas');

test('ideaCouncilSchemas: validates structured idea correctly', () => {
  const validIdea = {
    title: 'تطبيق إدارة المخزون الذكي',
    elevatorPitch: 'منصة ذكية لإدارة المخزون والتنبؤ بالمبيعات لتجار التجزئة',
    targetCustomer: 'أصحاب متاجر التجزئة ومحلات السوبرماركت',
    problem: 'فقدان الأرباح وتلف البضائع بسبب سوء إدارة المشتريات والمخزون',
    solution: 'نظام تنبؤ بالذكاء الاصطناعي يطلب البضائع تلقائياً قبل نفادها',
    valueProposition: 'خفض الهدر بنسبة 35% وزيادة التدفق النقدي',
    alternatives: ['إكسيل شيت', 'الدفاتر الورقية'],
    targetMarket: 'السعودية والخليج',
    revenueModel: 'اشتراك شهري SaaS',
    initialAssumptions: ['التجار مستعدون لربط أجهزة الكاشير بالنظام'],
    missingInformation: ['متوسط دورة الشراء للسلع الاستهلاكية'],
    coreEvaluationQuestion: 'هل يثق التاجر في طلب بضائع تلقائياً دون تدخله؟',
  };

  const res = validateAgentOutput('STRUCTURER', validIdea);
  assert.equal(res.valid, true);
  assert.equal(res.error, null);
});

test('ideaCouncilSchemas: rejects invalid chairperson verdict', () => {
  const invalidChairperson = {
    executiveSummary: 'خلاصة التقرير',
    verdict: 'SUPER_AWESOME', // Invalid verdict!
    verdictExplanation: 'تفسير القرار',
    sevenDayBuildVerdict: 'YES',
    strongestOpportunity: 'فرصة قوية',
    biggestRisk: 'مخاطرة كبرى',
    top3Assumptions: ['افتراض 1', 'افتراض 2', 'افتراض 3'],
    criticalQuestion: 'سؤال محوري',
    killOrDeferList: [],
    validationPlan: {
      hypothesis: 'فرضية',
      targetAudience: 'جمهور',
      testingSteps: ['خطوة 1'],
      channel: 'قناة',
      suggestedDuration: '10 أيام',
      estimatedCost: '100$',
      successMetric: 'معيار نجاح',
      stopCondition: 'شرط توقف',
    },
    sevenDayMvpScope: ['ميزة 1'],
    uniqueWedge: 'ميزة تميز',
    firstMomentOfValue: 'لحظة قيمة',
    truthBoardItems: [
      {
        id: 'tb-1',
        type: 'ASSUMPTION',
        epistemicStatus: 'UNPROVEN',
        priority: 'HIGH',
        statement: 'بيان',
        rationale: 'سبب',
        nextAction: 'إجراء',
      },
    ],
  };

  const res = validateAgentOutput('CHAIRPERSON', invalidChairperson);
  assert.equal(res.valid, false);
  assert.match(res.error, /"verdict" must be one of/);
});

test('ideaCouncilSchemas: validates Cold Customer output schema', () => {
  const coldCustomerOutput = {
    rejectionReason: 'لا أملك وقتاً لتدريب الموظفين على نظام جديد',
    switchingCost: 'نقل قواعد البيانات القديمة يحتاج أسبوعين',
    triggerToTry: 'تجربة مجانية لمدة 30 يوماً مع استيراد تلقائي للبيانات',
    willingnessToPay: 'نعم إذا وفر علي راتب موظف جرد',
    summary: 'العميل متردد بسبب صعوبة التغيير لكنه مهتم بالتوفير المالي',
  };

  const res = validateAgentOutput('COLD_CUSTOMER', coldCustomerOutput);
  assert.equal(res.valid, true);
  assert.equal(res.error, null);
});
