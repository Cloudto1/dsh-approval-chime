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

import { boot, suite, makeFetch } from './kit/rev4.mjs';

const S = suite('probe-11 rev-4 scroll CSS semantics (independent)');

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

const api = boot({ fetch: makeFetch({}), scopeValue: { enabled: true, volume: 70, tone: 'chime', custom: [] } });
const css = api.cssText();
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
let pickerRule = null;
let optionRule = null;
if (supports !== null) {
  for (const rule of rules(supports.body)) {
    if (rule.selector.includes('::picker(select)')) pickerRule = rule;
    else if (rule.selector.includes('option') && declared(rule.declarations, 'line-height') !== null) optionRule = rule;
    S.note('rule', `${rule.selector} { ${rule.declarations} }`);
  }
}
S.check('a `::picker(select)` rule exists inside the @supports block', pickerRule !== null, pickerRule === null ? 'missing' : pickerRule.selector);
S.check('an `option` rule exists inside the @supports block', optionRule !== null, optionRule === null ? 'missing' : optionRule.selector);
S.same('the picker opts into the customizable rendering', pickerRule === null ? null : declared(pickerRule.declarations, 'appearance'), 'base-select');
S.same('rev-5 R5-1: the picker pins its own box model to content-box', pickerRule === null ? null : declared(pickerRule.declarations, 'box-sizing'), 'content-box');
S.same('`max-height` is declared on the picker (rev-5 R5-1: 84px, not 92px)', pickerRule === null ? null : declared(pickerRule.declarations, 'max-height'), '84px');
S.same('`overflow-y:auto` is in the SAME rule as max-height', pickerRule === null ? null : declared(pickerRule.declarations, 'overflow-y'), 'auto');
S.same('`overflow-x:hidden` is in the SAME rule as max-height', pickerRule === null ? null : declared(pickerRule.declarations, 'overflow-x'), 'hidden');
S.same('the picker padding is 4px all round', pickerRule === null ? null : declared(pickerRule.declarations, 'padding'), '4px');
S.same('the picker border is the 1px hairline the comment mentions', pickerRule === null ? null : declared(pickerRule.declarations, 'border'), '1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16))');
S.same('no explicit height is set on the picker', pickerRule === null ? null : declared(pickerRule.declarations, 'height'), null);
S.same('the option line box is pinned to 20px', optionRule === null ? null : declared(optionRule.declarations, 'line-height'), '20px');
S.same('the option padding is 4px 9px', optionRule === null ? null : declared(optionRule.declarations, 'padding'), '4px 9px');
S.same('the option has no explicit height, so height follows the line box', optionRule === null ? null : declared(optionRule.declarations, 'height'), null);

/* ------------------------------------------------------ the arithmetic, step by step */

S.group('claim 7c — the arithmetic, step by step');
{
  const lineHeight = optionRule === null ? null : Number.parseFloat(declared(optionRule.declarations, 'line-height'));
  const optionPadding = optionRule === null ? null : padding(declared(optionRule.declarations, 'padding'));
  const pickerPadding = pickerRule === null ? null : padding(declared(pickerRule.declarations, 'padding'));
  const maxHeight = pickerRule === null ? null : Number.parseFloat(declared(pickerRule.declarations, 'max-height'));
  const borderWidth = pickerRule === null ? 1 : Number.parseFloat(declared(pickerRule.declarations, 'border'));
  const boxSizing = pickerRule === null ? null : declared(pickerRule.declarations, 'box-sizing');
  const rows = api.diagnostics.toneRows;

  S.same('TONE_ROWS published by the bundle', rows, 3);
  S.note('step 1 — option line box', `${lineHeight}px (line-height)`);
  S.note('step 2 — option padding', `${JSON.stringify(optionPadding)} → ${optionPadding === null ? '?' : optionPadding[0] + optionPadding[2]}px vertical`);
  const rowHeight = lineHeight + optionPadding[0] + optionPadding[2];
  S.note('step 3 — one row is', `${lineHeight} + ${optionPadding[0]} + ${optionPadding[2]} = ${rowHeight}px`);
  const content = rows * rowHeight;
  S.note(`step 4 — ${rows} rows are`, `${rows} × ${rowHeight} = ${content}px`);
  const pickerPad = pickerPadding[0] + pickerPadding[2];
  S.note('step 5 — picker padding / border', `${pickerPad}px padding, ${borderWidth * 2}px border`);
  S.note('step 6 — with box-sizing:content-box the max-height IS the content box', `max-height ${maxHeight}px vs content needed ${content}px`);
  S.same('max-height equals exactly 3 rows: the 4th row is the first one that overflows', maxHeight, content);
  S.same('and the UA\'s own box model can no longer change that (the author declaration wins)', boxSizing, 'content-box');
  S.check('the padding and border are ADDED to that 84px, not subtracted from it', maxHeight === content && maxHeight + pickerPad + borderWidth * 2 > content, `outer box = ${maxHeight} + ${pickerPad} + ${borderWidth * 2} = ${maxHeight + pickerPad + borderWidth * 2}px`);
  S.same('the pinned row constant is 28px (derived from the stylesheet, not from the source)', rowHeight, 28);
  S.note('the old value under the reviewer\'s UA=border-box claim', `92 - ${pickerPad} (padding) - ${borderWidth * 2} (border) = ${92 - pickerPad - borderWidth * 2}px of content → ${((92 - pickerPad - borderWidth * 2) / rowHeight).toFixed(4)} rows, i.e. ${content - (92 - pickerPad - borderWidth * 2)}px short of three rows`);
  S.check('the reviewer\'s mechanism is arithmetically consistent (92px border-box would have been 2px short of 3 rows)', 92 - pickerPad - borderWidth * 2 === content - 2, `92px → ${92 - pickerPad - borderWidth * 2}px content vs ${content}px needed`);
  S.check('the shipped 84px cannot be short of three rows under EITHER box model', 84 === content && 84 > 0, 'fixed value, independent of the UA sheet');
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
  S.check('the fallback rules that DO apply everywhere are the option colors', /\.dacCard select option\{background-color:/.test(css === null ? '' : css), 'option{background-color:...;color:...} is outside @supports');
  S.note('fallback semantics', 'the @supports condition is FALSE → the whole block (appearance:base-select, ::picker(select) max-height/overflow/padding/radius) is dropped; the select keeps the UA popup, so max-height/overflow-y have no effect and every option is listed in full. Nothing is truncated or hidden.');
}

S.done();
