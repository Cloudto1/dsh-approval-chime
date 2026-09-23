# Independent rev-24 full regression run (r24/t1, the tilt is DELETED and the bell stops moving; the MUTE is drawn instead and every live fingerprint re-anchored; the r18/t1, r18b/t5, r18c/t7, r19/t2, r20/t1, r21/t1 and r23/t1 logs are preserved).
#
# Derived from run-r12.ps1 (which was derived from run-r11.ps1 -> run-r10.ps1 -> run-r7.ps1) and
# re-anchored by r15/t6. Same structure, same exception discipline, same UTF-8-without-BOM
# logging. Every log this script writes carries the `r24-` prefix; the r4 ... r12b archives, the
# r13-*/r13b-*/r13c-*/r13-final-*/r13w-* evidence of the r12/r13 rounds, the r15-*/r16-*/r17-*
# evidence of the r15/r16/r17/r18/r18b/r18c/r19/r20 rounds under verify-independent/_raw/ are NEVER overwritten
# (run-r12.ps1 is left exactly as it was). The r16/t1 round learned why this note exists: a
# forgotten prefix row made the first r16/t1 run overwrite the rev-15 logs; see
# _raw/r16-t1-mislabelled-r15-logs/README.md. r17/t1, r18/t1, r18b/t5, r18c/t7, r19/t2, r20/t1 AND r21/t1 moved every prefix row in the
# SAME batch as the rest of the re-anchor.
#
# t2 (the mutation-soundness audit, same round) added section 2d and the reviewer registration:
#   - probe-17's five mutants used to exit 1 whenever ANY check was red -- i.e. exactly when the
#     mutant WAS caught -- so every mutation reported a false red. The driver now answers the
#     question probe-11/18/19 answer ("caught EXACTLY as declared?"): declared set all red, no
#     undeclared red, and the evaluated bytes provably differ (sha256). The five declarations
#     were re-measured: slot 9, order 3, heading 2, picker 2, rogue 6 red checks. Section 2d runs
#     all five and each must exit 0.
#   - probe-11: the exact-red-set comparison is enforced now, and its no-op self-check prints the
#     two stylesheet sha256 instead of two equal character counts.
#   - probe-18: the rewrite helper measures the anchor's occurrence count (must be exactly 1) and
#     the driver compares the mutant source digest with the shipped one, so a dead mutation can
#     no longer be mistaken for a caught one.
#   - probe-19: an undeclared red now fails the mutant (it used to be printed only).
#   - section 6 REGISTERS the four .scratch reviewer probes: registered exit code + registered
#     red set + the reason each red is expected at rev-14. Drift fails the run.
#   These four probes still carry exactly the same assertion call sites as before the audit (see
#   _raw/r13c-assertion-inventory.txt: nothing deleted, nothing softened).
#
# t6 (the bell-appearance coverage round): t3 measured that rev-13/rev-14's session-bell
#   APPEARANCE had no independent mutation coverage at all -- four undeclared bell mutations
#   (muted state filled as well, the audible :hover rule deleted, the fill hard-coded to #2563eb,
#   the muted glyph recoloured) reddened NOTHING in probe-18's 131 assertions, and probe-11/17/19
#   read lib/client.js from disk without ever naming `.dacBell`. The new, purely additional
#   probe-20-r14-bell-appearance.mjs reads the stylesheet the bundle really injected, the console
#   surface `__DSH_APPROVAL_CHIME__.sessionIcon` and the rendered bell/caret, and declared ELEVEN
#   appearance mutants when it was written (seven rev-14 semantics + four rev-13 geometry ones);
#   the LIVE count is TWENTY-SIX after r17/t2 added the seven caret-turn mutants and r18/t2 the
#   six reduce-motion ones. They run in section 2e
#   and the shipped probe runs in the regression set (section 2). Nothing existing was edited or
#   relaxed; the runner's log prefix moved to `r13w-` so the r12/r13 logs and t5's r13-final-*
#   archive stay untouched (the prefix moved round after round: r15-, r16-, r17-, r18-, r18b-, r18c- and
#   the r19/t2 re-anchor; this r20/t1 re-anchor wrote `r20-`, and the rule is stated at the top of this
#   header).
#   Evidence for this round: _raw/r13w-*, plus the report
#   verify-independent/r13w-bell-appearance-coverage.md.
#
# WHY THE r13 RUN EXISTED (history, kept verbatim) -- rev-13 and rev-14 were both client-only
# appearance changes, and each moved the bytes the independent probes hard-code as their anchor:
#   - rev-13 "bigger session bell": the per-session bell/caret in the session header were
#     enlarged (BELL_BOX_PX 20 -> 28, bell glyph 14px -> 22px, caret 7x10 -> 11x16, hover
#     radius 6px -> 8px). Behaviour, DOM shape, requests, audio path and popover logic were
#     untouched. lib/client.js 142330 B / 777E8796... (rev-12) -> 144687 B / 7CCE3D62...
#     (rev-13); verify/client-half.test.mjs 319 -> 327 checks.
#   - rev-14 "blue session bell": the "will ring" bell is now a solid blue chip carrying the
#     SAME design token the enable switch and the volume slider already use
#     (BELL_ON_BG = var(--dsw-alias-state-business-primary,#2563eb)), white glyph on it, its
#     own :hover (same specificity as .dacBell:hover, so the generic grey hover would
#     otherwise win), and the muted state stays caption grey with a slash. lib/client.js
#     144687 B -> 147062 B / 730D1C2F7F58E19471D4B77EE43A221B4FD255BC06AD2AE3752A2C4443466BD5;
#     verify/client-half.test.mjs 327 -> 336 checks. diagnostics.revision is now
#     'rev-14 ... blue session bell'.
#   - lib/index.js (the HOST half) is UNCHANGED since rev-11 and must stay byte-identical:
#     46638 B / 03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938.
#
# WHY THIS RUN EXISTS AT rev-24 -- THE BELL DOES NOT MOVE; THE MUTE IS DRAWN. User request:
# "不要晃动，静音时把斜杠重左上拉到右下的动画", extended over four reader rounds ("关闭静音的时候斜杠从左上
# 到右下动画两个动画时长一样" / "斜杠的图层是在铃铛上面的" / "蓝色的部分也弄个逐渐变暗到消失的动画", plus the
# duration tuning recorded at the constant). rev-23's tilt is DELETED, not toned down: the glyph and the
# 28px button carry no transform and no animation in ANY state. What moves is the slash's STROKE -- drawn
# from its top-left end to its bottom-right end by animating `stroke-dashoffset` from the diagonal's own
# length (15.27) to 0 -- and the blue fill, on the SAME 240 ms clock in both directions.
#   - the console surface reports `sessionIcon.bellMuteMs` (240) and `sessionIcon.bellSlashLen` (15.27);
#     the attribute that arms the animation is `data-draw`, the glyph key is unchanged ("glyph<N>"), and
#     the arming rule is still "not before the first click", so the first paint is silent.
#   - THE RESTING AUDIBLE STATE DRAWS NOTHING, and it does so with `opacity` rather than a dash offset.
#     That is not a preference: a single-value `stroke-dasharray` repeats every 2*LEN, so LEN parks a
#     round cap on the far end (the DOT the user reported) and LEN+margin drags the next repetition in at
#     the near end (the STUB LINE they reported next). Both were shipped, and both were seen.
#   - PAINT ORDER IS THE PATHS ARRAY. SVG has no z-index, so the slash is pushed BEFORE the bell and its
#     clapper; the user had reported the stroke sitting ON TOP of the bell.
#   - NO reduced-motion override was added for the draw either, and `prefers-reduced-motion` still appears
#     ZERO times in the stylesheet -- measured by probe-20, not assumed.
#   - THE DURATION IS A READER TUNING, NOT A MEASUREMENT: 240 -> 420 -> 420+the fill -> 300 -> (360 for
#     one round, set from a misread typo) -> 240. The whole history sits next to the constant, including
#     the 360 that was never really on trial. WHETHER 240 READS RIGHT IS NOT SOMETHING THIS RUN CAN
#     PROVE -- only the user, looking at the page, can. probe-13 (the browser probe) still cannot run
#     here, so the FRAMES stay unobserved by anything in this repo.
# WHY THE r22 ROUND EXISTED (history, kept verbatim) -- the BELL RINGS when it is toggled. User request: "这个铃铛也要有动画"
# (the bell beside the caret must animate too, the way the arrow already does). The glyph swings about
# its TOP edge in a damped ring; the @keyframes text is generated from ONE declared frame table, so the
# stylesheet and the console surface cannot disagree about the peak angle; the animation is armed only
# after the first click (`data-ring="true"`), so the first paint is silent; and the node that moves is
# the <svg> glyph, never the 28px button that carries the hover pill. Geometry, paint, the audio path
# and the host half are UNTOUCHED.
#   - BELL_RING_MS is 420 and BELL_RING_DEG is 14, both on the console surface as
#     `sessionIcon.bellRingMs` / `sessionIcon.bellRingDeg`. The ring is deliberately LONGER than the
#     caret's 160 ms and is a separate knob: the caret reports one discrete state with a quarter turn,
#     the bell imitates a decaying oscillation, and neither number is derived from the other.
#   - NO reduced-motion override is added for the ring either. That is r20/t1's standing decision for
#     the caret (one rule, every environment) applied to the new motion, not a new policy: this
#     micro-interaction still does not distinguish environments, and the trade-off is recorded next to
#     the constant rather than dressed up. `prefers-reduced-motion` still appears ZERO times in the
#     stylesheet, which probe-20 measures rather than assumes.
#   - WHETHER THE RING IS WHAT THE USER WANTED -- and whether it reads as a ring rather than a twitch on
#     their hardware -- IS NOT SOMETHING THIS RUN CAN PROVE. Only the user, looking at the page, can.
#     This run pins the duration, the peak angle, the generated keyframes, the pivot, the untouched
#     button and the arming hook; nothing about perception. probe-13 (the browser probe) still cannot run
#     here -- there is no browser engine in this environment -- so the FRAMES stay unobserved by anything
#     in this repo.
# WHY THE r21 ROUND EXISTED (history, kept verbatim) -- the SECTION BADGE prints the version ID ALONE. User request:
# "这里只显示版本号就行了" (the badge used to render the whole stamp, e.g.
# 'rev-20 · the caret turn takes 160 ms'). The badge now renders `snapshot.bundleRevisionId`, which
# is DERIVED from `REVISION` when the bundle is built, so the id and the descriptive half cannot
# drift apart; the descriptive half stays on the console surface (`diagnostics.revision`), where
# there is room for it, and `diagnostics.revisionId` is the badge's text. Behaviour, stylesheet,
# geometry, the audio path and the host half are UNTOUCHED -- this is a rendering change and it is
# the whole change.
#   - the round also found that the tree had already moved under the r20 evidence: commit b0ad1eb
#     ("rev-12..rev-20 refinements, DSH terminology, user-facing README", 2026-09-20 00:38) landed
#     AFTER the r20 canonical run (23:06) and rewrote 556 strings across 25 files, two of them in
#     the strings this bundle shows. The product bytes therefore went 158549 B / 4B6C8B91... (the
#     bytes every r20 fingerprint pinned) to 158546 B / 5DE1F30C... BEFORE this round started, so
#     section 0 of this script was RED on the committed tree until this re-anchor. The deltas below
#     name that hop explicitly instead of presenting the r20 numbers as current.
#   - WHETHER AN ID-ONLY BADGE IS WHAT THE USER WANTED IS NOT SOMETHING THIS RUN CAN PROVE. Only
#     the user, looking at the page, can. This run pins the badge's text, the absence of the prose
#     half on the page and the console surface that keeps both -- nothing about taste.
# WHY THE r20 ROUND EXISTED (history, kept verbatim) -- the caret turn is 160 ms again and BOTH
# reduced-motion media blocks are deleted. This is a reversal, and the finding that forced it is the point of the round:
# the caret's own override removed the transition ENTIRELY on the reporting user's device (their
# system asks for reduced motion), so rev-18's 300 ms and rev-19's 400 ms were never played there
# at all -- the duration was never the cause. User request: "动画效果打开有效果，不过我要的是开不开都是
# 能有动画的，把动画时长改回 160ms。" We answer the half of that a constant can answer and refuse to
# claim the other half (the rev-18 and rev-19 reasoning recorded below is those rounds' own record,
# see the "PREVIOUS ROUND" pointer further down):
#   - CARET_ROTATE_MS 160 (400 in rev-19, 300 in rev-18, 160 in rev-17; the round trip is over and this
#     is the value the user asked for). The CSS transition duration is STILL built from that constant
#     (`.dacCaret svg{transition:transform <CARET_ROTATE_MS>ms ease}`), so the stylesheet and the
#     console surface move together and no number is transcribed by hand;
#   - the TOP-LEVEL diagnostic `__DSH_APPROVAL_CHIME__.reduceMotion()` answers LIVE whether THIS page
#     is under `(prefers-reduced-motion: reduce)`. It added that answer because an arrow that jumps
#     had two causes that look identical on a device: "too fast to see" and "this environment asks
#     for no motion" -- and the reporting device turned out to be the second one, which is why the
#     override it used to describe is DELETED. Since rev-20 nothing in the bundle branches on the
#     answer: it is an environment report, kept because "which environment is this tab in?" is the
#     first question to ask when a device report will not reproduce.
#   - WHETHER THE TURN IS NOW VISIBLE IS NOT SOMETHING THIS RUN CAN PROVE. Only the user, on the
#     device, can. This run pins the duration constant, the CSS/diagnostic agreement and the
#     three branches of the diagnostic -- nothing about perception.
#   - r18b/t5 moved NO behaviour: the stamp and one comment were repaired so the product states
#     only what is testable, and every live fingerprint was re-anchored.
#   - r18c/t7 repaired ONE ASSERTION NAME that asserted device visibility, and re-anchored
#     `verify/client-half.test.mjs` again. Its logs carry the r18c prefix; the r18/t1 and r18b/t5
#     canonical logs, archives and mutation tables stay on disk untouched as the records a quality
#     gate already reviewed.
#   - r19/t2 moved the caret duration constant to 400 ms and re-anchored every live
#     fingerprint that pinned it. Its logs carry the r19 prefix; the r18/t1, r18b/t5 and r18c/t7
#     canonical logs, archives and mutation tables stay on disk untouched as the records a quality
#     gate already reviewed.
#   - r20/t1 (this sub-round) puts the constant back to 160 ms, DELETES both reduced-motion
#     media blocks (so no environment is singled out any more) and re-anchors every live fingerprint:
#     byte counts, sha256 values, the build-stamp literals, the caret's absolute duration pin, the
#     `caret-turn-ms-250` mutant anchor, the renamed `caret-turn-reduced-motion-restored` mutant --
#     whose red set is the new no-override check -- the two rewritten sections of client-half and
#     this script's log prefix. Its logs are `r20-`; the r18/t1, r18b/t5, r18c/t7 and r19/t2
#     canonical logs, archives and mutation tables stay on disk untouched as the records a quality
#     gate already reviewed.
#   - lib/client.js 154457 B / B4A0A1B3... -> 156937 B / 1C8DB24C... (r18/t1) -> 157296 B / 7FE150A0... (r18b/t5, stamp + one comment repaired) ->
#     157296 B / 1C75C8B5... (r19/t1: SIX equal-length in-line substitutions) ->
#     158549 B / 4B6C8B91... (r20/t1: the caret duration back to 160 ms, the switch's and the
#     caret's reduced-motion media blocks DELETED, and the notes that read them rewritten, so the
#     byte count GREW that time); diagnostics.revision BECAME 'rev-20 · the caret turn takes 160 ms' ->
#     158546 B / 5DE1F30C... (commit b0ad1eb, the user's own terminology pass, which landed AFTER the
#     r20 canonical run -- see the WHY block above) ->
#     159172 B / AE391909... (r21/t1: the badge prints the version id alone; diagnostics.revision
#     is now 'rev-21 · the section badge prints the version id alone' and diagnostics.revisionId is
#     the badge's text) ->
#     166986 B / 04376143... (r22/t1: the bell rings when it is toggled -- the ring
#     constants, the generated @keyframes, the arming hook and the re-keyed glyph) ->
#     168920 B / DA25EB01... (r23/t1: that rattle is replaced by ONE lean past rest and a
#     settle -- a 9 deg peak, a scale track and a long-tail ease-out) ->
#     179451 B / 0BDAC98C... (r24/t1: the tilt is deleted outright and the bell stops moving;
#     the MUTE is drawn instead -- the slash's stroke travels the diagonal while the blue fill dims on
#     the same 240 ms clock, and the stroke is pushed BEFORE the bell so the silhouette paints over it;
#     diagnostics.revision is now 'rev-24 · muting draws the slash instead of moving the bell').
#   - verify/client-half.test.mjs 95803 B / 97EEB2D0... -> 100983 B / AB6F7E48... -> 101496 B /
#     B24E22E8... -> 101901 B /
#     6DBDF454... -> 103459 B / C156BBB2... (r20/t1: the stamp, the duration pin
#     400 -> 160 and the assertion names that read them; the reduce-motion section is REWRITTEN --
#     the two "the caret has its own override" checks are replaced by three that assert the opposite
#     (no reduced-motion block is emitted, the product carries none at all, the caret keeps its ONE
#     transition in every environment). The assertion count was 400 then (399 before it) ->
#     103457 B / 5D117404... (commit b0ad1eb, same terminology pass) ->
#     104904 B / 5FAA8FEF... (r21/t1: the badge/id assertions and the version literal --
#     FOUR new checks; the assertion count is 404 now (400 before it)) ->
#     111255 B / 75218CE8... (r22/t1: SEVENTEEN ring checks -- the reported
#     constants, the generated keyframes and their decay, the crown pivot, the untouched button, the
#     silent first paint and the click that arms it; the assertion count was 421 then) ->
#     112635 B / 9BA8B577... (r23/t1: the section is rewritten for the tilt -- twenty
#     checks, two of which measure the SHAPE the user asked for: the ONE zero crossing and the bound on
#     the swell, plus a refusal of `ease-in-out` by name; the assertion count was 424 then) ->
#     121975 B / 1BCC6FAF... (r24/t1: the section is rewritten AGAIN -- twenty-two checks about the
#     draw, the sweep, the blue fill, the paint order and the ABSENCE of every tilt rule, because "the
#     bell does not move" is what a later edit breaks by re-adding a keyframe nobody asked for; the
#     assertion count is 442 now).
#   - verify/custom-audio.test.mjs 20263 B / 523572EA... -> 20263 B / 6EF2F162... -> 20263 B /
#     B2C82501... -> 20263 B / D4B610DF... -- ONE byte each time (the version
#     literal at :267; the assertion count is unchanged at 75 checks) ->
#     20263 B / 49B0493E... (r21/t1: the same literal; the count is still 75) ->
#     20263 B / 11DAF28B... (r22/t1: the same literal; the count is still 75) ->
#     20263 B / 2D712A6D... (r23/t1: the same literal; the count is still 75) ->
#     20263 B / D2DE24C1... (r24/t1: the same literal; the count is still 75).
#   - probe-20-r14-bell-appearance.mjs is 58/58 checks (was 49) with 26 declared mutants (was 20).
#     r22/t1 added group 7 (ten ring checks), r23/t1 rewrote it for the tilt (twelve checks) and r24/t1
#     rewrote it AGAIN as a four-state CASCADE SIMULATION (twenty checks: the winner among competing
#     rules in each of audible/muted x clicked/not-yet-clicked, the opacity that leaves no dot, the
#     paint order of the rendered glyph, and the absence of every tilt rule); NO mutant was added or
#     renamed by any round, and --mutate=all re-measures that claim: all twenty-six declared red sets
#     are unchanged.
#   - lib/index.js (the HOST half), verify/host-half.test.mjs, verify/waterfall.test.mjs,
#     verify/_harness.mjs, package.json and cordis.patch.yml are UNCHANGED.
# THE PREVIOUS ROUND IS RECORDED ELSEWHERE: the rev-19 narrative that used to sit here (the 300 ms
# -> 400 ms reasoning, its byte counts, its sha256 values and its stamp) now lives where a
# previous round's record belongs -- CHANGELOG.md (the rev-19 section), the r19/t2 round's own
# console log and mutation table under _raw/, and its baselines archived under _raw/r18-t1-archive/,
# _raw/r18b-t5-archive/, the r18c/t7 archive and the r19/t2 archive. The even older rev-18 and rev-17
# narratives that used to sit here are pointed at the same way -- CHANGELOG.md (their sections),
# the r18/t2 and r17/t2 console logs and tables, and their archives under _raw/. This file POINTS at
# those records instead of duplicating them, so the only revision fingerprints left here are the
# current round's and the rev-15 narrative that was already history before r16/t1 ran (see docs
# §14.4 for the disclosed edit).
# THE rev-15 NARRATIVE BELOW IS HISTORY: rev-15 was the first BEHAVIOURAL change since rev-11, and the
# first change to lib/client.js since rev-14's appearance work: a convergence re-read that FAILS
# now keeps the last known per-session table (fail-safe: quieter, never louder) instead of
# degrading to "no overrides", with the reason on the popover's existing error line.
#   - lib/client.js 147062 B / 730D1C2F... -> 149196 B / 32F0E31F...; diagnostics.revision BECAME
#     'rev-15 ... a failed re-read keeps the mutes' (the stamp that superseded it belongs to the
#     r16/t1 round and is quoted in that round's record, not in this file).
#   - verify/client-half.test.mjs 77626 B / D24FA991... -> 88005 B / BB2C1A34... (the new 5j group:
#     35 assertions, 11 of which are red on the verbatim rev-14 bytes).
#   - verify/custom-audio.test.mjs 20263 B / A0071E2E... -> 20263 B / D13A8D63... -- ONE byte
#     (the version literal at :267; the assertion count is unchanged at 83 call sites).
#   - lib/index.js (the HOST half) is STILL the rev-11 bytes
#     46638 B / 03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938, and
#     verify/host-half.test.mjs, verify/waterfall.test.mjs, verify/_harness.mjs, package.json and
#     cordis.patch.yml are untouched.
#   - the new independent FAILURE-PATH probe t2 wrote -- r15t2-independent-probe.mjs, 41641 B /
#     B36E0B4B7AD175F5AD502BEC015E78D079BA0F92FF32D4954A60FC5E395AAF51 -- joins the regression
#     set (shipped 42/42, section 2) and its --mutant mode runs in section 2f (exactly ten declared
#     red checks, exit 0).
#   - the ten rev-1 ... rev-3 legacy probes are GREEN since r15/t3 (10/10, 0 red) and are RETIRED
#     from the exception table in this round: section 5 now treats a non-zero exit as a FAILURE.
# WHAT THE r13 ROUND CHANGED (t1; verification-only -- lib/**, verify/** and the docs were NOT
# touched by that task, only verify-independent/ was):
#   - probe-17-r7-section.mjs: the three stale fingerprint literals re-anchored to rev-14 --
#     client byte count 142330 -> 147062, sha256 777E8796... -> 730D1C2F..., and the two
#     rev-12 stamp literals -> rev-14. Those are the ONLY edits: no assertion subject, no
#     expected value, no assertion count moved (94 assertions before and after). 91/94 -> 94/94.
#   - probe-18-r10-sessions.mjs: EXPECTED_REVISION, one line only. 130/1 -> 131/0.
#   - probe-19-r12-select-parity.mjs: the FROZEN block's client bytes/sha256/revision only.
#     63/66 -> 66/66. The host half of that block still pins the rev-11 bytes, on purpose.
#   - probe-11-r4-css-rows.mjs needed nothing: 32/32, exit 0.
#   "Only literals moved" is not a claim here, it is measured: _raw/r13-reverse-substitution.txt
#   (script _raw/r13-reverse-substitution-check.mjs) reverses the exact substitutions on the
#   CURRENT bytes and shows the result hashes back to the pre-edit sha256 of each file,
#   byte-for-byte, with the changed lines listed one by one.
#
# WHAT THIS RUN IS EXPECTED TO REPORT AS RED, AND WHY THAT IS NOT A REGRESSION:
#   - probe-13-r4-browser.mjs (as since rev-4): no browser engine in this sandbox.
#     THE ONLY probe allowed to exit non-zero in this round. Every other member of the
#     regression set must exit 0: the other 14 probes (including the new r15t2 failure-path
#     probe), probe-11's / probe-17's / probe-19's / probe-20's mutation modes, probe-18's
#     --mutate=all, both probe-18 race measurements, the r15t2 --mutant mode, and the four
#     author suites (124 / 442 / 22 / 75 = 663 checks). The ten rev-1 ... rev-3 legacy probes
#     are green since r15/t3 and are no longer tolerated non-zero.
#
# THE FROZEN MANIFEST (section 0) is a hard-coded 9-file table -- lib/client.js, lib/index.js,
# verify/_harness.mjs, verify/client-half.test.mjs, verify/custom-audio.test.mjs,
# verify/host-half.test.mjs, verify/waterfall.test.mjs, package.json, cordis.patch.yml -- with
# each file's expected byte count and sha256. It replaces run-r12's runtime "enumerate
# everything under lib/ and verify/" scan: a moved byte is now NAMED against a recorded
# baseline instead of only appearing as a before/after delta. Section 0b additionally fails
# the run if an UNRECORDED file appears under lib/ or verify/.
# README.md and CHANGELOG.md are deliberately NOT in the frozen set this round: this is a
# verification-only round and the docs are out of its scope, so a document edit must not be
# able to fail the run. Their hashes are still printed (section 0c and section 7) as an
# informational drift note.
#
# ENVIRONMENT NOTE / run-r12 lesson: run 1 of r12 once ended with "FROZEN PATHS CHANGED"
# because lib/client.js was being rewritten by another task WHILE the run executed (archived
# as r12-run1-CONCURRENT-WRITE-*). The baseline-before/baseline-after pair below is what makes
# such a window visible: any non-"identical" frozen diff means the run is tainted and must be
# repeated on a quiet worktree. Section 0 was already checked before section 1 starts, so a
# manifest mismatch is reported even when the run is otherwise green.
#
#   powershell -ExecutionPolicy Bypass -File verify-independent/run-r13.ps1
#
# Shell: this host has Windows PowerShell 5.1 only (no `pwsh`). The older archives are
# UTF-16LE because 5.1's `>` redirection encodes that way; every log is written as
# UTF-8 WITHOUT a BOM instead, so it reads back with any tool. The native output is
# decoded through [Console]::OutputEncoding, which is set to UTF-8 below -- without that,
# Node's UTF-8 bytes are decoded as the OEM code page and the Chinese strings in the logs
# come out as mojibake. This script is ASCII-only on purpose (run-r11 contained U+2026
# ellipses, which 5.1 mis-decodes when it reads a BOM-less file as ANSI).
#
# The pre-rev-4 probes (everything run-r4/r5/r6/r7 did NOT run) are re-run for the record
# and classified: each non-zero one is quoted with the assertion that failed and must be on
# the declared exception list below, or the run fails. They pin facts that rev-4 ... rev-14
# deliberately changed (the `settings.plugin.item` card became a `settings.section` page in
# rev-7, DEFAULTS gained `custom` in rev-4, the 415 extension rules changed in rev-5, ...),
# and several count EVERY request, which rev-10's one boot-time read of
# `/api/approval-chime/sessions` shifts by one.

