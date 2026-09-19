/**
 * Browser half of dsh-approval-chime.
 *
 * Loaded by the Host as a CLASSIC script (a plain `<script src>`), so this file
 * must contain no top-level `import`/`export`; everything lives inside the
 * factory closure below. `id` must equal the package name, because the module
 * graph keys rows by package name (dsh-client-modules/lib/index.js:813-835).
 *
 * WHAT IT DOES
 *   1. Watches the session pending-interaction source for a NEW approval and plays
 *      a short synthesised chime — one per session, 180 ms apart (rev-10; the batch
 *      used to be covered by a single chime).
 *   2. Registers one page of its own under the `settings.section` list slot, which
 *      is what puts 设置 → 通知提醒 in the settings navigation (private id
 *      `approval-chime`, order 16). The page carries the enable switch, the 0..100
 *      volume slider, the tone picker, the import/remove/preview controls, the
 *      reset-to-defaults action, and the visible trigger counters.
 *   3. Registers the per-session bell into the session header
 *      (`conversation.session.header.actions`, private id `approval-chime`, order
 *      30). The bell shows whether THIS session will ring (`enabled ?? global`) and
 *      mutes exactly this session; its caret opens a self-drawn popover with the
 *      session's own tone and volume. Per-session overrides are Host state — they
 *      live in the Host's own file and travel over HTTP (see below).
 *
 * PER-SESSION OVERRIDES (rev-10) — WHERE THE DATA LIVES AND WHY
 *   `$DSH_HOME|~/.dsh` / `approval-chime/sessions.json`, written by the Host half only
 *   (`POST /api/approval-chime/sessions`, read back with `GET`), bounded to 200
 *   records and evicted by `updatedAt`. NOT the settings document: that is the user's
 *   global preference file, and a session id is not a preference anyone writes by
 *   hand. NOT browser storage either: overrides must follow the Host process (and
 *   survive a restart) rather than one browser profile, and this bundle touches no
 *   web storage at all — a test asserts the words are absent from the file. An
 *   unreadable or corrupt store degrades to "no overrides" (every session follows the
 *   global settings) and is reported, never thrown — as long as nothing is known yet.
 *   A read that fails AFTER a table is known keeps that table instead of dropping the
 *   user's mutes (rev-15, see `sessionsReadFailed`).
 *   The trade-off is documented rather than hidden: the file is per-machine, so
 *   overrides do not follow the user to another machine (see README §9).
 *
 * CONVERGENCE AFTER A WRITE (rev-11) — fixes the rev-10 review's F-01
 *   Applying every POST answer to the local table is not enough: two clicks are two
 *   sockets, and the answer bodies are not guaranteed to be consumed in the order the
 *   Host applied them (measured: one round where the bell said "on" while the file
 *   said `{enabled:false}`). A `revision >` fence does not fix it — with the answers
 *   reversed, the fresh table rides the LATER answer and carries the larger revision.
 *   So when the last outstanding write of the table settles, the table is read back
 *   from the Host once (`settleSessionWrites` → `refreshSessions()`): the local copy
 *   then equals the file whatever order the answers arrived in. A refused write keeps
 *   its rollback and its error line across that read.
 *
 * FAIL-SAFE RE-READ (rev-15) — fixes OBS-A
 *   That convergence re-read used to degrade the table to "no overrides" whenever it
 *   failed, so ONE transient failure silently dropped every mute the user had set: a
 *   session silenced on purpose went back to following the global switch and rang when
 *   that switch was on. Trading a deliberate mute for a chime is the wrong direction to
 *   fail in. A failed read now keeps the last known table — `table`, `ready` and
 *   `revision` all stay exactly as they were — and only writes the reason onto the error
 *   line the popover renders; a later successful read converges as it always did. The
 *   failure direction is therefore "quieter, never louder" (`sessionsReadFailed`).
 *
 * TRIGGER: WHY `ctx.uiSession.pendingInteractions` AND NOT THE EVENT CHAIN
 * Registering on the Host's remote approval event is a dead end, and not just
 * because that API silently drops a third `{prepend:true}` argument: it forwards
 * exactly two arguments to the event registry (dsh-api-gateway/lib/client.js:1472-1474
 * → remote-events.js:32-35), so a listener can never jump the queue. The built-in
 * approval panel registers FIRST (its row is inserted ahead of ours by dsh-web-app's
 * patch) and its normal path is `return await pending.result` — it never calls
 * `next()`, which ends the chain there, so every listener registered after it is
 * simply never invoked. Joining that chain can therefore only ever produce: no
 * chime, or a chime that swallowed the user's approval prompt. This plugin registers
 * NOTHING on that event — the built-in decision path stays exactly as it was (see
 * verify/waterfall.test.mjs, which asserts this statically and at runtime, and note
 * that this file deliberately contains neither the event name nor the remote-event
 * subscription API, so a plain text check is a valid check).
 *
 * Instead we observe the source that reflects "an approval is on screen":
 * `ctx.uiSession.pendingInteractions` is a HostObservable
 * (`getSnapshot()` / `subscribe(listener) => disposer`,
 * dsh-client-ui-session/lib/client.js:80-90). Its snapshot is a
 * `ReadonlyMap<SessionId, PendingInteraction>` that is replaced wholesale; we
 * diff it by the interaction's `key` and chime once per key. The discriminator is
 * `interaction.kind === 'approval'`, which the built-in panel sets
 * (dsh-client-ui-approval/lib/client.js:140) alongside a unique `key` (`:142`).
 *
 * SETTINGS PLACEMENT (rev-7): WHY A SECTION OF ITS OWN
 *   Until rev-6 these controls lived in the Plugins tab as one plugin's
 *   "configurable plugin" card: that tab dispatches exactly the cards whose key is a
 *   namespace the Host currently serves, so the card could only ever appear once the
 *   Host half was up, and it sat under 设置 → 插件 → 插件配置 instead of the
 *   navigation. rev-7 registers a `settings.section` entry instead. `settings.section`
 *   is a root-scope LIST slot declared by the settings shell
 *   (dsh-client-ui-settings-general/lib/client.js:621-624, from its `sidebar.settings`
 *   entry at :601-661), so a plugin can add its own navigation row and its own page
 *   without touching any Host package:
 *     - the row is keyed by our PRIVATE id (`approval-chime`). Reusing a shipped id
 *       ('general'/'models'/'plugins'/'agent-presets') would REPLACE that row rather
 *       than add one, because `id` is what identifies a list-slot entry
 *       (dsh-client-ui-settings-general/lib/client.js:566-571);
 *     - `order: 16` places it right after 插件 (order 15,
 *       dsh-client-ui-settings-plugins/lib/client.js:1761-1765) and before Agent 预设
 *       (order 20, dsh-cordis-client-runner/lib/client.js:3912);
 *     - `label` is a thunk, re-read on every projection
 *       (dsh-cordis-client-runner/lib/client.js:3893-3894: "A thunk is re-read on
 *       every projection, so localized text follows the active locale without
 *       re-registering"), which is why the nav row tracks the active locale;
 *     - `locale: NS` binds `props.t` for the section component from the same
 *       dictionary, so the page heading and the nav row always read one copy.
 *   Nothing registers into the Plugins tab any more, and the Host half takes no part
 *   in this move: it still only registers the settings namespace.
 *
 * KNOWN HOST LIMITS (documented rather than worked around)
 *   - A session exposes at most ONE pending interaction, the highest-precedence
 *     one (dsh-client-ui-session/lib/client.js:213-227). When a session is
 *     waiting on a question at the same time as an approval, the approval can be
 *     shadowed and this chime stays silent.
 *   - Audio needs a user gesture: an AudioContext created before any interaction
 *     starts `suspended`. We unlock on the first gesture anywhere in the page,
 *     we also expose an explicit "preview" gesture on the section page, and every
 *     policy-blocked trigger is counted so a silent deployment is still visible.
 *
 * BROWSER-SIDE REQUIRE SIDES (docs/契约调研.md §C.5, measured from the shell
 * bundle's seed table): `react`, `react/jsx-runtime`, `react-dom`,
 * `react-dom/client`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`,
 * `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`,
 * `@deepseek-ai/dsh-client-ui-dockkit`. This bundle requires only `react`.
 * The platform's card toolkit (CardForm / numberField / ValueField / PluginCard)
 * is NOT requireable: that bundle exports only `apply`/`inject`
 * (dsh-client-ui-settings-plugins/lib/client.js:1813-1814). The section page below
 * is therefore self-drawn, and every write still goes through the platform's
 * revision-fenced settings scope (`ctx.settingsScope.bind({ namespace })` →
 * `set` / `unset`); nothing is persisted through browser storage of its own.
 */
