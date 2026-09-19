# rev-4「导入自定义音频」浏览器侧独立验证报告（任务 t1 · verifier）

> **一句话结论**：rev-4 新增的浏览器侧（`lib/client.js`）在本轮 **7 条 claim 的可验证部分全部独立通过、0 条被证伪**；其中 claim 5 与 claim 7 各有一部分子项（引擎级"不执行"、真实渲染/降级语义）因**本机无浏览器、无 React** 只能给出结构性证据，已单独列为**未证实**（§4，没有写成通过）。
> 自写探针共 **262 项独立断言**（39+48+38+65+27+45）全部通过，另有 1 个探针（probe-13）专门记录"环境让哪些测量无法完成"（11/14，3 项失败全部是环境限制，不是被测实现）。
> 发现 **1 个 medium 健壮性缺口 + 5 个 low 缺陷 + 3 条设计性观察**（§3），均可用最小复现复现；未发现会影响 rev-4 主流程（导入→选中→播放→移除）的缺陷。

**独立性声明**：本报告的探针代码在 `dsh-approval-chime/verify-independent/`，**未 import `verify/_harness.mjs` 的任何一行**（那是实现者自测的桩）；`kit/platform.mjs` 是本人上一轮（任务 t3）独立验证时自写的 kit，`kit/rev4.mjs`、`kit/cdp.mjs` 为本轮新写。被测对象只有真实文件 `lib/client.js`（以 `<script src>` 方式在 `node:vm` 里执行）与 `lib/index.js`（真实 ESM import），没有修改 `lib/**` 与 `verify/**`。

---

## 0. 取证环境与被测修订

| 项 | 值 |
| --- | --- |
| 节点 | `node v24.21.0`（`node --version`） |
| Shell / 权限 | Windows PowerShell 5.1；DSH 沙箱 `workspace-write`，**审批提示已禁用**（无法临时放开以启动浏览器） |
| 工作区 | `<workspace>` |
| 被测文件 SHA-256（验证前后一致，未变动） | `lib\client.js` 66998 B `A4E452380184C0FB3EC4F4094B18D2516B11B769A18560DE29FB23562D67383B`<br>`lib\index.js` 22684 B `A3DF98244E13A7ACC0AA71349DAF6FC23E799ADAE19C3B642337256288FAA301` |
| 浏览器 | Edge 153.0.4234.32 存在，但 **Chromium 的 Mojo IPC 需要命名管道，沙箱拒绝**（见 §2.7 / probe-13），**无法进行任何真实引擎测量** |
| React | 本机**不存在** react/react-dom（已搜 npx checkout、`~/.dsh` profile、npm cacache；网络被封；GUI `http://127.0.0.1:3080` 返回 401） |

探针与原始输出（每次运行都会覆盖；本报告引用的每一行都能在下列文件里找到原文）：

```
dsh-approval-chime/verify-independent/probe-7-r4-roster.mjs       -> _raw/ind-probe-7-r4-roster.txt      39/39
dsh-approval-chime/verify-independent/probe-8-r4-playback.mjs     -> _raw/ind-probe-8-r4-playback.txt    48/48
dsh-approval-chime/verify-independent/probe-9-r4-concurrency.mjs  -> _raw/ind-probe-9-r4-concurrency.txt 38/38
dsh-approval-chime/verify-independent/probe-10-r4-volume.mjs      -> _raw/ind-probe-10-r4-volume.txt     65/65
dsh-approval-chime/verify-independent/probe-11-r4-css-rows.mjs    -> _raw/ind-probe-11-r4-css-rows.txt   27/27
dsh-approval-chime/verify-independent/probe-12-r4-injection.mjs   -> _raw/ind-probe-12-r4-injection.txt  45/45
dsh-approval-chime/verify-independent/probe-13-r4-browser.mjs     -> _raw/ind-probe-13-r4-browser.txt    11/14（环境限制）
dsh-approval-chime/verify-independent/kit/rev4.mjs                独立探针 kit（vm 加载器 / 采样录音器 / fetch 桩 / 卡片驱动）
dsh-approval-chime/verify-independent/kit/cdp.mjs                 CDP 客户端（为真实引擎测量而写；本环境用不上，保留复现路径）
```

复现命令（原样可跑，Windows PowerShell）：

```powershell
cd '<workspace>'
node dsh-approval-chime/verify-independent/probe-7-r4-roster.mjs
node dsh-approval-chime/verify-independent/probe-8-r4-playback.mjs
node dsh-approval-chime/verify-independent/probe-9-r4-concurrency.mjs
node dsh-approval-chime/verify-independent/probe-10-r4-volume.mjs
node dsh-approval-chime/verify-independent/probe-11-r4-css-rows.mjs
node dsh-approval-chime/verify-independent/probe-12-r4-injection.mjs
node dsh-approval-chime/verify-independent/probe-13-r4-browser.mjs   # 预期 exit 1：它记录环境使哪些测量无法完成
```