$ErrorActionPreference = 'Continue'

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
try { [Console]::OutputEncoding = $utf8NoBom } catch { Write-Host "console encoding left alone: $_" }
try { $OutputEncoding = $utf8NoBom } catch { }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$plugin = Split-Path -Parent $here
$workspace = Split-Path -Parent $plugin
$raw = Join-Path $here '_raw'
New-Item -ItemType Directory -Force -Path $raw | Out-Null

# Run one native command and archive its merged stdout/stderr as UTF-8 (no BOM).
function Invoke-Logged {
  param([scriptblock]$Body, [string]$LogPath)
  $text = & $Body 2>&1 | Out-String
  [System.IO.File]::WriteAllText($LogPath, $text, $utf8NoBom)
  return $LASTEXITCODE
}
function Write-Utf8 {
  param([string]$Path, [string[]]$Lines)
  [System.IO.File]::WriteAllText($Path, (($Lines -join [Environment]::NewLine) + [Environment]::NewLine), $utf8NoBom)
}
function Get-FailedAssertions {
  param([string]$LogPath)
  return @(Select-String -Path $LogPath -Pattern '^    FAILED: ' -Encoding UTF8 | ForEach-Object { $_.Line.Substring('    FAILED: '.Length).Trim() })
}

# THE FROZEN MANIFEST -- 9 files, re-anchored to the rev-24 baseline. Re-anchoring this table
# is the ONLY edit a future revision should need here (plus the two anchors in section 0c).
$frozenManifest = @(
  @{ path = 'lib\client.js';               bytes = 179451; sha = '0BDAC98C5F9AB06F687A9856238EA7C7302A5E7F6CDEDD9CBBA6CDEBCEA49958' },
  @{ path = 'lib\index.js';                bytes = 46638;  sha = '03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938' },
  @{ path = 'verify\_harness.mjs';         bytes = 24855;  sha = 'DD1D6E8123D81A3E4FD27155C3850ACA444734E0A4652ACD052E9240A4286BB0' },
  @{ path = 'verify\client-half.test.mjs'; bytes = 121975;  sha = '1BCC6FAF5C40E64D9023E7EF19B97A548EA422CB9ADD4C943068400706916895' },
  @{ path = 'verify\custom-audio.test.mjs'; bytes = 20263; sha = 'D2DE24C11CA2699738E975476C9659976FC44C201C9F0174567BCE1551F4CD8C' },
  @{ path = 'verify\host-half.test.mjs';   bytes = 29685;  sha = '8AF6315DB2B48A6F089E7DEF96B6C281921209ED0E69799CCFAFD1BC04A3146B' },
  @{ path = 'verify\waterfall.test.mjs';   bytes = 8888;   sha = '010811A5D233C70B058198056BC73B1A9DE1B17560E8A76626F0FE6D4BD6EFC9' },
  @{ path = 'package.json';                bytes = 732;    sha = 'D78E27106F6876C75A218DDDF0A9F71D3B7C7183FA8579D2941AE2E9D29F1A52' },
  @{ path = 'cordis.patch.yml';            bytes = 809;    sha = '505A61D6FD1F63A4FB2CE208AE3FC481FFF862D7A212D9530E5D3502683BD3C0' }
)
$docPaths = @('README.md', 'CHANGELOG.md')

