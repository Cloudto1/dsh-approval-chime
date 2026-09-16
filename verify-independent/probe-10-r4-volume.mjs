/**
 * Independent adversarial probe 10 (rev-4, task t1) — volume semantics.
 *
 * Claims under attack:
 *   6. an imported tone and a built-in tone must carry EXACTLY the same master
 *      gain at the same `volume`; with `volume = 0` or `enabled = false` the
 *      imported path must create/play no node at all.
 *
 * Both entry paths are driven separately, because they do not share the same
 * gate: the approval path calls `chime()` directly, while the preview path goes
 * through `playPreview()` (which unlocks the AudioContext first). The master
 * gain is identified structurally — the one gain node wired straight into
 * `destination` — never by trusting the source text.
 */

import { boot, entry, makeFetch, suite, settle, watchRejections } from './kit/rev4.mjs';

const S = suite('probe-10 rev-4 volume / gate semantics (independent)');
const rejections = watchRejections();
const A = entry(41, 'a.wav');
const TONE_A = `custom:${A.id}`;

let counter = 0;
function nextKey() {
  counter += 1;
  return `k-${counter}`;
}

/** Boot one settings document and drive ONE chime through `preview` or `approval`. */
function drive(tone, settings, path, options = {}) {
  const fetchStub = makeFetch({ get: { bytes: { tag: 'A' } } });
  const api = boot({
    scopeValue: { enabled: settings.enabled === undefined ? true : settings.enabled, volume: settings.volume, tone, custom: [A] },
    fetch: fetchStub,
    audio: options.audio,
  });
  api.mountCard({});
  let accepted = true;
  if (path === 'preview') accepted = api.diagnostics.preview();
  else api.fakeApi.publish([['s1', { sessionId: 's1', kind: 'approval', key: nextKey() }]]);
  return { api, fetchStub, accepted, gains: () => api.recorder.masterGains().map((gain) => gain.value) };
}

/** Total nodes the card built for one attempt. */
function nodes(api) {
  return api.recorder.gains.length + api.recorder.oscillators.length + api.recorder.bufferSources.length;
}

/* ----------------------------------------------- identical master gain by volume */

S.group('claim 6a — the same volume gives the same master gain on both paths');
{
  for (const volume of [1, 25, 50, 70, 100]) {
    const builtIn = drive('chime', { volume }, 'preview');
    const custom = drive(TONE_A, { volume }, 'preview');
    await settle(8);
    const expected = (volume / 100) * 0.6;
    S.deep(`volume ${volume}: built-in master gain`, builtIn.gains(), [expected]);
    S.deep(`volume ${volume}: imported master gain`, custom.gains(), [expected]);
    S.check(`volume ${volume}: the two paths agree EXACTLY (Object.is)`, builtIn.gains()[0] === custom.gains()[0], `${builtIn.gains()[0]} vs ${custom.gains()[0]}`);
  }
  const builtIn = drive('bell', { volume: 70 }, 'preview');
  const custom = drive(TONE_A, { volume: 70 }, 'preview');
  await settle(8);
  S.same('the custom master gain is connected straight to the destination', custom.api.recorder.links.filter((link) => link.from.startsWith('gain-') && link.to === 'destination').length, 1);
  S.same('the built-in master gain is connected straight to the destination', builtIn.api.recorder.links.filter((link) => link.from.startsWith('gain-') && link.to === 'destination').length, 1);
  S.same('the custom path builds exactly ONE gain node (master only)', custom.api.recorder.gains.length, 1);
  S.same('the built-in path builds master + one envelope per note (bell: 3)', builtIn.api.recorder.gains.length, 3);
  S.same('the imported source is connected to the master gain', custom.api.recorder.links.filter((link) => link.from.startsWith('src-') && link.to === 'gain').length, 1);
  S.same('the imported play started at the context currentTime', custom.api.recorder.bufferSources[0].startedAt, 7.25);
  const approval = drive(TONE_A, { volume: 70 }, 'approval');
  await settle(10);
  S.deep('the approval path carries the same gain as the preview path', approval.gains(), [0.42]);
  S.same('the approval play is counted as a trigger', approval.api.stats().triggers, 1);
}

/* ------------------------------------------------------------------ silent gates */

S.group('claim 6b — volume = 0 creates no node on either path');
{
  const builtIn = drive('chime', { volume: 0 }, 'preview');
  const custom = drive(TONE_A, { volume: 0 }, 'preview');
  await settle(8);
  S.same('built-in preview: no node was built', nodes(builtIn.api), 0);
  S.same('built-in preview: counted as "volume 0"', builtIn.api.stats().suppressedSilent, 1);
  S.same('imported preview: no node was built', nodes(custom.api), 0);
  S.same('imported preview: NOTHING was fetched', custom.fetchStub.calls.length, 0);
  S.same('imported preview: counted as "volume 0"', custom.api.stats().suppressedSilent, 1);
  S.same('imported preview: no other suppressed counter moved', JSON.stringify([custom.api.stats().suppressedDisabled, custom.api.stats().suppressedFailed, custom.api.stats().suppressedUnsupported]), JSON.stringify([0, 0, 0]));

  // The APPROVAL path is where the documented "no AudioContext is created" holds.
  const approvalBuiltIn = drive('chime', { volume: 0 }, 'approval');
  const approvalCustom = drive(TONE_A, { volume: 0 }, 'approval');
  await settle(10);
  S.same('built-in approval at volume 0: no AudioContext at all', approvalBuiltIn.api.recorder.contexts.length, 0);
  S.same('built-in approval at volume 0: no node', nodes(approvalBuiltIn.api), 0);
  S.same('imported approval at volume 0: no AudioContext at all', approvalCustom.api.recorder.contexts.length, 0);
  S.same('imported approval at volume 0: no node', nodes(approvalCustom.api), 0);
  S.same('imported approval at volume 0: no fetch', approvalCustom.fetchStub.calls.length, 0);
  S.same('imported approval at volume 0: counted as silent', approvalCustom.api.stats().suppressedSilent, 1);
}

