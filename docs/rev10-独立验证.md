# rev-10 独立验证（任务 t2 · verifier）

- 插件：`dsh-approval-chime`，工作区 `<workspace>`
- 被验证字节：`lib/index.js` 46638 B / sha256 `03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938`；
  `lib/client.js` 133812 B / sha256 `2078125FCADDDC3AF9CEADE6585A321BF65B79B91E64DB4D244133832FD7CBB4`
  （`verify-independent/_raw/r10-baseline-before.txt:3-4`）
- 新探针：`verify-independent/probe-18-r10-sessions.mjs`（自有加载器/桩/虚拟时钟/HTTP 服务，**不复用** `verify/_harness.mjs`，也不 import `kit/`）
- 全量回归：`verify-independent/run-r10.ps1` → 日志 `verify-independent/_raw/r10-*.txt`
- 总体：**probe-18 = 130 断言 / 0 失败**（`r10-ind-probe-18-r10-sessions.txt:178`）；四套 harness 502 项全绿；回归探针集（run-r4…r10）除 probe-13 外全部 exit 0；8/8 变异体按声明精确报红；冻结路径 11 个文件前后逐行一致。
- **未证实** 4 项（真实浏览器渲染/悬浮提示/popover 实际定位/真实 dsh web 端到端），见 §11。
- **已复现缺陷 1 项**：铃铛快速连点两次后，本地表可以与宿主文件不一致（≈0.06%，非阻塞，见 §10）。

---

## 1. 方法与独立性

| 项 | 做法 |
| --- | --- |
| 加载真实字节 | `readFileSync(lib/client.js)` → `vm.runInContext`（自有 classic-script 加载器）→ 取 `factory(require('react'))` → `apply(ctx)` |
| 不信任实现者 | 不 import `verify/**`；自带 mini-React（`createElement`/`useState`/`useRef`/`useEffect` + 依赖比较 + 重渲染）、DOM/AudioContext/fetch 桩、虚拟时钟 |
| 「音色/音量」的证据形态 | **仪器化音频图**，不是计数器：`createOscillator().start()` 记录 `wave`+`freq`，接到 `destination` 的 master `gain.value` 记录音量（探针内 `makeAudioProbe()` / `chimes()`）；结果见 `r10-ind-probe-18-r10-sessions.txt:54-65` |
| 宿主侧 | `import()` 真实 `lib/index.js`，真起 `node:http` 服务器，`registerSessionRoutes(ctx)` 挂 prefix 路由，再对 `127.0.0.1:<port>` 发真 HTTP |
| `$DSH_HOME` | 每次运行新建 `os.tmpdir()` 临时目录，**从不触碰真实 `~/.dsh`**；探针另断言 `sessionsFile()` 不落在真实 home 下（`r10-ind-probe-18-r10-sessions.txt:52` F0） |
| 反证 | `--mutate=<name>` 加载**内存中**改坏的同一份字节（client 走字符串，host 走 `data:` URL 模块），要求观测到的红点集**恰好等于**声明集；`lib/**` 磁盘哈希前后不变（`r10-ind-probe-18-mutations.txt:1543-1544`） |

宿主合同是**自己复核**的（未抄 t1 结论）：

- 槽 `conversation.session.header.actions`：`kind:"list"`、`scope:"session"`、注册项 `id`(必填)/`order`/`label` —— `dsh-cordis-client-runner/lib/client.js:3102-3126`；其标准 props 明确含 `sessionId: SessionId`（:3141）与 `useSessionPendingInteraction`（:3134）；`replaceRisk:"none"`、占用者为 `agent-preset`/`job-list`/`schedule-catalog`/`agent-team`（:3149-3154）。
- 会话作用域的 `sessionId` 是**普通 prop**：`dsh-client-ui-session/lib/client.js:61-70`（`props:["sessionId"]`、`props:{sessionId: binding.sessionId}`）→ `:246-267` 物化 → `dsh-client-ui-renderer/lib/client.js:538-539`(`{...binding.props}`)、`:551-573`、`:792` 合并进 entry kit。
- 渲染点：`renderSlot("conversation.session.header.actions", {})`（owner props 为空）位于 header 的 `.headerActions` 容器内 —— `dsh-client-ui-conversation/lib/client.js:15067-15070`；槽声明见 `:16688-16691`。
- 已装占用者的 order：`agent-preset=-10`（`dsh-client-ui-agent-preset/lib/client.js:1474-1479`）、`schedule-catalog=10`（`dsh-client-ui-schedule/lib/client.js:293-298`）、`job-list=20`（`dsh-client-ui-jobs/lib/client.js:266-271`）→ **30 无冲突**；`agent-team` 在本机**未安装**（`@deepseek-ai` 下 0 个包匹配），故其视觉落点未证实（§11）。
- 待审批表以 `sessionId` 为键、每会话只留优先级最高的一条：`dsh-client-ui-session/lib/client.js:213-227`；来源 `pendingInteractions.getSnapshot/subscribe`（:83-90）。
- 审批交互自带 `sessionId`、`kind="approval"`、唯一 `key=approval:<n>`：`dsh-client-ui-approval/lib/client.js:138-142`。
- 路由表按 `(kind,path)` 唯一、重复即抛：`dsh-host-webserver/lib/index.js:176-183`。
- home 规则（空白 `$DSH_HOME` 视为未设）：`@deepseek-ai/dsh-home-paths/lib/index.js:49-51,73-76`。