# The probes run-r4/r5/r6/r7 shipped, plus the rev-10 sessions probe and the rev-12 parity probe.
$probes = @(
  'probe-7-r4-roster.mjs',
  'probe-8-r4-playback.mjs',
  'probe-9-r4-concurrency.mjs',
  'probe-10-r4-volume.mjs',
  'probe-11-r4-css-rows.mjs',
  'probe-12-r4-injection.mjs',
  'probe-13-r4-browser.mjs',
  'probe-14-r5-http-413.mjs',
  'probe-15-r5-names-files.mjs',
  'probe-16-r5-cap-race.mjs',
  'probe-17-r7-section.mjs',
  'probe-18-r10-sessions.mjs',
  'probe-19-r12-select-parity.mjs',
  'probe-20-r14-bell-appearance.mjs',
  # r15/t6: t2's independent failure-path probe (shipped mode here; --mutant mode in section 2f).
  'r15t2-independent-probe.mjs'
)
# Probes from rev-1 ... rev-3, kept for the record.
$legacyProbes = @(
  'probe-1-approval.mjs',
  'probe-2-gain-and-resources.mjs',
  'probe-3-card-and-scope.mjs',
  'probe-4-host-half.mjs',
  'probe-5-contract.mjs',
  'probe-6-autoplay-replay.mjs',
  'probe-7-host-audio-http.mjs',
  'probe-8-client-roster-render.mjs',
  'probe-9-client-playback.mjs',
  'probe-10-startup-resilience.mjs'
)
# Non-zero exits this run does not treat as a regression, with the reason.
# The ONLY entry, and the only probe that may exit non-zero in this round:
$expectedNonZero = @{
  'probe-13-r4-browser.mjs' = 'no browser engine in this sandbox (pre-existing, recorded since rev-4)'
}
# For a tolerated non-zero probe, the EXACT set of red assertions. Drift fails the run.
# Empty in r13 on purpose: probe-11/17/18/19 are all GREEN, and this round adds no new
# tolerated non-zero probe.
$expectedFailingAssertions = @{}
# The rev-1 ... rev-3 legacy probes: HISTORY ONLY, no longer an exception table.
# Through rev-14 ten of these exited non-zero and this run tolerated it. r15/t3 re-baselined all
# ten against the rev-15 bytes (10/10 exit 0, 0 red, 820 checks; the baseline is archived in
# _raw/r15-t3-before-*.txt and was re-run independently by the captain). A tolerated known-red set
# is exactly how a real regression hides, so since r15/t6 a non-zero exit from ANY legacy probe
# fails this run (section 5). The text below is kept because it is the record of what each probe
# measured when it was written -- not a licence to be red.
$legacyHistory = @{
  'probe-1-approval.mjs'             = 'was non-zero through rev-14: rev-1/rev-2 era probe (see the quoted failing assertion)'
  'probe-2-gain-and-resources.mjs'    = 'was non-zero through rev-14: asserted "lib/client.js contains no fetch(" -- true before rev-4; rev-4 added the audio fetch and rev-10 the sessions read'
  'probe-3-card-and-scope.mjs'        = 'was non-zero through rev-14: pinned the rev-6 settings.plugin.item card; rev-7 moved it to settings.section'
  'probe-4-host-half.mjs'             = 'was non-zero through rev-14: pinned DEFAULTS without `custom` and the pre-rev-4 import list'
  'probe-5-contract.mjs'              = 'was non-zero through rev-14: pinned the settings.plugin.item registration'
  'probe-6-autoplay-replay.mjs'       = 'was non-zero through rev-14: rev-1/rev-2 era probe (see the quoted failing assertion)'
  'probe-7-host-audio-http.mjs'       = 'was non-zero through rev-14: pinned the pre-rev-5 upload-name / 415 rules'
  'probe-8-client-roster-render.mjs'  = 'was non-zero through rev-14: pinned the pre-rev-4 picker CSS, the uppercase-uuid roster and the unbounded name'
  'probe-9-client-playback.mjs'       = 'was non-zero through rev-14: counted every request; rev-10 adds one boot read of the sessions table'
  'probe-10-startup-resilience.mjs'   = 'was non-zero through rev-14: counted registered routes; rev-10 registers one more (the sessions prefix)'
}
$reviewerProbes = @(
  @{ name = 'reqcheck-rev5.mjs'; path = Join-Path $workspace '.scratch\reviewer-r5\reqcheck-rev5.mjs'; expectedExit = 1; marker = 'reqcheck-rev5.mjs:260';
     why = 'rev-5 render harness: it captures the settings entry with "the LAST slots.register wins", which held while the plugin had exactly ONE registration. rev-7 moved the entry to settings.section and rev-10 added a second registration (the session-header bell), so the shim now captures the bell; the bell renders nothing without a sessionId prop, and the probe throws TypeError at reqcheck-rev5.mjs:260 (row.props.className) BEFORE any assertion runs. Re-baselining it would rewrite what the rev-5 round measured; the live facts are re-derived from rev-14 bytes by probe-17 (slot counts, page controls) and probe-18.' }
  @{ name = 'reqcheck-host-413.mjs'; path = Join-Path $workspace '.scratch\reviewer-r5\reqcheck-host-413.mjs'; expectedExit = 0; marker = '### reviewer host-413 probe: 9 passed / 0 failed';
     why = 'STILL GREEN at rev-14: the rev-5 415 / extension-name rules it checks have not moved.' }
  @{ name = 'reqcheck.mjs'; path = Join-Path $workspace '.scratch\reviewer-r5\reqcheck.mjs'; expectedExit = 1; marker = 'reqcheck.mjs:251';
     why = 'same rev-5 render harness as reqcheck-rev5.mjs (a duplicate snapshot taken at the time): one registration per rev-5, two since rev-10, so it captures the bell and dies at reqcheck.mjs:251 before any assertion runs.' }
  @{ name = 'probe-r7-reqcheck.mjs'; path = Join-Path $workspace '.scratch\reviewer-r7\probe-r7-reqcheck.mjs'; expectedExit = 1; marker = '8 failed';
     why = 'the rev-7 review probe. EIGHT of its assertions pin a superseded product, each on purpose: the rev-7 stamp literal (line 82); "the bundle revision stamp is on the page" (line 477 -- the badge text, and since rev-21 the badge prints the version ID alone, so the page carries diagnostics.revisionId and no longer carries diagnostics.revision); "exactly one slots.inject / one register" (lines 398/400/414 -- rev-10 added the session-header bell, so there are two); the over-broad "the old plugin title string must not occur in client.js" substring check (line 452 -- rev-10 introduced an aria-label that legitimately contains those words); the pre-rev-12 co-location regex that wants box-sizing:content-box and max-height:84px in ONE rule (line 497 -- rev-12 split that rule; probe-11 re-derives the resolved values by cascade); and the intro-line text (commit b0ad1eb renamed the DSH process in the user-visible copy, so the rev-7 wording is gone). Rewriting those expectations would erase the rev-7 record; the live facts are covered by probe-17 (slot counts, page controls, the badge) and probe-11.' }
)
# probe-r7-reqcheck's registered red set, verbatim -- drift fails this run.
$reviewerRedSet = @{
  'probe-r7-reqcheck.mjs' = @(
    'the rev-7 stamp names the new revision',
    'exactly one slots.inject happened',
    'exactly one registration landed',
    'client.js has exactly one slots.inject / one slots.register call site',
    'no competing page-level title remains',
    # rev-21: the badge renders the ID alone, so the page no longer carries the full stamp.
    'the bundle revision stamp is on the page',
    # commit b0ad1eb renamed the DSH process in the user-visible copy; the rev-7 wording is gone.
    'the intro line is present',
    '::picker(select) keeps content-box + max-height:84px'
  )
}

