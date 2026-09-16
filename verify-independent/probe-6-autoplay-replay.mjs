/**
 * Independent probe 6 — the autoplay-policy path, end to end (task t5 addendum).
 *
 * Question the captain asked to document honestly: when the browser blocks the
 * chime because no user gesture has happened yet, is that chime DROPPED or is it
 * scheduled and then heard on the first successful unlock?
 *
 * The mechanism, measured here: `chime()` builds and starts the audio graph with
 * the context's (frozen) clock BEFORE it looks at `context.state`, and the unlock
 * path only calls `resume()` — it never rebuilds the graph. So the blocked chime
 * is already scheduled, and the first successful `resume()` lets it play. The
 * final audibility is browser behaviour and stays a user-confirmed item.
 *
 * Run: node dsh-approval-chime/verify-independent/probe-6-autoplay-replay.mjs
 */

import { approval, loadBundle, makeCtx, settle, suite, watchRejections } from './kit/platform.mjs';

const report = suite('probe-6-autoplay-replay.mjs');
const rejections = watchRejections();

const bundle = loadBundle({ audio: { state: 'suspended', resumeKeepsSuspended: true } });
const harness = makeCtx();
bundle.contract.apply(harness.ctx);
const diagnostics = bundle.diagnostics();
const record = bundle.audio.record;

report.group('1. a chime under a locked AudioContext is scheduled, not dropped');

harness.api.publish([['session-1', approval('approval:1')]]);
const context = record.contexts[0];
report.check('an AudioContext exists', context !== undefined, `state=${context?.state}`);
report.same('exactly one master gain is wired even while locked', record.masterGains().length, 1);
report.check('the oscillators were STARTED while locked', record.starts.length >= 1, JSON.stringify(record.starts.map((entry) => entry.at)));
report.check(
  'they start at the frozen context clock (the sound sits on the timeline, waiting)',
  record.starts.length >= 1 && record.starts[0].at === context.currentTime && record.starts.every((entry) => entry.at >= context.currentTime),
  `currentTime=${context.currentTime}, starts=${JSON.stringify(record.starts.map((entry) => entry.at))}`,
);
report.same('the blocked chime is counted as a policy block', diagnostics.stats().suppressedPolicy, 1);
// Measured behaviour: a policy-blocked chime still increments the trigger counter
// (the graph WAS built and scheduled); `suppressedPolicy` is the separate "you may
// not have heard it" marker the card renders as 被浏览器自动播放策略拦下.
report.same('the trigger counter counts the scheduled chime', diagnostics.stats().triggers, 1);
report.same('its last-trigger stamp records the tone that was scheduled', diagnostics.stats().lastTone, 'chime');
report.same('the audio state is reported as suspended', diagnostics.audio().state, 'suspended');
report.same('the unlock flag stays false', diagnostics.audio().unlocked, false);

report.group('2. the gesture unlock only resumes; it does not rebuild the graph');

const oscillatorsBeforeUnlock = record.oscillators.length;
// Model the browser granting the resume on the user's first gesture.
context.resume = function resume() {
  context.state = 'running';
  return Promise.resolve();
};
await bundle.document.fire('pointerdown');
await settle();

report.same('the context is running after the gesture', diagnostics.audio().state, 'running');
report.same('the unlock flag is now true', diagnostics.audio().unlocked, true);
report.same('no new oscillator was created by the unlock itself', record.oscillators.length, oscillatorsBeforeUnlock);
report.check(
  'the previously scheduled notes are still on the timeline (this is the delayed chime)',
  record.starts.length >= 1 && record.stops.length === record.starts.length,
  `${record.starts.length} start(s), ${record.stops.length} stop(s)`,
);
report.same('the gesture listeners were released after unlocking', bundle.document.listenerCount(), 0);

report.group('3. the next approval is a fresh, immediate chime');

const startsBefore = record.starts.length;
const triggersBefore = diagnostics.stats().triggers;
harness.api.publish([['session-1', approval('approval:2')]]);
report.same('the new approval adds exactly one trigger', diagnostics.stats().triggers, triggersBefore + 1);
report.check('a fresh oscillator was scheduled for it', record.starts.length > startsBefore, `${startsBefore} → ${record.starts.length}`);
report.same('no further policy block is counted', diagnostics.stats().suppressedPolicy, 1);
report.note('per-chime audio plan', record.oscillators.map((oscillator) => ({ hz: oscillator.frequency.value, at: oscillator.startedAt })));

await settle();
report.same('no unhandled rejection in this probe', rejections.seen.length, 0);
rejections.stop();
report.done();
