import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, DEFAULTS } from '../src/settings.js';

test('khali/kharab input default par aata hai', () => {
  const { settings } = sanitize({ warnDays: 'abc', dangerDays: null, warnColor: 'neon', showDots: 'yes' });
  assert.deepEqual(settings, DEFAULTS);
});

test('range ke bahar ke din clamp hote hain', () => {
  assert.equal(sanitize({ warnDays: -5 }).settings.warnDays, 1);
  assert.equal(sanitize({ warnDays: 999 }).settings.warnDays, 43);
  assert.equal(sanitize({ warnDays: 5.6 }).settings.warnDays, 6);
});

test('red hamesha amber se bada hota hai', () => {
  const { settings, notes } = sanitize({ warnDays: 10, dangerDays: 3 });
  assert.equal(settings.dangerDays, 11);
  assert.equal(notes.length, 1);
  assert.equal(sanitize({ warnDays: 43, dangerDays: 500 }).settings.dangerDays, 44);
});

test('rang sirf apni list se', () => {
  assert.equal(sanitize({ warnColor: 'red' }).settings.warnColor, DEFAULTS.warnColor);
  assert.equal(sanitize({ dangerColor: 'purple' }).settings.dangerColor, 'purple');
});