S.group('claim 6c — enabled = false creates no node on either path');
{
  const builtIn = drive('chime', { volume: 70, enabled: false }, 'preview');
  const custom = drive(TONE_A, { volume: 70, enabled: false }, 'preview');
  await settle(8);
  S.same('built-in preview while disabled: no context', builtIn.api.recorder.contexts.length, 0);
  S.same('built-in preview while disabled: no node', nodes(builtIn.api), 0);
  S.same('imported preview while disabled: no context', custom.api.recorder.contexts.length, 0);
  S.same('imported preview while disabled: no node', nodes(custom.api), 0);
  S.same('imported preview while disabled: no fetch', custom.fetchStub.calls.length, 0);
  S.same('imported preview while disabled: the call reports "not played"', custom.accepted, false);
  S.same('rev-5 F3: the disabled preview IS now counted as a suppression', custom.api.stats().suppressedDisabled, 1);
  S.same('and the built-in preview is counted the same way', builtIn.api.stats().suppressedDisabled, 1);

  const approvalBuiltIn = drive('chime', { volume: 70, enabled: false }, 'approval');
  const approvalCustom = drive(TONE_A, { volume: 70, enabled: false }, 'approval');
  await settle(10);
  S.same('built-in approval while disabled: no context', approvalBuiltIn.api.recorder.contexts.length, 0);
  S.same('built-in approval while disabled: counted as disabled', approvalBuiltIn.api.stats().suppressedDisabled, 1);
  S.same('imported approval while disabled: no context', approvalCustom.api.recorder.contexts.length, 0);
  S.same('imported approval while disabled: no fetch', approvalCustom.fetchStub.calls.length, 0);
  S.same('imported approval while disabled: counted as disabled', approvalCustom.api.stats().suppressedDisabled, 1);
}

S.group('adversarial — both switches off on the approval path');
{
  const both = drive(TONE_A, { volume: 0, enabled: false }, 'approval');
  await settle(10);
  S.same('the approval was seen', both.api.stats().approvalsSeen, 1);
  S.same('no context, no node, no fetch', JSON.stringify([both.api.recorder.contexts.length, nodes(both.api), both.fetchStub.calls.length]), JSON.stringify([0, 0, 0]));
  S.same('the refusal is counted once, as "disabled" (disabled wins over volume 0)', JSON.stringify([both.api.stats().suppressedDisabled, both.api.stats().suppressedSilent]), JSON.stringify([1, 0]));
}

S.group('adversarial — out-of-range and non-numeric volume is treated the same on both paths');
{
  const cases = [
    ['-25 (below range)', -25],
    ['150 (above range)', 150],
    ['70.4 (fractional)', 70.4],
    ['"70" (a string in the document)', '70'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ];
  for (const [label, volume] of cases) {
    const builtIn = drive('chime', { volume }, 'preview');
    const custom = drive(TONE_A, { volume }, 'preview');
    await settle(8);
    const a = builtIn.gains()[0];
    const b = custom.gains()[0];
    S.check(`${label}: both paths agree (${JSON.stringify(a)} vs ${JSON.stringify(b)})`, a === b, `built-in ${JSON.stringify(a)}, imported ${JSON.stringify(b)}`);
  }
  const clamped = drive(TONE_A, { volume: 150 }, 'preview');
  await settle(8);
  S.deep('150 clamps to volume 100 → gain 0.6', clamped.gains(), [0.6]);
  const fractional = drive(TONE_A, { volume: 70.4 }, 'preview');
  await settle(8);
  S.deep('70.4 rounds to 70 → gain 0.42', fractional.gains(), [0.42]);
  const negative = drive(TONE_A, { volume: -25 }, 'preview');
  await settle(8);
  S.same('-25 clamps to 0 → silent, nothing built', nodes(negative.api), 0);
  S.same('-25 → counted as "volume 0"', negative.api.stats().suppressedSilent, 1);
}

S.group('measured — the PREVIEW path at volume 0 still constructs an AudioContext (rev-5 documents this intent)');
{
  const custom = drive(TONE_A, { volume: 0 }, 'preview');
  await settle(8);
  S.same('the AudioContext WAS constructed by the preview path', custom.api.recorder.contexts.length, 1);
  S.same('but no gain / buffer source was created with it', nodes(custom.api), 0);
  S.same('and no fetch was made', custom.fetchStub.calls.length, 0);
  S.same('the refusal is counted', custom.api.stats().suppressedSilent, 1);
  S.note('rev-5 F2 wording', 'lib/client.js:618-621 scopes "no AudioContext is created" to `chime()` itself — true for the APPROVAL path (measured in group 6b). The 试听 path unlocks the context first on purpose (lib/client.js:776). Measured here: contexts=1, nodes=0, fetches=0.');
}

S.group('instrument control — no unhandled rejection');
{
  await settle(4);
  S.deep('rejections observed', rejections.seen.map((item) => String(item && item.message ? item.message : item)), []);
}

S.done();
rejections.stop();
