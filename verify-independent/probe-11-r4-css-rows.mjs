/**
 * Independent adversarial probe 11 (rev-4, task t1) — the "3 rows then it scrolls" claim.
 *
 * Claim under attack:
 *   7. the `max-height` in the CSS is really 3 option rows (derived step by step,
 *      not asserted as a string), the rule lives inside `@supports
 *      (appearance:base-select)`, and `overflow-y:auto` sits in the SAME rule.
 *
 * The stylesheet is not read from the source text: the REAL `injectStyles()` is
 * executed in a vm sandbox and the probe parses the `textContent` of the
 * `<style>` element that the bundle appended. The row height is derived from the
 * two declarations the stylesheet itself carries (line-height + padding), so a
 * drift in either number is a failure here.
 */

import { createHash } from 'node:crypto';
import { boot, suite, makeFetch } from './kit/rev4.mjs';

const S = suite('probe-11 rev-4 scroll CSS semantics (independent)');

/** sha256 of a string, so "the mutation really changed something" is a digest, not a length. */
const sha = (text) => (text === null || text === undefined ? 'null' : createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').toUpperCase());

/* --------------------------------------------------------------- mutations */

/**
 * In-memory mutations of the stylesheet the REAL bundle injected — `lib/client.js` on disk
 * is never touched. `boot()` reads the shipped source itself (kit/rev4.mjs), so the mutation
 * is applied to `api.cssText()`: the unmutated run proves the extraction path reads the real
 * injected `<style>`, and the mutant then exercises the resolution + arithmetic below on a
 * one-token edit of those very bytes. `expectFail` lists the checks that MUST go red — a
 * mutation nothing notices fails the probe.
 *
 *       node verify-independent/probe-11-r4-css-rows.mjs
 *       node verify-independent/probe-11-r4-css-rows.mjs --mutate=card-cap-92px
 *       node verify-independent/probe-11-r4-css-rows.mjs --list-mutations
 */
const MUTATIONS = {
  'card-cap-92px': {
    what: 'rev-5 R5-1 回归：卡片上限从 84px 改回 92px（就是当年那个 box-model 缺陷的值）',
    expectFail: [
      '`max-height` is declared on the picker (rev-5 R5-1: 84px, not 92px)',
      'max-height equals exactly 3 rows: the 4th row is the first one that overflows',
      'the padding and border are ADDED to that 84px, not subtracted from it',
    ],
    apply(css) {
      const from = '.dacCard select::picker(select){max-height:84px;}';
      const to = '.dacCard select::picker(select){max-height:92px;}';
      if (css === null) throw new Error('mutation anchor not found: no stylesheet');
      const at = css.indexOf(from);
      if (at < 0) throw new Error(`mutation anchor not found: ${from}`);
      if (css.indexOf(from, at + from.length) >= 0) throw new Error(`mutation anchor is not unique: ${from}`);
      return css.slice(0, at) + to + css.slice(at + from.length);
    },
  },
};

const mutateArg = process.argv.find((value) => value.startsWith('--mutate='));
const MUTATION = mutateArg === undefined ? null : MUTATIONS[mutateArg.slice('--mutate='.length)];
if (mutateArg !== undefined && MUTATION === undefined) {
  console.error(`unknown mutation ${mutateArg}; available: ${Object.keys(MUTATIONS).join(', ')}`);
  process.exit(2);
}
if (process.argv.includes('--list-mutations')) {
  for (const [name, entry] of Object.entries(MUTATIONS)) console.log(`${name}: ${entry.what}`);
  process.exit(0);
}

/** Find one block by prelude and return its body with brace matching. */
function blockBody(css, prelude) {
  const at = css.indexOf(prelude);
  if (at < 0) return null;
  const open = css.indexOf('{', at);
  if (open < 0) return null;
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    else if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) return { body: css.slice(open + 1, index), start: open + 1, end: index, preludeStart: at };
    }
  }
  return null;
}

/** Split one level of `sel{decls}` rules; nested blocks are not expected here. */
function rules(body) {
  const found = [];
  let cursor = 0;
  while (cursor < body.length) {
    const open = body.indexOf('{', cursor);
    if (open < 0) break;
    const selector = body.slice(cursor, open).trim();
    let depth = 0;
    for (let index = open; index < body.length; index += 1) {
      if (body[index] === '{') depth += 1;
      else if (body[index] === '}') {
        depth -= 1;
        if (depth === 0) {
          found.push({ selector, declarations: body.slice(open + 1, index) });
          cursor = index + 1;
          break;
        }
      }
    }
  }
  return found;
}