---

## 2. 冻结基线（开工前后逐行一致）

`run-r10.ps1` §0/§7 对 `lib/**`、`verify/**`、`README.md`、`CHANGELOG.md`、`package.json`、`cordis.patch.yml` 共 **11 个文件**取 SHA256：

- `_raw/r10-baseline-before.txt`（第 2 行起）
- `_raw/r10-baseline-after.txt`
- `_raw/r10-frozen-diff.txt` = `identical`
- 控制台佐证：`_raw/r10-run-console.txt:77` “11 frozen files are byte-identical before/after the run”
- 探针内自查：`r10-ind-probe-18-r10-sessions.txt:175-176`（client `2078125F…` / index `03778391…`）

`lib/**`、`verify/**`、`README.md`、`CHANGELOG.md` 在本次验证中**一个字节未动**。

---

## 3. 结论 1：会话头部真的挂上了小铃铛，且切换写的是「本会话」

| 断言 | 证据 |
| --- | --- |
| `slots.inject` 收到 `conversation.session.header.actions` | `r10-ind-probe-18-r10-sessions.txt:7`（A1，注入列表 `["settings.section","conversation.session.header.actions"]`） |
| 注册项形状 `{name, id:'approval-chime', order:30, locale:NS}` | 同上 `:8`（A2） |
| order 30 不与已装占用者（-10/10/20）冲突且落在其后 | `:9`（A3：`shipped orders = [-10,10,20]`）、A3b |
| 诊断面暴露 `sessionSlot`/`sessionAction`/`batchGapMs` | `:10`（A4） |
| 组件从 **props** 收到 `sessionId`（`data-session=session-a`） | `:15`（B1）；源码 `lib/client.js:2298`，无 sessionId 时不渲染（`lib/client.js:2370`；探针 B5 `:21`） |
| 铃铛两态内联 SVG 可区分（开=2 path；关=+1 条 `.dacSlash`） | `:20`（B4：`unmuted={pathCount:2,hasSlash:false} muted={pathCount:3,hasSlash:true}`）；源码 `lib/client.js:2177-2204`、`:2190` |
| `title` 与 `aria-label` 同串，且**中英双语同时**含「本会话审批提示音：开/关」 | `:16-18`（B2/B3）：`本会话审批提示音：开 · Approval chime for this session: on` / `…：关 · … : off`；源码 `lib/client.js:2230-2233` 直接读 `DICT.zh[key]+' · '+DICT.en[key]`（`:1483-1484` / `:1536-1537`） |
| 点击「会响 → 静音」的报文 | `:36`（C1）`{"sessionId":"session-a","patch":{"enabled":false}}` |
| 点击「被静音 → 开回来」的报文 | `:38`（C2）`{"sessionId":"session-a","patch":{"enabled":null}}`（**清除覆盖**，不是写 true）；`:39`（C2b）全程未出现 `enabled:true`；源码 `lib/client.js:1181-1184` |
| 「静音一个会话」绝不等于「关掉全局开关」 | `:43`（C3）`scope.sets=[]` 且 `value.enabled=false`（作用域一次没被写过） |
| 全局关 + 该会话被静音 → 再「开回来」仍静音（写 true 会响） | `:44`（C4）`chimes=[]`，`:45`（C4b）仍跟随全局 |
| 只影响本会话 | `:47`（C6）：A 被覆盖为 `enabled:false`、B 仍 `enabled:true`；C6b `:48` 只响 1 声、C6c `:49` `suppressedSession=1` |
| popover 结构（自绘、`position:fixed`、音色含「跟随全局」、音量 0..100 跟随时禁用、Escape 关闭） | `:26-32`（B8…B8g） |

---

## 4. 结论 2：有效值严格是「会话覆盖 ?? 全局」

`sessionSettings()` 的源码位置：`lib/client.js:983-1004`（`:986` enabled、`:987` volume、`:988` tone、`:989-990` custom 缺失回退全局音色）。
真值表 12 组，逐组把**实际写进音频图**的 wave/freq/gain/sample 断言出来（探针 §D）：

| 组 | 全局 | 会话记录 | 实测 |
| --- | --- | --- | --- |
| D1 | 开/70/chime | 无 | sine 880/1318.5，gain 0.42 |
| D2 | **关**/70/chime | 无 | 不响，`suppressedDisabled+1`（`:55`） |
| D3 | 开/70/chime | `enabled:false` | 不响，`suppressedSession+1`（`:56`） |
| D4 | **关**/70/chime | `enabled:false` | 不响，计 `suppressedSession`（`:57`） |
| D5 | 开/70/chime | `volume:30` | gain 0.18，音色仍全局 chime（`:58`） |
| D6 | 开/70/chime | `tone:'beep'` | square 440（`:59`） |
| D7 | 开/70/chime | `volume:30,tone:'bell'` | triangle 659.25，gain 0.18（`:60`） |
| D8 | **关**/70/chime | `volume:30` | 不响，计 `suppressedDisabled`（`:61`） |
| D9 | 开/70/chime | `tone:'custom:<uuid>'`（在册） | 播该 sample，gain 0.42（`:62`） |
| D10 | 开/100/bell | `volume:0` | 不响，`suppressedSilent+1`（`:63`） |
| D11 | 开/70/chime | `tone:'custom:<缺失>'` | **回退全局 chime**：sine 880（`:64`） |
| D12 | 开/40/bell | `enabled:true` | triangle 659.25，gain 0.24（`:65`） |