> 说明：`_raw/*.txt` 由 Windows PowerShell 重定向产生，因此是 UTF-16LE（与目录里上一轮 `ind-probe-1..6*.txt` 的编码一致）；`_raw/ind-probe-13-browser-launch.log` 由 Node 直接写 fd，是 UTF-8。

**被测修订的锚定**：整套探针在 2026-09-15 20:56:50–20:57:01 之间一次跑完（见 `_raw` 文件时间戳），而 `lib/*.js` 的 mtime 是 20:34/20:35，即**探针运行发生在最后一次改动之后**；运行前后两次计算的 SHA-256 与上表一致，因此本报告的全部结论都对应这两个哈希的字节。
`verify-independent/` 目录里还有别人任务的探针（`probe-7-host-audio-http.mjs`、`probe-8-client-roster-render.mjs`、`probe-9-client-playback.mjs`、`probe-10-startup-resilience.mjs` 等），本报告只声明与引用本人这 7 个 `*-r4-*.mjs` 及其 `ind-probe-*-r4-*.txt` 原始输出。

---

## 1. 逐条判定总表

| # | claim | 判定 | 证据 |
| --- | --- | --- | --- |
| 1 | 名册解析：畸形项 / 重复 id / 空与超长 name / 非数组 / >50 项 / id 大小写 → 渲染集合与顺序 = 导入的在前且按导入先后 | **PASS** | probe-7（6 种输入形状 + 真实导入路径） |
| 2 | `tone` 指向已删除/不存在 id：卡片仍渲染一行而不是空白；播放只增 `suppressedFailed` 与 `lastError`，不抛未处理 rejection，不影响内置音色 | **PASS** | probe-8（+ 渲染层"值必有匹配 option"不变量） |
| 3 | fetch 404 / decode 抛错 / `typeof fetch === undefined` 三种情况下内置音色仍发声 | **PASS** | probe-8（另测 reject / 无响应 / 永久挂起） |
| 4 | 并发与缓存：同 id 并发只 fetch 一次；不同 id 互不干扰；重复播放复用 buffer | **PASS** | probe-9（含"首个请求悬挂时两个触发"） |
| 5 | HTML 注入面：`name` 进 React 文本节点，含 `<img onerror=...>` 的名字不会被当成 HTML；DSH 显示名清洗没有把它变成别的东西 | **半数 PASS / 半数未证实** | probe-12（结构 + DSH 逐字节一致）PASS；**引擎级"不执行"未证实**（§4-U3） |
| 6 | 音量语义：导入音色与内置音色同 volume 下主增益完全一致；`volume=0` / `enabled=false` 不创建、不播放任何节点 | **PASS** | probe-10（5 档 volume + 边界值 + 两条入口路径分别测） |
| 7 | 「3 行后滚动」：`max-height` 数值等于 3 个 option 行高（逐步推导）、落在 `@supports (appearance:base-select)` 内、`overflow-y:auto` 同规则 | **静态 PASS / 引擎级未证实** | probe-11（算术 92 = 3×28 + 8，同规则、同 @supports 块）；真实渲染语义与降级行为见 §4-U1/U4 |

**没有任何一条被证伪**（即：我没有找到能让某条 claim 变成"错误"的证据）；同时也没有任何未证实项被写成通过。

---

## 2. 逐条 claim：方法、原始命令与原始输出

### 2.1 claim 1 —— 名册解析与顺序（PASS）

**方法**：在 `node:vm` 里以经典脚本加载真实 `lib/client.js`，用桩 `settingsScope` 喂不同形状的 `custom`，挂载真实卡片组件（`slots.register` 捕获）后**从返回的元素树里按渲染顺序读出 `<option>`**；再额外用真实导入路径（驱动 `input[type=file].onChange` → `uploadAudio` → `commit`）验证「追加而非前插」。

命令：`node dsh-approval-chime/verify-independent/probe-7-r4-roster.mjs`（原始输出 `_raw/ind-probe-7-r4-roster.txt`）

原始输出（节选）：

```
--- shape A — malformed entries inside a valid array ---
    · A · rendered options = [{"value":"custom:00000001-…","label":"first"},
       {"value":"custom:00000002-…","label":"00000002-…(id 兜底)"},
       {"value":"custom:00000003-…","label":"00000003-…"},
       {"value":"custom:00000004-AAAA-…","label":"upper case id"},
       {"value":"custom:00000005-…","label":"   "},
       {"value":"custom:00000006-…","label":"xxxx…(5000 chars)"},
       {"value":"custom:00000007-…","label":"00000007-…"},
       {"value":"chime","label":"风铃 chime"},{"value":"bell","label":"铃铛 bell"},{"value":"beep","label":"蜂鸣 beep"}]
[PASS] A: rendered rows are exactly the valid entries in source order, then the built-ins
[PASS] A: diagnostics.toneOptions() agrees with the rendered values
[PASS] A: over-long name is NOT truncated by the browser half — length=5000
--- shape B — `custom` is not an array of entries ---   （missing/null/string/number/对象 map 五种，全部只出内置）
[PASS] B(object map): only the built-ins are offered
--- shape B2 — a sparse array / `undefined` entries never poison the rest ---
[PASS] B2: the valid entry after the holes is still rendered
--- shape C — more entries than the CUSTOM_LIMIT (50) ---
[PASS] C: exactly 50 imported rows render / 第一行与第 50 行都按源序 / 第 51 项不出现
--- shape D — duplicate ids and case-only differences ---
[PASS] D: the same id rendered twice is deduplicated, first name wins
[PASS] D: case-only duplicates are NOT deduplicated (case-sensitive `seen`)
--- shape E — the import path appends (order = import order) ---
[PASS] E: the second import is APPENDED (first import stays first)
[PASS] E: the roster write order was [first, second]
### probe-7 rev-4 roster parsing / order (independent): 39/39 independent checks passed
```