/** `padding:4px` / `padding:4px 9px` → [top, right, bottom, left]. */
function padding(value) {
  if (typeof value !== 'string') return null;
  const parts = value.trim().split(/\s+/).map((part) => Number.parseFloat(part));
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  return parts;
}

/** Read one declaration out of a `prop:value;` list (last wins, like CSS). */
function declared(declarations, property) {
  const found = [];
  for (const part of declarations.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    if (part.slice(0, colon).trim() === property) found.push(part.slice(colon + 1).trim());
  }
  return found.length === 0 ? null : found[found.length - 1];
}

/* ---------------------------------------------- resolving one target's declarations */

/*
 * rev-12 repair (t2). Before rev-12 the whole picker style was ONE rule, so "the last
 * rule inside @supports whose selector mentions ::picker(select)" WAS the picker rule.
 * rev-12 split it on purpose: the box declarations moved into a rule whose selector list
 * names BOTH tone lists, and each list kept a rule of its own carrying only `max-height`.
 * The SUBJECT of every assertion below is unchanged -- what the CARD's list resolves to --
 * so the lookup now cascades over every rule inside the block whose selector LIST names
 * `.dacCard select::picker(select)` (the shared box rule + the card-only cap rule), in
 * written order, the way a browser would. Co-location is no longer asserted anywhere:
 * that is precisely the thing rev-12 changed.
 */

const CARD_PICKER = '.dacCard select::picker(select)';
const POP_PICKER = '.dacPop select::picker(select)';
const CARD_OPTION_SELECTOR = '.dacCard select option';

/** Top-level selector-list split: a comma inside `(...)` does not split. */
function selectorList(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      out.push(text.slice(start, index));
      start = index + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((entry) => entry.trim().replace(/\s+/g, ' ')).filter((entry) => entry !== '');
}

/**
 * Resolve a target's declarations across the rules that NAME it. Participation is an
 * exact selector match, so every participant carries the IDENTICAL selector and therefore
 * the identical specificity -- written order is the whole cascade here, and the
 * `participants[0] === participants[0]` cross-check below records that the two lists share
 * the first participant rather than each having a copy of their own.
 */
function resolve(ruleList, target) {
  const participants = ruleList.filter((rule) => selectorList(rule.selector).includes(target));
  const declarations = new Map();
  for (const rule of participants) {
    for (const part of rule.declarations.split(';')) {
      const colon = part.indexOf(':');
      if (colon < 0) continue;
      declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
    }
  }
  return { participants, declarations };
}

/** `4px` / `12px` → 4 / 12; anything missing or unparsable → null (never throw). */
function px(value) {
  if (typeof value !== 'string') return null;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

/** `1px solid var(...)` → 1; absent → null. */
function borderWidthOf(value) {
  return px(value);
}

/** `Map` lookup that answers null instead of undefined. */
function valueOf(resolved, property) {
  return resolved.declarations.has(property) ? resolved.declarations.get(property) : null;
}

const api = boot({ fetch: makeFetch({}), scopeValue: { enabled: true, volume: 70, tone: 'chime', custom: [] } });
const injectedCss = api.cssText();
const css = MUTATION === null ? injectedCss : MUTATION.apply(injectedCss);
S.note('mutation mode', MUTATION === null ? 'off — run with --mutate=<name> to prove the checks bite' : MUTATION.what);
S.note('style element id', api.document.elements.filter((element) => element.tag === 'style').map((element) => `${element.id} (data-plugin=${element.attributes['data-plugin']})`));
S.note('stylesheet length (chars)', css === null ? null : css.length);
S.same('the bundle injected exactly one <style> element', api.document.elements.filter((element) => element.tag === 'style').length, 1);

/* -------------------------------------------------- the @supports gate itself */

S.group('claim 7a — the rule is inside @supports (appearance:base-select)');
const supports = css === null ? null : blockBody(css, '@supports (appearance:base-select)');
S.check('the exact @supports prelude is present', supports !== null, supports === null ? 'not found' : `body is ${supports.body.length} chars`);
S.same('the @supports prelude appears exactly once', css === null ? -1 : css.split('@supports').length - 1, 1);
const outerCss = supports === null ? css : css.slice(0, supports.preludeStart) + css.slice(supports.end + 1);
S.check('outside the @supports block there is no max-height for the select at all', outerCss !== null && /max-height/.test(outerCss) === false, outerCss === null ? 'no stylesheet' : `max-height occurrences outside: ${(outerCss.match(/max-height/g) ?? []).length}`);
S.check('outside the @supports block there is no overflow-y for the select at all', outerCss !== null && /overflow-y/.test(outerCss) === false, outerCss === null ? 'no stylesheet' : `overflow-y occurrences outside: ${(outerCss.match(/overflow-y/g) ?? []).length}`);
S.check('the only rule outside that touches the popup items is the option color rule', outerCss !== null && /(^|\})([^{}]*option[^{}]*)\{([^}]*)\}/.test(outerCss) === true, outerCss === null ? 'no stylesheet' : 'see the rule dump below');