# The red set of probe-r7-reqcheck is a FUNCTION OF TWO FILES. Its group E asserts that CHANGELOG.md
# anchors the LIVE lib/client.js byte count and sha256, and CHANGELOG.md is re-anchored by this round's
# documentation task. While CHANGELOG still carries the PREVIOUS revision's anchors those two checks
# are red as well (ten red for the probe); once CHANGELOG is re-anchored they turn green and the
# recorded eight-red set is exact again. BOTH states are checked as an EXACT set -- the two names are
# required to be RED in one state and GREEN in the other, nothing is tolerated and nothing is
# softened. The state is measured from CHANGELOG.md itself and printed in section 6.
$clientHashForChangelog = (Get-FileHash (Join-Path $plugin 'lib\client.js') -Algorithm SHA256).Hash
$changelogText = ''
try { $changelogText = Get-Content (Join-Path $plugin 'CHANGELOG.md') -Raw -Encoding UTF8 } catch { }
$changelogAnchorsClientHash = $changelogText.ToUpper().Contains($clientHashForChangelog.ToUpper())
$reviewerRedSetExtra = @{
  'probe-r7-reqcheck.mjs' = @{
    requires = 'CHANGELOG.md does NOT yet anchor the live lib/client.js sha256'
    names = @(
      'lib/client.js byte count is anchored in CHANGELOG.md',
      'lib/client.js sha256 is anchored in CHANGELOG.md'
    )
  }
}