**输入形状覆盖**（≥3 种，实为 6 种）：A 畸形混合数组（null/字符串/数字/函数/数组/无 id/非 UUID/含 `-too-long`/重复/空名/大小写 id/纯空白名/5000 字名/数字名）；B `custom` 非数组（缺失/null/字符串/数字/对象 map）；B2 稀疏数组与 `undefined`；C 60 项；D 重复与仅大小写不同的 id；E/F 真实导入与导入守卫（超 5 MB、无 `fetch`）。
**顺序不变量**与 `diagnostics.toneOptions()`、与 `settings` 写入顺序三方一致。

**观察（非缺陷）**：
- 纯空白名（`'   '`）原样保留 → 该行看起来"空"（`lib/client.js:654` 只判 `length > 0`）。DSH 在上传时 `.trim()`，所以只有手改 settings 文档才可达。
- 浏览器侧对 `name` **无长度上限**（5000 字原样渲染）。同样只有手改文档可达（DSH 上传时截断到 120）。
- 仅大小写不同的两个 id **不会**被去重（`seen` 大小写敏感，`lib/client.js:650`）；而 DSH 按文件名 `startsWith` 精确匹配（`lib/index.js:352`），所以大写 id 会渲染成一行但播放时 404 → 记为观察项，正常路径不可达（`randomUUID()` 恒为小写）。

### 2.2 claim 2 —— 已删除/不存在的 id（PASS）

命令：`node …/probe-8-r4-playback.mjs`（`_raw/ind-probe-8-r4-playback.txt`）

原始输出（节选）：

```
--- claim 2a — a tone whose file is gone still renders a row (no blank select) ---
    · rendered options = [{"value":"custom:00000099-…","label":"（文件缺失）"},
                          {"value":"chime",…},{"value":"bell",…},{"value":"beep",…}]
[PASS] the missing tone is the FIRST row and carries the missing-file label
[PASS] the select value matches a rendered option (this is what stops `<select>` from rendering blank)
[PASS] a built-in-shaped unknown id falls back to the default tone (no row is added)
--- claim 2b/3a — fetch answers 404 ---
[PASS] every other counter is untouched — {"triggers":0,"previews":0,"suppressedDisabled":0,"suppressedSilent":0,…,"lastTone":"","lastAt":0}
[PASS] suppressedFailed went up by exactly 1
[PASS] lastError records the 404 — "audio fetch failed (404)"
[PASS] audio.state is not marked broken by a missing file
[PASS] no AudioBufferSource was created / no master gain was created either
[PASS] the built-in oscillator pair was created
[PASS] the built-in play did not add another suppressedFailed
```

- 「渲染出一行而不是空白」的**充分条件**已被证明：卡片渲染的 `<select>` 的 `value` 一定等于某个已渲染 `<option>` 的 `value`（缺失时 `unshift` 一行"（文件缺失）"，`lib/client.js:1163-1167`）。**引擎级"有匹配 option 就不空白"这一平台行为未实测**（§4-U2）。
- 播放失败时**只有** `suppressedFailed`（+1）与 `lastError` 变化；`state/unlocked` 不被写成错误态；不抛未处理 rejection（探针内置了"能观测到 vm realm 内未处理 rejection"的仪器对照，见输出 `control: … IS observed by the watcher`）。
- 失败后内置音色照常（oscillator 重建、`previews` 计数）。
- 注意一个**设计性不对称**（非缺陷）：裸 id（非 `custom:` 形状）会被 `normalizeTone` 静默回退成 `chime`，**不**产生"文件缺失"行；只有 `custom:<uuid>` 形状才会。DSH 的 schema 只接受封闭集合，所以正常路径不可达。

### 2.3 claim 3 —— 三种播放失败路径（PASS）

同一份 probe-8 输出：