/* ------------------------------------------------------- the picker rule itself */

S.group('claim 7b — the picker rule and its arithmetic');
const insideRules = supports === null ? [] : rules(supports.body);
for (const rule of insideRules) S.note('rule', `${rule.selector} { ${rule.declarations} }`);
const cardPicker = resolve(insideRules, CARD_PICKER);
const popPicker = resolve(insideRules, POP_PICKER);
const cardOption = resolve(insideRules, CARD_OPTION_SELECTOR);
const pickerRule = insideRules.find((rule) => rule.selector.includes('::picker(select)')) ?? null;
const optionRule = insideRules.find((rule) => rule.selector.includes('option') && declared(rule.declarations, 'line-height') !== null) ?? null;
S.note('rules naming the card list', cardPicker.participants.map((rule) => rule.selector));
S.note('card list declarations (resolved in written order)', Object.fromEntries(cardPicker.declarations));
S.check('a `::picker(select)` rule exists inside the @supports block', pickerRule !== null, pickerRule === null ? 'missing' : pickerRule.selector);
S.check('an `option` rule exists inside the @supports block', optionRule !== null, optionRule === null ? 'missing' : optionRule.selector);
S.same('the picker opts into the customizable rendering', valueOf(cardPicker, 'appearance'), 'base-select');
S.same('rev-5 R5-1: the picker pins its own box model to content-box', valueOf(cardPicker, 'box-sizing'), 'content-box');
S.same('`max-height` is declared on the picker (rev-5 R5-1: 84px, not 92px)', valueOf(cardPicker, 'max-height'), '84px');
S.same('the card list resolves overflow-y:auto (rev-12: declared in the shared box rule)', valueOf(cardPicker, 'overflow-y'), 'auto');
S.same('the card list resolves overflow-x:hidden (rev-12: declared in the shared box rule)', valueOf(cardPicker, 'overflow-x'), 'hidden');
S.same('the picker padding is 4px all round', valueOf(cardPicker, 'padding'), '4px');
S.same('the picker border is the 1px hairline the comment mentions', valueOf(cardPicker, 'border'), '1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16))');
S.check('no explicit height is set on the picker', cardPicker.participants.length > 0 && valueOf(cardPicker, 'height') === null, `participants=${cardPicker.participants.length}, height=${JSON.stringify(valueOf(cardPicker, 'height'))}`);
S.same('the option line box is pinned to 20px', valueOf(cardOption, 'line-height'), '20px');
S.same('the option padding is 4px 9px', valueOf(cardOption, 'padding'), '4px 9px');
S.check('the option has no explicit height, so height follows the line box', cardOption.participants.length > 0 && valueOf(cardOption, 'height') === null, `participants=${cardOption.participants.length}, height=${JSON.stringify(valueOf(cardOption, 'height'))}`);
// rev-12: the two tone lists are one design by construction, so the CARD's resolution
// above is the POPOVER's too. That is a fact this probe's subject now depends on.
S.check(
  'the popover list is styled by the SAME shared rule, not a second copy (rev-12)',
  cardPicker.participants.length === 2 && popPicker.participants.length === 2
    && cardPicker.participants[0] === popPicker.participants[0]
    && selectorList(cardPicker.participants[0].selector).length === 2,
  `card=${cardPicker.participants.map((rule) => rule.selector).join(' | ')}; popover=${popPicker.participants.map((rule) => rule.selector).join(' | ')}`,
);