$failed = @()
$rows = @()

$audioDir = Join-Path $plugin 'audio'
function Get-AudioListing {
  if (-not (Test-Path $audioDir)) { return @() }
  return @(Get-ChildItem $audioDir -Force -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
}

# The frozen manifest turned into the canonical "hash  bytes  relpath" rows.
function Get-FrozenListing {
  return @($frozenManifest | Sort-Object { $_.path } | ForEach-Object {
    $full = Join-Path $plugin $_.path
    if (-not (Test-Path $full)) { return ("{0} {1,10}  {2}" -f ('-' * 64), 0, $_.path) }
    $digest = (Get-FileHash $full -Algorithm SHA256).Hash
    return ("{0}  {1,10}  {2}" -f $digest, (Get-Item $full).Length, $_.path)
  })
}
# README/CHANGELOG, printed for the record only -- they cannot fail this run.
function Get-DocListing {
  return @($docPaths | ForEach-Object {
    $full = Join-Path $plugin $_
    if (-not (Test-Path $full)) { return ("{0} {1,10}  {2}" -f ('-' * 64), 0, $_) }
    return ("{0}  {1,10}  {2}" -f (Get-FileHash $full -Algorithm SHA256).Hash, (Get-Item $full).Length, $_)
  })
}

Write-Host '=== 0. frozen manifest: 9 recorded files byte-identical to the rev-24 baseline ==='
foreach ($row in $frozenManifest) {
  $full = Join-Path $plugin $row.path
  if (-not (Test-Path $full)) {
    Write-Host ("    {0,-30} MISSING" -f $row.path) -ForegroundColor Red
    $failed += "frozen/$($row.path) (missing)"
    continue
  }
  $item = Get-Item $full
  $hash = (Get-FileHash $full -Algorithm SHA256).Hash
  $ok = ($item.Length -eq $row.bytes) -and ($hash -eq $row.sha)
  Write-Host ("    {0,-30} {1,8} B  {2}  {3}" -f $row.path, $item.Length, $hash.Substring(0, 16), $(if ($ok) { 'OK' } else { 'MISMATCH' }))
  if (-not $ok) {
    Write-Host ("        expected {0} B / {1}" -f $row.bytes, $row.sha) -ForegroundColor Red
    $failed += "frozen/$($row.path)"
  }
}
$before = Get-FrozenListing
$beforePath = Join-Path $raw 'r24-baseline-before.txt'
Write-Utf8 -Path $beforePath -Lines $before
Write-Host ("{0} frozen files recorded -> {1}" -f $before.Count, $beforePath)

Write-Host ''
Write-Host '=== 0b. no UNRECORDED file under lib/ or verify/ ==='
$recorded = @($frozenManifest | Where-Object { $_.path -like 'lib\*' -or $_.path -like 'verify\*' } | ForEach-Object { $_.path })
$onDisk = @()
foreach ($group in @('lib', 'verify')) {
  $dir = Join-Path $plugin $group
  if (Test-Path $dir) {
    $onDisk += @(Get-ChildItem $dir -Recurse -File | ForEach-Object { $_.FullName.Substring($plugin.Length + 1) })
  }
}
$unrecorded = @($onDisk | Where-Object { $recorded -notcontains $_ })
Write-Host ("    {0} file(s) under lib/ + verify/, {1} of them recorded in the manifest" -f $onDisk.Count, $recorded.Count)
if ($unrecorded.Count -eq 0) {
  Write-Host '    no unrecorded file: a new product/test file would have to be added to the manifest first'
} else {
  Write-Host ("    UNRECORDED: {0}" -f ($unrecorded -join ', ')) -ForegroundColor Red
  $failed += 'unrecorded file under lib/ or verify/'
}

Write-Host ''
Write-Host '=== 0c. the revision anchors this run asserts against, and the doc drift note ==='
Write-Host 'rev-24 changed lib/client.js and verify/: lib/index.js must still be the rev-11 bytes.'
foreach ($row in @(
    @{ path = (Join-Path $plugin 'lib\client.js'); bytes = 179451; sha = '0BDAC98C5F9AB06F687A9856238EA7C7302A5E7F6CDEDD9CBBA6CDEBCEA49958' },
    @{ path = (Join-Path $plugin 'lib\index.js'); bytes = 46638;  sha = '03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938' })) {
  $item = Get-Item $row.path
  $hash = (Get-FileHash $row.path -Algorithm SHA256).Hash
  $ok = ($item.Length -eq $row.bytes) -and ($hash -eq $row.sha)
  Write-Host ("{0,-16} {1,8} B  {2}  {3}" -f $item.Name, $item.Length, $hash.Substring(0, 16), $(if ($ok) { 'OK' } else { 'MISMATCH' }))
  if (-not $ok) {
    Write-Host ("    expected {0} B / {1}" -f $row.bytes, $row.sha) -ForegroundColor Red
    $failed += "anchor $($item.Name)"
  }
}
$docBefore = Get-DocListing
foreach ($row in $docBefore) { Write-Host ("    note doc: {0}" -f $row) }
Write-Host '    (README.md / CHANGELOG.md are out of scope for this verification-only round: informational only)'

Write-Host ''
Write-Host '=== preflight: audio/ is SHARED MUTABLE STATE between suites and probes ==='
Write-Host 'verify/custom-audio.test.mjs asserts that directory is EMPTY at the end, so any file left'
Write-Host 'by another tool makes that suite report short for a reason outside the plugin itself.'
$preflight = Get-AudioListing
Write-Host ("audio/ before the run: {0} file(s) {1}" -f $preflight.Count, ($preflight -join ', '))
if ($preflight.Count -ne 0) {
  Write-Host 'WARNING: the directory is not empty; custom-audio will likely fail its hygiene check.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '=== 1. implementer harness suites (read-only re-run) ==='
foreach ($suite in @('host-half', 'client-half', 'waterfall', 'custom-audio')) {
  $test = Join-Path $plugin "verify\$suite.test.mjs"
  $log = Join-Path $raw "r24-dev-$suite.txt"
  $code = Invoke-Logged -Body { & node $test } -LogPath $log
  $summary = (Select-String -Path $log -Pattern '^=== ' -Encoding UTF8 | Select-Object -Last 1).Line
  Write-Host ("{0,-16} exit={1} :: {2}" -f $suite, $code, $summary)
  $rows += [pscustomobject]@{ kind = 'harness'; name = $suite; exit = $code; summary = $summary }
  if ($code -ne 0) { $failed += "dev/$suite (exit $code)" }
}
$afterDev = Get-AudioListing
Write-Host ("audio/ after the suites: {0} file(s) {1}" -f $afterDev.Count, ($afterDev -join ', '))

Write-Host ''
Write-Host '=== 2. independent probes (the set run-r4 ... run-r7 shipped, plus probe-18 and probe-19) ==='
Push-Location $here
foreach ($probe in $probes) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($probe)
  $log = Join-Path $raw "r24-ind-$name.txt"
  $code = Invoke-Logged -Body { & node $probe } -LogPath $log
  $summary = (Select-String -Path $log -Pattern '^### ' -Encoding UTF8 | Select-Object -Last 1).Line
  # r15/t6: the r15t2 failure-path probe does not print a '### ' banner (it prints
  # '=== shipped rev-24 run: 42/42 checks passed ==='), so fall back to the last non-empty line
  # rather than reporting an empty summary for a probe that passed.
  if (-not $summary) {
    $summary = (Get-Content $log -Encoding UTF8 | Where-Object { $_.Trim().Length -gt 0 } | Select-Object -Last 1)
  }
  Write-Host ("{0,-32} exit={1} :: {2}" -f $probe, $code, $summary)
  $rows += [pscustomobject]@{ kind = 'independent'; name = $name; exit = $code; summary = $summary }
  if ($code -ne 0) {
    if ($expectedNonZero.ContainsKey($probe)) {
      Write-Host ("    EXPECTED non-zero: {0}" -f $expectedNonZero[$probe]) -ForegroundColor Yellow
      if ($expectedFailingAssertions.ContainsKey($probe)) {
        $declared = $expectedFailingAssertions[$probe]
        $observed = Get-FailedAssertions -LogPath $log
        $missing = @($declared | Where-Object { $observed -notcontains $_ })
        $extra = @($observed | Where-Object { $declared -notcontains $_ })
        if ($missing.Count -eq 0 -and $extra.Count -eq 0) {
          Write-Host ("    the {0} red check(s) are EXACTLY the declared ones" -f $observed.Count)
        } else {
          Write-Host '    the red set is NOT the declared one' -ForegroundColor Red
          if ($missing.Count -gt 0) { Write-Host ("      declared but still green: {0}" -f ($missing -join ' | ')) -ForegroundColor Red }
          if ($extra.Count -gt 0) { Write-Host ("      red but undeclared: {0}" -f ($extra -join ' | ')) -ForegroundColor Red }
          $failed += "$probe (failing-assertion set drifted)"
        }
      }
    } else {
      Write-Host ("    UNEXPECTED non-zero - see {0}" -f $log) -ForegroundColor Red
      $failed += "$probe (exit $code)"
    }
  }
}
Pop-Location

Write-Host ''
Write-Host '=== 2b. probe-19 falsifiability: the rev-12 parity claim must be able to go RED ==='
Push-Location $here
$parityMutationLog = Join-Path $raw 'r24-ind-probe-19-mutations.txt'
$parityMutationCode = Invoke-Logged -Body { & node 'probe-19-r12-select-parity.mjs' '--mutate=all' } -LogPath $parityMutationLog
$paritySummary = (Select-String -Path $parityMutationLog -Pattern '^### mutation ' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() })
$parityVerdict = (Select-String -Path $parityMutationLog -Pattern '^probe-19 verdict' -Encoding UTF8 | Select-Object -Last 1).Line
Write-Host ("probe-19 --mutate=all exit={0}" -f $parityMutationCode)
foreach ($line in $paritySummary) { Write-Host ("    {0}" -f $line) }
Write-Host ("    {0}" -f $parityVerdict)
$rows += [pscustomobject]@{ kind = 'mutation'; name = 'probe-19 --mutate=all'; exit = $parityMutationCode; summary = $parityVerdict }
if ($parityMutationCode -ne 0) { $failed += "probe-19 --mutate=all (exit $parityMutationCode)" }
Pop-Location