```
--- claim 3b — `decodeAudioData` rejects ---    [PASS] suppressedFailed=1；lastError="probe: unsupported audio container"；内置音色仍发声
--- claim 3c — `typeof fetch === "undefined"` ---
[PASS] the global really is gone inside the sandbox — expected "undefined", got "undefined"
[PASS] the failure is counted / lastError explains why — "this browser cannot fetch the uploaded audio"
[PASS] the built-in beep still renders (2 oscillators)
--- claim 3d — the fetch promise rejects (offline, DNS, abort) ---  [PASS] 计数 + lastError="probe: network down"，内置不受影响
--- claim 3e — a response object that is not ok-ish at all ---      [PASS] lastError="audio fetch failed (no response)"
--- adversarial — a fetch that never settles ---
[PASS] no counter moved while the request hangs / a built-in chime does not wait for the hanging sample
--- adversarial — `fetch` throws SYNCHRONOUSLY（见 §3 F1） ---
[PASS] MEASURED: a synchronous throw inside the sample path escapes the caller (no counter moves)
[PASS] MEASURED: the same throw escapes the pendingInteractions listener
### probe-8 rev-4 missing sample + playback failure modes (independent): 48/48 independent checks passed
```

### 2.4 claim 4 —— 并发与缓存（PASS）

命令：`node …/probe-9-r4-concurrency.mjs`（`_raw/ind-probe-9-r4-concurrency.txt`）

原始输出（节选）：

```
--- claim 4a — one id, two triggers in the same tick, a DEFERRED first response ---
[PASS] exactly ONE fetch was issued while the first was in flight
[PASS] both triggers land as plays once the buffer arrives (shared promise) — 2
[PASS] both sources carry the SAME decoded buffer object — identity equal = true
--- claim 4b — replaying a ready sample reuses the decoded buffer ---
[PASS] the network was touched exactly once — 1
[PASS] every play reused one and the same AudioBuffer instance — ["buffer-1","buffer-1","buffer-1"]
[PASS] the decode happened once — 1
--- claim 4c — two different ids in flight do not interfere ---
[PASS] both files were requested / two independent in-flight requests
[PASS] B produced a source carrying B bytes（先解 B 后解 A，A 不带 B 的数据）
--- claim 4d — two approvals in one tick share one request ---
[PASS] two approvals were seen / 2 triggers / 但文件只 fetch 一次、只 decode 一次
--- adversarial — a failed load is retried (there is no negative cache) --- 2 次尝试 = 2 次请求（观察项）
--- adversarial — the remove button drops the cached buffer ---
[PASS] the delete request was sent to the host / the buffer cache was dropped, so the file is fetched again
### probe-9 rev-4 concurrency + sample cache (independent): 38/38 independent checks passed
```

「首个请求悬挂（deferred）时第二个触发共用同一 promise」这一条是本轮特意加的对抗形状：它证明去重发生在**请求在途**阶段，而不只是"解好之后命中缓存"。

### 2.5 claim 5 —— HTML 注入面（结构层 PASS；引擎级未证实）

命令：`node …/probe-12-r4-injection.mjs`（`_raw/ind-probe-12-r4-injection.txt`）

```
--- A — the browser half contains no HTML sink ---
[PASS] dangerouslySetInnerHTML / innerHTML / outerHTML / insertAdjacentHTML / document.write /
       createContextualFragment / DOMParser / eval / new Function / srcdoc 在 lib/client.js 可执行代码中均为 0 处
[PASS] the only `<script` in the file is inside a comment
    · React.createElement call sites = 32
--- B — the payload reaches the tree as a text child only ---
    · rendered rows = [{"value":"custom:00000051-aaaa-…","label":"<img src=x onerror=\"window.__XSS__=1\">.wav"},…]
[PASS] the payload survives into the DOM text verbatim (not pre-escaped by the plugin)
[PASS] the option value is the validated UUID, never the name
[PASS] the payload appears in NO attribute of any element
[PASS] every occurrence of the payload in the tree is a string child
    · payload placements = [{"path":"card.children[4].children[1].children[0].children[0]","kind":"STRING CHILD (React text node)"}]
[PASS] no element sets dangerouslySetInnerHTML
--- C — the Host half's display-name cleaning, measured through its own route ---
[PASS] the display name is the payload verbatim — the cleaning does NOT change it
[PASS] the display name is echoed byte-for-byte (no HTML entity encoding, no stripping) — true
[PASS] windows/posix path is stripped · traversal is stripped · control bytes are stripped · leading space trimmed
[PASS] the name is capped at 120 chars (len 120)
[PASS] an unsupported extension is refused with 415
### probe-12 rev-4 injection surface (independent): 45/45 independent checks passed
```