所有 12 组 ok 行位于 `r10-ind-probe-18-r10-sessions.txt:54-65`。
（D4/D8 的「全局关」也计入 `suppressedDisabled` 而非把锅算给会话，`:78` E10 单独断言了这条区分。）

---

## 5. 结论 3：同一批多会话「各响各的」

- 3 个会话同批待审批 → **3 次触发，顺序 = 快照顺序，间隔 0/180/360 ms**：`r10-ind-probe-18-r10-sessions.txt:68`（E1：`at:0/180/360`）、`:69`（E2：`pending before drain=[180,360]`）、`:70`（E3 同为 880）。源码：`lib/client.js:1290-1310`（`schedule(playable[i], i * BATCH_GAP_MS)`），`BATCH_GAP_MS=180` 在 `lib/client.js:178`。
- 批次计数器：`lastBatchSize=3`/`lastBatchPlayed=3`/`triggers=3`（`:71`，E4）。
- **同一会话重复 snapshot 不重复计数**：`:72`（E5）`chimes=0` 且 `approvalsSeen=3`；新 key（替换请求）恰响一次：E6 `:73`。源码 key 去重 `lib/client.js:1274-1283`。
- 其中 1 个被本会话静音 → **2 次触发**（`:74` E7 `at:[0,180]`），间隔仍 180（`:75` E8），被静音会话计入 **`suppressedSession`**（`:76` E9 `before=0 after=1`），`lastBatchSize=3/lastBatchPlayed=2`（E9b）。
- 静音会话本身**不发声**（E7 只有 2 次触发，且音色轨迹里没有它的条目）。

---

## 6. 结论 4：覆盖数据真的落在插件自己的文件里

前缀：`lib/index.js:73` `SESSIONS_ROUTE`；存储 `lib/index.js:740-747`（`<DSH_HOME|~/.dsh>/approval-chime/sessions.json`）。

| 断言 | 证据 |
| --- | --- |
| `$DSH_HOME` 生效：文件落在临时 home 下（且不在真实 home 下） | `:52`（F0/D0）、`:86`（F4：`unset`/空白 → `~/.dsh/approval-chime/sessions.json`；覆盖 → 临时目录）。源码 `lib/index.js:163-171` |
| 空白 `$DSH_HOME` 视为未设（与平台同规则） | `:87`（F4b，对照 `dsh-home-paths/lib/index.js:73-76`） |
| GET 空表 200 | `:81`（F1） |
| POST 成功 → 200 且应答即带回新表；文件 `{version:1,sessions:{…}}`；**读回一致** | `:82-84`（F2/F2b/F2c） |
| **不是设置文档**（临时 home 下无 settings.yaml） | `:85`（F2d） |
| 非法输入一律 400 且**文件字节不变**：缺/空白/超长/非字符串 sessionId；volume 42.5 / 101 / `'50'`；tone `noise` / 大写 uuid；`enabled:'false'`；未知字段 `color`；缺 patch / patch 为数组 / body 为数组或字符串 / 空 body / 坏 JSON | `:88-104`（17 条 F5a…F5q 全 ok） |
| 未知路径 404 / 非 GET/POST 405 / HEAD 200 | `:105-107`（F6a/F6b/F6c） |
| 200 上限按 `updatedAt` 淘汰**最旧**、**最近使用的不被踢** | `:110`（F7：`count=200 fresh-201=true seed-199=true seed-000=false`，种子按 key 逆序写入以免与「首键优先」混淆）；`lib/index.js:787-798` |
| 特殊 id 不被淘汰逻辑误伤：`A-upper`/`a-lower`/带空格/中文/`__proto__`/`constructor`/200 字符 | `:111`（F8a 全部存在，count 仍 200）、`:112`（F8b `Object.prototype` 未被污染）、`:113`（F8c 最新的仍在） |
| 纯函数级淘汰：**key 顺序与 `updatedAt` 顺序相反**时仍踢最旧 | `:114`（F8d：`p-000` 最新在、`p-200` 最旧被踢） |
| 原子写：临时文件与目标同目录 + `rename` | `:117`（F9a，源码 `lib/index.js:888-892`） |
| 目录里躺着垃圾 `.tmp` 不影响读取 | `:118`（F9b：读到的仍是 200 条） |
| 写后无残留临时文件 | `:119`（F9c：只剩探针自己种的那个 `.tmp`） |
| 落盘 payload 是完整可解析 JSON | `:120`（F9d） |
| 缺失/坏 JSON/数组/null/无 sessions 键/sessions 非对象/记录非对象 → 空表 200 且不抛 | `:123-129`（F10a…F10g） |
| 坏字段被丢弃、合法字段保留 | `:130`（F10h：只剩 `c:{enabled:false}`） |
| 损坏后仍能正常写入 | `:131`（F10i） |
| 写失败 → 500 且**目标不变**（把 `approval-chime` 造成普通文件逼 `mkdir` 失败） | `:134`（F11）、`:135`（F11b）；源码 `lib/index.js:893-900,1066-1071` |
| 未注入 webServer：只告警不崩 | `:138`（F12）、`:139`（F12b `apply()` 也不抛）；源码 `lib/index.js:1101-1123` |
| 同 `(kind,path)` 二次注册被拒；本插件只注册 **1** 条 prefix 路由 | `:140-142`（F13/F13b/F13c）；`:141` 断言路由表恰为 `["prefix /api/approval-chime/sessions"]` |