Write-Host ''
Write-Host '=== 2c. probe-11 falsifiability: the row-arithmetic probe must go RED too ==='
Push-Location $here
$rowMutationLog = Join-Path $raw 'r24-ind-probe-11-mutations.txt'
$rowMutationCode = Invoke-Logged -Body { & node 'probe-11-r4-css-rows.mjs' '--mutate=card-cap-92px' } -LogPath $rowMutationLog
$rowRed = ((Select-String -Path $rowMutationLog -Pattern 'checks that turned red' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() }) -join '')
$rowVerdict = ((Select-String -Path $rowMutationLog -Pattern '^\[(PASS|FAIL)\] every expected check failed|^\[(PASS|FAIL)\] no undeclared check turned red|^\[(PASS|FAIL)\] the mutation really rewrote' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() }) -join ' | ')
Write-Host ("probe-11 --mutate=card-cap-92px exit={0}" -f $rowMutationCode)
Write-Host ("    {0}" -f $rowRed)
Write-Host ("    {0}" -f $rowVerdict)
$rows += [pscustomobject]@{ kind = 'mutation'; name = 'probe-11 --mutate=card-cap-92px'; exit = $rowMutationCode; summary = $rowVerdict }
if ($rowMutationCode -ne 0) { $failed += "probe-11 --mutate=card-cap-92px (exit $rowMutationCode)" }
Pop-Location

Write-Host ''
Write-Host '=== 2d. probe-17 falsifiability: all FIVE mutants must be caught exactly as declared ==='
Write-Host 'Before t2 this probe exited 1 whenever ANY check was red -- i.e. exactly when the mutant WAS'
Write-Host 'caught -- so every mutation reported a false red. The driver now answers the same question'
Write-Host 'probe-11/18/19 answer: declared set all red, NOTHING else red, and the evaluated bytes'
Write-Host 'provably differ. A caught mutant exits 0; a dead mutant or a drifted red set exits 1.'
Push-Location $here
$probe17Caught = 0
foreach ($mutation in @('slot', 'order', 'heading', 'picker', 'rogue')) {
  $log = Join-Path $raw "r24-ind-probe-17-mut-$mutation.txt"
  $code = Invoke-Logged -Body { & node 'probe-17-r7-section.mjs' "--mutate=$mutation" } -LogPath $log
  $summary = (Select-String -Path $log -Pattern '^### ' -Encoding UTF8 | Select-Object -Last 1).Line
  $verdict = ((Select-String -Path $log -Pattern 'every expected check failed under|no undeclared check turned red|the mutation really rewrote the evaluated source' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() }) -join ' | ')
  Write-Host ("{0,-10} exit={1} :: {2}" -f $mutation, $code, $summary)
  Write-Host ("    {0}" -f $verdict)
  $rows += [pscustomobject]@{ kind = 'mutation'; name = "probe-17 --mutate=$mutation"; exit = $code; summary = $summary }
  if ($code -ne 0) { $failed += "probe-17 --mutate=$mutation (exit $code)" } else { $probe17Caught += 1 }
}
Write-Host ("probe-17 mutants caught exactly as declared: {0}/5" -f $probe17Caught)
Pop-Location

Write-Host ''
Write-Host '=== 2e. probe-20 falsifiability: the SESSION-BELL + CARET APPEARANCE and the rev-18 REDUCED-MOTION DIAGNOSTIC (rev-13, rev-14, the r16/t1 gap, the r17/t1 turn, the rev-19 duration, the rev-20 deletion of both reduced-motion overrides, the rev-22 ring, the rev-23 tilt, the rev-24 draw) ==='
Write-Host 't3 measured that this appearance had NO independent mutation coverage: four undeclared bell'
Write-Host 'mutations reddened nothing in probe-18, and probe-11/17/19 never name .dacBell. probe-20'
Write-Host 'declares TWENTY-SIX appearance mutants; each must rewrite the source, redden EXACTLY its declared'
Write-Host 'checks and exit 0, and all twenty-six red sets must be pairwise different.'
Push-Location $here
$bellMutationLog = Join-Path $raw 'r24-ind-probe-20-mutations.txt'
$bellMutationCode = Invoke-Logged -Body { & node 'probe-20-r14-bell-appearance.mjs' '--mutate=all' } -LogPath $bellMutationLog
$bellMutationSummary = (Select-String -Path $bellMutationLog -Pattern '^### mutation summary: ' -Encoding UTF8 | Select-Object -Last 1).Line
$bellVerdicts = ((Select-String -Path $bellMutationLog -Pattern '^\[(PASS|FAIL)\] ' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() }) -join ' | ')
Write-Host ("probe-20 --mutate=all exit={0} :: {1}" -f $bellMutationCode, $bellMutationSummary)
Write-Host ("    {0}" -f $bellVerdicts)
$rows += [pscustomobject]@{ kind = 'mutation'; name = 'probe-20 --mutate=all'; exit = $bellMutationCode; summary = $bellMutationSummary }
if ($bellMutationCode -ne 0) { $failed += "probe-20 --mutate=all (exit $bellMutationCode)" }

$bellCaught = 0
$bellMutations = @('muted-bell-filled', 'audible-hover-dropped', 'fill-hardcoded-hex', 'muted-icon-recolored', 'audible-foreground-recoloured', 'muted-rule-declares-fill', 'bell-glyph-shrunk-to-14', 'bell-svg-hardcoded-14', 'caret-css-hardcoded-12', 'caret-svg-hardcoded-9', 'bell-css-hardcoded-20', 'bell-caret-gap-removed', 'bell-caret-gap-constant-zeroed', 'caret-turn-transition-dropped', 'caret-turn-rule-dropped', 'caret-turn-angle-45-deg', 'caret-turn-ms-250', 'caret-turn-reduced-motion-restored', 'caret-turn-moved-to-button', 'caret-turn-also-when-closed', 'reduce-motion-boolean-snapshot', 'reduce-motion-always-false', 'reduce-motion-always-true', 'reduce-motion-cached-after-first-call', 'reduce-motion-asks-the-wrong-query', 'reduce-motion-snapshotted-into-sessionIcon')
foreach ($mutation in $bellMutations) {
  $log = Join-Path $raw "r24-ind-probe-20-mut-$mutation.txt"
  $code = Invoke-Logged -Body { & node 'probe-20-r14-bell-appearance.mjs' "--mutate=$mutation" } -LogPath $log
  $anchorLine = (Select-String -Path $log -Pattern '^############ anchor occurrences' -Encoding UTF8 | Select-Object -Last 1).Line
  $digestLine = (Select-String -Path $log -Pattern '^############ mutant source sha256' -Encoding UTF8 | Select-Object -Last 1).Line
  $observedLine = (Select-String -Path $log -Pattern '^############ observed red set' -Encoding UTF8 | Select-Object -Last 1).Line
  $verdictLine = (Select-String -Path $log -Pattern '^############ (DETECTED|NOT DETECTED)' -Encoding UTF8 | Select-Object -Last 1).Line
  Write-Host ("{0,-26} exit={1} :: {2}" -f $mutation, $code, $verdictLine)
  Write-Host ("    {0}" -f $anchorLine)
  Write-Host ("    {0}" -f $digestLine)
  Write-Host ("    {0}" -f $observedLine)
  $rows += [pscustomobject]@{ kind = 'mutation'; name = "probe-20 --mutate=$mutation"; exit = $code; summary = $verdictLine }
  if ($code -ne 0) { $failed += "probe-20 --mutate=$mutation (exit $code)" } else { $bellCaught += 1 }
}
$bellDeclared = $bellMutations.Count
Write-Host ("probe-20 mutants caught exactly as declared: {0}/{1}" -f $bellCaught, $bellDeclared)
# The count is a RED condition, not a decoration: a mutant that stops being caught (or a renamed one
# that exits non-zero) must make the WHOLE run non-zero, not merely print a smaller fraction.
if ($bellCaught -ne $bellDeclared) { $failed += "probe-20 mutants caught $bellCaught of $bellDeclared" }
Pop-Location