- **注入载荷**：`<img src=x onerror="window.__XSS__=1">.wav`。
- 浏览器侧：**全文件没有任何 HTML sink**；载荷在元素树里**只**以字符串子节点（React 文本子节点）出现，从不进任何属性；`<option>` 的 `value` 永远是正则校验过的 `custom:<uuid>`（`^[0-9a-f]{8}-…$`，不可能携带 HTML 字符）。即：实现把"转义"完全交给 React 的文本子节点契约。
- DSH 侧（用**真实路由处理器**驱动，不是抄逻辑）：`displayName` 逐字节原样返回载荷（不做实体编码、不删 `<>"`），只剥路径/控制字符、trim、截 120；文件落盘名是 `<uuid>.wav`。上传后我用同一路由 `DELETE` 清理，`audio/` 目录前后一致（`before=[] after=[]`）。
- **未证实的部分**（§4-U3）：React 一定把字符串子节点渲染成文本节点、且该文本在真实引擎里不执行 —— 本机既无 React 也无浏览器。
- 用独立 DOM 实现（domino 2.2.0，turndown 的解析器）补充的旁证（probe-13 节 C）：同一个载荷走 `innerHTML` 会生成**真实 `<img src="x" onerror="window.__XSS__=1">` 元素**（说明载荷本身是活标记），走 `textContent` 只生成 `nodeType === 3` 的文本节点、序列化时被转义成 `&lt;img … &gt;`。domino 不是浏览器、不执行脚本，因此这只是"文本路径惰性"的旁证，不能替代引擎级对照。

### 2.6 claim 6 —— 音量语义（PASS）

命令：`node …/probe-10-r4-volume.mjs`（`_raw/ind-probe-10-r4-volume.txt`），**主增益的识别方式是结构性的**（唯一接到 `destination` 的 gain 节点），不是读源码字符串。

```
[PASS] volume 1/25/50/70/100: 两条路径主增益分别 0.006/0.15/0.3/0.42/0.6，
       且 "the two paths agree EXACTLY (Object.is)"
[PASS] the custom path builds exactly ONE gain node (master only)
[PASS] the built-in path builds master + one envelope per note (bell: 3)
[PASS] the imported source is connected to the master gain / started at currentTime 7.25
--- claim 6b — volume = 0 creates no node on either path ---
[PASS] 预览路径：无节点（nodes=0）、无 fetch、suppressedSilent=1
[PASS] 审批路径：built-in/imported 都是 "no AudioContext at all" + nodes=0
--- claim 6c — enabled = false creates no node on either path ---
[PASS] 两条路径都无 context、无节点、无 fetch；审批路径 suppressedDisabled=1
--- adversarial — out-of-range and non-numeric volume ---
[PASS] -25 / 150 / 70.4 / "70" / NaN / Infinity 六种取值，两条路径结果完全一致
        （-25→静音；150→0.6；70.4→0.42；"70"/NaN/Infinity→回退 70→0.42）
### probe-10 rev-4 volume / gate semantics (independent): 65/65 independent checks passed
```

`volume=0` 与 `enabled=false` 时**导入音色不创建任何音频节点、不发任何请求**这一点在两条入口路径上分别验证（预览路径与审批路径的闸门位置不同，见 §3 F2/F3 的措辞）。

### 2.7 claim 7 —— 「3 行后滚动」的真实语义（静态 PASS；引擎级未证实）

命令：`node …/probe-11-r4-css-rows.mjs`（`_raw/ind-probe-11-r4-css-rows.txt`）
样式表不是从源码里抠的：探针**执行真实的 `injectStyles()`**，再解析它塞进 `<style>` 的 `textContent`。

```
    · stylesheet length (chars) = 2390 ；@supports 块体 575 字符，且整份样式里只出现 1 次 @supports
--- claim 7a — the rule is inside @supports (appearance:base-select) ---
[PASS] outside the @supports block there is no max-height / overflow-y for the select at all（块外计数均为 0）
--- claim 7b — the picker rule and its arithmetic ---
    · rule = .dacCard select { appearance:base-select; }
    · rule = .dacCard select::picker(select) { appearance:base-select;margin-top:4px;padding:4px;
             border:1px solid …;border-radius:10px;…;max-height:92px;overflow-x:hidden;overflow-y:auto; }
    · rule = .dacCard select option { border-radius:7px;padding:4px 9px;line-height:20px; }
--- claim 7c — the arithmetic, step by step ---
    · step 1 — option line box = 20px (line-height)
    · step 2 — option padding = [4,9,4,9] → 8px vertical
    · step 3 — one row is = 20 + 4 + 4 = 28px
    · step 4 — 3 rows are = 3 × 28 = 84px
    · step 5 — picker padding = 8px
    · step 6 — max-height should be = 84 + 8 = 92px
[PASS] max-height equals 3 rows + the picker padding, EXACTLY (content-box arithmetic)
[PASS] the pinned row constant is 28px (derived from the stylesheet, not from the source)
    · if the UA box model makes the picker border-box instead, the inner content box is = 92 - 8 - 2 = 82px → 2.9286 rows
--- claim 7e — what a browser without base-select falls back to ---
    · fallback semantics = @supports 条件为假 → 整块被丢弃（appearance:base-select、::picker(select) 的
      max-height/overflow/padding/radius 全部不生效），select 退回 UA 原生弹窗：max-height/overflow-y 无意义，
      所有 option 完整列出，不会截断或隐藏任何一项。
### probe-11 rev-4 scroll CSS semantics (independent): 27/27 independent checks passed
```