---

## 7. 零浏览器存储 / 设置页零回退

- 真实字节里**不含** `localStorage`/`sessionStorage`/`indexedDB`/`document.cookie`/`window.name`/`caches.open`：`r10-ind-probe-18-r10-sessions.txt:158`（G1 `hits=[]`）。
- 运行时把 `localStorage`/`sessionStorage`/`indexedDB` 做成会记账的 getter，跑完一整轮（挂载 + 播一次审批）后**一次都没被读**：`:159`（G2 `touches=[]`）。
- 设置页既有控件在真实字节上仍成立：`:162-172`
  - 全局开关（`role=switch`，`checked=true`）`:162`
  - 音量滑杆 `min0/max100/step1/value70` `:163`
  - 音色下拉 `[custom:<uuid>, chime, bell, beep]`（导入音色在前）`:164`
  - 隐藏 file input `accept=audio/*`、class `dacFile` `:165`
  - 「导入音频 / 试听 / 恢复默认」按钮 `:166`
  - 统计行 + `rev-10 · per-session chime` 徽标 `:167`
  - `@supports (appearance:base-select)` 块与 `::picker(select)` 仍在注入的 CSS 里 `:168`（源码 `lib/client.js:1681-1695`）
  - `CUSTOM_LIMIT = 50` `:169`（源码 `lib/client.js:193`）
  - `toneRows=3` `:170`
  - 「恢复默认」依次 `unset enabled/volume/tone` `:172`
- 零回退侧证：`verify/waterfall.test.mjs` 仍 22/22 通过（`_raw/r10-dev-waterfall.txt:32`），即审批瀑布上仍无注册。

---

## 8. 反证能力：8 个变异体，全部按声明精确报红

只改内存（client 一份改坏字符串；host 用 `data:` URL 模块），**磁盘哈希前后一致**（`r10-ind-probe-18-mutations.txt:1543-1544`）：

| 变异体 | 做了什么 | 观测红点集 |
| --- | --- | --- |
| `mute-ignored` | `sessionSettings` 让全局开关盖过会话覆盖 | 15 条（B3/B3b/B4/C2/C2c/C6/C6b/C6c/D3/E7/E8/E9/E9b/I1b/I2） |
| `unmute-writes-true` | 「开回来」写成 `{enabled:true}` 而非清除 | 5 条（C2/C2b/C2c/C5/I1b） |
| `batch-gap-zero` | `BATCH_GAP_MS 180 → 0` | 6 条（A4/E1/E2/E3/E7/E8） |
| `session-id-constant` | 铃铛不读 `props.sessionId` | 8 条（B1/B5/B8/C1/C2/C6/C6b/C6c） |
| `custom-tone-no-fallback` | 缺失 custom 音色不回退全局 | 1 条（D11） |
| `batch-merge-first-only` | 一批只响第一声（退回 rev-9 行为） | 6 条（E1/E2/E3/E4/E7/E8） |
| `evict-newest-first` | 淘汰反向（踢掉最近用的） | 5 条（F7/F8a/F8c/F8d/F9d） |
| `home-blank-accepted` | 空白 `$DSH_HOME` 不再视为未设 | 1 条（F4） |

汇总：`### mutation summary: 8/8 mutations detected exactly as declared`（`r10-ind-probe-18-mutations.txt:1546`）；控制台 `_raw/r10-run-console.txt:32`。

> 「精确等于声明集」意味着变异体既**能咬人**，也没有顺带炸掉无关断言（即变异是外科式的，探针的红点是它自己的判断而非级联崩溃）。

---

## 9. 全量回归 `run-r10.ps1`

由 `run-r7.ps1` 派生（本目录**没有** `run-r8.ps1`/`run-r9.ps1`，rev-8/9 并入 rev-10 实施）；日志前缀 `r10-`，`r4/r5/r6/r7` 归档未被覆盖。

| 段 | 结果 |
| --- | --- |
| 四套实现者 harness（只读重跑） | host-half **124/124**（`r10-dev-host-half.txt:175`）、client-half **282/282**（`:324`）、waterfall **22/22**（`:32`）、custom-audio **74/74**（`:92`）= **502 项全绿**（`r10-run-console.txt:10-13`） |
| 回归探针集（run-r4…r10 的 12 个） | 除 `probe-13-r4-browser`（无浏览器引擎，**预期**非零，`r10-run-console.txt:23`）外**全部 exit 0**（`r10-run-console.txt:17-29`） |
| probe-18 | 130/0（`:29`） |
| 变异 | 8/8（`:32`） |
| race 测量 | raw 0/1500、sidechannel 1/1500（`:36-37`） |
| 旧版探针（rev-1…rev-3，10 个） | 逐一记录+分类（`:41-62`），非零项都带「被引用的失败断言」与容忍理由；`audio/` 由脚本回滚（`:63-65`） |
| 审查者探针 | `reqcheck-host-413` 9/9；其余为早期修订版探针，逐字记录退出码（`:66-73`） |
| 冻结路径 | 11 个文件逐行一致（`:77`） |
| 总退出码 | **0** |