Write-Host ''
Write-Host '=== 2f. r15t2 failure-path probe: the rev-15 OBS-A fix must be able to go RED (t2) ==='
Write-Host 'This probe is the independent half of the rev-15 fix: it drives the real bundle in a vm and'
Write-Host 'observes the real render tree, the diagnostics object and the recording WebAudio stub while a'
Write-Host 'convergence re-read FAILS. Its --mutant mode reverts sessionsReadFailed() to the rev-14 body'
Write-Host 'IN MEMORY ONLY and requires the red set to be non-empty and EXACTLY the ten declared checks.'
Push-Location $here
$r15t2MutantLog = Join-Path $raw 'r24-ind-r15t2-independent-probe-mutant.txt'
$r15t2MutantCode = Invoke-Logged -Body { & node 'r15t2-independent-probe.mjs' '--mutant' } -LogPath $r15t2MutantLog
$r15t2M1 = (Select-String -Path $r15t2MutantLog -Pattern '^M1: ' -Encoding UTF8 | Select-Object -Last 1).Line
$r15t2M2 = (Select-String -Path $r15t2MutantLog -Pattern '^M2: ' -Encoding UTF8 | Select-Object -Last 1).Line
$r15t2Summary = (Select-String -Path $r15t2MutantLog -Pattern '^=== mutant run: ' -Encoding UTF8 | Select-Object -Last 1).Line
$r15t2Anchor = (Select-String -Path $r15t2MutantLog -Pattern 'A2: the mutation anchor matches exactly one site' -Encoding UTF8 | Select-Object -Last 1).Line
Write-Host ("r15t2 --mutant exit={0} :: {1}" -f $r15t2MutantCode, $r15t2Summary)
Write-Host ("    {0}" -f $r15t2Anchor)
Write-Host ("    {0}" -f $r15t2M1)
Write-Host ("    {0}" -f $r15t2M2)
$rows += [pscustomobject]@{ kind = 'mutation'; name = 'r15t2 --mutant'; exit = $r15t2MutantCode; summary = $r15t2Summary }
if ($r15t2MutantCode -ne 0) { $failed += "r15t2-independent-probe --mutant (exit $r15t2MutantCode)" }
Pop-Location

Write-Host ''
Write-Host '=== 3. probe-18 falsifiability: every declared mutation must redden exactly its declared checks ==='
Push-Location $here
$mutationLog = Join-Path $raw 'r24-ind-probe-18-mutations.txt'
$mutationCode = Invoke-Logged -Body { & node 'probe-18-r10-sessions.mjs' '--mutate=all' } -LogPath $mutationLog
$mutationSummary = (Select-String -Path $mutationLog -Pattern '^### mutation summary' -Encoding UTF8 | Select-Object -Last 1).Line
$hashLines = ((Select-String -Path $mutationLog -Pattern '^### lib/(client|index)\.js' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() }) -join ' | ')
Write-Host ("mutations exit={0} :: {1}" -f $mutationCode, $mutationSummary)
Write-Host ("    {0}" -f $hashLines)
$rows += [pscustomobject]@{ kind = 'mutation'; name = 'probe-18 --mutate=all'; exit = $mutationCode; summary = $mutationSummary }
if ($mutationCode -ne 0) { $failed += "probe-18 --mutate=all (exit $mutationCode)" }

Write-Host ''
Write-Host '=== 4. probe-18 race measurement (fast double-click, real host over real HTTP) ==='
foreach ($mode in @(
    @{ tag = 'raw'; args = @('--race-rounds=1500', '--race-raw') },
    @{ tag = 'sidechannel'; args = @('--race-rounds=1500', '--race-sidechannel') })) {
  $raceLog = Join-Path $raw ("r24-ind-probe-18-race-" + $mode.tag + ".txt")
  $raceCode = Invoke-Logged -Body { & node 'probe-18-r10-sessions.mjs' $mode.args } -LogPath $raceLog
  $raceLine = (Select-String -Path $raceLog -Pattern 'I1 measurement' -Encoding UTF8 | Select-Object -Last 1).Line
  $residualLine = (Select-String -Path $raceLog -Pattern 'RESIDUAL \(measured, reproducible\)|FINDING \(measured, reproducible\)' -Encoding UTF8 | Select-Object -Last 1).Line
  Write-Host ("race[{0}] exit={1} :: {2}" -f $mode.tag, $raceCode, $raceLine)
  if ($residualLine) { Write-Host ("    {0}" -f $residualLine.Trim()) -ForegroundColor Yellow }
  $rows += [pscustomobject]@{ kind = 'race'; name = "probe-18 $($mode.tag)"; exit = $raceCode; summary = $raceLine }
  if ($raceCode -ne 0) { $failed += "probe-18 race[$($mode.tag)] (exit $raceCode)" }
}
Pop-Location

Write-Host ''
Write-Host '=== 5. legacy probes from rev-1 ... rev-3 (green since r15-t3, re-anchored at rev-18, again at rev-19 and again at rev-20; a non-zero exit is a FAILURE) ==='
Push-Location $here
foreach ($probe in $legacyProbes) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($probe)
  $log = Join-Path $raw "r24-legacy-$name.txt"
  $code = Invoke-Logged -Body { & node $probe } -LogPath $log
  $summary = (Select-String -Path $log -Pattern '^### ' -Encoding UTF8 | Select-Object -Last 1).Line
  $failing = ((Select-String -Path $log -Pattern '^    FAILED: ' -Encoding UTF8 | ForEach-Object { $_.Line.Trim() }) -join ' ; ')
  Write-Host ("{0,-34} exit={1} :: {2}" -f $probe, $code, $summary)
  $rows += [pscustomobject]@{ kind = 'legacy'; name = $name; exit = $code; summary = $summary }
  if ($code -ne 0) {
    Write-Host ("    REGRESSION: this probe has been green since r15-t3 and may no longer exit non-zero - see {0}" -f $log) -ForegroundColor Red
    if ($legacyHistory.ContainsKey($probe)) { Write-Host ("    history: {0}" -f $legacyHistory[$probe]) }
    if ($failing) {
      $cut = [Math]::Min(300, $failing.Length)
      Write-Host ("    failing assertion(s): {0}" -f $failing.Substring(0, $cut))
    }
    $failed += "legacy/$probe (exit $code)"
  } elseif ($legacyHistory.ContainsKey($probe)) {
    Write-Host ("    GREEN (retired from the exception table in r15/t6) -- history: {0}" -f $legacyHistory[$probe])
  }
}
Pop-Location
$afterLegacy = Get-AudioListing
Write-Host ("audio/ after the legacy probes: {0} file(s) {1}" -f $afterLegacy.Count, ($afterLegacy -join ', '))
# The legacy probe-7-host-audio-http plants .mp3 files in audio/ and does not clean
# up after itself. Restore the listing the run started with, so the next run's
# custom-audio hygiene check sees the same state.
$planted = @($afterLegacy | Where-Object { $preflight -notcontains $_ })
if ($planted.Count -gt 0) {
  foreach ($name in $planted) { Remove-Item (Join-Path $audioDir $name) -Force -ErrorAction SilentlyContinue }
  Write-Host ("    removed {0} file(s) the legacy probes planted: {1}" -f $planted.Count, ($planted -join ', '))
}
Write-Host ("audio/ restored to: {0} file(s) {1}" -f (Get-AudioListing).Count, ((Get-AudioListing) -join ', '))