**逐步推导**（不依赖任何注释声称）：行高不是猜的 —— `line-height:20px` 与 `padding:4px 9px` 都取自同一份样式表，`height` 未设置（高度=行盒+内边距），因此 1 行 = 20+4+4 = **28px**；3 行 = 84px；picker 自身 `padding:4px` → 8px；`max-height` 恰好 **92px = 84+8**。
**仍无法判定的**：`::picker(select)` 的 `box-sizing` 由 UA 样式表决定，本机无法查（§4-U1）——若为 `content-box` 则内容盒 84px = 恰好 3 整行；若为 `border-box` 则 82px ≈ 2.93 行，第 3 行会被裁掉 2px（纯视觉、无功能影响）。
`overflow-x:hidden` 与 `overflow-y:auto` 与 `max-height` **在同一个规则里**（同一条 `.dacCard select::picker(select){…}`，不是相邻块）✓；整个块确实在 `@supports (appearance:base-select)` 内 ✓；块外**没有**任何 max-height/overflow 声明 ✓。
补充观察：`@supports` 条件只测 `appearance:base-select` 这个**属性值**，而块内容还依赖 `::picker(select)` 伪元素。若存在"支持该值但不支持该伪元素"的浏览器，`appearance:base-select` 会生效而 picker 规则惰性失效 → 3 行上限静默丢失（不会截断内容，只是不滚）。本轮没有实测到这样的浏览器，故仅作静态观察记录，不计为缺陷。

### 2.8 真实浏览器测量：为什么没有（probe-13）

命令：`node …/probe-13-r4-browser.mjs`（`_raw/ind-probe-13-r4-browser.txt`，退出码 1 属预期）

```
[FAIL] a real browser engine could be driven (CDP reachable) — port 56717 was published, but nothing answers: fetch failed
[PASS] the log shows the sandbox denying Chromium its IPC channel
    · launch log (tail) = ["[23712:34136:…] Failed opening key Software\Microsoft\EdgeUpdate\…",
       "[31584:28840:…:FATAL:mojo\public\cpp\platform\platform_channel.cc:183] Check failed: . : 拒绝访问。 (0x5)", …]
```

- 我写了一个 0 依赖的 CDP 客户端（`kit/cdp.mjs`，`--headless=new --single-process --no-sandbox` 等组合全试过）：Edge 153 能写出 `DevToolsActivePort`，但随后 **`mojo/platform_channel.cc:183` 因命名管道被拒（0x5）而 FATAL 退出**，CDP 永远连不上。这正是沙箱的既定边界（"程序不能打开命名管道"），本会话审批提示已禁用，无法放开。
- 退而求其次的取证尝试（probe-13 节 B）：从 Edge 二进制里找 UA 样式表 —— **方法本身被证否**：对照串 `input[type="checkbox"]`（UA 样式表必然包含）在 332 MB 的 `msedge.dll` 里**也找不到**，说明 UA CSS 并非以明文存储；唯一命中 `picker(select)` 的窗口是 Blink 的伪元素名字表（`-internal-option-slot`、`select-options`…），**不能**据此判断 `box-sizing`。该结论被如实记为"无法判定"。

---

## 3. 缺陷清单

> 判定口径：**none of these break the rev-4 happy path**（导入→选中→预览/响铃→移除）。F1 是健壮性缺口（需要非常规的同步抛错才触发），F2–F6 是措辞/边界问题。全部给最小复现。

### F1（medium）采样路径未防"同步抛错"：计数器不动、异常逃逸到调用方；导入路径还会把按钮卡死

- 位置：`lib/client.js:444-469`（`loadSample`，`fetch(...)` 调用在 `:448`）、`:486-505`（`playSample`）、`:577-590`（`chime` 的 `custom` 分支，`:581` 只挂了 `.catch`）、`:592-603`（对照：内置分支用 `try/catch` 把抛错转成 `suppressedFailed + lastError`）；导入路径 `:518-519`（`uploadAudio` 的 `fetch` 调用）与 `:1190-1192`（`setImporting(true)` 之后才调用 `uploadAudio`）。
- 现象（实测）：`fetch` **同步**抛错时 `loadSample`/`playSample` 直接把异常抛穿 `chime()`，`suppressedFailed` 与 `lastError` **都不更新**（用户完全看不到失败）；审批路径下异常还会穿过 `pendingInteractions` 的订阅回调（`:737` 的 `chime(...)` 在 `try` 之外），即逃进 app 自己的 publish 扇出。
- 最小复现：

  ```js
  // 浏览器控制台（或探针：node probe-8-r4-playback.mjs 的 "fetch throws SYNCHRONOUSLY" 组）
  window.fetch = () => { throw new Error('x') };
  window.__DSH_APPROVAL_CHIME__.stats()      // 记录基准
  window.__DSH_APPROVAL_CHIME__.preview()    // → 抛异常；stats().suppressedFailed 仍为 0，audio().lastError 仍为 ''
  ```