**关于「全部独立探针 exit 0」的诚实说明**：回归集（12 个）成立；`verify-independent/` 里另有 10 个 **rev-1…rev-3 时代**探针（run-r4 起就未纳入回归），它们的非零退出已被逐条证明与 rev-10 无关：
- 3 个（probe-3/4/5）钉住 rev-6 的 `settings.plugin.item` 卡片与不带 `custom` 的 DEFAULTS —— 那是 rev-4/rev-7 有意改掉的（`r10-run-console.txt:45-53`）；
- 2 个（probe-7-host-audio-http、probe-8-client-roster-render）钉住 rev-5 之前的 415 规则、rev-4 之前的 picker CSS/大写 uuid/无界名称（`:55-58`）；
- 2 个（probe-9-client-playback、probe-10-startup-resilience）**按请求数/路由数**断言，rev-10 多出的正好是 1 次挂载期 GET 或 1 条路由（`:59-62`）；
- 1 个（probe-2）断言「`lib/client.js` 里没有 `fetch(`」—— rev-4 起就不成立（`:42-44`）。

为了让回归集真正全绿，我把 rev-4/5/7 的 5 个探针**重新基线化**到 rev-10（`kit/rev4.mjs` 把挂载期那一次 `GET /api/approval-chime/sessions` 单独记到 `sessionReads`、不再混入音频/上传 `calls`；`probe-15` 的两处自定义 fetch 同样短路；`probe-17` 的字节数/哈希/槽计数(1→2)/rev 戳按 rev-10 更新）。这些改动只动 `verify-independent/**`（我自己的产物），且**探针-18 的 C0 断言反过来证明**「每次挂载恰好 1 次该读取」（`r10-ind-probe-18-r10-sessions.txt:35`），所以新基线不是放水。

---

## 10. 已复现缺陷：铃铛快速连点两次后，本地表可以与宿主文件不一致

### 10.1 现象

```
verify-independent/_raw/r10-ind-probe-18-race-evidence.txt:7
FINDING (measured, reproducible): the bell's final state disagreed with the store in 1 round(s):
[{"round":320,"client":true,"file":false,"agreement":false,
  "fileRecord":{"enabled":false,"updatedAt":1789574886167},
  "localRecord":null,"localSize":159,"fileSize":160,
  "patchesSent":["{\"enabled\":false}","{\"enabled\":null}"],
  "revisionsInResolutionOrder":[],"answerHasId":[]}]
```

- 两次点击发出的 patch 是**正确的**（先 `{enabled:false}` 再 `{enabled:null}`）；
- 本地表 159 条、文件 160 条 —— **与 200 条上限无关**；
- 结果：宿主文件停在**静音**（`fileRecord.enabled=false`，即第 1 次写的表赢了 rename 竞争），
  而客户端本地表**没有该记录**（`localRecord=null` → 铃铛显示「开」），即第 2 次请求的应答被最后应用；
- 之后**没有任何再读**：`refreshSessions()` 只在 `apply` 挂载时调用一次（`lib/client.js:2739`），
  所以这个不一致会一直持续到下次刷新页面，并且**会驱动该会话的响铃判断**（`lib/client.js:983-1004`）。

### 10.2 机理（源码行号）

1. `writeSessionPatch` 先乐观改本地表，然后**无条件**用应答里的表覆盖本地表：
   `lib/client.js:1153-1178`（成功分支 `:1160-1168`）。
2. 应答里带的 `revision` 被记下（`lib/client.js:1163`）却**从未被比较/用作栅栏**；全文件没有任何地方读 `sessions.revision` 做判断。
3. 两次并发 POST 走两条 socket：客户端按**应答体被消费完的顺序**覆盖本地表，而这个顺序不保证等于宿主 `rename` 的落地顺序。

### 10.3 复现命令与频率

```powershell
cd dsh-approval-chime
node verify-independent/probe-18-r10-sessions.mjs --race-rounds=1200 --race-raw
node verify-independent/probe-18-r10-sessions.mjs --race-rounds=1500 --race-sidechannel
```

| 测量 | 结果 |
| --- | --- |
| raw 直通 fetch，本轮 run-r10 记录 | 0/1500（`r10-ind-probe-18-race-raw.txt:146`） |
| clone 旁路 fetch，本轮 run-r10 记录 | 1/1500（`r10-ind-probe-18-race-sidechannel.txt:146-147`） |
| 累计（真实时钟） | 约 **7/12500 ≈ 0.06%**（raw 6/9400、clone 旁路 1/3100） |
| 单次点击 / 任何等上一次应答返回再点的序列 | **永远收敛**（30~1500 轮全部一致） |
| 构造式反证（应答顺序被强制反序） | 稳定复现：`r10-ind-probe-18-r10-sessions.txt:150`（I2 `mid-flight true → 迟到应答后 false`） |

> 排查记录（避免误判）：最初用**虚拟时钟**跑同一实验时得到 4/400、2/400、1/400、1/30，
> 但那些行长的签名是 `patchesSent:[false,false]`——本地表的 200 条淘汰按 `updatedAt`
> 排序（`lib/client.js:929-942`），而虚拟时钟盖的 `updatedAt`（1.73e12）比宿主真实
> `Date.now()`（1.79e12）小，导致客户端把自己刚写的记录当最旧踢掉。改成真实时钟后
> **该类签名彻底消失**，剩下的 7 例全部带正确的 `[false,null]` patch 对。所以 §10.1 那条
> （本地表 159 < 200，且 patch 对正确）是真实现象，不是我的桩造成的。

### 10.4 严重度与处置建议（未自行修改 `lib/**`）