(function () {
  if (typeof window === 'undefined' || !window.__ModuleLoader__) return;

  window.__ModuleLoader__.load({
    id: 'dsh-approval-chime',
    factory: function (require) {
      var React = require('react');

      var PLUGIN_ID = 'dsh-approval-chime';
      /** Settings namespace: what the Host half registers and this side binds. */
      var NS = 'approval-chime';
      /**
       * Which build of this bundle the PAGE actually loaded. The module graph is
       * built once per page load and the Host caches bundle bytes, so "the feature
       * is missing" and "this tab is stale" look identical from the outside; the
       * stamp is shown on the section and exposed to the console. Bump on every
       * behavioural edit.
       */
      var REVISION = 'rev-20 · the caret turn takes 160 ms';

      /** Peak amplitude of a chime at volume 100. The headless test asserts volume × this. */
      var MASTER_GAIN = 0.6;
      /** Newest approval keys remembered, so a re-published snapshot never re-chimes. */
      var DEDUP_LIMIT = 256;
      /** While dragging the volume slider, previews are throttled to this interval. */
      var PREVIEW_THROTTLE_MS = 140;

      /** Pre-describe fallback: the Host half's schema defaults, mirrored. */
      var FALLBACK = { enabled: true, volume: 70, tone: 'chime' };

      /** Imported tones are addressed as `custom:<uuid>`; built-in ids stay bare. */
      var CUSTOM_PREFIX = 'custom:';
      /**
       * Case-SENSITIVE, mirroring the Host's route and schema: an id this side accepted
       * in mixed case could be stored and rendered but never fetched (N3).
       */
      var CUSTOM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

      /** The Host half's upload route; the browser never writes a file itself. */
      var AUDIO_ROUTE = '/api/approval-chime/audio';

      /**
       * The Host half's per-session route (rev-10). The table it serves lives in the
       * plugin's own file under the harness home — this bundle owns no copy of it and
       * writes nothing anywhere else, so the same overrides follow the Host process
       * (not this browser profile).
       */
      var SESSIONS_ROUTE = '/api/approval-chime/sessions';

      /** The session-header slot the bell registers into (see docs/契约调研.md §L.1). */
      var SESSION_SLOT = 'conversation.session.header.actions';

      /** Our own cell key there — never a shipped one (`agent-preset`/`job-list`/…). */
      var SESSION_ACTION_ID = 'approval-chime';

      /**
       * Position among the header actions. The shipped occupants sit at -10
       * (`agent-preset`), 10 (`schedule-catalog`) and 20 (`job-list`), so 30 is
       * free: the bell lands at the right end of the action cluster, next to the
       * right-aligned utilities, and shadows nobody.
       */
      var SESSION_ACTION_ORDER = 30;

      /**
       * Gap between two chimes of one batch. Approvals from different sessions must
       * each be heard, and two sounds 180 ms apart are unmistakably two; played
       * together they would be one louder sound instead.
       */
      var BATCH_GAP_MS = 180;

      /**
       * The bell's geometry (user request rev-13: "把图标改大点，这个太小了").
       *
       * The first cut was a 20px button with a 14px icon. The drawn bell only fills
       * ~68% of its viewBox (y 1.7 → 12.5 of 16), so that read as a ~9.5px glyph — too
       * small to be seen as a control. Measured neighbours, for scale: a shipped header
       * chip is ~28px tall (`dsh-client-ui-jobs` `.trigger{min-height:28px;
       * border-radius:6px;padding:3px 2px}`), and the chat action row draws 15px icons
       * (`dsh-client-ui-chat` `.action svg{width:calc(15px + …)}`). The box now matches
       * the chip height and the glyph is 22px ⇒ ~15px drawn, i.e. about half again the
       * old size and in the same visual weight class as the row it lives in.
       *
       * Both numbers live here because three places must agree: the CSS box, the SVG
       * attributes and the console surface the headless test reads. Same reason as
       * TONE_ROW_PX — one value, no hand-copied second copy.
       */
      var BELL_BOX_PX = 28;
      var CARET_BOX_PX = 16;
      var BELL_GLYPH_PX = 22;
      var CARET_GLYPH_W = 11;
      var CARET_GLYPH_H = 16;

      /**
       * The caret's turn (user request rev-17: the arrow beside the bell must turn down
       * while the per-session popover is open).
       *
       * The chevron is DRAWN pointing right — `caretIcon()` paints `M1 1.5 6 6l-5 4.5` into
       * an 11×16 box — so the state "this popover is open" is said by a quarter turn
       * clockwise. 90° is the only angle that takes an east-pointing chevron to south, and
       * it is the angle the user asked for; it is not a taste value.
       *
       * The turn is applied to the <svg> GLYPH, never to `.dacCaret` itself. The button is
       * CARET_BOX_PX × BELL_BOX_PX = 16×28 so that it lines up with the bell beside it, and
       * a 90° turn of THAT box would swap it to 28×16: the hover pill would flip from a
       * tall chip to a wide bar under the pointer, which reads as a layout bug. The 11×16
       * glyph turned about its own middle instead becomes a 16×11 footprint, still inside
       * the untouched button box.
       *
       * 160 ms, restored by rev-20 after a 160 → 300 → 400 → 160 round trip that was chasing the
       * wrong cause. The device report ("要有过渡动画能看到在转动的箭头") moved this constant to
       * 300 ms in rev-18 and to 400 ms in rev-19; what actually removed the turn on that device was
       * a `prefers-reduced-motion: reduce` media block in this same stylesheet, which deleted the
       * caret's transition outright for a reader whose system asks for reduced motion — that
       * user's system does, so no duration could ever have shown up there. rev-20 deletes the
       * block, and the caret now turns for the same 160 ms with the preference on and off. User
       * request: "动画效果打开有效果，不过我要的是开不开都是能有动画的，把动画时长改回 160ms。"
       *
       * That flip is a DELIBERATE TRADE-OFF and it is written down as one rather than dressed up as
       * an accessibility best practice: this micro-interaction no longer distinguishes
       * environments. A reader who asked the platform for reduced motion gets the same quarter
       * turn as everyone else. It is defensible only because the user who owns this plugin asked
       * for exactly that ("开不开都是能有动画的") and because the thing that moves is an 11×16
       * glyph — it is NOT a policy recommendation, and nothing in this file should be quoted as
       * one. If this plugin ever has to honour the preference again, the honest shape is a SHORT
       * turn that is still played — this 160 ms constant is the knob — and never a deleted
       * transition.
       *
       * 160 ms is ~10 frames at 60 Hz where rev-19's 400 ms was ~24, and the popover still has no
       * entrance animation of its own: that is a COUNT, not a measurement of perception. The rest
       * is a JUDGMENT only the user can settle on their own hardware: the expectation is that the
       * arrow is still turning as the eye starts to move and has settled by the time the eye
       * reaches the panel's first row, so 160 ms reads as a turn rather than as lag. If a device
       * still shows a jump, this number is the one to
       * move, and no sentence in this file should be read as "the turn is visible now".
       *
       * Both numbers live here because two places must agree — the stylesheet and the
       * console surface the headless test reads — for the same reason as the boxes above:
       * one value, no hand-copied second copy.
       */
      var CARET_OPEN_ROTATE_DEG = 90;
      var CARET_ROTATE_MS = 160;

      /**
       * The gap between the bell and its caret (user request rev-16: "这个铃铛和箭头分开点").
       *
       * Both boxes are 28px tall and sit flush in an `inline-flex` wrapper, and the chevron
       * only fills 11px of its own 16px box — so the blue square and the drawn arrow were
       * 2.5px apart and read as ONE control instead of two. Measured neighbour for scale:
       * the host draws 8px between the header's action chips (`dsh-client-ui-conversation`'s
       * `.headerActions{...;gap:8px}`). 6px here, plus the chevron's own 2.5px inset, puts the
       * ink-to-ink distance at ~8.5px — the rhythm the header already uses, so the pair still
       * reads as one cluster while each half reads as its own button.
       *
       * A constant, not a literal in the CSS string, for the same reason as the boxes above:
       * the stylesheet and the console surface must not be able to disagree about it.
       */
      var BELL_GAP_PX = 6;

      /**
       * The paint of the AUDIBLE bell (rev-14, user: "改成图片中的蓝色" — the blue of the
       * enabled toggle). `BELL_ON_BG` is the very string the enable switch's track and the
       * volume slider's `accent-color` already use, so the header control and the settings
       * page cannot drift apart by a hex digit; the console surface reports it and the
       * headless test compares the three rules against each other.
       * The muted state deliberately keeps the transparent button and the caption-grey
       * glyph: blue means "this session will ring".
       */
      var BELL_ON_BG = 'var(--dsw-alias-state-business-primary,#2563eb)';
      var BELL_ON_FG = '#fff';
      /** Hover of the filled bell: the same blue, darkened — one value, derived. */
      var BELL_ON_BG_HOVER = 'color-mix(in srgb,' + BELL_ON_BG + ' 86%,#000)';

      /** Mirrors the Host half's cap; the client never grows its copy past it either. */
      var MAX_SESSIONS = 200;

      /** Mirrors the Host half's session-id bound (the route refuses longer ids). */
      var SESSION_ID_LIMIT = 200;

      /** The three fields a session record may override, in the order the UI writes them. */
      var SESSION_FIELDS = ['enabled', 'volume', 'tone'];

      /** Mirrors the Host half's cap so an oversized file is refused before it is sent. */
      var MAX_AUDIO_BYTES = 5 * 1024 * 1024;

      /** Longest roster the card will render; the Host caps uploads, this caps the list. */
      var CUSTOM_LIMIT = 50;

      /** Display-name bound, mirroring the Host half's `NAME_LIMIT`. */
      var NAME_LIMIT = 120;

      /**
       * MIME → extension, used only when a picked file has no usable extension.
       * Without it the fallback name carried no extension at all, so the Host could
       * only ever answer 415 for a file the browser itself had typed (F6).
       */
      var MIME_EXTENSIONS = {
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/wav': 'wav',
        'audio/wave': 'wav',
        'audio/x-wav': 'wav',
        'audio/ogg': 'ogg',
        'audio/opus': 'opus',
        'audio/mp4': 'm4a',
        'audio/aac': 'aac',
        'audio/flac': 'flac',
        'audio/x-flac': 'flac',
        'audio/webm': 'webm',
      };

      /** Rows the tone menu shows before it scrolls (the popup is a CSS box — see styles). */
      var TONE_ROWS = 3;
      var TONE_ROW_PX = 28;
      /**
       * The session popover's tone menu also offers 跟随全局, so it lists one row more
       * than the card's before it scrolls.
       */
      var SESSION_TONE_ROWS = TONE_ROWS + 1;
      /**
       * The type size of both tone lists, and the few pixels of slack the popover's
       * list gets on top of its rows. The card and the session popover read these from
       * here and nowhere else, so "the two lists look the same" (user request rev-12) is
       * one number rather than two that agree by hand.
       *
       * Why slack at all: `max-height` CLAMPS (it never pads a short list), so a little
       * room costs nothing — but the card's own list is visibly scrollable at exactly
       * three rows, i.e. the browser's picker chrome takes a few pixels the row
       * arithmetic does not see. 8px keeps the popover's four default rows whole while
       * still being far below a fifth row (140px), so the cap stays "four rows, then
       * scroll". This is the one number in this change that a real browser has to
       * confirm; it can only ever cost a hairline scrollbar, never a hidden row.
       */
      var TONE_PICKER_TEXT_PX = 13;
      var TONE_PICKER_SLACK_PX = 8;

      /* ------------------------------------------------------------------ tones */

      /**
       * Each tone is a short sequence of notes rendered with WebAudio primitives.
       * No audio file is loaded or referenced: the chime exists only as these
       * numbers, so the plugin stays a single self-contained asset.
       */
      var TONE_SPECS = {
        chime: {
          wave: 'sine',
          notes: [
            { freq: 880, at: 0, dur: 0.16, level: 1 },
            { freq: 1318.5, at: 0.085, dur: 0.26, level: 0.9 },
          ],
        },
        bell: {
          wave: 'triangle',
          notes: [
            { freq: 659.25, at: 0, dur: 0.7, level: 0.9 },
            { freq: 1318.5, at: 0, dur: 0.5, level: 0.45 },
          ],
        },
        beep: {
          wave: 'square',
          notes: [
            { freq: 440, at: 0, dur: 0.12, level: 0.7 },
            { freq: 440, at: 0.18, dur: 0.12, level: 0.7 },
          ],
        },
      };
      var TONE_IDS = ['chime', 'bell', 'beep'];

      /* --------------------------------------------------------------- utilities */

      function describeError(error) {
        if (error === null || error === undefined) return 'unknown error';
        if (typeof error === 'string') return error;
        var message = error.message;
        return typeof message === 'string' && message.length > 0 ? message : String(error);
      }

      function warn(message) {
        try {
          if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn(PLUGIN_ID + ': ' + message);
        } catch (error) {
          /* no console: stay silent */
        }
      }

      function shallowCopy(source) {
        var copy = {};
        for (var key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) copy[key] = source[key];
        }
        return copy;
      }

      function shallowEqual(left, right) {
        if (left === right) return true;
        var keys = Object.keys(left);
        if (keys.length !== Object.keys(right).length) return false;
        for (var index = 0; index < keys.length; index += 1) {
          if (left[keys[index]] !== right[keys[index]]) return false;
        }
        return true;
      }

      /**
       * The smallest snapshot store the slot contract needs: `getSnapshot()` plus
       * `subscribe(listener) => disposer`, with replacement snapshots published only
       * on a real change. Hand-rolled instead of `require('@deepseek-ai/dsh-client-store')`
       * so this bundle needs exactly one seed module.
       */
      function createStore(initial) {
        var snapshot = initial;
        var listeners = [];
        return {
          getSnapshot: function () {
            return snapshot;
          },
          subscribe: function (listener) {
            listeners.push(listener);
            return function () {
              var index = listeners.indexOf(listener);
              if (index >= 0) listeners.splice(index, 1);
            };
          },
          update: function (mutate) {
            var next = shallowCopy(snapshot);
            if (mutate(next) === false) return snapshot;
            if (shallowEqual(next, snapshot)) return snapshot;
            snapshot = next;
            for (var index = 0; index < listeners.length; index += 1) {
              try {
                listeners[index]();
              } catch (error) {
                warn('snapshot subscriber failed: ' + describeError(error));
              }
            }
            return snapshot;
          },
        };
      }

      function clampVolume(value) {
        var number = typeof value === 'number' ? value : Number(value);
        if (!isFinite(number)) return FALLBACK.volume;
        if (number < 0) return 0;
        if (number > 100) return 100;
        return Math.round(number);
      }

      /**
       * A stored tone is either a built-in id or `custom:<uuid>`. The parse is strict
       * on purpose: this value indexes both the option list and the upload route, so
       * anything else falls back to the default instead of being fetched.
       */
      function normalizeTone(value) {
        if (typeof value !== 'string') return FALLBACK.tone;
        if (TONE_IDS.indexOf(value) >= 0) return value;
        if (value.slice(0, CUSTOM_PREFIX.length) === CUSTOM_PREFIX && CUSTOM_ID.test(value.slice(CUSTOM_PREFIX.length))) return value;
        return FALLBACK.tone;
      }

      /** True when a tone names an imported file rather than a synthesized one. */
      function isCustomTone(value) {
        return typeof value === 'string' && value.slice(0, CUSTOM_PREFIX.length) === CUSTOM_PREFIX;
      }

      function formatClock(at) {
        try {
          return new Date(at).toLocaleTimeString();
        } catch (error) {
          return String(at);
        }
      }

      /* ------------------------------------------------------------ runtime state */

      /**
       * Everything the section page and the diagnostics surface read. Filled by
       * `apply`, because binding a settings scope and the platform translator both
       * need the plugin context. `translate` is the platform's translator bound to
       * NS (dsh-client-locale/lib/client.js:1283-1304): the nav-label thunk has no
       * props to read `t` from, so it goes through this one.
       */
      var runtime = { scope: null, store: null, translate: null };

      var counters = {
        /** Chimes played for an approval (they passed the enabled/volume gate). */
        triggers: 0,
        previews: 0,
        approvalsSeen: 0,
        lastAt: 0,
        lastTone: '',
        lastVolume: null,
        lastGain: null,
        /** Chimes the settings said no to. */
        suppressedDisabled: 0,
        suppressedSilent: 0,
        /** Approvals skipped because THIS session is muted (rev-10). */
        suppressedSession: 0,
        /** Chimes the browser refused to make audible (no WebAudio, broken context). */
        suppressedUnsupported: 0,
        suppressedFailed: 0,
        /** Chimes rendered while the AudioContext was still suspended (autoplay policy). */
        suppressedPolicy: 0,
        lastPreviewAt: 0,
        /** New approvals in the last batch, and how many of them were audible. */
        lastBatchSize: 0,
        lastBatchPlayed: 0,
      };

      /**
       * The per-session override table, as the Host last answered it.
       *
       * `table` is a null-prototype map keyed by session id: a session id is user
       * data, and `__proto__` is a legal JSON key that a plain `{}` would take as a
       * prototype assignment. `ready` distinguishes "the Host answered an empty
       * table" from "nothing was read yet" — the UI may only claim a session follows
       * the global settings once it knows the table, so an unread table still
       * behaves as "no overrides" (every session follows the global settings).
       */
      var sessions = {
        table: Object.create(null),
        ready: false,
        revision: null,
        error: '',
        /** Timer for the delayed chimes of one batch; cancelled when the watch stops. */
        timers: [],
      };

      /**
       * How many session writes are still in flight (rev-11).
       *
       * One counter for the whole table on purpose: the failure this guards against is
       * "the last answer that lands is not the last write that reached the file", and
       * that can also happen across two sessions of one table. When this reaches zero,
       * the table is re-read once from the Host — see `settleSessionWrites`.
       */
      var sessionWrites = { outstanding: 0 };

      var audio = {
        context: null,
        /** idle | running | suspended | unsupported | error */
        state: 'idle',
        unlocked: false,
        lastError: '',
        gestureBound: false,
        releaseGesture: null,
      };

      /* ------------------------------------------------------------- audio engine */

      function audioConstructor() {
        if (typeof window === 'undefined') return null;
        if (typeof window.AudioContext === 'function') return window.AudioContext;
        if (typeof window.webkitAudioContext === 'function') return window.webkitAudioContext;
        return null;
      }

      /** Best-effort resume; never throws and never returns a rejected promise. */
      function resumeContext(context) {
        try {
          if (context.state !== 'suspended' || typeof context.resume !== 'function') {
            audio.state = typeof context.state === 'string' ? context.state : 'running';
            audio.unlocked = audio.state === 'running';
            return;
          }
          var pending = context.resume();
          if (pending !== null && pending !== undefined && typeof pending.then === 'function') {
            pending.then(
              function () {
                audio.state = typeof context.state === 'string' ? context.state : 'running';
                audio.unlocked = audio.state === 'running';
                if (audio.unlocked && typeof audio.releaseGesture === 'function') audio.releaseGesture();
                publish();
              },
              function (error) {
                audio.lastError = describeError(error);
                publish();
              },
            );
          }
        } catch (error) {
          audio.lastError = describeError(error);
        }
      }

      function ensureAudio() {
        if (audio.context !== null) return audio.context;
        var Ctor = audioConstructor();
        if (Ctor === null) {
          audio.state = 'unsupported';
          return null;
        }
        try {
          var context = new Ctor();
          audio.context = context;
          audio.state = typeof context.state === 'string' ? context.state : 'running';
          audio.unlocked = audio.state === 'running';
          if (audio.state === 'suspended') resumeContext(context);
          return context;
        } catch (error) {
          audio.context = null;
          audio.state = 'error';
          audio.lastError = describeError(error);
          return null;
        }
      }

      /**
       * Unlock the AudioContext from a user gesture. Browsers keep a context
       * created without one `suspended`, so this is the only way an approval that
       * arrives later can be audible.
       *
       * @returns whether the context is running right now.
       */
      function attemptUnlock(reason) {
        var context = ensureAudio();
        if (context === null) {
          if (typeof audio.releaseGesture === 'function') audio.releaseGesture();
          return false;
        }
        resumeContext(context);
        audio.state = typeof context.state === 'string' ? context.state : audio.state;
        audio.unlocked = audio.state === 'running';
        if (audio.unlocked && typeof audio.releaseGesture === 'function') audio.releaseGesture();
        publish();
        return audio.unlocked;
      }

      var GESTURE_EVENTS = ['pointerdown', 'mousedown', 'keydown', 'touchstart'];

      /** Listen for the first gesture anywhere in the page, then get out of the way. */
      function bindGestureUnlock() {
        if (audio.gestureBound) return;
        if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
        audio.gestureBound = true;
        var handler = function () {
          attemptUnlock('gesture');
        };
        for (var index = 0; index < GESTURE_EVENTS.length; index += 1) {
          try {
            document.addEventListener(GESTURE_EVENTS[index], handler, true);
          } catch (error) {
            warn('could not listen for "' + GESTURE_EVENTS[index] + '": ' + describeError(error));
          }
        }
        audio.releaseGesture = function () {
          if (!audio.gestureBound) return;
          audio.gestureBound = false;
          for (var index = 0; index < GESTURE_EVENTS.length; index += 1) {
            try {
              document.removeEventListener(GESTURE_EVENTS[index], handler, true);
            } catch (error) {
              /* nothing left to do about a listener we could not remove */
            }
          }
        };
      }

      /**
       * Render one tone: ONE master gain per chime (fixed at `volume × MASTER_GAIN`,
       * connected straight to the destination) and one enveloped oscillator per
       * note, so the amplitude the settings ask for is exactly what the graph
       * carries.
       *
       * @returns whether any audio node was created.
       */
      function renderTone(context, toneId, scale) {
        var spec = TONE_SPECS[toneId] !== undefined ? TONE_SPECS[toneId] : TONE_SPECS[FALLBACK.tone];
        var master = context.createGain();
        master.gain.value = scale;
        master.connect(context.destination);
        var start = typeof context.currentTime === 'number' ? context.currentTime : 0;
        for (var index = 0; index < spec.notes.length; index += 1) {
          var note = spec.notes[index];
          var at = start + note.at;
          var envelope = context.createGain();
          envelope.gain.setValueAtTime(note.level, at);
          envelope.gain.exponentialRampToValueAtTime(0.001, at + note.dur);
          envelope.connect(master);
          var oscillator = context.createOscillator();
          oscillator.type = spec.wave;
          oscillator.frequency.value = note.freq;
          oscillator.connect(envelope);
          oscillator.start(at);
          oscillator.stop(at + note.dur + 0.03);
        }
        return true;
      }

      /* ---------------------------------------------------------- imported samples */

      /**
       * Decoded imported files, keyed by upload id. Decoding is not free and an
       * approval can fire repeatedly, so each file is fetched and decoded once and
       * the AudioBuffer is reused. In-flight loads are shared, so two approvals in
       * one tick cannot fetch the same file twice.
       */
      var samples = { ready: Object.create(null), pending: Object.create(null) };

      /**
       * Fetch and decode one imported file.
       *
       * @param context - the running AudioContext.
       * @param id - the upload id the Host answered with.
       * @returns a promise of the decoded AudioBuffer.
       */
      function loadSample(context, id) {
        if (samples.ready[id] !== undefined) return Promise.resolve(samples.ready[id]);
        if (samples.pending[id] !== undefined) return samples.pending[id];
        if (typeof fetch !== 'function') return Promise.reject(new Error('this browser cannot fetch the uploaded audio'));
        var request;
        try {
          // `fetch` can throw SYNCHRONOUSLY (a blocking extension, a torn-down realm).
          // Unguarded, that throw escapes `playSample` → `chime` → the Host's
          // pending-interactions listener, which must never see this plugin's failures
          // (F1). Converting it into a rejection keeps every failure on one path.
          request = fetch(AUDIO_ROUTE + '/' + encodeURIComponent(id), { credentials: 'same-origin' });
        } catch (error) {
          return Promise.reject(error);
        }
        var pending = Promise.resolve(request)
          .then(function (response) {
            if (response === null || response === undefined || response.ok !== true) {
              throw new Error('audio fetch failed (' + (response === undefined || response === null ? 'no response' : String(response.status)) + ')');
            }
            return response.arrayBuffer();
          })
          .then(function (bytes) {
            return context.decodeAudioData(bytes);
          })
          .then(function (buffer) {
            samples.ready[id] = buffer;
            delete samples.pending[id];
            return buffer;
          })
          .catch(function (error) {
            delete samples.pending[id];
            throw error;
          });
        samples.pending[id] = pending;
        return pending;
      }

      /**
       * Play one imported file through the SAME master gain the synthesized tones use,
       * so the volume slider means one thing for both kinds of sound.
       *
       * Unlike `renderTone` this is asynchronous (fetch + decode), so the counters are
       * settled when the sound really starts: "triggered" keeps meaning "was audible"
       * rather than "was attempted".
       *
       * @param context - the running AudioContext.
       * @param tone - the `custom:<uuid>` value.
       * @param scale - master gain for this playback.
       * @param source - `preview` or `approval`.
       * @param volume - the volume the scale came from, recorded for the card.
       * @returns a promise resolving once the sample has started.
       */
      function playSample(context, tone, scale, source, volume) {
        var id = tone.slice(CUSTOM_PREFIX.length);
        return loadSample(context, id).then(function (buffer) {
          var master = context.createGain();
          master.gain.value = scale;
          master.connect(context.destination);
          var node = context.createBufferSource();
          node.buffer = buffer;
          node.connect(master);
          node.start(typeof context.currentTime === 'number' ? context.currentTime : 0);
          if (source === 'preview') counters.previews += 1;
          else counters.triggers += 1;
          counters.lastAt = Date.now();
          counters.lastTone = tone;
          counters.lastVolume = volume;
          counters.lastGain = scale;
          publish();
          return true;
        });
      }

      /**
       * The name sent to the Host for one picked file.
       *
       * Trimmed, and never left extension-less: the Host refuses by extension, so the
       * old bare `'audio'` fallback could only ever be answered with 415 even when the
       * browser itself had typed the file as `audio/mpeg` (F6).
       */
      function uploadName(file) {
        var raw = typeof file.name === 'string' ? file.name.trim() : '';
        if (/\.[A-Za-z0-9]+$/.test(raw)) return raw;
        var type = typeof file.type === 'string' ? file.type.toLowerCase() : '';
        var extension = MIME_EXTENSIONS[type];
        var base = raw.length > 0 ? raw : 'audio';
        return base + '.' + (extension === undefined ? 'wav' : extension);
      }

      /** Drop one stored file. Best-effort by design: a file with no roster entry is inert. */
      function deleteAudio(id) {
        if (typeof fetch !== 'function') return Promise.resolve();
        try {
          return Promise.resolve(fetch(AUDIO_ROUTE + '/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin' })).then(
            function () {},
            function () {},
          );
        } catch (error) {
          return Promise.resolve();
        }
      }

      /**
       * Upload one file to the Host half.
       *
       * Kept at module scope rather than inside the card so the headless harness can
       * drive the exact request the button makes — the card passes the same `File`
       * the browser hands it.
       *
       * @param file - a `File`-like object carrying `size`, `type`, `name`, and bytes.
       * @returns a promise of `{ id, name }` as the Host answered.
       */
      function uploadAudio(file) {
        if (typeof fetch !== 'function') return Promise.reject(new Error('this browser cannot import files'));
        var request;
        try {
          request = fetch(AUDIO_ROUTE, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'content-type': typeof file.type === 'string' && file.type.length > 0 ? file.type : 'application/octet-stream',
              'x-chime-name': encodeURIComponent(uploadName(file)),
            },
            body: file,
          });
        } catch (error) {
          // Same synchronous-throw guard as `loadSample`: without it the import button
          // stays disabled on "导入中…" forever, because the throw happens before any
          // `.then` handler exists to reset it (F1).
          return Promise.reject(error);
        }
        return Promise.resolve(request)
          .then(function (response) {
            return response.json().then(
              function (body) {
                return { ok: response.ok === true, body: body };
              },
              function () {
                return { ok: false, body: null };
              },
            );
          })
          .then(function (result) {
            var body = result.body;
            if (result.ok !== true || body === null || typeof body !== 'object' || body.ok !== true) {
              throw new Error(body !== null && typeof body === 'object' && typeof body.error === 'string' ? body.error : 'the Host rejected the upload');
            }
            return { id: body.id, name: typeof body.name === 'string' && body.name.length > 0 ? body.name : String(body.id) };
          });
      }

      /**
       * The one gate every sound passes through: `enabled === false` and
       * `volume <= 0` are silent BY CONSTRUCTION — no AudioContext is created and
       * no node is built — and every refusal is counted so the card can show why.
       *
       * @param options - `{ enabled, volume, tone, source }`.
       * @returns whether a chime was rendered.
       */
      function chime(options) {
        var request = options === null || options === undefined ? {} : options;
        var source = request.source === 'preview' ? 'preview' : 'approval';
        if (request.enabled === false) {
          counters.suppressedDisabled += 1;
          publish();
          return false;
        }
        var volume = clampVolume(request.volume === undefined ? FALLBACK.volume : request.volume);
        if (volume <= 0) {
          counters.suppressedSilent += 1;
          publish();
          return false;
        }
        var tone = normalizeTone(request.tone);
        var context = ensureAudio();
        if (context === null) {
          counters.suppressedUnsupported += 1;
          publish();
          return false;
        }
        var scale = (volume / 100) * MASTER_GAIN;
        if (isCustomTone(tone)) {
          // Imported audio cannot be rendered synchronously, so this reports
          // "scheduled" and the counters land when the buffer actually starts. A
          // failure is counted and surfaced rather than vanishing into a promise.
          var failSample = function (error) {
            audio.lastError = describeError(error);
            counters.suppressedFailed += 1;
            publish();
          };
          try {
            playSample(context, tone, scale, source, volume).catch(failSample);
          } catch (error) {
            // Defence in depth: `loadSample` already turns a synchronous `fetch` throw
            // into a rejection, and this keeps a future regression from reaching the
            // Host's listener (F1).
            failSample(error);
          }
          if (context.state === 'suspended') {
            counters.suppressedPolicy += 1;
            resumeContext(context);
          }
          return true;
        }
        var rendered = false;
        try {
          rendered = renderTone(context, tone, scale);
        } catch (error) {
          audio.lastError = describeError(error);
          audio.state = 'error';
        }
        if (!rendered) {
          counters.suppressedFailed += 1;
          publish();
          return false;
        }
        var suspended = context.state === 'suspended';
        if (suspended) {
          counters.suppressedPolicy += 1;
          resumeContext(context);
        }
        if (source === 'preview') counters.previews += 1;
        else counters.triggers += 1;
        counters.lastAt = Date.now();
        counters.lastTone = tone;
        counters.lastVolume = volume;
        counters.lastGain = scale;
        publish();
        return true;
      }

      /* -------------------------------------------------------------- settings read */

      function readScopeSnapshot() {
        var scope = runtime.scope;
        if (scope === null || scope === undefined || typeof scope.getSnapshot !== 'function') return null;
        try {
          return scope.getSnapshot();
        } catch (error) {
          warn('settings scope unreadable: ' + describeError(error));
          return null;
        }
      }

      /**
       * Fold a scope snapshot (or the absence of one) into the three values the
       * chime needs. Before the first `settings.describe` answer the scope is
       * `loading` and carries no value; the Host half's defaults are the honest
       * stand-in for that window.
       */
      /**
       * One display name, bounded exactly the way the Host bounds it. A settings
       * document edited by hand could otherwise carry a 200 000-character name and the
       * card would render a 200 000-character option (D4); control bytes are dropped
       * for the same reason the Host drops them, and the cut is by CODE POINT so a
       * surrogate pair is never split.
       */
      function clampName(value, fallback) {
        // Trimmed as well as stripped: a name of nothing but spaces rendered as an empty
        // row in the menu, which reads as a broken option (review round 2, R-RESID).
        var raw = typeof value === 'string' && value.length > 0 ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
        if (raw.length === 0) return fallback;
        var points = Array.from(raw);
        return points.length <= NAME_LIMIT ? raw : points.slice(0, NAME_LIMIT).join('');
      }

      /**
       * The imported roster, filtered to what can actually be selected: a malformed
       * entry or a duplicate id is dropped rather than rendered as a dead option.
       * Order is preserved — first imported stays first.
       */
      function readRoster(value) {
        var entries = value !== null && value !== undefined && Array.isArray(value.custom) ? value.custom : [];
        var roster = [];
        var seen = Object.create(null);
        for (var index = 0; index < entries.length && roster.length < CUSTOM_LIMIT; index += 1) {
          var entry = entries[index];
          if (entry === null || typeof entry !== 'object') continue;
          if (typeof entry.id !== 'string' || !CUSTOM_ID.test(entry.id) || seen[entry.id] === true) continue;
          seen[entry.id] = true;
          roster.push({ id: entry.id, name: clampName(entry.name, entry.id) });
        }
        return roster;
      }

      function effectiveSettings(scopeSnapshot) {
        var value =
          scopeSnapshot !== null && scopeSnapshot !== undefined && typeof scopeSnapshot.value === 'object' && scopeSnapshot.value !== null
            ? scopeSnapshot.value
            : null;
        return {
          enabled: value !== null && typeof value.enabled === 'boolean' ? value.enabled : FALLBACK.enabled,
          volume: value !== null && typeof value.volume === 'number' && isFinite(value.volume) ? clampVolume(value.volume) : FALLBACK.volume,
          tone: normalizeTone(value !== null ? value.tone : undefined),
          custom: readRoster(value),
        };
      }

      /* ---------------------------------------------------- per-session overrides */

      /**
       * The stored override record for one session, or null when it has none.
       *
       * Read through `Object.prototype.hasOwnProperty` on purpose: the table is a
       * null-prototype map, and a plain property read would also answer inherited
       * names for a malformed table.
       */
      function sessionRecord(sessionId) {
        if (typeof sessionId !== 'string' || sessionId.length === 0) return null;
        if (!Object.prototype.hasOwnProperty.call(sessions.table, sessionId)) return null;
        var record = sessions.table[sessionId];
        if (record === null || record === undefined) return null;
        if (typeof record !== 'object' || Array.isArray(record)) return null;
        return record;
      }

      /** The same bounds the Host route enforces, so a bad key never leaves the page. */
      function validSessionId(value) {
        return typeof value === 'string' && value.length > 0 && value.length <= SESSION_ID_LIMIT && value.trim().length > 0;
      }

      /** An integer in 0..100; a float or a numeric string is not one. */
      function validVolumeOverride(value) {
        return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= 100;
      }

      /** A built-in id or `custom:<lowercase uuid>` — the same closed set the schema uses. */
      function validToneOverride(value) {
        if (typeof value !== 'string') return false;
        if (TONE_IDS.indexOf(value) >= 0) return true;
        return value.slice(0, CUSTOM_PREFIX.length) === CUSTOM_PREFIX && CUSTOM_ID.test(value.slice(CUSTOM_PREFIX.length));
      }

      /** Whether the imported roster still names this `custom:<uuid>` tone. */
      function rosterHas(roster, tone) {
        var id = tone.slice(CUSTOM_PREFIX.length);
        for (var index = 0; index < roster.length; index += 1) {
          if (roster[index].id === id) return true;
        }
        return false;
      }

      /**
       * Drop the oldest records until the table fits {@link MAX_SESSIONS}, oldest
       * `updatedAt` first, so this side can never render a larger table than the
       * Host is willing to store.
       */
      function evictSessions(table) {
        var ids = Object.keys(table);
        if (ids.length <= MAX_SESSIONS) return table;
        var stamp = function (id) {
          return typeof table[id].updatedAt === 'number' ? table[id].updatedAt : 0;
        };
        ids.sort(function (left, right) {
          var delta = stamp(left) - stamp(right);
          if (delta !== 0) return delta;
          return left < right ? -1 : left > right ? 1 : 0;
        });
        for (var index = 0; index < ids.length - MAX_SESSIONS; index += 1) delete table[ids[index]];
        return table;
      }

      /**
       * Fold one Host answer into a table this bundle can trust.
       *
       * The same sanitizing rule the Host applies to its file: an unusable field is
       * dropped, an entry with nothing left is dropped, and the result is bounded.
       * A hand-edited file must not be able to make this side render a control whose
       * value cannot be stored again.
       */
      function sanitizeSessions(raw) {
        var table = Object.create(null);
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return table;
        var ids = Object.keys(raw);
        for (var index = 0; index < ids.length; index += 1) {
          var id = ids[index];
          if (!validSessionId(id)) continue;
          var record = raw[id];
          if (record === null || typeof record !== 'object' || Array.isArray(record)) continue;
          var entry = {};
          if (typeof record.enabled === 'boolean') entry.enabled = record.enabled;
          if (validVolumeOverride(record.volume)) entry.volume = record.volume;
          if (validToneOverride(record.tone)) entry.tone = record.tone;
          if (Object.keys(entry).length === 0) continue;
          entry.updatedAt = typeof record.updatedAt === 'number' && isFinite(record.updatedAt) ? record.updatedAt : 0;
          table[id] = entry;
        }
        return evictSessions(table);
      }

      /**
       * The values one session will actually use: `override ?? global`, field by
       * field.
       *
       * `enabled:false` therefore mutes exactly one session, and a session with no
       * overrides follows the global switch and volume completely — with the global
       * switch off it stays silent. A `custom:<uuid>` override whose file is gone
       * (removed, or never imported in this profile) falls back to the global tone
       * instead of failing to decode: a per-session preference that cannot be
       * honoured must not turn into a silent session.
       */
      function sessionSettings(sessionId) {
        var globals = effectiveSettings(readScopeSnapshot());
        var record = sessionRecord(sessionId);
        var enabled = record !== null && typeof record.enabled === 'boolean' ? record.enabled : globals.enabled;
        var volume = record !== null && typeof record.volume === 'number' ? clampVolume(record.volume) : globals.volume;
        var tone = record !== null && typeof record.tone === 'string' ? normalizeTone(record.tone) : globals.tone;
        var customMissing = record !== null && isCustomTone(tone) && !rosterHas(globals.custom, tone);
        if (customMissing) tone = globals.tone;
        return {
          sessionId: sessionId,
          enabled: enabled,
          volume: volume,
          tone: tone,
          globals: globals,
          overridden: {
            enabled: record !== null && record.enabled !== undefined,
            volume: record !== null && record.volume !== undefined,
            tone: record !== null && record.tone !== undefined,
          },
          customMissing: customMissing,
        };
      }

      /** One pair of `{ok, body}` from a response, without ever rejecting. */
      function readJsonAnswer(response) {
        if (response === null || response === undefined || typeof response.json !== 'function') {
          return Promise.resolve({ ok: false, body: null, status: undefined });
        }
        return response.json().then(
          function (body) {
            return { ok: response.ok === true, body: body, status: response.status };
          },
          function () {
            return { ok: false, body: null, status: response.status };
          },
        );
      }

      /** The message a failed per-session answer carries, or an honest stand-in. */
      function sessionAnswerError(result) {
        var body = result === null || result === undefined ? null : result.body;
        if (body !== null && typeof body === 'object' && typeof body.error === 'string' && body.error.length > 0) return body.error;
        return 'the Host refused the per-session request (' + String(result === null || result === undefined ? 'no answer' : result.status) + ')';
      }

      /** The table carried by an answer, or null when the answer is not a success. */
      function sessionAnswerTable(result) {
        if (result === null || result === undefined || result.ok !== true) return null;
        var body = result.body;
        if (body === null || typeof body !== 'object' || body.ok !== true) return null;
        if (body.sessions === null || typeof body.sessions !== 'object' || Array.isArray(body.sessions)) return null;
        return sanitizeSessions(body.sessions);
      }

      /**
       * Record a FAILED read of the table without touching the table (rev-15, fixes OBS-A).
       *
       * The table is the user's own decisions — a muted session, a per-session tone. Until
       * rev-15 a failed read degraded it to "no overrides", which is the LOUD direction to
       * fail in: a session muted on purpose silently went back to following the global
       * switch and rang when that switch was on. A failed read is not evidence that the
       * overrides are gone, so the last known `table`, `ready` and `revision` stay exactly
       * as they were and the reason goes onto the error line the popover renders. Only a
       * read that lands may move the table — that keeps the one convergence property intact
       * (local table == Host file whenever a read succeeded) while making every failure
       * strictly more quiet, never more loud.
       *
       * @returns false, so callers keep resolving "that read did not land".
       */
      function sessionsReadFailed(message) {
        sessions.error = message;
        publish();
        return false;
      }

      /**
       * Read the table from the Host.
       *
       * A read that fails keeps the last known table and reports the reason on the error
       * line (rev-15, see `sessionsReadFailed`); with nothing read yet the table simply
       * stays empty, which is the honest "every session follows the global settings" state.
       * Never rejects — a rejection here would surface as an unhandled rejection in the page.
       */
      function refreshSessions() {
        if (typeof fetch !== 'function') {
          return Promise.resolve(sessionsReadFailed('this browser cannot read the per-session overrides'));
        }
        var request;
        try {
          request = fetch(SESSIONS_ROUTE, { credentials: 'same-origin' });
        } catch (error) {
          return Promise.resolve(sessionsReadFailed(describeError(error)));
        }
        return Promise.resolve(request)
          .then(readJsonAnswer)
          .then(
            function (result) {
              var table = sessionAnswerTable(result);
              if (table === null) return sessionsReadFailed(sessionAnswerError(result));
              sessions.table = table;
              sessions.ready = true;
              sessions.revision = typeof result.body.revision === 'number' ? result.body.revision : null;
              sessions.error = '';
              publish();
              return true;
            },
            function (error) {
              return sessionsReadFailed(describeError(error));
            },
          );
      }

      /** `POST { sessionId, patch }`; resolves with the new table or rejects with the reason. */
      function postSessionPatch(sessionId, patch) {
        if (typeof fetch !== 'function') return Promise.reject(new Error('this browser cannot store per-session preferences'));
        var request;
        try {
          // The same synchronous-throw guard as the upload path: `fetch` can throw
          // before any handler exists, and the caller's rollback must still run.
          request = fetch(SESSIONS_ROUTE, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId, patch: patch }),
          });
        } catch (error) {
          return Promise.reject(error);
        }
        return Promise.resolve(request)
          .then(readJsonAnswer)
          .then(function (result) {
            var table = sessionAnswerTable(result);
            if (table === null) throw new Error(sessionAnswerError(result));
            return { table: table, revision: typeof result.body.revision === 'number' ? result.body.revision : null };
          });
      }

      /**
       * Apply one patch to the LOCAL copy, mirroring the Host's semantics: `null`
       * clears a field, an absent field is untouched, and a record with no field
       * left is deleted rather than kept as an empty override.
       */
      function applyLocalPatch(table, sessionId, patch) {
        var next = Object.create(null);
        var ids = Object.keys(table);
        for (var index = 0; index < ids.length; index += 1) next[ids[index]] = shallowCopy(table[ids[index]]);
        var record = Object.prototype.hasOwnProperty.call(next, sessionId) ? next[sessionId] : {};
        for (var fieldIndex = 0; fieldIndex < SESSION_FIELDS.length; fieldIndex += 1) {
          var field = SESSION_FIELDS[fieldIndex];
          if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
          var value = patch[field];
          if (value === undefined) continue;
          if (value === null) delete record[field];
          else record[field] = value;
        }
        var empty = true;
        for (var checkIndex = 0; checkIndex < SESSION_FIELDS.length; checkIndex += 1) {
          if (record[SESSION_FIELDS[checkIndex]] !== undefined) empty = false;
        }
        if (empty) delete next[sessionId];
        else {
          record.updatedAt = Date.now();
          next[sessionId] = record;
        }
        return evictSessions(next);
      }

      /**
       * Write one session's override, optimistically.
       *
       * The local table moves FIRST so the bell answers the click immediately, then
       * the Host answer replaces it. A refused write rolls the table back to the copy
       * taken before the change and puts the reason on `sessions.error`, which the
       * popover renders: the UI must never keep showing a switch position the Host
       * did not accept.
       *
       * WHY THE LAST ANSWER ALONE IS NOT ENOUGH (rev-11, fixes the window the rev-10
       * review filed as F-01): two quick clicks are two POSTs on two sockets, and
       * nothing guarantees that the answer bodies are consumed in the order the Host
       * renamed the file. One measured round left the bell saying "on" while the file
       * said `{enabled:false}` — and nothing re-read the store afterwards, so the
       * disagreement lasted until the page was reloaded.
       *
       * `answer.revision` cannot arbitrate either, which is why no revision fence is
       * used here: with the answers delivered in reverse, the FRESH table is the one
       * riding the later answer and it carries the LARGER revision, so a
       * `revision >` test would accept the stale table and skip the fresh one.
       *
       * The fix is a convergence re-read instead: once the last outstanding write of
       * the whole table settles, the table is read back from the Host
       * (`refreshSessions()`), so the local copy equals the FILE regardless of which
       * answer arrived last and regardless of the order the Host applied the writes.
       *
       * @returns a promise of whether the Host accepted the write; when this was the
       *   last write in flight, it resolves after the convergence re-read.
       */
      function writeSessionPatch(sessionId, patch) {
        var previous = sessions.table;
        var previousRevision = sessions.revision;
        var previousReady = sessions.ready;
        sessions.table = applyLocalPatch(previous, sessionId, patch);
        sessions.error = '';
        publish();
        sessionWrites.outstanding += 1;
        return postSessionPatch(sessionId, patch).then(
          function (answer) {
            sessions.table = answer.table;
            sessions.revision = answer.revision;
            sessions.ready = true;
            sessions.error = '';
            publish();
            return settleSessionWrites('');
          },
          function (failure) {
            var message = describeError(failure);
            sessions.table = previous;
            sessions.revision = previousRevision;
            sessions.ready = previousReady;
            sessions.error = message;
            publish();
            return settleSessionWrites(message).then(function () {
              return false;
            });
          },
        );
      }

      /**
       * Account for one settled write; when none is left in flight, re-read the table
       * once so the local copy equals the Host file (rev-11).
       *
       * `preservedError` carries the verdict of a refused write: the re-read is about
       * the TABLE, so a successful read must not silently erase the reason the user
       * needs to see. Never rejects, and never blocks a queued write: the counter is
       * decremented before the read is issued.
       *
       * @returns a promise of whether the re-read landed (true when none was needed).
       */
      function settleSessionWrites(preservedError) {
        sessionWrites.outstanding -= 1;
        if (sessionWrites.outstanding > 0) return Promise.resolve(true);
        sessionWrites.outstanding = 0;
        return refreshSessions().then(function (ok) {
          if (preservedError !== '' && sessions.error === '') {
            sessions.error = preservedError;
            publish();
          }
          return ok;
        });
      }

      /** Toggle one session's mute: audible → write `enabled:false`; muted → clear it. */
      function toggleSession(sessionId) {
        var view = sessionSettings(sessionId);
        return writeSessionPatch(sessionId, view.enabled === true ? { enabled: false } : { enabled: null });
      }

      /** Cancel every delayed chime of the current batch (the watch is going away). */
      function cancelPendingChimes() {
        for (var index = 0; index < sessions.timers.length; index += 1) {
          try {
            clearTimeout(sessions.timers[index]);
          } catch (error) {
            /* a timer that cannot be cleared is already gone */
          }
        }
        sessions.timers = [];
      }

      /**
       * Audible feedback for an explicit user action. The switch is respected here
       * too: with the chime off, nothing — not even a preview — is allowed to make a
       * sound, so the settings state and the audio graph can never disagree.
       */
      function playPreview(tone, volume, enabled) {
        if (enabled === false) {
          // Counted like every other refusal: the card's "why is it silent" line must
          // not depend on which entry point asked (F3).
          counters.suppressedDisabled += 1;
          publish();
          return false;
        }
        attemptUnlock('preview');
        return chime({ enabled: true, volume: volume, tone: tone, source: 'preview' });
      }

      /* ------------------------------------------------------------- approval watch */

      /**
       * Chime once per newly appeared approval, PER SESSION (rev-10).
       *
       * The snapshot is a Map replaced wholesale and its element references are
       * stable, so change detection is a `key` diff, not a "did it notify" test: a
       * re-publication for any unrelated reason must not ring again, and a
       * replacement request is a new key and therefore rings exactly once.
       *
       * A batch of N sessions now plays N chimes, 180 ms apart, each with the values
       * THAT session resolves to (`override ?? global`): one sound for the whole
       * batch made "two sessions are waiting" indistinguishable from "one is", and
       * per-session volume/tone would have been silently ignored. A session muted by
       * its own override does not sound and is counted as `suppressedSession`
       * (a session that is silent because the GLOBAL switch is off keeps counting as
       * `suppressedDisabled`).
       *
       * @returns the disposer that stops watching.
       */
      function startApprovalWatch(ctx) {
        var service = ctx === null || ctx === undefined ? undefined : ctx.uiSession;
        var source = service === null || service === undefined ? undefined : service.pendingInteractions;
        if (source === null || source === undefined || typeof source.getSnapshot !== 'function' || typeof source.subscribe !== 'function') {
          warn('ctx.uiSession.pendingInteractions is unavailable — the approval chime is disabled (degraded, not broken)');
          return function () {};
        }
        var seen = Object.create(null);
        var order = [];
        /** Sound one scheduled chime, using the values captured when it was scheduled. */
        var play = function (entry) {
          chime({ enabled: true, volume: entry.view.volume, tone: entry.view.tone, source: 'approval' });
        };
        var schedule = function (entry, at) {
          if (at <= 0) {
            play(entry);
            return;
          }
          var timer = setTimeout(function () {
            var slotIndex = sessions.timers.indexOf(timer);
            if (slotIndex >= 0) sessions.timers.splice(slotIndex, 1);
            play(entry);
          }, at);
          sessions.timers.push(timer);
        };
        var sync = function (reason) {
          var snapshot;
          try {
            snapshot = source.getSnapshot();
          } catch (error) {
            warn('pendingInteractions snapshot failed: ' + describeError(error));
            return;
          }
          if (snapshot === null || snapshot === undefined || typeof snapshot.forEach !== 'function') return;
          var batch = [];
          try {
            snapshot.forEach(function (interaction, sessionId) {
              if (interaction === null || typeof interaction !== 'object') return;
              if (interaction.kind !== 'approval') return;
              var key = typeof interaction.key === 'string' && interaction.key.length > 0 ? interaction.key : 'session:' + String(sessionId);
              if (seen[key] === true) return;
              seen[key] = true;
              order.push(key);
              if (order.length > DEDUP_LIMIT) {
                var oldest = order.shift();
                if (oldest !== undefined) delete seen[oldest];
              }
              counters.approvalsSeen += 1;
              batch.push({ sessionId: typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : String(sessionId), key: key });
            });
          } catch (error) {
            warn('pendingInteractions snapshot unreadable: ' + describeError(error));
            return;
          }
          if (batch.length === 0) return;
          var playable = [];
          var muted = 0;
          for (var index = 0; index < batch.length; index += 1) {
            var view = sessionSettings(batch[index].sessionId);
            if (view.enabled !== true) {
              // `enabled:false` ON THE RECORD is a per-session mute; anything else that
              // lands here is the global switch being off, which is not this session's
              // doing and must keep counting the way it always did.
              if (view.overridden.enabled === true) counters.suppressedSession += 1;
              else counters.suppressedDisabled += 1;
              muted += 1;
              continue;
            }
            playable.push({ sessionId: batch[index].sessionId, view: view });
          }
          counters.lastBatchSize = batch.length;
          counters.lastBatchPlayed = playable.length;
          if (muted > 0) publish();
          for (var playIndex = 0; playIndex < playable.length; playIndex += 1) {
            schedule(playable[playIndex], playIndex * BATCH_GAP_MS);
          }
        };
        var dispose = function () {
          cancelPendingChimes();
          try {
            off();
          } catch (error) {
            warn('pendingInteractions unsubscribe failed: ' + describeError(error));
          }
        };
        var off = function () {};
        try {
          off = source.subscribe(function () {
            sync('change');
          });
        } catch (error) {
          warn('pendingInteractions subscribe failed: ' + describeError(error));
          return function () {};
        }
        // Align with what is already pending: a page that loads while an approval
        // is on screen must still chime once.
        sync('initial');
        return dispose;
      }

      /* -------------------------------------------------------------- snapshot fold */

      function initialSnapshot() {
        var snapshot = {
          available: false,
          status: 'loading',
          writable: false,
          mode: 'unknown',
          settingsRevision: null,
          userLayer: false,
          enabled: FALLBACK.enabled,
          volume: FALLBACK.volume,
          tone: FALLBACK.tone,
          custom: [],
          triggers: 0,
          previews: 0,
          approvalsSeen: 0,
          lastAt: 0,
          lastTone: '',
          lastVolume: null,
          lastGain: null,
          suppressedDisabled: 0,
          suppressedSilent: 0,
          suppressedSession: 0,
          suppressedUnsupported: 0,
          suppressedFailed: 0,
          suppressedPolicy: 0,
          lastBatchSize: 0,
          lastBatchPlayed: 0,
          /** The per-session table as the Host last answered it (empty until then). */
          sessions: Object.create(null),
          sessionsReady: false,
          sessionsRevision: null,
          sessionsError: '',
          audio: 'idle',
          unlocked: false,
          lastError: '',
          bundleRevision: REVISION,
        };
        return snapshot;
      }

      /** Rebuild the section page's snapshot from the settings scope and the runtime counters. */
      function publish() {
        var store = runtime.store;
        if (store === null || store === undefined) return;
        var scopeSnapshot = readScopeSnapshot();
        var settings = effectiveSettings(scopeSnapshot);
        var status = scopeSnapshot !== null && typeof scopeSnapshot.status === 'string' ? scopeSnapshot.status : 'unavailable';
        var userLayer = scopeSnapshot !== null && scopeSnapshot.user !== null && typeof scopeSnapshot.user === 'object' ? Object.keys(scopeSnapshot.user).length > 0 : false;
        store.update(function (draft) {
          draft.status = status;
          draft.available = status === 'ready';
          draft.writable = scopeSnapshot !== null && scopeSnapshot.writable === true;
          draft.mode = scopeSnapshot !== null && typeof scopeSnapshot.mode === 'string' ? scopeSnapshot.mode : 'unknown';
          draft.settingsRevision = scopeSnapshot !== null && typeof scopeSnapshot.revision === 'number' ? scopeSnapshot.revision : null;
          draft.userLayer = userLayer;
          draft.enabled = settings.enabled;
          draft.volume = settings.volume;
          draft.tone = settings.tone;
          draft.custom = settings.custom;
          draft.triggers = counters.triggers;
          draft.previews = counters.previews;
          draft.approvalsSeen = counters.approvalsSeen;
          draft.lastAt = counters.lastAt;
          draft.lastTone = counters.lastTone;
          draft.lastVolume = counters.lastVolume;
          draft.lastGain = counters.lastGain;
          draft.suppressedDisabled = counters.suppressedDisabled;
          draft.suppressedSilent = counters.suppressedSilent;
          draft.suppressedSession = counters.suppressedSession;
          draft.suppressedUnsupported = counters.suppressedUnsupported;
          draft.suppressedFailed = counters.suppressedFailed;
          draft.suppressedPolicy = counters.suppressedPolicy;
          draft.lastBatchSize = counters.lastBatchSize;
          draft.lastBatchPlayed = counters.lastBatchPlayed;
          draft.sessions = sessions.table;
          draft.sessionsReady = sessions.ready;
          draft.sessionsRevision = sessions.revision;
          draft.sessionsError = sessions.error;
          draft.audio = audio.state;
          draft.unlocked = audio.unlocked;
          draft.lastError = audio.lastError;
        });
      }

      /* ------------------------------------------------------------------- copy */

      /**
       * Dictionary registered under NS. The Host binds `props.t` for a slot entry
       * whose `locale` option names a registered namespace, so the section page reads
       * the same copy as the rest of the settings UI — with these strings as its
       * fallback when the platform hands it no translator.
       *
       * `nav` and `title` deliberately carry the SAME text: `nav` labels the
       * navigation row (via the label thunk below) and `title` is the page heading, so
       * the row and the heading can never drift apart. That is the Host's own
       * convention — its sections ship nav/title/intro triples too
       * (dsh-client-ui-settings-models/lib/client.js:2649-2651, :2752-2754;
       * dsh-client-ui-settings-plugins/lib/client.js:1566-1568, :1621-1623).
       */
      var DICT = {
        zh: {
          nav: '通知提醒',
          title: '通知提醒',
          intro: 'DSH 向你申请权限时响一次（不改变审批面板的行为）',
          enabled: '启用提示音',
          volume: '音量',
          tone: '音色',
          'tone.chime': '风铃 chime',
          'tone.bell': '铃铛 bell',
          'tone.beep': '蜂鸣 beep',
          preview: '试听',
          reset: '恢复默认',
          writeDisabled: '设置当前不可写',
          statsTriggered: '已触发',
          statsLast: '上次触发',
          statsNever: '尚未触发',
          statsSound: '最近音色/音量',
          statsSeen: '已见审批',
          statsAudio: '音频状态',
          audioIdle: '未创建（首次响铃时创建）',
          audioRunning: '已就绪',
          audioSuspended: '未解锁（先点击页面任意处，或点“试听”）',
          audioUnsupported: '浏览器不支持 WebAudio',
          audioError: '初始化失败',
          unlocked: '已解锁',
          mutedDisabled: '因“启用”关闭而静音',
          mutedSilent: '因音量为 0 而静音',
          mutedSession: '因本会话提示音关闭而静音',
          mutedUnsupported: '浏览器不支持 WebAudio',
          mutedFailed: '音频节点创建失败',
          mutedPolicy: '被浏览器自动播放策略拦下',
          memoryHint: '当前页面不是本机（loopback）访问：平台只在内存中保留设置，写入不会落盘。',
          errorHint: '设置写入失败',
          overridden: '已覆盖默认值',
          'import': '导入音频',
          importing: '导入中…',
          remove: '移除',
          toneMissing: '（文件缺失）',
          importTooBig: '文件超过 5 MB 上限',
          importLimit: '导入音色已达上限（50 个）',
          importUnsupported: '当前浏览器不支持文件导入',
          importFailed: '导入失败',
          customHint: '导入的音色排在前面，按导入先后排列；超过 3 项后列表可滚动。',
          // rev-10 · per-session bell. `sessionOn`/`sessionOff` are ALSO read from
          // the other locale's block below on purpose: the bell's tooltip must carry
          // both languages at once, so it is readable whichever locale is active.
          sessionOn: '本会话审批提示音：开',
          sessionOff: '本会话审批提示音：关',
          sessionMore: '本会话音色与音量',
          sessionFollow: '跟随全局',
          sessionFollowVolume: '跟随全局音量',
          sessionReset: '恢复跟随全局',
          sessionError: '本会话设置写入失败',
          sessionMissing: '（文件缺失，回退全局音色）',
          sessionGlobalOff: '全局开关已关闭：要让本会话响铃，先在「通知提醒」里打开全局开关。',
          sessionHint: '每个会话的覆盖存在 DSH 的 approval-chime/sessions.json（最多 200 个会话）；不进设置文档、不进浏览器存储。',
        },
        en: {
          nav: 'Notifications',
          title: 'Notifications',
          intro: 'Rings once when the Host asks you for permission (the approval panel is untouched).',
          enabled: 'Play a chime',
          volume: 'Volume',
          tone: 'Tone',
          'tone.chime': 'Chime',
          'tone.bell': 'Bell',
          'tone.beep': 'Beep',
          preview: 'Preview',
          reset: 'Restore defaults',
          writeDisabled: 'Settings are read-only',
          statsTriggered: 'Triggered',
          statsLast: 'Last trigger',
          statsNever: 'never',
          statsSound: 'Last tone/volume',
          statsSeen: 'Approvals seen',
          statsAudio: 'Audio',
          audioIdle: 'not created yet (built on the first chime)',
          audioRunning: 'ready',
          audioSuspended: 'locked (click anywhere on the page, or press Preview)',
          audioUnsupported: 'WebAudio unsupported',
          audioError: 'init failed',
          unlocked: 'unlocked',
          mutedDisabled: 'muted: the switch is off',
          mutedSilent: 'muted: volume 0',
          mutedUnsupported: 'muted: WebAudio unsupported',
          mutedFailed: 'muted: node creation failed',
          mutedPolicy: 'blocked by the autoplay policy',
          memoryHint: 'This page is not a loopback page: the platform keeps settings in memory, so writes do not reach disk.',
          errorHint: 'settings write failed',
          overridden: 'overrides the defaults',
          'import': 'Import audio',
          importing: 'Importing…',
          remove: 'Remove',
          toneMissing: '(file missing)',
          importTooBig: 'File exceeds the 5 MB limit',
          importLimit: 'The imported roster is full (50)',
          importUnsupported: 'This browser cannot import files',
          importFailed: 'Import failed',
          customHint: 'Imported tones come first, in the order you added them; the list scrolls past three.',
          sessionOn: 'Approval chime for this session: on',
          sessionOff: 'Approval chime for this session: off',
          sessionMore: 'Tone and volume for this session',
          sessionFollow: 'Follow the global setting',
          sessionFollowVolume: 'Follow the global volume',
          sessionReset: 'Follow the global settings again',
          sessionError: 'per-session write failed',
          sessionMissing: '(file missing — using the global tone)',
          sessionGlobalOff: 'The global switch is off: turn it on in Notifications to let this session ring.',
          sessionHint: 'Per-session overrides live in the Host file approval-chime/sessions.json (at most 200 sessions); never in the settings document, never in browser storage.',
        },
      };
      var STRINGS = DICT.zh;

      /**
       * `props.t` when the platform bound one for this entry, the bundled copy
       * otherwise. A translator that hands back the KEY itself (the platform's own
       * "nothing registered under this namespace" answer,
       * dsh-client-locale/lib/client.js:1292-1297) is treated as a miss, so a missing
       * dictionary degrades to the bundled copy instead of printing raw keys.
       */
      function translator(props) {
        var bound = props !== null && props !== undefined && typeof props.t === 'function' ? props.t : null;
        return function (key) {
          if (bound !== null) {
            try {
              var text = bound(key);
              if (typeof text === 'string' && text.length > 0 && text !== key) return text;
            } catch (error) {
              /* a broken translator falls back to the bundled copy */
            }
          }
          return Object.prototype.hasOwnProperty.call(STRINGS, key) ? STRINGS[key] : key;
        };
      }

      /**
       * The settings-section navigation label.
       *
       * The shell projects a settings-section row through `resolveSlotLabel` and
       * re-projects it whenever the slot ledger OR the locale revision changes
       * (dsh-client-ui-settings-general/lib/client.js:560-582), and the slot contract
       * states that a thunk label is "re-read on every projection, so localized text
       * follows the active locale without re-registering"
       * (dsh-cordis-client-runner/lib/client.js:3893-3894). A thunk receives no props,
       * so this reads the platform's translator bound to NS at apply time
       * (dsh-client-locale/lib/client.js:1283-1291) and falls back to the bundled
       * copy. It resolves the same `nav` key the page heading resolves through
       * `title`, which is what keeps the two texts identical.
       */
      function navLabel() {
        var bound = runtime.translate;
        if (typeof bound === 'function') {
          try {
            var text = bound('nav');
            if (typeof text === 'string' && text.length > 0 && text !== 'nav') return text;
          } catch (error) {
            /* a broken translator falls back to the bundled copy */
          }
        }
        return STRINGS.nav;
      }

      /* -------------------------------------------------------------------- css */

      function injectStyles() {
        if (typeof document === 'undefined' || document === null || typeof document.createElement !== 'function') return;
        var tagId = PLUGIN_ID + '/styles';
        try {
          if (typeof document.getElementById === 'function' && document.getElementById(tagId) !== null) return;
          var style = document.createElement('style');
          style.id = tagId;
          style.setAttribute('data-plugin', PLUGIN_ID);
          // The three fragments every tone list in this bundle is built from — see the
          // `@supports (appearance:base-select)` block below for why they are shared.
          var pickerBox = 'appearance:base-select;margin-top:4px;padding:4px;' +
            'border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));border-radius:10px;' +
            'background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);' +
            'box-shadow:0 10px 28px rgba(0,0,0,.28);box-sizing:content-box;' +
            'overflow-x:hidden;overflow-y:auto;' +
            // The list's own type size. The card's select inherits 13px from `.dacCard`, and
            // the popover's is 12px (its container) — so the list states the size itself
            // instead of inheriting it, which is what makes the two menus read identically.
            'font-size:' + String(TONE_PICKER_TEXT_PX) + 'px;';
          var pickerOption = 'border-radius:7px;padding:4px 9px;line-height:' + String(TONE_ROW_PX - 8) + 'px;';
          var pickerHighlight = 'background:color-mix(in srgb,currentColor 14%,transparent);';
          style.textContent = [
            // The section container, its heading and its intro follow the HOST's own
            // settings-section rules, token for token: `.section` is
            // `max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;
            // gap:12px;display:flex`, `.title` is `color:...;margin:0;font-size:16px;
            // font-weight:500;line-height:24px`, and `.intro` is
            // `color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px`
            // (dsh-client-ui-settings-models/lib/client.js:58, the shipped
            // ModelsSection.module.css bundle; used at :1954-1962). Matching them is what
            // makes this page sit in the settings shell like a shipped one; the fallback
            // colors only matter on a host that ships no design tokens at all.
            '.dacSection{max-width:720px;color:var(--dsw-alias-label-primary,#1a1a1a);',
            'flex-direction:column;gap:12px;display:flex;}',
            '.dacHead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;}',
            '.dacTitle{color:var(--dsw-alias-label-primary,#1a1a1a);margin:0;font-size:16px;',
            'font-weight:500;line-height:24px;}',
            '.dacIntro{color:var(--dsw-alias-label-tertiary,#71717a);margin:0;font-size:14px;',
            'line-height:22px;}',
            '.dacRev{font-size:10px;opacity:.55;white-space:nowrap;}',
            // The controls keep their own framed panel inside the section.
            '.dacCard{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:12px;',
            'border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));',
            'background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.6));',
            'color:var(--dsw-alias-label-primary,#1a1a1a);font-size:13px;line-height:1.6;}',
            '.dacRow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}',
            '.dacRow label{display:inline-flex;align-items:center;gap:6px;cursor:pointer;}',
            // The enable control is the Apple switch (user request): a slim 38x22
            // track with a 16px white knob and a 2px inset — Apple's own macOS
            // toggle geometry, which is also what the plugin market's rows use.
            // The first cut shipped iOS's larger 51x31 and read as "太胖" in a
            // 13px row on the real machine; the numbers below are that fix.
            // The on state paints itself with the SAME token as the volume
            // slider's `accent-color`, so "on" and the progress bar are one color
            // by construction rather than two values agreeing by hand.
            // The native <input type=checkbox> stays in the tree: semantics,
            // keyboard activation, the disabled state and every harness assertion
            // still go through it; only its painting is replaced. It is clipped
            // rather than `display:none` so it stays focusable, and
            // `data-on`/`data-disabled` mirror the React state onto the styled
            // span, because a sibling combinator cannot read React's `checked`.
            '.dacToggle{display:inline-flex;align-items:center;gap:8px;}',
            '.dacToggle input{position:absolute;width:1px;height:1px;margin:-1px;padding:0;',
            'border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}',
            '.dacSwitch{box-sizing:border-box;position:relative;flex:none;width:38px;height:22px;',
            'border-radius:99px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));',
            'background:var(--dsw-alias-bg-layer-2,rgba(120,120,128,.32));',
            'transition:background-color .18s ease,border-color .18s ease;}',
            '.dacSwitch[data-on="true"]{background:var(--dsw-alias-state-business-primary,#2563eb);',
            'border-color:var(--dsw-alias-state-business-primary,#2563eb);}',
            '.dacSwitch[data-disabled="true"]{opacity:.5;}',
            '.dacKnob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;',
            'background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .18s ease;}',
            '.dacSwitch[data-on="true"] .dacKnob{transform:translateX(16px);}',
            '.dacToggle input:focus-visible+.dacSwitch{box-shadow:0 0 0 3px color-mix(in srgb,',
            'var(--dsw-alias-state-business-primary,#2563eb) 35%,transparent);}',
            // rev-20 · a reduced-motion override used to sit on this line: it deleted the switch's
            // transitions for a reader whose system asks for no motion. It is gone for the same
            // reason as the caret's override a few rules below — no state of this card removes its
            // transition any more, so the `.18s` track/knob pair above runs in every environment.
            // The deliberate trade-off is recorded at CARET_ROTATE_MS.
            '.dacLabel{min-width:52px;color:var(--dsw-alias-label-secondary,#3f3f46);}',
            '.dacCard input[type=range]{flex:1;min-width:160px;accent-color:var(--dsw-alias-state-business-primary,#2563eb);}',
            '.dacCard select,.dacCard button{font:inherit;color:inherit;border-radius:8px;padding:3px 9px;',
            'border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));background:transparent;cursor:pointer;}',
            // The expanded <select> popup is painted by the browser, not by the card, so its
            // items need their colors stated explicitly: without this the list keeps the
            // user agent's light default and the item text washes out on a dark theme. Both
            // values come from the same tokens the card itself uses, so the menu matches its
            // surroundings in either theme instead of hard-coding a dark palette. This is the
            // fallback for a browser without customizable select; the block below restyles
            // the same list from scratch where it can.
            '.dacCard select option,.dacPop select option{background-color:var(--dsw-alias-bg-layer-1,#fff);',
            'color:var(--dsw-alias-label-primary,#1a1a1a);}',
            // The UA paints a native <select> popup as a square-cornered box and exposes no
            // way to clip it — `border-radius` on the options cannot round the container. So
            // we opt into the customizable-select rendering, which hands the popup to CSS
            // while keeping native semantics and keyboard behaviour. Browsers without it
            // simply ignore this block and keep the colored-but-square popup above.
            //
            // BOTH tone selects go through the SAME declarations (rev-12, user request: the
            // list in the session header has to look like the one in Settings). They used to
            // be styled apart — the card's list was rounded and tinted, the popover's kept
            // the UA's square grey highlight — so the shared pieces now live in the
            // `pickerBox`/`pickerOption`/`pickerHighlight` fragments below and appear here
            // once for both selector lists. Only the row count differs, and only because the
            // popover's list is one entry longer.
            '@supports (appearance:base-select){',
            '.dacCard select,.dacPop select{appearance:base-select;}',
            '.dacCard select::picker(select),.dacPop select::picker(select){' + pickerBox + '}',
            // Exactly N rows, then it scrolls. Two details make this exact:
            //   * `box-sizing:content-box` — the UA stylesheet gives `::picker(select)`
            //     `border-box`, so the previous `92px` box with 8px padding and a 2px
            //     border left only 82px of content: the DEFAULT three-tone list already
            //     showed a scrollbar and clipped its third row by 2px, i.e. the opposite
            //     of the requirement (found in review round 2, R5-1).
            //   * the row height is pinned in `pickerBox`'s `line-height` (20px line box
            //     + 4px padding twice), so the arithmetic cannot drift with the theme's
            //     font metrics.
            // The popover's cap carries TONE_PICKER_SLACK_PX on top of its four rows: its
            // list opens with 跟随全局 + the three built-in tones and must show all four
            // without a scrollbar, and the browser's own picker chrome takes a few pixels
            // (the card's cap, which has no slack, is visibly scrollable at exactly its
            // row count — the state the user asked for there).
            '.dacCard select::picker(select){max-height:' + String(TONE_ROWS * TONE_ROW_PX) + 'px;}',
            '.dacPop select::picker(select){',
            'max-height:' + String(SESSION_TONE_ROWS * TONE_ROW_PX + TONE_PICKER_SLACK_PX) + 'px;}',
            '.dacCard select option,.dacPop select option{' + pickerOption + '}',
            '.dacCard select option:hover,.dacCard select option:checked,',
            '.dacPop select option:hover,.dacPop select option:checked{' + pickerHighlight + '}',
            '}',
            '.dacCard button:disabled,.dacCard select:disabled,.dacCard input:disabled{cursor:not-allowed;opacity:.5;}',
            // The file picker is driven by the adjacent button; the input itself is a
            // hidden native control and must not add a row of its own.
            '.dacCard .dacFile{display:none;}',
            '.dacValue{font-variant-numeric:tabular-nums;min-width:42px;text-align:right;}',
            '.dacStats{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;',
            'color:var(--dsw-alias-label-tertiary,#71717a);}',
            '.dacHint{font-size:12px;color:var(--dsw-alias-state-warning-primary,#b45309);}',
            '.dacError{font-size:12px;color:var(--dsw-alias-state-error-primary,#dc2626);}',
            '.dacBadge{font-size:11px;padding:1px 6px;border-radius:999px;',
            'border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));}',
            // rev-10 · the session-header bell. It sits among the header's own action
            // chips (`flex:none;gap:8px` — dsh-client-ui-conversation's `.headerActions`
            // rule), so it draws no frame of its own and borrows the host's interactive
            // hover token instead of inventing a palette.
            // rev-13 grew it: the box is now 28px — the height a shipped header chip uses
            // (`dsh-client-ui-jobs` `.trigger{min-height:28px}`) — and the bell glyph is
            // 22px (≈15px drawn, up from ≈9.5px), because at 20px/14px the user read it as
            // a smudge. Both numbers come from the constants above.
            // rev-16 separated the two halves of the cluster: the wrapper's `gap` is
            // BELL_GAP_PX, because flush boxes made the bell and the caret read as one
            // control rather than two (user request; see the constant's note).
            '.dacBellWrap{position:relative;display:inline-flex;align-items:center;gap:' + String(BELL_GAP_PX) + 'px;}',
            '.dacBell,.dacCaret{display:inline-flex;align-items:center;justify-content:center;',
            'background:transparent;border:0;padding:0;margin:0;color:var(--dsw-alias-label-secondary,#3f3f46);',
            'cursor:pointer;border-radius:8px;line-height:0;}',
            '.dacBell{width:' + String(BELL_BOX_PX) + 'px;height:' + String(BELL_BOX_PX) + 'px;}',
            '.dacCaret{width:' + String(CARET_BOX_PX) + 'px;height:' + String(BELL_BOX_PX) + 'px;}',
            // rev-17 · the caret's turn. The GLYPH rotates, the button does not: 16×28 turned
            // 90° would be a 28×16 hover pill (see the constant's note). Two rules, so the
            // turn is symmetric — the base rule always carries the transition, which is what
            // lets the arrow turn BACK when the popover closes, while the `[data-open="true"]`
            // rule supplies only the terminal quarter turn. Both numbers are spelled from the
            // constants above; no second copy exists to drift.
            '.dacCaret svg{transition:transform ' + String(CARET_ROTATE_MS) + 'ms ease;}',
            '.dacCaret[data-open="true"] svg{transform:rotate(' + String(CARET_OPEN_ROTATE_DEG) + 'deg);}',
            // The quarter turn must stay centred on the glyph, or the ink swings towards the
            // button's left edge instead of pointing down. With `transform-box:view-box` the
            // used origin already IS the middle of the 11×16 box, and saying so keeps the
            // rotation where it was measured if an engine resolves it against (0,0) instead.
            '.dacCaret svg{transform-origin:center;}',
            // rev-20 · the caret's reduced-motion override used to sit HERE and deleted the
            // transition outright, while the 90° terminal rule above stayed outside it — so the
            // reader it named got the end state and no turn at all, in every revision before this
            // one, which is why the duration changes of rev-18 and rev-19 changed nothing on a
            // machine whose system asks for reduced motion. Deleted on purpose: the caret now
            // turns for the same CARET_ROTATE_MS in every environment (one rule, no override), and
            // the trade-off is written down at the constant above. Do not re-add.
            '.dacBell:hover,.dacCaret:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(120,120,128,.16));}',
            '.dacBell[data-muted="true"]{color:var(--dsw-alias-label-caption,#71717a);}',
            // rev-14 · the bell wears the switch's own "on" paint (user request: "改成图片中的
            // 蓝色" — the blue of the enabled toggle in their screenshot). It is the SAME
            // token the switch and the volume slider already use, taken from `BELL_ON_BG`, so
            // "the bell is the same blue as the switch" holds by construction rather than by
            // two hex codes agreeing today; the console surface reports the same string and
            // the headless test compares them.
            //
            // Scope: only the AUDIBLE state (`data-muted="false"`) is filled. A muted session
            // keeps the caption-grey icon on a transparent button — the on=blue / off=grey
            // language the switch taught, plus the struck-through glyph, so colour is never
            // the only signal. The button also needs its own hover rule: the generic
            // `.dacBell:hover` above has the same specificity as the fill and would otherwise
            // make the blue flicker to grey under the pointer.
            '.dacBell[data-muted="false"]{background:' + BELL_ON_BG + ';color:' + BELL_ON_FG + ';}',
            '.dacBell[data-muted="false"]:hover{background:' + BELL_ON_BG_HOVER + ';}',
            '.dacBell:focus-visible,.dacCaret:focus-visible{box-shadow:0 0 0 3px color-mix(in srgb,',
            'var(--dsw-alias-state-business-primary,#2563eb) 35%,transparent);}',
            '.dacBell:disabled,.dacCaret:disabled{opacity:.5;cursor:not-allowed;}',
            // The popover is drawn by this plugin (position:fixed + getBoundingClientRect):
            // no portal and no third-party library, because this bundle may only
            // require react. It still borrows the host's layer/border/shadow tokens.
            '.dacPop{position:fixed;z-index:60;box-sizing:border-box;min-width:216px;max-width:288px;',
            'display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-radius:10px;',
            'border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));',
            'background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);',
            'box-shadow:0 10px 28px rgba(0,0,0,.28);font-size:12px;line-height:1.5;}',
            '.dacPopHead{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:500;}',
            '.dacPopRow{display:flex;align-items:center;gap:8px;}',
            '.dacPopRow label{display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;}',
            '.dacPop select,.dacPop button{font:inherit;color:inherit;border-radius:8px;padding:2px 8px;',
            'border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));background:transparent;cursor:pointer;}',
            // `.dacPop select option` needs no colors of its own any more: the fallback rule
            // above (and the `@supports` block) now names both selects in one selector list,
            // which is what keeps the two menus one design instead of two that agree today.
            '.dacPop input[type=range]{flex:1;min-width:96px;accent-color:var(--dsw-alias-state-business-primary,#2563eb);}',
            '.dacPop button:disabled,.dacPop select:disabled,.dacPop input:disabled{cursor:not-allowed;opacity:.5;}',
            '.dacPopValue{font-variant-numeric:tabular-nums;min-width:34px;text-align:right;}',
            '.dacPopError{color:var(--dsw-alias-state-error-primary,#dc2626);}',
            '.dacPopHint{color:var(--dsw-alias-label-tertiary,#71717a);font-size:11px;}',
          ].join('');
          if (document.head !== null && document.head !== undefined && typeof document.head.appendChild === 'function') {
            document.head.appendChild(style);
          }
        } catch (error) {
          warn('styles could not be injected: ' + describeError(error));
        }
      }

      /* ---------------------------------------------------------------- section */

      function describeAudio(t, snapshot) {
        if (snapshot.audio === 'running') return t('audioRunning') + (snapshot.unlocked ? ' · ' + t('unlocked') : '');
        if (snapshot.audio === 'suspended') return t('audioSuspended');
        if (snapshot.audio === 'unsupported') return t('audioUnsupported');
        if (snapshot.audio === 'error') return t('audioError') + (snapshot.lastError ? ' · ' + snapshot.lastError : '');
        return t('audioIdle');
      }

      /**
       * This plugin's settings section: the whole page 设置 → 通知提醒 opens.
       *
       * A `settings.section` component owns its page, so it draws its own heading, its
       * own intro line, and its own controls — no shipped UI toolkit is requireable
       * from a plugin bundle (dsh-client-ui-settings-plugins/lib/client.js exports only
       * apply/inject). The slot hands it the owner props (`close`, unused here — nothing
       * in this page leaves the settings panel) plus `props.t` when the entry's `locale`
       * option names a registered dictionary
       * (dsh-cordis-client-runner/lib/client.js:3897, :3899-3906). It subscribes to this
       * plugin's own snapshot store and writes through the bound settings scope.
       * `available === false` (nothing served yet, or a namespace the Host no longer
       * exposes) renders nothing, so the page can never present dead controls as live.
       */
      function ChimeSection(props) {
        var t = translator(props);
        var store = runtime.store;
        var state = React.useState(function () {
          return store === null ? initialSnapshot() : store.getSnapshot();
        });
        var snapshot = state[0];
        var setSnapshot = state[1];
        var draftState = React.useState(null);
        var draft = draftState[0];
        var setDraft = draftState[1];
        var errorState = React.useState('');
        var error = errorState[0];
        var setError = errorState[1];
        var importingState = React.useState(false);
        var importing = importingState[0];
        var setImporting = importingState[1];
        /** The hidden native file input the 导入 button drives. */
        var fileRef = React.useRef(null);

        React.useEffect(
          function () {
            if (store === null) return undefined;
            setSnapshot(store.getSnapshot());
            return store.subscribe(function () {
              setSnapshot(store.getSnapshot());
            });
          },
          [store],
        );

        if (snapshot.available !== true) return null;

        var writable = snapshot.writable === true;
        var view = {
          enabled: draft !== null && typeof draft.enabled === 'boolean' ? draft.enabled : snapshot.enabled === true,
          volume: draft !== null && typeof draft.volume === 'number' ? draft.volume : snapshot.volume,
          tone: draft !== null && typeof draft.tone === 'string' ? draft.tone : snapshot.tone,
        };

        function stage(patch) {
          var next = shallowCopy(draft === null ? view : draft);
          var keys = Object.keys(patch);
          for (var index = 0; index < keys.length; index += 1) next[keys[index]] = patch[keys[index]];
          setDraft(next);
        }

        /** Follow the platform's write semantics: one fenced write per field, then re-seed. */
        function commit(patch) {
          var scope = runtime.scope;
          if (scope === null || typeof scope.set !== 'function') {
            setError(t('writeDisabled'));
            return;
          }
          var fields = Object.keys(patch);
          var chain = Promise.resolve();
          var writeField = function (field, value) {
            chain = chain.then(function () {
              return scope.set(field, value);
            });
          };
          for (var index = 0; index < fields.length; index += 1) writeField(fields[index], patch[fields[index]]);
          chain.then(
            function () {
              setDraft(null);
              setError('');
            },
            function (failure) {
              setError(t('errorHint') + ': ' + describeError(failure));
              setDraft(null);
            },
          );
        }

        function resetToDefaults() {
          var scope = runtime.scope;
          if (scope === null || typeof scope.unset !== 'function') {
            setError(t('writeDisabled'));
            return;
          }
          var fields = ['enabled', 'volume', 'tone'];
          var chain = Promise.resolve();
          var clearField = function (field) {
            chain = chain.then(function () {
              return scope.unset(field);
            });
          };
          for (var index = 0; index < fields.length; index += 1) clearField(fields[index]);
          chain.then(
            function () {
              setDraft(null);
              setError('');
            },
            function (failure) {
              setError(t('errorHint') + ': ' + describeError(failure));
              setDraft(null);
            },
          );
        }

        function commitVolume() {
          if (draft === null || typeof draft.volume !== 'number') return;
          if (draft.volume === snapshot.volume) {
            setDraft(null);
            return;
          }
          commit({ volume: draft.volume });
        }

        /** Audible feedback while dragging; throttled so a drag is not a chord. */
        function previewDuringDrag(volume) {
          if (view.enabled !== true) return;
          var now = Date.now();
          if (now - counters.lastPreviewAt < PREVIEW_THROTTLE_MS) return;
          counters.lastPreviewAt = now;
          playPreview(view.tone, volume, true);
        }

        /**
         * The select's options: imported files first — in the order they were imported
         * — then the built-in tones. A selected tone whose file has gone still gets a
         * row, because a `<select>` whose value matches no option renders blank and
         * would hide exactly the state the user needs to see.
         */
        var roster = snapshot.custom !== null && Array.isArray(snapshot.custom) ? snapshot.custom : [];
        var options = [];
        for (var customIndex = 0; customIndex < roster.length; customIndex += 1) {
          options.push({ value: CUSTOM_PREFIX + roster[customIndex].id, label: roster[customIndex].name });
        }
        for (var toneIndex = 0; toneIndex < TONE_IDS.length; toneIndex += 1) {
          options.push({ value: TONE_IDS[toneIndex], label: t('tone.' + TONE_IDS[toneIndex]) });
        }
        var selectedKnown = false;
        for (var optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
          if (options[optionIndex].value === view.tone) selectedKnown = true;
        }
        if (!selectedKnown) options.unshift({ value: view.tone, label: t('toneMissing') });
        var selectedCustomId = isCustomTone(view.tone) ? view.tone.slice(CUSTOM_PREFIX.length) : null;

        /**
         * Import one audio file: upload its bytes to the Host half, then record it in
         * the roster and select it. The roster write is what makes it durable — the
         * file alone would be an orphan the card cannot name.
         */
        function onImport(event) {
          var input = event.target;
          var files = input === null || input === undefined ? null : input.files;
          var file = files !== null && files !== undefined && files.length > 0 ? files[0] : null;
          // Re-arm the control so choosing the same file twice still fires a change.
          if (input !== null && input !== undefined && 'value' in input) input.value = '';
          if (file === null) return;
          if (file.size > MAX_AUDIO_BYTES) {
            setError(t('importTooBig'));
            return;
          }
          if (roster.length >= CUSTOM_LIMIT) {
            // Refused BEFORE the upload: letting it through would store a file the roster
            // has no room to name, and the card would then present the new tone as
            // "（文件缺失）" — a lie about a file that really is there (R4-CAP).
            setError(t('importLimit'));
            return;
          }
          if (typeof fetch !== 'function') {
            setError(t('importUnsupported'));
            return;
          }
          setImporting(true);
          setError('');
          var succeed = function (entry) {
            // Re-read the roster at WRITE time instead of trusting the render-time copy:
            // two open tabs importing at once would otherwise each write their own
            // snapshot and one entry would vanish (R4-RACE; the residual window is a
            // documented limitation).
            var latest = effectiveSettings(readScopeSnapshot()).custom;
            setImporting(false);
            if (latest.length >= CUSTOM_LIMIT) {
              setError(t('importLimit'));
              deleteAudio(entry.id);
              return;
            }
            commit({ custom: latest.concat([entry]), tone: CUSTOM_PREFIX + entry.id });
            playPreview(CUSTOM_PREFIX + entry.id, view.volume, view.enabled === true);
          };
          var fail = function (failure) {
            setImporting(false);
            setError(t('importFailed') + ': ' + describeError(failure));
          };
          try {
            uploadAudio(file).then(succeed, fail);
          } catch (error) {
            // `uploadAudio` turns a synchronous `fetch` throw into a rejection; this keeps
            // the button from sticking on "导入中…" if that ever regresses (F1).
            fail(error);
          }
        }

        /** Drop one imported tone: forget its decoded buffer and the roster entry naming it. */
        function onRemove(id) {
          var next = roster.filter(function (entry) {
            return entry.id !== id;
          });
          delete samples.ready[id];
          delete samples.pending[id];
          deleteAudio(id);
          commit({ custom: next, tone: selectedCustomId === id ? FALLBACK.tone : view.tone });
        }

        var muted = [];
        if (snapshot.suppressedDisabled > 0) muted.push(t('mutedDisabled') + ' ×' + snapshot.suppressedDisabled);
        if (snapshot.suppressedSession > 0) muted.push(t('mutedSession') + ' ×' + snapshot.suppressedSession);
        if (snapshot.suppressedSilent > 0) muted.push(t('mutedSilent') + ' ×' + snapshot.suppressedSilent);
        if (snapshot.suppressedPolicy > 0) muted.push(t('mutedPolicy') + ' ×' + snapshot.suppressedPolicy);
        if (snapshot.suppressedUnsupported > 0) muted.push(t('mutedUnsupported'));
        if (snapshot.suppressedFailed > 0) muted.push(t('mutedFailed'));

        var children = [
          React.createElement(
            'div',
            { className: 'dacRow', key: 'enabled' },
            React.createElement(
              'label',
              { className: 'dacToggle' },
              React.createElement('input', {
                type: 'checkbox',
                checked: view.enabled === true,
                disabled: writable !== true,
                role: 'switch',
                'aria-checked': view.enabled === true,
                'aria-label': t('enabled'),
                onChange: function (event) {
                  var next = event.target.checked;
                  stage({ enabled: next });
                  commit({ enabled: next });
                  if (next) playPreview(view.tone, view.volume, true);
                },
              }),
              // The painted switch; the input above keeps the semantics. `data-on`
              // and `data-disabled` carry the state CSS cannot read from React.
              React.createElement(
                'span',
                {
                  className: 'dacSwitch',
                  'data-on': view.enabled === true ? 'true' : 'false',
                  'data-disabled': writable !== true ? 'true' : 'false',
                  'aria-hidden': 'true',
                },
                React.createElement('span', { className: 'dacKnob' }),
              ),
              React.createElement('span', { className: 'dacSwitchText' }, t('enabled')),
            ),
            !writable ? React.createElement('span', { className: 'dacBadge' }, t('writeDisabled')) : null,
            snapshot.userLayer ? React.createElement('span', { className: 'dacBadge' }, t('overridden')) : null,
          ),
          React.createElement(
            'div',
            { className: 'dacRow', key: 'volume' },
            React.createElement('span', { className: 'dacLabel' }, t('volume')),
            React.createElement('input', {
              type: 'range',
              min: 0,
              max: 100,
              step: 1,
              value: view.volume,
              disabled: writable !== true,
              'aria-label': t('volume'),
              onChange: function (event) {
                var next = clampVolume(event.target.value);
                stage({ volume: next });
                previewDuringDrag(next);
              },
              onPointerUp: commitVolume,
              onMouseUp: commitVolume,
              onTouchEnd: commitVolume,
              onKeyUp: commitVolume,
              onBlur: commitVolume,
            }),
            React.createElement('span', { className: 'dacValue' }, String(view.volume) + '%'),
          ),
          React.createElement(
            'div',
            { className: 'dacRow', key: 'tone' },
            React.createElement('span', { className: 'dacLabel' }, t('tone')),
            React.createElement(
              'select',
              {
                value: view.tone,
                disabled: writable !== true,
                'aria-label': t('tone'),
                onChange: function (event) {
                  var next = normalizeTone(event.target.value);
                  stage({ tone: next });
                  commit({ tone: next });
                  playPreview(next, view.volume, view.enabled === true);
                },
              },
              options.map(function (option) {
                return React.createElement('option', { key: option.value, value: option.value }, option.label);
              }),
            ),
            // The picker itself is hidden; the button below is what the user presses.
            React.createElement('input', {
              type: 'file',
              accept: 'audio/*',
              className: 'dacFile',
              ref: fileRef,
              onChange: onImport,
            }),
            React.createElement(
              'button',
              {
                type: 'button',
                disabled: writable !== true || importing === true,
                title: t('customHint'),
                onClick: function () {
                  var input = fileRef.current;
                  if (input !== null && input !== undefined && typeof input.click === 'function') input.click();
                },
              },
              importing === true ? t('importing') : t('import'),
            ),
            selectedCustomId === null
              ? null
              : React.createElement(
                  'button',
                  {
                    type: 'button',
                    disabled: writable !== true,
                    onClick: function () {
                      onRemove(selectedCustomId);
                    },
                  },
                  t('remove'),
                ),
            React.createElement(
              'button',
              {
                type: 'button',
                disabled: view.enabled !== true,
                onClick: function () {
                  playPreview(view.tone, view.volume, view.enabled === true);
                },
              },
              t('preview'),
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                disabled: writable !== true,
                onClick: resetToDefaults,
              },
              t('reset'),
            ),
          ),
          React.createElement(
            'div',
            { className: 'dacStats', key: 'stats' },
            React.createElement('span', null, t('statsTriggered') + ': ' + String(snapshot.triggers)),
            React.createElement('span', null, t('statsLast') + ': ' + (snapshot.lastAt > 0 ? formatClock(snapshot.lastAt) : t('statsNever'))),
            React.createElement(
              'span',
              null,
              t('statsSound') + ': ' + (snapshot.lastTone === '' ? '—' : snapshot.lastTone + ' / ' + String(snapshot.lastVolume) + '%') + (snapshot.lastGain === null ? '' : ' (gain ' + String(Math.round(snapshot.lastGain * 1000) / 1000) + ')'),
            ),
            React.createElement('span', null, t('statsSeen') + ': ' + String(snapshot.approvalsSeen)),
            React.createElement('span', null, t('statsAudio') + ': ' + describeAudio(t, snapshot)),
          ),
        ];
        if (muted.length > 0) children.push(React.createElement('div', { className: 'dacHint', key: 'muted' }, muted.join(' · ')));
        if (snapshot.mode === 'memory') children.push(React.createElement('div', { className: 'dacHint', key: 'memory' }, t('memoryHint')));
        if (error !== '') children.push(React.createElement('div', { className: 'dacError', key: 'error' }, error));
        // One page-level heading, and it is the section's own title — the controls
        // below no longer carry a second title of their own. `data-plugin` stays on the
        // outermost element so a browser probe can find this whole page.
        return React.createElement('section', { className: 'dacSection', 'data-plugin': PLUGIN_ID }, [
          React.createElement(
            'div',
            { className: 'dacHead', key: 'head' },
            React.createElement('h2', { className: 'dacTitle' }, t('title')),
            React.createElement('span', { className: 'dacRev' }, snapshot.bundleRevision),
          ),
          React.createElement('p', { className: 'dacIntro', key: 'intro' }, t('intro')),
          React.createElement('div', { className: 'dacCard', key: 'controls' }, children),
        ]);
      }

      /* ------------------------------------------------------ session bell (rev-10) */

      /** Estimated popover box; used for the flip decision before it is laid out. */
      var POPOVER_WIDTH = 248;
      var POPOVER_HEIGHT = 184;

      /**
       * The bell, in one of its two states: a solid bell, or the same bell struck
       * through. Inline SVG, so the icon costs no request and inherits `currentColor`
       * (which is what lets the muted state dim it with one CSS rule).
       */
      function bellIcon(muted) {
        var paths = [
          React.createElement('path', {
            key: 'bell',
            d: 'M8 1.7A3.3 3.3 0 0 0 4.7 5v2.2L3.5 9.6h9L11.3 7.2V5A3.3 3.3 0 0 0 8 1.7Z',
            fill: 'currentColor',
          }),
          React.createElement('path', { key: 'clapper', d: 'M6.5 11a1.5 1.5 0 0 0 3 0Z', fill: 'currentColor' }),
        ];
        if (muted === true) {
          paths.push(
            React.createElement('path', {
              key: 'slash',
              className: 'dacSlash',
              d: 'M2.6 2.6 13.4 13.4',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: '1.7',
              strokeLinecap: 'round',
            }),
          );
        }
        return React.createElement(
          'svg',
          {
            viewBox: '0 0 16 16',
            width: BELL_GLYPH_PX,
            height: BELL_GLYPH_PX,
            'aria-hidden': 'true',
            focusable: 'false',
          },
          paths,
        );
      }

      /** The caret that opens the per-session popover; its size comes from the constants. */
      function caretIcon() {
        return React.createElement(
          'svg',
          {
            viewBox: '0 0 8 12',
            width: CARET_GLYPH_W,
            height: CARET_GLYPH_H,
            'aria-hidden': 'true',
            focusable: 'false',
          },
          React.createElement('path', {
            d: 'M1 1.5 6 6l-5 4.5',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: '1.4',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }),
        );
      }

      /**
       * The bell's tooltip and accessible name.
       *
       * Both languages, ALWAYS — read straight out of the two dictionary blocks, not
       * through `props.t` (which answers one locale): a user who switched the UI to
       * English must still be able to read the Chinese wording this plugin's
       * documentation uses, and vice versa.
       */
      function sessionLabel(on) {
        var key = on === true ? 'sessionOn' : 'sessionOff';
        return DICT.zh[key] + ' · ' + DICT.en[key];
      }

      /**
       * Where the popover goes: `position:fixed` at the wrapper's own rect, flipped
       * above the bell when the viewport has no room below.
       *
       * Deliberately not a portal (this bundle may only require react) and not an
       * absolutely-positioned child (the header row clips nothing, but an overlay must
       * not scroll with the header either). The rect is read during render from the
       * wrapper that already exists, so opening shows the box in place on the first
       * frame; the effect below re-measures on resize/scroll.
       */
      function popoverPosition(anchor) {
        var base = { position: 'fixed', left: 0, top: 0, width: POPOVER_WIDTH, zIndex: 60 };
        if (anchor === null || anchor === undefined || typeof anchor.getBoundingClientRect !== 'function') return base;
        var rect = anchor.getBoundingClientRect();
        if (rect === null || rect === undefined) return base;
        var width = typeof window !== 'undefined' && typeof window.innerWidth === 'number' && window.innerWidth > 0 ? window.innerWidth : 0;
        var height = typeof window !== 'undefined' && typeof window.innerHeight === 'number' && window.innerHeight > 0 ? window.innerHeight : 0;
        var left = rect.left;
        if (width > 0) left = Math.min(Math.max(8, left), Math.max(8, width - POPOVER_WIDTH - 8));
        var below = rect.bottom + 6;
        var openUp = height > 0 && below + POPOVER_HEIGHT > height - 8 && rect.top - POPOVER_HEIGHT - 6 > 0;
        return {
          position: 'fixed',
          left: left,
          top: openUp ? rect.top - POPOVER_HEIGHT - 6 : below,
          width: POPOVER_WIDTH,
          zIndex: 60,
        };
      }

      /**
       * The per-session bell in the session header (rev-10).
       *
       * Registered into `conversation.session.header.actions`
       * (docs/契约调研.md §L.1): a session-scoped LIST slot, so the entry gets the
       * standard Session props — including `sessionId` — and its own `id`/`order`
       * (`approval-chime` / 30; the shipped occupants sit at -10/10/20).
       *
       * The bell shows the state THIS session will ring with — `override ?? global` —
       * so with the global switch off every bell is struck through, which is exactly
       * what happens. Clicking flips the session's own override: audible → writes
       * `enabled:false` (mute this session only), muted → clears the override (follow
       * the global switch again). There is deliberately no "force on" state: a session
       * can go quieter than the global setting, never louder.
       */
      function SessionChimeAction(props) {
        var t = translator(props);
        var store = runtime.store;
        var state = React.useState(function () {
          return store === null ? initialSnapshot() : store.getSnapshot();
        });
        var snapshot = state[0];
        var setSnapshot = state[1];
        var openState = React.useState(false);
        var open = openState[0];
        var setOpen = openState[1];
        var draftState = React.useState(null);
        var draftVolume = draftState[0];
        var setDraftVolume = draftState[1];
        var tickState = React.useState(0);
        var setTick = tickState[1];
        var rootRef = React.useRef(null);
        var caretRef = React.useRef(null);
        var sessionId = props !== null && props !== undefined && typeof props.sessionId === 'string' ? props.sessionId : '';

        React.useEffect(
          function () {
            if (store === null) return undefined;
            setSnapshot(store.getSnapshot());
            return store.subscribe(function () {
              setSnapshot(store.getSnapshot());
            });
          },
          [store],
        );

        /**
         * Open-state side effects: dismiss on an outside pointer press, on Escape,
         * and re-measure when the viewport moves under the box. Both listeners live on
         * `document` because the popover is painted outside the header row's flow.
         */
        React.useEffect(
          function () {
            if (open !== true) return undefined;
            var doc = typeof document === 'undefined' ? null : document;
            var win = typeof window === 'undefined' ? null : window;
            var close = function () {
              setOpen(false);
            };
            var onPointerDown = function (event) {
              var root = rootRef.current;
              var inside = root !== null && root !== undefined && typeof root.contains === 'function' && event !== null && event !== undefined && root.contains(event.target);
              if (inside === true) return;
              close();
            };
            var onKeyDown = function (event) {
              if (event === null || event === undefined || event.key !== 'Escape') return;
              close();
              var trigger = caretRef.current;
              if (trigger !== null && trigger !== undefined && typeof trigger.focus === 'function') trigger.focus();
            };
            var onReflow = function () {
              setTick(function (value) {
                return value + 1;
              });
            };
            if (doc !== null && typeof doc.addEventListener === 'function') {
              doc.addEventListener('pointerdown', onPointerDown, true);
              doc.addEventListener('mousedown', onPointerDown, true);
              doc.addEventListener('keydown', onKeyDown, true);
            }
            if (win !== null && typeof win.addEventListener === 'function') {
              win.addEventListener('resize', onReflow);
              win.addEventListener('scroll', onReflow, true);
            }
            return function () {
              if (doc !== null && typeof doc.removeEventListener === 'function') {
                doc.removeEventListener('pointerdown', onPointerDown, true);
                doc.removeEventListener('mousedown', onPointerDown, true);
                doc.removeEventListener('keydown', onKeyDown, true);
              }
              if (win !== null && typeof win.removeEventListener === 'function') {
                win.removeEventListener('resize', onReflow);
                win.removeEventListener('scroll', onReflow, true);
              }
            };
          },
          [open],
        );

        // No session id means no session to toggle. Rendering a bell that cannot act
        // would be worse than an empty cell, and the slot tolerates an empty cell.
        // An UNREAD table (the Host route not answered yet) still renders the bell:
        // "no overrides" is the honest state then, and the popover reports a refused
        // write instead of the feature silently missing from the header.
        if (sessionId === '') return null;

        var view = sessionSettings(sessionId);
        var on = view.enabled === true;
        var label = sessionLabel(on);

        var record = sessionRecord(sessionId);
        var storedTone = record !== null && typeof record.tone === 'string' ? record.tone : '';
        var toneOptions = [{ value: '', label: t('sessionFollow') }];
        var roster = view.globals.custom;
        for (var customIndex = 0; customIndex < roster.length; customIndex += 1) {
          toneOptions.push({ value: CUSTOM_PREFIX + roster[customIndex].id, label: roster[customIndex].name });
        }
        for (var toneIndex = 0; toneIndex < TONE_IDS.length; toneIndex += 1) {
          toneOptions.push({ value: TONE_IDS[toneIndex], label: t('tone.' + TONE_IDS[toneIndex]) });
        }
        var knownTone = storedTone === '';
        for (var optionIndex = 0; optionIndex < toneOptions.length; optionIndex += 1) {
          if (toneOptions[optionIndex].value === storedTone) knownTone = true;
        }
        if (!knownTone) toneOptions.splice(1, 0, { value: storedTone, label: t('sessionMissing') });

        var volumeOverridden = view.overridden.volume === true;
        var shownVolume = draftVolume !== null && typeof draftVolume === 'number' ? draftVolume : view.volume;

        function toggle() {
          toggleSession(sessionId);
        }

        function commitVolume(value) {
          var next = clampVolume(value);
          setDraftVolume(null);
          if (next === view.volume && volumeOverridden === true) return;
          writeSessionPatch(sessionId, { volume: next });
        }

        var bell = React.createElement(
          'button',
          {
            type: 'button',
            className: 'dacBell',
            key: 'bell',
            'data-plugin': PLUGIN_ID,
            'data-session': sessionId,
            'data-muted': on === true ? 'false' : 'true',
            title: label,
            'aria-label': label,
            'aria-pressed': on,
            onClick: toggle,
          },
          bellIcon(on !== true),
        );

        var caret = React.createElement(
          'button',
          {
            type: 'button',
            className: 'dacCaret',
            key: 'caret',
            ref: caretRef,
            title: t('sessionMore'),
            'aria-label': t('sessionMore'),
            'aria-expanded': open === true,
            'data-open': open === true ? 'true' : 'false',
            onClick: function () {
              setOpen(open !== true);
            },
          },
          caretIcon(),
        );

        var popover = null;
        if (open === true) {
          var rows = [
            React.createElement(
              'div',
              { className: 'dacPopHead', key: 'head' },
              React.createElement('span', null, label),
              React.createElement(
                'button',
                {
                  type: 'button',
                  key: 'reset',
                  'data-action': 'follow-global',
                  disabled: view.overridden.enabled !== true && volumeOverridden !== true && view.overridden.tone !== true,
                  onClick: function () {
                    setDraftVolume(null);
                    writeSessionPatch(sessionId, { enabled: null, volume: null, tone: null });
                  },
                },
                t('sessionReset'),
              ),
            ),
            React.createElement(
              'div',
              { className: 'dacPopRow', key: 'tone' },
              React.createElement('span', null, t('tone')),
              React.createElement(
                'select',
                {
                  value: storedTone,
                  'aria-label': t('tone'),
                  onChange: function (event) {
                    var next = event.target.value;
                    writeSessionPatch(sessionId, { tone: next === '' ? null : normalizeTone(next) });
                  },
                },
                toneOptions.map(function (option) {
                  return React.createElement('option', { key: option.value, value: option.value }, option.label);
                }),
              ),
            ),
            React.createElement(
              'div',
              { className: 'dacPopRow', key: 'volume' },
              React.createElement('span', null, t('volume')),
              React.createElement(
                'label',
                null,
                React.createElement('input', {
                  type: 'checkbox',
                  'data-field': 'volume-follow',
                  checked: volumeOverridden !== true,
                  'aria-label': t('sessionFollowVolume'),
                  onChange: function (event) {
                    var follow = event.target.checked === true;
                    setDraftVolume(null);
                    writeSessionPatch(sessionId, { volume: follow ? null : view.volume });
                  },
                }),
                t('sessionFollowVolume'),
              ),
              React.createElement('input', {
                type: 'range',
                min: 0,
                max: 100,
                step: 1,
                value: shownVolume,
                disabled: volumeOverridden !== true,
                'aria-label': t('volume'),
                onChange: function (event) {
                  setDraftVolume(clampVolume(event.target.value));
                },
                onPointerUp: function () {
                  commitVolume(shownVolume);
                },
                onMouseUp: function () {
                  commitVolume(shownVolume);
                },
                onKeyUp: function () {
                  commitVolume(shownVolume);
                },
                onBlur: function () {
                  commitVolume(shownVolume);
                },
              }),
              React.createElement('span', { className: 'dacPopValue' }, String(shownVolume) + '%'),
            ),
          ];
          if (view.globals.enabled !== true) {
            rows.push(React.createElement('div', { className: 'dacPopHint', key: 'globalOff' }, t('sessionGlobalOff')));
          }
          if (view.customMissing === true) {
            rows.push(React.createElement('div', { className: 'dacPopHint', key: 'missing' }, t('sessionMissing')));
          }
          rows.push(React.createElement('div', { className: 'dacPopHint', key: 'hint' }, t('sessionHint')));
          if (snapshot.sessionsError !== '') {
            rows.push(React.createElement('div', { className: 'dacPopError', key: 'error' }, t('sessionError') + ': ' + snapshot.sessionsError));
          }
          popover = React.createElement(
            'div',
            {
              className: 'dacPop',
              key: 'pop',
              role: 'dialog',
              'data-plugin': PLUGIN_ID,
              'data-session': sessionId,
              'aria-label': t('sessionMore'),
              style: popoverPosition(rootRef.current),
            },
            rows,
          );
        }

        return React.createElement('span', { className: 'dacBellWrap', ref: rootRef, 'data-plugin': PLUGIN_ID, 'data-tick': tickState[0] }, [
          bell,
          caret,
          popover,
        ]);
      }

      /* ------------------------------------------------------------ diagnostics */

      /**
       * Console/file-based self-verification surface (documented in README). It is
       * the only reason the headless browser-half test can assert what the sound
       * engine really did — a chime has no DOM representation.
       */
      var diagnostics = {
        plugin: PLUGIN_ID,
        revision: REVISION,
        namespace: NS,
        /** The slot this bundle registers into; the same key it exposes to the console. */
        slot: 'settings.section',
        /** The session-header slot the bell registers into (rev-10). */
        sessionSlot: SESSION_SLOT,
        /** The bell's cell key and position among the header actions. */
        sessionAction: { id: SESSION_ACTION_ID, order: SESSION_ACTION_ORDER },
        /**
         * The header control's geometry (rev-13; the gap is rev-16). The CSS box, the SVG
         * glyph sizes and the bell↔caret gap are built from these same constants, so the
         * headless test can assert what the browser was handed instead of grepping for a
         * number that might drift.
         */
        sessionIcon: {
          bellBoxPx: BELL_BOX_PX,
          caretBoxPx: CARET_BOX_PX,
          bellGlyphPx: BELL_GLYPH_PX,
          caretGlyph: String(CARET_GLYPH_W) + 'x' + String(CARET_GLYPH_H),
          /** rev-16: the gap between the bell button and the caret beside it. */
          bellGapPx: BELL_GAP_PX,
          /** rev-17: how far the caret glyph turns while the popover is open. */
          caretOpenRotateDeg: CARET_OPEN_ROTATE_DEG,
          /** rev-17: how long that turn takes — the CSS transition duration is built from it. */
          caretRotateMs: CARET_ROTATE_MS,
          /** rev-14: the audible bell's paint — the same token the switch/slider use. */
          onBackground: BELL_ON_BG,
          onForeground: BELL_ON_FG,
          onBackgroundHover: BELL_ON_BG_HOVER,
        },
        /**
        /**
         * rev-18, re-scoped by rev-20: what does THIS page's platform say about
         * `(prefers-reduced-motion: reduce)` right now?
         *
         * ENVIRONMENT REPORT ONLY. Since rev-20 no part of this bundle branches on the answer: the
         * caret turns for the same `CARET_ROTATE_MS` whether this returns true or false, so the
         * value must not be read as "my environment changed the animation". It is kept because
         * "which environment is this tab in?" is still the first question to ask when a device
         * report cannot be reproduced on a machine whose own setting differs.
         *
         * Read LIVE on every call: a user can flip reduced motion while the page is open,
         * so a value snapshotted when the diagnostics were installed would answer a
         * question nobody asked. Deliberately NOT a member of `sessionIcon` — that object
         * is the header control's geometry snapshot, and a media-query answer is not
         * geometry.
         *
         * A platform whose `window` has no `matchMedia` (the headless stub in this repo is
         * one) is not a reduced-motion environment, so this answers `false` instead of
         * throwing.
         */
        reduceMotion: function () {
          try {
            if (typeof window.matchMedia !== 'function') return false;
            var query = window.matchMedia('(prefers-reduced-motion: reduce)');
            return Boolean(query && query.matches);
          } catch (error) {
            // A `matchMedia` that throws is "no preference", never a crash.
            return false;
          }
        },
        /** Milliseconds between two chimes of one batch. */
        batchGapMs: BATCH_GAP_MS,
        masterGain: MASTER_GAIN,
        tones: TONE_IDS.slice(),
        customPrefix: CUSTOM_PREFIX,
        toneRows: TONE_ROWS,
        /** The popover's tone list is one row longer: it also offers 跟随全局 (rev-12). */
        sessionToneRows: SESSION_TONE_ROWS,
        /**
         * The metrics both tone lists share (rev-12). One source for the two menus, so
         * "the session list looks like the card's" can be checked from the console and
         * asserted by the headless test instead of eyeballed per theme.
         */
        pickerMetrics: {
          rowPx: TONE_ROW_PX,
          textPx: TONE_PICKER_TEXT_PX,
          slackPx: TONE_PICKER_SLACK_PX,
          cardMaxPx: TONE_ROWS * TONE_ROW_PX,
          sessionMaxPx: SESSION_TONE_ROWS * TONE_ROW_PX + TONE_PICKER_SLACK_PX,
        },
        fallback: { enabled: FALLBACK.enabled, volume: FALLBACK.volume, tone: FALLBACK.tone },
        /** The exact request the 导入 button makes, for the headless harness. */
        upload: function (file) {
          return uploadAudio(file);
        },
        /** The imported roster as the section resolves it, in render order. */
        custom: function () {
          return effectiveSettings(readScopeSnapshot()).custom;
        },
        /** Option values in the order the select renders them: imports first. */
        toneOptions: function () {
          var values = effectiveSettings(readScopeSnapshot()).custom.map(function (entry) {
            return CUSTOM_PREFIX + entry.id;
          });
          return values.concat(TONE_IDS.slice());
        },
        stats: function () {
          return shallowCopy(counters);
        },
        audio: function () {
          return { state: audio.state, unlocked: audio.unlocked, lastError: audio.lastError };
        },
        settings: function () {
          return effectiveSettings(readScopeSnapshot());
        },
        /**
         * The per-session table as the Host last answered it, plus whether that read
         * succeeded. With nothing read yet (or when the first read fails) it answers
         * `{ ready: false, sessions: {} }` — the same "every session follows the global
         * settings" state the plugin acts on. A read that fails after a table is known
         * keeps that table and reports the reason on `error` (rev-15, fixes OBS-A).
         */
        sessions: function () {
          var copy = {};
          var ids = Object.keys(sessions.table);
          for (var index = 0; index < ids.length; index += 1) copy[ids[index]] = shallowCopy(sessions.table[ids[index]]);
          return { ready: sessions.ready, revision: sessions.revision, error: sessions.error, sessions: copy };
        },
        /**
         * rev-11: how many session writes are still in flight. Zero means the convergence
         * re-read has been issued — when it landed, the table equals the Host file (that is
         * the convergence point). A re-read that FAILED also leaves zero here, with the last
         * known table kept and its reason on `sessions().error` (rev-15).
         */
        sessionWrites: function () {
          return { outstanding: sessionWrites.outstanding };
        },
        /** What ONE session will actually use: `override ?? global`, field by field. */
        sessionSettings: function (sessionId) {
          var view = sessionSettings(typeof sessionId === 'string' ? sessionId : '');
          return {
            sessionId: view.sessionId,
            enabled: view.enabled,
            volume: view.volume,
            tone: view.tone,
            overridden: view.overridden,
            customMissing: view.customMissing,
            globals: { enabled: view.globals.enabled, volume: view.globals.volume, tone: view.globals.tone },
          };
        },
        /** Drive one session's optimistic write exactly the way the bell does. */
        toggleSession: function (sessionId) {
          return toggleSession(sessionId);
        },
        /** Re-read the per-session table from the Host. */
        refreshSessions: function () {
          return refreshSessions();
        },
        snapshot: function () {
          return runtime.store === null ? null : runtime.store.getSnapshot();
        },
        unlock: function () {
          return attemptUnlock('diagnostics');
        },
        preview: function () {
          var settings = effectiveSettings(readScopeSnapshot());
          return playPreview(settings.tone, settings.volume, settings.enabled);
        },
      };
      try {
        window.__DSH_APPROVAL_CHIME__ = diagnostics;
      } catch (error) {
        warn('diagnostics surface could not be installed: ' + describeError(error));
      }

      /* ---------------------------------------------------------------- lifecycle */

      /**
       * Services this bundle actually uses:
       *   slots         — the slot registry: `settings.section` for the page and
       *                   `conversation.session.header.actions` for the bell,
       *   locale        — the copy dictionary the Host binds for `props.t`, and the
       *                   translator the nav-label thunk resolves through,
       *   settingsScope — bind/set/unset for the namespace the Host registers,
       *   uiSession     — the pending-interaction source the chime watches.
       * `remote` is deliberately ABSENT: this plugin registers nothing on the
       * approval waterfall.
       */
      var inject = ['slots', 'locale', 'settingsScope', 'uiSession'];

      /**
       * Mount the chime and the section page. Every part is independently guarded and
       * the whole body is guarded once more: a UI plugin that cannot mount must
       * cost the user its own feature and nothing else.
       */
      function apply(ctx) {
        try {
          applyInner(ctx);
        } catch (error) {
          warn('apply() failed: ' + describeError(error));
        }
      }

      function applyInner(ctx) {
        runtime.store = createStore(initialSnapshot());
        injectStyles();

        var scope = null;
        try {
          scope = ctx.settingsScope.bind({ namespace: NS });
          runtime.scope = scope;
        } catch (error) {
          warn('settings scope could not be bound: ' + describeError(error));
        }

        if (scope !== null && typeof scope.subscribe === 'function') {
          ctx.effect(
            function () {
              var off = scope.subscribe(function () {
                publish();
              });
              publish();
              return function () {
                try {
                  off();
                } catch (error) {
                  warn('settings unsubscribe failed: ' + describeError(error));
                }
              };
            },
            PLUGIN_ID + ': settings mirror',
          );
        } else {
          publish();
        }

        ctx.effect(
          function () {
            return startApprovalWatch(ctx);
          },
          PLUGIN_ID + ': approval chime',
        );

        ctx.effect(function () {
          bindGestureUnlock();
          return function () {
            if (typeof audio.releaseGesture === 'function') audio.releaseGesture();
          };
        }, PLUGIN_ID + ': audio unlock');

        ctx.effect(
          function () {
            // The per-session table is Host state, not page state: read it once now so
            // the header bells and the first chime already know it. The promise never
            // rejects (a failed read degrades to "no overrides"), so nothing needs a
            // rejection handler here.
            refreshSessions();
            return function () {
              cancelPendingChimes();
            };
          },
          PLUGIN_ID + ': session overrides',
        );

        try {
          ctx.effect(
            function () {
              return ctx.locale.register(NS, DICT);
            },
            PLUGIN_ID + ': dictionaries',
          );
        } catch (error) {
          warn('dictionary registration failed: ' + describeError(error));
        }

        try {
          // A nav label is projected with no props, so grab the platform's translator
          // for NS once. Failing here only costs localization of the nav row (the thunk
          // falls back to the bundled copy); the section itself still registers.
          if (ctx.locale !== null && ctx.locale !== undefined && typeof ctx.locale.bind === 'function') {
            var bound = ctx.locale.bind(NS);
            if (typeof bound === 'function') runtime.translate = bound;
          }
        } catch (error) {
          warn('locale translator could not be bound: ' + describeError(error));
        }

        try {
          // `inject` waits for the slot to be DECLARED by its owner: registering
          // against an undeclared slot throws at load time. `settings.section` is a
          // root-scope LIST slot declared by the settings shell
          // (dsh-client-ui-settings-general/lib/client.js:621-624), so the entry needs
          // its own `id`: reusing a shipped one ('general'/'models'/'plugins'/
          // 'agent-presets') would REPLACE that row instead of adding one
          // (…/lib/client.js:566-571 reads `id`/`order`/`label` per row). `order: 16`
          // sits right after 插件 (15, dsh-client-ui-settings-plugins/lib/client.js:1764)
          // and before Agent 预设 (20, dsh-cordis-client-runner/lib/client.js:3912).
          ctx.slots.inject('settings.section', function () {
            return ctx.slots.register(
              {
                name: 'settings.section',
                id: 'approval-chime',
                order: 16,
                label: navLabel,
                locale: NS,
              },
              ChimeSection,
            );
          });
        } catch (error) {
          warn('section registration failed: ' + describeError(error));
        }

        try {
          // rev-10: the bell in the session header. `conversation.session.header.actions`
          // is a session-scoped LIST slot declared by the conversation header
          // (dsh-cordis-client-runner/lib/client.js:3102-3157, docs/契约调研.md §L.1), so
          // the entry needs its own `id` — reusing a shipped one ('agent-preset' /
          // 'job-list' / 'schedule-catalog' / 'agent-team') would REPLACE that cell —
          // and `order: 30` lands after all of them (-10/10/20) with no collision.
          // `locale: NS` binds `props.t` for the popover copy, and the owner hands every
          // entry the standard Session props, `sessionId` included.
          ctx.slots.inject(SESSION_SLOT, function () {
            return ctx.slots.register(
              {
                name: SESSION_SLOT,
                id: SESSION_ACTION_ID,
                order: SESSION_ACTION_ORDER,
                locale: NS,
              },
              SessionChimeAction,
            );
          });
        } catch (error) {
          warn('session bell registration failed: ' + describeError(error));
        }
      }

      return { name: PLUGIN_ID, inject: inject, apply: apply };
    },
  });
})();