Write-Host ''
Write-Host '=== 6. reviewer probes (read-only re-run; cwd = workspace root, which they resolve paths against) ==='
Push-Location $workspace
foreach ($probe in $reviewerProbes) {
  $log = Join-Path $raw ("r24-reviewer-" + $probe.name.Replace('.mjs', '') + ".txt")
  if (-not (Test-Path $probe.path)) {
    Write-Host ("{0,-24} SKIPPED (not found at {1})" -f $probe.name, $probe.path)
    continue
  }
  $code = Invoke-Logged -Body { & node $probe.path } -LogPath $log
  $summary = (Select-String -Path $log -Pattern '^### ' -Encoding UTF8 | Select-Object -Last 1).Line
  Write-Host ("{0,-24} exit={1} (registered {2}) :: {3}" -f $probe.name, $code, $probe.expectedExit, $summary)
  $rows += [pscustomobject]@{ kind = 'reviewer'; name = $probe.name; exit = $code; summary = $summary }
  # t2: REGISTERED, not tolerated. Each of these four is a recorded artifact from the rev-5 /
  # rev-7 review rounds; three of them assert facts that later revisions replaced on purpose
  # (see `why`). The registration below is a contract: the exit code and, where it has one,
  # the exact red set must still match the record -- if a reviewer probe starts behaving
  # differently, this run fails and somebody has to look, instead of a note nobody reads.
  Write-Host ("    why non-zero: {0}" -f $probe.why)
  if ($code -ne $probe.expectedExit) {
    Write-Host ("    REGISTERED EXIT CODE DRIFTED: registered {0}, observed {1}" -f $probe.expectedExit, $code) -ForegroundColor Red
    $failed += "reviewer/$($probe.name) (registered exit drifted)"
  }
  # r15/t6: probe-r7-reqcheck's marker carries its red COUNT, which legitimately has the two states
  # described at $reviewerRedSetExtra. The count is still an exact requirement -- it is compared
  # against the count implied by the measured state of CHANGELOG.md, not against one frozen literal.
  $markerExpected = $probe.marker
  if ($probe.name -eq 'probe-r7-reqcheck.mjs' -and -not $changelogAnchorsClientHash) { $markerExpected = '10 failed' }
  if ($probe.marker -and -not ((Get-Content $log -Raw -Encoding UTF8).Contains($markerExpected))) {
    Write-Host ("    REGISTERED MARKER MISSING: '{0}' is not in the log" -f $markerExpected) -ForegroundColor Red
    $failed += "reviewer/$($probe.name) (registered marker drifted)"
  }
  if ($reviewerRedSet.ContainsKey($probe.name)) {
    $observedRed = Get-FailedAssertions -LogPath $log
    $registeredRed = $reviewerRedSet[$probe.name]
    if ($reviewerRedSetExtra.ContainsKey($probe.name) -and -not $changelogAnchorsClientHash) {
      $extraSet = $reviewerRedSetExtra[$probe.name]
      Write-Host ("    CHANGELOG STATE: {0} -- {1} extra registered check(s) must be red in this run" -f $extraSet.requires, $extraSet.names.Count) -ForegroundColor Yellow
      $registeredRed = @($registeredRed + $extraSet.names)
    } elseif ($reviewerRedSetExtra.ContainsKey($probe.name)) {
      Write-Host '    CHANGELOG STATE: CHANGELOG.md already anchors the live lib/client.js sha256 -- the recorded set is exact as-is'
    }
    $missingRed = @($registeredRed | Where-Object { $observedRed -notcontains $_ })
    $extraRed = @($observedRed | Where-Object { $registeredRed -notcontains $_ })
    if ($missingRed.Count -eq 0 -and $extraRed.Count -eq 0) {
      Write-Host ("    the {0} red assertion(s) are EXACTLY the registered set" -f $observedRed.Count)
    } else {
      Write-Host '    REGISTERED RED SET DRIFTED:' -ForegroundColor Red
      if ($missingRed.Count -gt 0) { Write-Host ("      registered but now green: {0}" -f ($missingRed -join ' | ')) -ForegroundColor Red }
      if ($extraRed.Count -gt 0) { Write-Host ("      newly red, not registered: {0}" -f ($extraRed -join ' | ')) -ForegroundColor Red }
      $failed += "reviewer/$($probe.name) (registered red set drifted)"
    }
  }
}
Pop-Location

Write-Host ''
Write-Host '=== 7b. rev-24 mutation table: every declared mutation re-measured on THESE bytes ==='
Write-Host 'verify-independent/r15t6-mutation-table.mjs refuses to run unless lib/client.js is the rev-24'
Write-Host 'bytes, re-runs all 44 declared probe-11/17/18/19/20 mutations plus the r15 failure-path mutant'
Write-Host '(one run, ten declared red checks) and writes _raw/r24-evidence/r24-t1-mutation-table.json/.md. Any row that'
Write-Host 'did not rewrite the source, whose anchor is not unique, whose red set is not exactly the one it'
Write-Host 'declared, or that exited non-zero makes this section fail.'
Push-Location $plugin
$mutationTableLog = Join-Path $raw 'r24-t1-mutation-table-console.txt'
$mutationTableCode = Invoke-Logged -Body { & node 'verify-independent/r15t6-mutation-table.mjs' } -LogPath $mutationTableLog
$mutationTableLine = (Select-String -Path $mutationTableLog -Pattern '^r21 mutation table: ' -Encoding UTF8 | Select-Object -Last 1).Line
$mutationTableResult = (Select-String -Path $mutationTableLog -Pattern '^RESULT: ' -Encoding UTF8 | Select-Object -Last 1).Line
Write-Host ("mutation table exit={0} :: {1}" -f $mutationTableCode, $mutationTableLine)
Write-Host ("    {0}" -f $mutationTableResult)
$rows += [pscustomobject]@{ kind = 'mutation-table'; name = 'r15t6-mutation-table'; exit = $mutationTableCode; summary = $mutationTableLine }
if ($mutationTableCode -ne 0) { $failed += "r15t6-mutation-table (exit $mutationTableCode)" }
Pop-Location

Write-Host ''
Write-Host '=== 7. frozen-manifest diff (before vs after the run) ==='
$after = Get-FrozenListing
$afterPath = Join-Path $raw 'r24-baseline-after.txt'
Write-Utf8 -Path $afterPath -Lines $after
$diff = Compare-Object -ReferenceObject $before -DifferenceObject $after
$diffPath = Join-Path $raw 'r24-frozen-diff.txt'
if ($diff) {
  $lines = @($diff | ForEach-Object { "{0} {1}" -f $_.SideIndicator, $_.InputObject })
  Write-Utf8 -Path $diffPath -Lines $lines
  Write-Host 'FROZEN PATHS CHANGED:' -ForegroundColor Red
  $lines | ForEach-Object { Write-Host ("  {0}" -f $_) }
  $failed += 'frozen paths changed'
} else {
  Write-Utf8 -Path $diffPath -Lines @('identical')
  Write-Host ("{0} frozen files are byte-identical before/after the run" -f $after.Count)
}
$docAfter = Get-DocListing
$docDiff = Compare-Object -ReferenceObject $docBefore -DifferenceObject $docAfter
if ($docDiff) {
  Write-Host 'NOTE (informational, cannot fail this run): a document changed DURING the run:' -ForegroundColor Yellow
  $docDiff | ForEach-Object { Write-Host ("  {0} {1}" -f $_.SideIndicator, $_.InputObject) }
} else {
  Write-Host 'README.md / CHANGELOG.md unchanged before/after the run (informational, not part of the frozen manifest)'
}

# THE HARNESS TOTAL IS SUMMED HERE, NOT SPELLED OUT. This line used to print the literal rev-19 wrote
# ("124 / 399 / 22 / 75 = 620 checks") while rev-20's client-half reports 400 -- a printed CURRENT claim
# that the run itself contradicts is the exact defect class this round exists to remove. The counts come
# from the four harness rows measured above; unreadable counts are a FAILURE, not a blank.
$harnessCounts = @($rows | Where-Object { $_.kind -eq 'harness' } | ForEach-Object {
  $harnessMatch = [regex]::Match([string]$_.summary, '(\d+)/\d+ checks passed')
  if ($harnessMatch.Success) { [int]$harnessMatch.Groups[1].Value } else { 0 }
})
$harnessSum = ($harnessCounts | Measure-Object -Sum).Sum
if ($harnessCounts.Count -ne 4 -or ($harnessCounts | Where-Object { $_ -le 0 })) {
  $failed += 'the four harness suite counts could not be read from this run'
  $harnessSum = 0
}

Write-Host ''
Write-Host '=== summary ==='
$rows | Format-Table -AutoSize
if ($failed.Count -eq 0) {
  Write-Host ("every harness suite exited 0 ({0} = {1} checks); every probe of the run-r4 ... run-r12 set" -f ($harnessCounts -join ' / '), $harnessSum)
  Write-Host 'plus probe-20 (r13/t6) and the r15t2 failure-path probe exited 0 except probe-13 (declared, no'
  Write-Host 'browser engine); ALL FORTY-FOUR declared probe-11/17/18/19/20 mutants (section 2b x1, 2c x1,'
  Write-Host '2d x5, 2e x26, 3 x9 -- re-run row by row in section 7b) plus the r15t2 rev-14 regression mutant'
  Write-Host '(section 2f, exactly its ten declared red checks) rewrite the source, redden EXACTLY their'
  Write-Host 'declared checks and exit 0; the ten rev-1 ... rev-3 legacy probes are GREEN since r15/t3 and a'
  Write-Host 'non-zero exit from any of them now FAILS the run; probe-18 race measurements ran; the 9 frozen files'
  Write-Host 'are byte-identical to the rev-24 manifest before and after; the four .scratch reviewer probes still'
  Write-Host 'match their registered exit codes and red sets (three are registered non-zero, see section 6).'
} else {
  Write-Host ('FAILURES: ' + ($failed -join ', ')) -ForegroundColor Red
}
Write-Host 'checker: only probe-13-r4-browser.mjs may be non-zero in the regression set (no browser engine).'
Write-Host '         the legacy (rev-1 ... rev-3) probes are GREEN since r15/t3; history of their old non-zero exits is printed in section 5.'
exit ([int]($failed.Count -ne 0))