- severity：**medium**，非阻塞。理由：单次点击永远正确；只有「用户在同一帧/极短时间内连点两次」才可能触发，概率约 0.05%/次双击；后果是铃铛显示与宿主文件相反，并让该会话的响铃判断用旧值，**持续到页面刷新**（不会丢数据，宿主文件本身始终是两次写中合法的那个结果）。
- 建议修法（择一，供后续实施任务）：把每会话的写入串行化（同一 sessionId 至多一个 POST 在飞），或在最后一次未决写入落定后重新 `refreshSessions()`。
  **注意**：单纯加 `revision >` 栅栏**不够** —— 应答被反序投递时它会接受旧表、跳过新表（I2 已把这条写进探针注解 `r10-ind-probe-18-r10-sessions.txt:152-155`）。

---

## 11. 未证实（本沙箱无法测量，明确不声称通过）

| 项 | 阻塞原因（可复现） |
| --- | --- |
| 真实浏览器里铃铛的渲染、尺寸、hover 提示的**实际弹出** | 无浏览器引擎：Edge 启动即 `FATAL:mojo\public\cpp\platform\platform_channel.cc:183 Check failed: 拒绝访问 (0x5)`，CDP 端口虽发布但无应答 —— `r10-ind-probe-13-r4-browser.txt:4-5` 与 `_raw/ind-probe-13-browser-launch.log:8`；探针 §B 只能断言**元素树与属性**（title/aria-label/`data-muted`/SVG path 数），不断言像素。 |
| popover 的实际定位与遮挡（贴底向上翻、水平收进视口、会不会被带 `transform` 的祖先裁剪） | 同上；只断言了 `style.position==='fixed'`、矩形来自 `getBoundingClientRect`，以及 Escape 会关闭（`r10-ind-probe-18-r10-sessions.txt:26-32`）。 |
| `order:30` 的**视觉落点**（在真实 header 里排在哪一格） | 本机未安装 `agent-team`（`@deepseek-ai` 下 0 个匹配包）且无浏览器；只能证明已装占用者为 -10/10/20、30 不与之冲突（`:9`）。 |
| 真实 `dsh web` 端到端（页面加载 → 铃铛出现 → 点击 → 宿主文件变化 → 下一次刷新读回） | 需要真实浏览器 + 已挂载 profile；沙箱两者都没有。本报告的端到端只到「vm 内的真实字节 ⇄ 真实 HTTP ⇄ 真实 `lib/index.js` ⇄ 真实文件」为止（§6、§10）。 |

此外，**同会话连点两次的应答乱序窗口**由「未证实」升级为**已复现**（§10）。

---

## 12. 产物清单（本次验证只新增/修改这些）

| 路径 | 说明 |
| --- | --- |
| `verify-independent/probe-18-r10-sessions.mjs` | 新探针（130 断言 + 8 变异体） |
| `verify-independent/run-r10.ps1` | 由 run-r7 派生的全量回归 |
| `verify-independent/_raw/r10-*.txt` | 38 个日志（含 4 套 harness、13 个探针、变异、race、审查者、基线/差异/控制台） |
| `verify-independent/_raw/r10-ind-probe-18-race-evidence.txt` | §10 的连点证据（4×1200 轮 raw 测量，第 7 行是那条干净的偏离记录） |
| `docs/rev10-独立验证.md` | 本报告 |
| `verify-independent/kit/rev4.mjs`、`probe-15-r5-names-files.mjs`、`probe-17-r7-section.mjs` | 仅**重新基线化**到 rev-10（见 §9 末段） |

未改动：`lib/**`、`verify/**`、`README.md`、`CHANGELOG.md`（§2 逐行一致）。

---

# 附录 A · t4（rev-11）之后的期望值更新（任务 t6）

> 上面的 §1–§12 是 **rev-10 当时**的记录，**不改动**（历史证据就该保持原样）。
> 本附录记录 rev-11 竞态修复落地后，我自己在 `verify-independent/**` 里做的四处期望值更新、为什么改、以及复跑出来的数字。
> 被验证字节在本轮变成：`lib/client.js` 137971 B / sha256 `36BDD86B4D09A96492FCD6819913A50117E17EB6017F07914E98955A02D6E9CB`；
> `lib/index.js` 仍 46638 B / `03778391…`（`_raw/r11-baseline-before.txt:3-4`）。
> 回归脚本换成 `run-r11.ps1`（由 run-r10.ps1 派生，日志前缀 `r11-`，`r4…r10` 归档未覆盖）。

## A.1 先看清 rev-11 到底改了什么（不是照抄 builder 的说法）

`lib/client.js` 新增了一个**收敛式重读**，而不是 revision 栅栏：

| 位置 | 内容 |
| --- | --- |
| `lib/client.js:433` | `var sessionWrites = { outstanding: 0 };` |
| `:1199` / `:1207` / `:1216` | 每次写入 +1；成功分支与失败分支都调用 `settleSessionWrites(...)` |
| `:1234-1245` | `settleSessionWrites()`：计数减 1；**只有归零时**才 `refreshSessions()` 重读一次表，读失败不吞掉被拒写的错误行 |
| `:1172-1191` | 注释解释了为什么**不用** `revision >` 栅栏：应答被反序时，新表骑在**后到**的那条应答上、带着**更大**的 revision，栅栏会接受旧表而跳过新表 |
| `:38-47` | 文件头把它记为 rev-11、对应 rev-10 复审的 F-01 |
| `:139` | `REVISION = 'rev-11 · per-session chime (race fix)'` |

