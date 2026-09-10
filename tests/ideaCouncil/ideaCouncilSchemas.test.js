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

test('ideaCouncilSchemas: validates chairperson output with unitEconomics', () => {
  const validChairperson = {
    executiveSummary: 'خلاصة التقرير الاستراتيجي',
    verdict: 'VALIDATE_FIRST',
    verdictExplanation: 'فكرة واعدة لكن تحتاج تحقق مسبق',
    sevenDayBuildVerdict: 'CONDITIONAL',
    sevenDayBuildConditions: 'البدء بتجربة يدوية',
    strongestOpportunity: 'فرصة قوية',
    biggestRisk: 'مخاطرة كبرى',
    top3Assumptions: ['افتراض 1', 'افتراض 2', 'افتراض 3'],
    criticalQuestion: 'سؤال محوري',
    criticalQuestionToSettle: 'سؤال محوري',
    killOrDeferList: ['ميزة متقدمة'],
    cutListForV1: ['ميزة متقدمة'],
    validationPlan: {
      hypothesis: 'فرضية',
      coreHypothesis: 'فرضية',
      targetAudience: 'أصحاب المطاعم',
      testingSteps: ['خطوة 1'],
      channel: 'واتساب مباشر',
      testingChannel: 'واتساب مباشر',
      suggestedDuration: '30 يوماً',
      estimatedCost: '0',
      successMetric: 'معيار نجاح',
      stopCondition: 'شرط توقف',
    },
    unitEconomics: {
      currency: 'EGP',
      averageOrderValue: 120,
      takeRatePercent: 20,
      grossRevenuePerUnit: 24,
      directCostsPerUnit: 4,
      netContributionPerUnit: 20,
      estimatedMonthlyFixedCosts: 10000,
      monthlyBreakevenOrders: 500,
      targetDailyOrders: 17,
      keyFinancialRisk: 'حساسية تكلفة التوصيل',
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

  const res = validateAgentOutput('CHAIRPERSON', validChairperson);
  assert.equal(res.valid, true);
  assert.equal(res.error, null);
  assert.equal(res.value.unitEconomics.monthlyBreakevenOrders, 500);
});

test('OpenAiWebResearchAdapter: extracts domain keywords and filters news noise', () => {
  const { OpenAiWebResearchAdapter } = require('../../server/services/ideaWebResearchAdapter');
  const adapter = new OpenAiWebResearchAdapter();

  const keywords = adapter._extractDomainKeywords({
    title: 'آخر ساعة',
    problem: 'فائض الطعام وهدر الوجبات في المطاعم قبل الإغلاق',
    targetMarket: 'مصر',
  });

  assert.ok(keywords.includes('فائض'));
  assert.ok(keywords.includes('الطعام'));
  assert.ok(keywords.includes('المطاعم'));

  const filtered = adapter._normalizeResults(
    [
      { title: 'حادث تصادم على طريق السويس خلال آخر ساعة', rawHref: 'https://youm7.com/story1', snippet: 'لقي شخص مصرعه' },
      { title: 'تطبيق مصري لإنقاذ فائض الطعام من المطاعم', rawHref: 'https://youm7.com/story2', snippet: 'منصة ناشئة لإعادة بيع الوجبات' },
    ],
    keywords
  );

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].title, 'تطبيق مصري لإنقاذ فائض الطعام من المطاعم');
});