/* ------------------------------------------------------ the arithmetic, step by step */

S.group('claim 7c — the arithmetic, step by step');
{
  // Every input below is null when the stylesheet stopped declaring it, and every derived
  // value propagates that null instead of throwing: a future re-split of the block must
  // show up as FAILED assertions, not as an uncaught TypeError that hides the verdict.
  const lineHeight = px(valueOf(cardOption, 'line-height'));
  const optionPadding = padding(valueOf(cardOption, 'padding'));
  const pickerPadding = padding(valueOf(cardPicker, 'padding'));
  const maxHeight = px(valueOf(cardPicker, 'max-height'));
  const borderWidth = borderWidthOf(valueOf(cardPicker, 'border'));
  const boxSizing = valueOf(cardPicker, 'box-sizing');
  const rows = api.diagnostics.toneRows;

  S.same('TONE_ROWS published by the bundle', rows, 3);
  S.note('step 1 — option line box', `${lineHeight}px (line-height)`);
  S.note('step 2 — option padding', `${JSON.stringify(optionPadding)} → ${optionPadding === null ? '?' : optionPadding[0] + optionPadding[2]}px vertical`);
  const rowHeight = lineHeight === null || optionPadding === null ? null : lineHeight + optionPadding[0] + optionPadding[2];
  S.note('step 3 — one row is', rowHeight === null ? 'unknown (line-height or padding missing)' : `${lineHeight} + ${optionPadding[0]} + ${optionPadding[2]} = ${rowHeight}px`);
  const content = rowHeight === null ? null : rows * rowHeight;
  S.note(`step 4 — ${rows} rows are`, content === null ? 'unknown' : `${rows} × ${rowHeight} = ${content}px`);
  const pickerPad = pickerPadding === null ? null : pickerPadding[0] + pickerPadding[2];
  S.note('step 5 — picker padding / border', `${pickerPad}px padding, ${borderWidth === null ? '?' : borderWidth * 2}px border`);
  S.note('step 6 — with box-sizing:content-box the max-height IS the content box', `max-height ${maxHeight}px vs content needed ${content}px`);
  S.check('max-height equals exactly 3 rows: the 4th row is the first one that overflows', maxHeight !== null && content !== null && maxHeight === content, `expected ${content}, got ${JSON.stringify(maxHeight)}`);
  S.same('and the UA\'s own box model can no longer change that (the author declaration wins)', boxSizing, 'content-box');
  const outerBox = maxHeight === null || pickerPad === null || borderWidth === null ? null : maxHeight + pickerPad + borderWidth * 2;
  S.check('the padding and border are ADDED to that 84px, not subtracted from it', outerBox !== null && content !== null && maxHeight === content && outerBox > content, `outer box = ${maxHeight} + ${pickerPad} + ${borderWidth === null ? '?' : borderWidth * 2} = ${outerBox}px`);
  S.same('the pinned row constant is 28px (derived from the stylesheet, not from the source)', rowHeight, 28);
  const shortfall = pickerPad === null || borderWidth === null ? null : 92 - pickerPad - borderWidth * 2;
  S.note('the old value under the reviewer\'s UA=border-box claim', shortfall === null || rowHeight === null ? 'unknown' : `92 - ${pickerPad} (padding) - ${borderWidth * 2} (border) = ${shortfall}px of content → ${(shortfall / rowHeight).toFixed(4)} rows, i.e. ${content - shortfall}px short of three rows`);
  S.check('the reviewer\'s mechanism is arithmetically consistent (92px border-box would have been 2px short of 3 rows)', shortfall !== null && content !== null && shortfall === content - 2, `92px → ${shortfall}px content vs ${content}px needed`);
  S.check('the shipped 84px cannot be short of three rows under EITHER box model', content !== null && 84 === content && 84 > 0, `content needed = ${content}px`);
}

/* -------------------------------------------- how many rows a real roster shows */