也就是说：rev-11 修的是「本地表最后被哪条应答覆盖」，做法是**最后一次未决写入落定后向宿主重读一次**。

## A.2 改动 1：probe-18 的 I2 期望（t6 的阻断项）

**问题**：`I2.the-late-answer-wins-locally` 原来断言 `midway === true && final === false` —— 这个签名把**修复前的缺陷**（迟到应答把本地表回退成旧值）写成了期望，rev-11 之后必然报红；而且它只断言「结果」，不断言「靠什么收敛」，所以即使有人只是碰巧让结果对了也看不出来。

**处理**：改名 + 拆成一对断言，直接对着 rev-11 的机制下断言：

```js
check('I2.late-answer-does-not-stick',       midway === true && final === true, ...)
check('I2b.convergence-reread-issued',       readsAfterSecond === readsAfterFirst - 1
                                          && readsAfterFirst === readsAtMount + 1, ...)
```

- `I2` 断言「迟到的那条**陈旧**应答不再把本地表带回去」；
- `I2b` 断言「这次收敛**确实是一次重读换来的**」：脚本自己数 `GET /api/approval-chime/sessions` 的次数（挂载 1 次 → 第二条应答落地时仍是 1 次 → 迟到的第一条应答落地后变成 2 次，**恰好一次**）；
- 三条注解改写成 rev-11 的现状（引用 `lib/client.js:1234-1245` / `:1207` / `:1216` / `:1179-1182`），删掉了「建议以后怎么修」的过期段落。

实测（`_raw/r11-ind-probe-18-r10-sessions.txt`）：

```
:150  ok   I2.late-answer-does-not-stick :: mid-flight client.enabled=true; after the LATE #1 answer (which carries the stale {enabled:false} table) client.enabled=true …
:151  ok   I2b.convergence-reread-issued :: reads: mount=1, after the 2nd answer=1, after the late 1st answer=2 — exactly ONE extra read, issued when the last write settled
```

**变异体同步（关键，否则会失去咬人能力）**：

- `mute-ignored` 的 `expect` 列里**删掉** `I2.the-late-answer-wins-locally`（该变异体现在不再让 I2 报红——它让两次点击发出同一个 patch，收敛结果依然正确）。实测该变异体红点集 14 条，`extra reds = (none)`。
- **新增**变异体 `convergence-reread-removed`：把 `return refreshSessions().then(function (ok) {` 换成 `return Promise.resolve(true).then(function (ok) {`（外科式：只摘掉那次重读，保留 `ok` 语义）。声明红点集恰为 `['I2.late-answer-does-not-stick', 'I2b.convergence-reread-issued']`，实测一致（`r11-ind-probe-18-mutations.txt:1346` 变异体、`:1528` 观测红点集 2 条恰好相等、`:1720` 汇总 `9/9`）。

这一对断言就是 rev-11 的**假想敌**：谁把重读删掉，I2 与 I2b 同时红。

## A.3 改动 2：H6 的硬编码 rev 戳

**问题**：`check('H6.stats-and-revision', labels.includes('已触发') && labels.includes('rev-10'), ...)` 把版本号写死在断言里，每次改 revision 都要来改一次。

**处理**：同时断言**两个方向**，既不再漂移、又不会因为「只读自己」而失去判别力：

```js
const EXPECTED_REVISION = 'rev-11 · per-session chime (race fix)';
check('H6.stats-and-revision',
      labels.includes('已触发')
   && labels.includes(bundle.diagnostics.revision)          // 徽标必须渲染 bundle 自报的串
   && bundle.diagnostics.revision === EXPECTED_REVISION, ...) // 且必须是本轮的 rev-11
```

实测：`r11-ind-probe-18-r10-sessions.txt:167` —— `revision="rev-11 · per-session chime (race fix)" rendered=true expected=…`。
（若以后有人 bump 了 revision 却忘了这条，它会红**一次**并逼人确认——这是期望的信号，不是脆弱。）

## A.4 改动 3：F-02（reviewer 的 low finding）

**问题**：`kit/rev4.mjs:254` 把挂载期那一次 `GET /api/approval-chime/sessions` 从 `calls` 里摘到 `sessionReads` 之后，
`probe-10` 的 6 处「NOTHING was fetched」与 `probe-16` 的「no request of any kind was made」**字面已不成立**；
更糟的是 `sessionReads` 全仓**没有任何断言**，等于既不说真也不说假。

**处理：选 (a)**——把每处断言从「半个事实」改成「整个事实」，并新增对那次读取本身的断言。**没有把读取从账本里删掉。**

`kit/rev4.mjs` 新增三个供两个探针共用的导出（规则只写一处）：

| 导出 | 作用 |
| --- | --- |
| `trafficOf(stub)` | 打印 `{ audioUploadCalls, mountSessionReads }` 两个数 |
| `onlyMountReadTraffic(stub)` | `calls.length === 0 && sessionReads.length === 1` —— 「除挂载期那一次读取外没有任何请求」 |
| `mountReadShape(stub)` | 那次读取的 `[method, url]` |

