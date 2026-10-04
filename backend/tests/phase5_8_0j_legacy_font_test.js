/**
 * phase5_8_0j_legacy_font_test.js
 *
 * Tests for the legacy font PUA normalizer (F23 partial fix).
 */

'use strict';

const {
  normalizeLegacyGlyphs,
  LEGACY_PUA_MAP,
  UNMAPPED_PLACEHOLDER,
  isLegacyPua,
} = require('../services/ingestion/legacyFontNormalizer');

let passed = 0, failed = 0;

function assert(name, condition) {
  if (condition) { console.log('[PASS] ' + name); passed++; }
  else { console.log('[FAIL] ' + name); failed++; }
}

// T1 — bracket family maps correctly
assert('T1 F8EB -> (', normalizeLegacyGlyphs('\uF8EB') === '(');
assert('T2 F8EC -> [', normalizeLegacyGlyphs('\uF8EC') === '[');
assert('T3 F8ED -> {', normalizeLegacyGlyphs('\uF8ED') === '{');
assert('T4 F8F6 -> )', normalizeLegacyGlyphs('\uF8F6') === ')');
assert('T5 F8F7 -> ]', normalizeLegacyGlyphs('\uF8F7') === ']');
assert('T6 F8F8 -> }', normalizeLegacyGlyphs('\uF8F8') === '}');

// T7 — mixed matrix-style string
const input = '\uF8EC1 2; 3 4\uF8F7';
assert('T7 matrix notation [1 2; 3 4]', normalizeLegacyGlyphs(input) === '[1 2; 3 4]');

// T8 — pass-through for non-PUA text
assert('T8 ASCII unchanged', normalizeLegacyGlyphs('hello world') === 'hello world');
assert('T9 real math unicode unchanged', normalizeLegacyGlyphs('x \u2264 y') === 'x \u2264 y');

// T10 — null/undefined safety
assert('T10 null returns null', normalizeLegacyGlyphs(null) === null);
assert('T11 undefined returns undefined', normalizeLegacyGlyphs(undefined) === undefined);

// T12 — unmapped PUA gets placeholder
const unmapped = '\uF04C';
assert('T12 unmapped PUA -> placeholder', normalizeLegacyGlyphs(unmapped) === UNMAPPED_PLACEHOLDER);

// T13 — mixed mapped + unmapped
const mixed = 'a\uF8EBb\uF04Cc\uF8F6d';
assert('T13 mixed output', normalizeLegacyGlyphs(mixed) === 'a(b' + UNMAPPED_PLACEHOLDER + 'c)d');

// T14 — isLegacyPua bounds
assert('T14 isLegacyPua F8EB true', isLegacyPua('\uF8EB') === true);
assert('T15 isLegacyPua F04C true', isLegacyPua('\uF04C') === true);
assert('T16 isLegacyPua ASCII false', isLegacyPua('a') === false);
assert('T17 isLegacyPua real unicode false', isLegacyPua('\u2264') === false);

// T18 — map has expected keys
const mapKeys = Object.keys(LEGACY_PUA_MAP);
assert('T18 map has 6 entries', mapKeys.length === 6);

// T19 — idempotency: normalize twice = normalize once
const once = normalizeLegacyGlyphs('\uF8ECx\uF8F7');
const twice = normalizeLegacyGlyphs(once);
assert('T19 idempotent', once === twice);

// T20 — realistic ML PDF matrix line
const line = 'A = \uF8EC1 0; 0 1\uF8F7';
assert('T20 realistic matrix identity', normalizeLegacyGlyphs(line) === 'A = [1 0; 0 1]');

console.log(`\nTests passed: ${passed}, failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