- 导入路径的连带后果（同一根因，实测）：`fetch` 在 POST 上同步抛错 → 变更处理器抛异常 → `setImporting(false)` 永不执行 → **导入按钮永久停在「导入中…」且 disabled**：

  ```
  · buttons after the throw = ["导入中… [disabled]","试听","恢复默认"]
  [PASS] MEASURED: the import button is left stuck on 导入中… and disabled — label="导入中…" disabled=true
  ```

- 建议修法：把 `chime` 的 custom 分支包进 `try/catch`（与内置分支同构，抛错→`suppressedFailed + lastError + publish`）；`onImport`/`onRemove`/`uploadAudio` 同样加一层 `try/catch` 兜底，保证 `importing` 一定复位。**未改代码（本任务只报告）。**

### F2（low）文档与行为不一致：`volume = 0` 时"预览"路径仍会创建 AudioContext

- 位置：`lib/client.js:545-550` 的文档写着 “`enabled === false` and `volume <= 0` are silent BY CONSTRUCTION — **no AudioContext is created** and no node is built”；但 `playPreview`（`:678-682`）先 `attemptUnlock('preview')`（`:680`，内部 `ensureAudio()`）再进 `chime` 的闸门（`:563-568`）。
- 实测：预览路径 `volume=0` → `contexts=1, nodes=0, fetches=0, suppressedSilent=1`；审批路径 `volume=0` → `contexts=0, nodes=0`（文档在审批路径上成立）。
- 最小复现：`__DSH_APPROVAL_CHIME__.audio()` 记下 `state:'idle'` → 音量滑到 0 → 点「试听」→ 再看 `audio()`，`state` 变成 `running/suspended`（即已建 context），但没有任何节点、没有声音。
- 影响：仅一声道资源与文档措辞；无声、无节点。建议改文档措辞（"no audio node is created"）或把 `attemptUnlock` 挪到闸门之后（但那样手势解锁语义会变，需权衡）。

### F3（low）`enabled = false` 时预览不计数，卡片无法解释"为什么试听没声"

- 位置：`playPreview`（`:678-682`）在 `enabled === false` 时 `return false`，**不经过** `chime` 的 `suppressedDisabled` 计数（`:558-562`）。审批路径会计数（实测 `suppressedDisabled=1`）。
- 实测：预览路径禁用时 `suppressedDisabled` 保持 0，`accepted=false`，无节点无请求。
- 最小复现：关掉开关 → `__DSH_APPROVAL_CHIME__.preview()` → `false`，且 `stats().suppressedDisabled === 0`。
- 影响：卡片"因『启用』关闭而静音 ×N"只在审批路径增长，用户点试听得到的静默没有任何计数解释（UI 上按钮本身也是 disabled，属轻微）。

### F4（low）浏览器侧对名册 `name` 无清洗/无上限（依赖 DSH 上传时的清洗）

- 位置：`lib/client.js:643-658`（`readRoster`，`:654` 只判 `typeof name === 'string' && length > 0`）。
- 实测：`'   '` 原样保留（该行视觉上是空白行）；5000 字名原样渲染。
- 最小复现：手改 settings 文档 `custom: [{ id: '<uuid>', name: '   ' }]` → 打开插件卡片，音色下拉第一行看起来是空行（值仍可选中，不空白）。
- 影响：只有手改 settings / 未来 DSH 放松清洗时才可达（当前 DSH 上传路径 trim + 截 120）。建议浏览器侧也做一次 trim/长度收敛。

### F5（low）DSH 120 字截断可能切断代理对，存下孤立高代理

- 位置：`lib/index.js:397-401`（`:399` 的 `.slice(0, 120)` 按 UTF-16 code unit 切）。
- 实测：文件名 `'x'.repeat(119) + '😀' + 'tail.wav'` → 返回名长度 120，末位 code unit = `U+D83D`（孤立高代理），浏览器显示会是 U+FFFD。
- 最小复现（探针即复现）：`node …/probe-12-r4-injection.mjs`，输出 `MEASURED: the cut split the U+1F600 surrogate pair, leaving a lone high surrogate — U+D83D`。
- 影响：纯显示层且极窄（≥120 字且截断点落在星平面字符上，需要 macOS/Linux 文件名）。

### F6（low）客户端自己造的兜底名 `audio` 必被 DSH 拒绝；尾随空格名也被拒

- 位置：`lib/client.js:524`（`file.name` 为空时发 `x-chime-name: audio`）与 `lib/index.js:406-413`（扩展名从**原始**名字取，`extname('audio') === ''` → 415）。
- 实测：`node …/probe-12-r4-injection.mjs` → `the client's own fallback name "audio" has no extension and is refused with 415`；`'padded.wav '`（尾随空格，macOS/Linux 合法文件名）同样 415。
- 影响：用户看到"导入失败 + DSH error 文本"（有反馈，不是静默）；建议客户端兜底名改成 `audio.wav` 或 DSH 对名字先 trim 再取扩展名。

### 观察项（不计为缺陷）