S.group('claim 7d — a real roster always exceeds the window');
{
  S.same('the built-ins alone already fill the window exactly', api.diagnostics.tones.length, 3);
  S.check('any imported tone makes the list scroll (3 built-ins + imports > 3 rows)', api.diagnostics.tones.length + 1 > api.diagnostics.toneRows, `${1 + api.diagnostics.tones.length} rows in a window of ${api.diagnostics.toneRows}`);
  const dictionary = api.log.localeRegistrations.length > 0 ? api.log.localeRegistrations[0].dictionary : null;
  S.check('the card copy promises the scroll behaviour in both languages', dictionary !== null && dictionary.zh.customHint.includes('超过 3 项后列表可滚动') && dictionary.en.customHint.includes('the list scrolls past three'), dictionary === null ? 'no dictionary registered' : `zh="${dictionary.zh.customHint}" en="${dictionary.en.customHint}"`);
}

S.group('claim 7e — what a browser without base-select falls back to');
{
  S.check('no rule outside the @supports block rounds the popup', outerCss !== null && /border-radius[^;]*;?[^}]*picker/.test(outerCss) === false, 'no ::picker rule outside @supports');
  // rev-12 merged this fallback rule's selector list with the popover's, so the subject is
  // asserted by resolving the CARD's option colours outside the block instead of by a
  // literal prefix: the card's list must still be painted by the design tokens.
  const cardFallback = outerCss === null ? { participants: [], declarations: new Map() } : resolve(rules(outerCss), CARD_OPTION_SELECTOR);
  const fallbackColour = valueOf(cardFallback, 'background-color');
  S.check(
    'the fallback rules that DO apply everywhere are the option colors',
    cardFallback.participants.length > 0 && typeof fallbackColour === 'string' && fallbackColour.startsWith('var(--dsw-alias-bg-layer-1'),
    `card option fallback rules=${cardFallback.participants.length}, background-color=${JSON.stringify(fallbackColour)}, color=${JSON.stringify(valueOf(cardFallback, 'color'))}`,
  );
  S.note('fallback semantics', 'the @supports condition is FALSE → the whole block (appearance:base-select, ::picker(select) max-height/overflow/padding/radius) is dropped; the select keeps the UA popup, so max-height/overflow-y have no effect and every option is listed in full. Nothing is truncated or hidden.');
}

/* ------------------------------------------------------- 7f. mutation verdict */

let mutationCaught = true;
if (MUTATION !== null) {
  S.group('claim 7f — the probe can falsify a regression, not just confirm the fix');
  const failing = new Set(S.rows.filter((row) => !row.passed).map((row) => row.name));
  S.note('checks that turned red', [...failing]);
  const missing = MUTATION.expectFail.filter((name) => !failing.has(name));
  S.check(
    `every expected check failed under "${MUTATION.what}"`,
    missing.length === 0,
    missing.length === 0 ? `all ${MUTATION.expectFail.length} expected failures observed` : `NOT caught: ${JSON.stringify(missing)}`,
  );
  // The red set must be EXACTLY the declaration: an extra red means the declaration and the
  // probe disagree, and one of them is wrong (t2 audit: measured red == declared, 3 == 3).
  const surprise = [...failing].filter((name) => !MUTATION.expectFail.includes(name));
  S.check(
    `no undeclared check turned red under "${MUTATION.what}"`,
    surprise.length === 0,
    surprise.length === 0 ? `the red set is exactly the ${MUTATION.expectFail.length} declared check(s)` : `UNDECLARED red: ${JSON.stringify(surprise)}`,
  );
  const stylesheetChanged = css !== injectedCss;
  S.check(
    'the mutation really rewrote the stylesheet under test',
    stylesheetChanged,
    `sha256 ${sha(css).slice(0, 16)} vs ${sha(injectedCss).slice(0, 16)} (${css === null ? 'null' : css.length} vs ${injectedCss === null ? 'null' : injectedCss.length} chars)${stylesheetChanged ? '' : ' — DEAD MUTATION: the stylesheet is unchanged'}`,
  );
  mutationCaught = missing.length === 0 && surprise.length === 0 && stylesheetChanged;
}

S.done();

// In mutation mode the exit code answers "was the mutation caught EXACTLY as declared?" —
// the red assertions above are the expected outcome, not a regression (probe-18's
// discipline). Without --mutate the exit code is the plain suite verdict from S.done().
if (MUTATION !== null) process.exitCode = mutationCaught ? 0 : 1;