`probe-10-r4-volume.mjs`：6 处 `calls.length === 0` 改成 `onlyMountReadTraffic(...)`（标签相应改成「no request beyond the mount-time sessions read」），并在文件末尾新增 F-02 组（4 条断言 + 1 条说明）：
那次读取**恰好 1 次**、是 `GET /api/approval-chime/sessions`、**从不进入**音频/上传账本、内置音色试听仍然 0 次音频请求。
实测 `_raw/r11-ind-probe-10-r4-volume.txt`：`:31/:38/:46/:53/:58/:76` 六处 PASS（每处都打印 `{"audioUploadCalls":0,"mountSessionReads":1}`）、`:80-81` F-02 组、`:90` 汇总 **70/70**（rev-10 时是 66/66）。

`probe-16-r5-cap-race.mjs`：`S.same('no request of any kind was made', stub.calls.length, 0)` 改成
`S.check('no request of any kind beyond the mount-time sessions read', onlyMountReadTraffic(stub), trafficOf(stub))`，并新增同样的 F-02 组。
实测 `_raw/r11-ind-probe-16-r5-cap-race.txt`：`:46` PASS、`:65-66` F-02 组、`:71` 汇总 **50/50**（rev-10 时是 47/47）。

顺带修掉一处会误导的旧引用：`probe-10` 里那条 rev-5 备注原先写「`fetches=0`」并指向 `lib/client.js:618-621` / `:776`——那两个行号早已漂到别处（现在分别是 `loadSample` 的 `.then` 和 `chime()` 内部），所以改成按**函数名**引用（`chime()` / `playPreview()`）并打印新的 `trafficOf`，避免下次 revision 再漂一次。

## A.5 改动 4：probe-17 的 rev 戳/哈希再次重新基线化

`probe-17-r7-section.mjs` 在 rev-10 被我基线化到 133812 B / `2078125F…` / `rev-10`；rev-11 换了字节，它在第一轮 r11 回归里报了 3 条红（`r11-ind-probe-17-r7-section.txt` 首轮的 `FAILED: lib/client.js byte count is what rev-10 claims` 等）。
已更新为 **137971 B / `36BDD86B…` / `rev-11`**，复跑 **94/94**（`_raw/r11-run-console.txt:28`）。

## A.6 t6 的独立复核数字

全部来自 `run-r11.ps1` 我自己的这一次运行，未照抄 builder 自测：

| 项 | 结果 | 证据 |
| --- | --- | --- |
| probe-18 | **131 断言 / 0 失败**，exit **0** | `r11-ind-probe-18-r10-sessions.txt:178`；`r11-run-console.txt:29` |
| 变异体 | **9/9** 按声明精确报红（含新 `convergence-reread-removed`），`extra reds=(none)`；`lib/**` 磁盘哈希前后 unchanged | `r11-ind-probe-18-mutations.txt:1720`、`:1717-1718` |
| race（raw 直通 fetch，1500 轮） | **0/1500 分歧**（宿主文件停在静音 760/1500） | `r11-ind-probe-18-race-raw.txt:146` |
| race（clone 旁路 fetch，1500 轮） | **0/1500 分歧**（宿主文件停在静音 703/1500） | `r11-ind-probe-18-race-sidechannel.txt:146` |
| 四套 harness | 124 + **302** + 22 + 74 = **522** 项全绿（client-half 由 282 增至 302，即 rev-11 新增的 20 项） | `r11-run-console.txt:10-13` |
| 回归探针集（run-r4…run-r11，12 个） | 除 `probe-13`（无浏览器引擎，**预期**非零，`:23`）外全部 exit 0 | `r11-run-console.txt:17-29` |
| 冻结路径 | 11 个文件逐行一致（`r11-frozen-diff.txt = identical`） | `r11-run-console.txt:76` |
| **run-r11.ps1 总退出码** | **0** | `r11-run-console.txt:117` |

对 §10 那个缺陷的收口结论：**rev-10 报告里那条「≈0.06% 的连点不一致」在 rev-11 上我独立复测为 0/3000**（两路各 1500 轮）。
机制层面的证据是 I2/I2b（结构化的反序投递场景），概率层面的证据是这两路 1500 轮；两者都指向同一件事：最后一次未决写入落定后会重读一次，本地表因此等于宿主文件。

## A.7 本附录涉及的产物（只动 `verify-independent/**` 与本文件）

| 路径 | 改了什么 |
| --- | --- |
| `verify-independent/probe-18-r10-sessions.mjs` | I2 改写 + 新增 I2b；H6 改为双断言；`mute-ignored` 的 expect 去掉 I2；新增 `convergence-reread-removed` 变异体 |
| `verify-independent/kit/rev4.mjs` | 新增 `trafficOf`/`onlyMountReadTraffic`/`mountReadShape`（F-02 的共享规则） |
| `verify-independent/probe-10-r4-volume.mjs` | 6 处流量断言改写 + 新增 F-02 组 + 备注改按函数名引用 |
| `verify-independent/probe-16-r5-cap-race.mjs` | 1 处流量断言改写 + 新增 F-02 组 |
| `verify-independent/probe-17-r7-section.mjs` | 重新基线化到 rev-11（字节数/哈希/rev 戳） |
| `verify-independent/run-r11.ps1` | 由 run-r10.ps1 派生的全量回归，前缀 `r11-` |
| `verify-independent/_raw/r11-*.txt` | 本轮日志 |
| `docs/rev10-独立验证.md` | 本附录 |

未改动：`lib/**`、`verify/**`、`README.md`、`CHANGELOG.md`（A.6 的冻结路径逐行一致）。
