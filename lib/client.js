/**
 * Browser half of dsh-approval-chime.
 *
 * Loaded by the Host as a CLASSIC script (a plain `<script src>`), so this file
 * must contain no top-level `import`/`export`; everything lives inside the
 * factory closure below. `id` must equal the package name, because the module
 * graph keys rows by package name (dsh-client-modules/lib/index.js:813-835).
 *
 * WHAT IT DOES
 *   1. Watches the session pending-interaction source for a NEW approval and
 *      plays a short synthesised chime.
 *   2. Registers one page of its own under the `settings.section` list slot, which
 *      is what puts 设置 → 通知提醒 in the settings navigation (private id
 *      `approval-chime`, order 16). The page carries the enable switch, the 0..100
 *      volume slider, the tone picker, the import/remove/preview controls, the
 *      reset-to-defaults action, and the visible trigger counters.
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
      var REVISION = 'rev-9 · slim switch';

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
        /** Chimes the browser refused to make audible (no WebAudio, broken context). */
        suppressedUnsupported: 0,
        suppressedFailed: 0,
        /** Chimes rendered while the AudioContext was still suspended (autoplay policy). */
        suppressedPolicy: 0,
        lastPreviewAt: 0,
      };

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
       * Chime once per newly appeared approval.
       *
       * The snapshot is a Map replaced wholesale and its element references are
       * stable, so change detection is a `key` diff, not a "did it notify" test: a
       * re-publication for any unrelated reason must not ring again, and a
       * replacement request is a new key and therefore rings exactly once.
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
        var sync = function (reason) {
          var snapshot;
          try {
            snapshot = source.getSnapshot();
          } catch (error) {
            warn('pendingInteractions snapshot failed: ' + describeError(error));
            return;
          }
          if (snapshot === null || snapshot === undefined || typeof snapshot.forEach !== 'function') return;
          var fresh = 0;
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
              fresh += 1;
            });
          } catch (error) {
            warn('pendingInteractions snapshot unreadable: ' + describeError(error));
            return;
          }
          if (fresh === 0) return;
          // Several sessions can be waiting at once; one chime covers the batch.
          var settings = effectiveSettings(readScopeSnapshot());
          chime({ enabled: settings.enabled, volume: settings.volume, tone: settings.tone, source: 'approval' });
        };
        var dispose = function () {
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
          suppressedUnsupported: 0,
          suppressedFailed: 0,
          suppressedPolicy: 0,
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
          draft.suppressedUnsupported = counters.suppressedUnsupported;
          draft.suppressedFailed = counters.suppressedFailed;
          draft.suppressedPolicy = counters.suppressedPolicy;
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
          intro: '宿主向你申请权限时响一次（不改变审批面板的行为）',
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
            '@media (prefers-reduced-motion:reduce){.dacSwitch,.dacKnob{transition:none;}}',
            '.dacLabel{min-width:52px;color:var(--dsw-alias-label-secondary,#3f3f46);}',
            '.dacCard input[type=range]{flex:1;min-width:160px;accent-color:var(--dsw-alias-state-business-primary,#2563eb);}',
            '.dacCard select,.dacCard button{font:inherit;color:inherit;border-radius:8px;padding:3px 9px;',
            'border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));background:transparent;cursor:pointer;}',
            // The expanded <select> popup is painted by the browser, not by the card, so its
            // items need their colors stated explicitly: without this the list keeps the
            // user agent's light default and the item text washes out on a dark theme. Both
            // values come from the same tokens the card itself uses, so the menu matches its
            // surroundings in either theme instead of hard-coding a dark palette.
            '.dacCard select option{background-color:var(--dsw-alias-bg-layer-1,#fff);',
            'color:var(--dsw-alias-label-primary,#1a1a1a);}',
            // The UA paints a native <select> popup as a square-cornered box and exposes no
            // way to clip it — `border-radius` on the options cannot round the container. So
            // we opt into the customizable-select rendering, which hands the popup to CSS
            // while keeping native semantics and keyboard behaviour. Browsers without it
            // simply ignore this block and keep the colored-but-square popup above.
            '@supports (appearance:base-select){',
            '.dacCard select{appearance:base-select;}',
            '.dacCard select::picker(select){appearance:base-select;margin-top:4px;padding:4px;',
            'border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));border-radius:10px;',
            'background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);',
            'box-shadow:0 10px 28px rgba(0,0,0,.28);',
            // Exactly TONE_ROWS rows, then it scrolls. Two details make this exact:
            //   * `box-sizing:content-box` — the UA stylesheet gives `::picker(select)`
            //     `border-box`, so the previous `92px` box with 8px padding and a 2px
            //     border left only 82px of content: the DEFAULT three-tone list already
            //     showed a scrollbar and clipped its third row by 2px, i.e. the opposite
            //     of the requirement (found in review round 2, R5-1).
            //   * the row height is pinned below (20px line box + 4px padding twice), so
            //     the arithmetic cannot drift with the theme's font metrics.
            'box-sizing:content-box;max-height:' + String(TONE_ROWS * TONE_ROW_PX) + 'px;',
            'overflow-x:hidden;overflow-y:auto;}',
            '.dacCard select option{border-radius:7px;padding:4px 9px;line-height:' + String(TONE_ROW_PX - 8) + 'px;}',
            '.dacCard select option:hover,.dacCard select option:checked{',
            'background:color-mix(in srgb,currentColor 14%,transparent);}',
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
        masterGain: MASTER_GAIN,
        tones: TONE_IDS.slice(),
        customPrefix: CUSTOM_PREFIX,
        toneRows: TONE_ROWS,
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
       *   slots         — the settings-section slot registry,
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
      }

      return { name: PLUGIN_ID, inject: inject, apply: apply };
    },
  });
})();