- **O1** 失败采样无负缓存：每次播放都重新发请求（probe-9 实测 2 次尝试 = 2 次请求）。对"文件已删但卡片仍引用"的场景会持续产生一次性请求；功能正确。
- **O2** 仅大小写不同的 id 不去重（`lib/client.js:650`），且 DSH 按 `readdir` + `startsWith` 精确匹配（`lib/index.js:352`）→ 大写 id 呈现为"（文件缺失）"；正常路径不可达（`randomUUID()` 恒小写）。
- **O3** `@supports` 只覆盖 `appearance` 属性值、未覆盖 `::picker()` 伪元素（见 §2.7 末）。未观测到受影响浏览器。

---

## 4. 未证实项（**不得**当作通过）

| # | 未证实的事 | 为什么没法证实 | 现有证据到哪一步 | 需要什么才能定论 |
| --- | --- | --- | --- | --- |
| **U1** | `::picker(select)` 的真实 `box-sizing`，即 `max-height:92px` 到底是"恰好 3 整行"（content-box：内容盒 84px）还是"第 3 行被裁 2px"（border-box：内容盒 82px ≈ 2.93 行） | UA 样式表不出现在二进制明文里（对照串也找不到，方法被证否）；无浏览器可测 | 静态算术 92 = 3×28 + 8 已证；两种盒模型的差 2px 已量化为 84 vs 82 | 在任意支持 `base-select` 的浏览器里打开 picker，读 `getComputedStyle(select,'::picker(select)').boxSizing` 或量 option 命中带（`kit/cdp.mjs` 已备好驱动代码，换到不受命名管道限制的环境即可跑） |
| **U2** | 引擎里"`<select>` 的 value 匹配到 option 时不会空白显示"这一平台行为 | 同上（无引擎） | 已证**充分条件**：卡片渲染的 value 必然等于某个已渲染 option 的 value（缺文件时会补一行） | 浏览器里 `select.value = 'custom:<未知>'` 对照：有匹配行 → `selectedIndex>=0`；无匹配行 → `value===''`（探针里已写好脚本，见 probe-13 节 D） |
| **U3** | 真实 React 把字符串子节点渲染为文本节点、且该文本在引擎里**不执行** | 本机无 react/react-dom（三处搜索 + 网络封锁 + GUI 401），也无浏览器 | 已证：全文件零 HTML sink（10 类 API 全 0）；载荷**只**以字符串子节点进树、不进任何属性；`option.value` 是正则校验的 UUID；domino 旁证 `innerHTML` 会生成真实 `<img onerror>`，`textContent` 只生成文本节点并转义 | 在装了 React 的环境里渲染该卡片，断言 `querySelector('img')===null` 且哨兵变量未被置位 |
| **U4** | 不支持 `base-select` 的浏览器里，DSH 原生弹窗是否真的沿用 `option{background-color/color}`（`lib/client.js:966-970` 的注释声称） | 无浏览器；也无法构造"不支持"的引擎 | 已证：该色值规则在 `@supports` **之外**（与注释一致），且降级时唯一生效的就是它 | 在 Chrome<135 / Firefox 上打开弹窗目视或截图取样 |

---

## 5. 证据强度自评（哪些结论有多硬）

| 结论类别 | 强度 | 说明 |
| --- | --- | --- |
| 名册集合/顺序/去重/上限/畸形项 | **硬**（直接观测渲染产物） | 6 种输入形状 + 真实导入路径，断言落在**卡片渲染出的 `<option>` 序列**上，不是内部函数返回值；并用 `diagnostics.toneOptions()` 交叉验证 |
| 失败路径的计数与不变量 | **硬** | 计数器、`lastError`、音频图（结构性识别 master gain）、未处理 rejection 仪器（含"能观测到 vm realm 内 rejection"的对照）都实测 |
| 并发/缓存 | **硬** | 用 deferred fetch 把两个触发压在"请求在途"窗口内，缓存命中/复用按 buffer 对象身份断言（`===`） |
| 音量一致性 | **硬** | 主增益按"唯一接到 destination 的 gain"识别；5 档 + 6 种非法取值；两条入口路径分别测 |
| 3 行滚动的**静态**语义 | **硬** | 解析的是真实 `injectStyles()` 产物；行高由样式表自身两个声明推出；同规则/同 `@supports` 块用大括号配平判定，不是字符串包含 |
| 3 行滚动的**渲染**语义、`<select>` 空白行为、React 转义、原生弹窗取色 | **未证实** | 见 §4；本报告**没有**把它们写成通过 |
| DSH 显示名清洗 | **硬**（走真实路由处理器） | 通过 `registerAudioRoutes` + 桩 webServer 驱动真实 `handleAudioRoute`，POST/DELETE 往返；上传物已清理，`audio/` 前后一致 |

**本轮没有做的事**（避免越界/重复）：DSH 路由 `/api/approval-chime/audio` 的完整契约验证由另一位独立验证者负责，我只覆盖了 claim 5 明确点名的"显示名清洗"；需求符合性审查（对照用户原话逐条判定）与两份验证报告的证据强度复核是另一项任务，不在本报告内。
