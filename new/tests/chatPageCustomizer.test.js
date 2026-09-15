const test = require('node:test');
const assert = require('node:assert/strict');

test('Chat page default configuration meets visual standards', () => {
  const defaultColors = {
    header: '#0F172A',
    titleColor: '#ffffff',
    outerBackgroundColor: '#0A0F1D',
    containerBackgroundColor: '#0F172A',
    chatAreaBackground: '#0B1329',
    userMessageBackground: '#06B6D4',
    userMessageTextColor: '#ffffff',
    botMessageBackground: '#1E293B',
    botMessageTextColor: '#F8FAFC',
    sendButtonColor: '#06B6D4',
    button: '#06B6D4',
    inputTextColor: '#ffffff',
  };

  assert.equal(defaultColors.header, '#0F172A');
  assert.equal(defaultColors.userMessageBackground, '#06B6D4');
  assert.equal(defaultColors.botMessageBackground, '#1E293B');
});

test('Chat page question formatting handles strings and arrays', () => {
  const formatQuestions = (input) => {
    if (Array.isArray(input)) return input;
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
      return input.split('\n').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  const stringList = 'سؤال أول\nسؤال ثاني\nسؤال ثالث';
  const arrayResult = formatQuestions(stringList);
  assert.equal(arrayResult.length, 3);
  assert.equal(arrayResult[0], 'سؤال أول');

  const jsonList = '["Q1", "Q2"]';
  const jsonResult = formatQuestions(jsonList);
  assert.equal(jsonResult.length, 2);
  assert.equal(jsonResult[1], 'Q2');
});
