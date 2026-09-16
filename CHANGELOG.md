# dsh-approval-chime 变更记录

版本戳在「通知提醒」分区页右上角显示，也可在控制台读 `window.__DSH_APPROVAL_CHIME__.revision`。

> ⚠️ **哈希提醒**：`docs/验证报告.md` 与 t4 评审记录里锁定的实现哈希对应 **rev-1**。
> rev-2/rev-3 是纯外观改动，**rev-4 是功能新增**，**rev-5 是两轮独立验证与需求审查后的修正**，
> **rev-6 是 N3 收尾**，**rev-7 把设置入口从「插件」迁到独立的「通知提醒」分区**，
> **rev-8 把「启用提示音」换成苹果式拨动开关**，**rev-9 按真机反馈把它改瘦、开启色统一成音量条的蓝**，
> **rev-10 加「按会话独立」（会话头部小铃铛 + 每会话音色/音量覆盖 + 各响各的）**，
> **rev-11 修 rev-10 的应答乱序窗口（会话写入落定后重读一次表）**。
> 每次改动后都复跑了全部 harness：现为 4 个文件 / **522 项断言全绿（124 + 302 + 22 + 74）**。

## rev-11 · per-session chime, race fix（修 rev-10 的应答乱序窗口 / F-01）

来源：rev-10 的需求符合性审查 **F-01（medium）** ——「同一会话连点两次、两次应答被反序投递时，本地表会与宿主文件相反，
且**直到刷新页面都没有收敛路径**」。审查者实测：`verify-independent/_raw/r10-ind-probe-18-race-evidence.txt:7`（1200 轮 1 例：
本地无记录而文件是 `{enabled:false}` → 铃铛显示"会响"而实际静音），构造式反证 `r10-ind-probe-18-r10-sessions.txt:150`
（I2：迟到应答把已恢复的状态又打回去）。

**机理（为什么"最后一个应答"不够）**：两次点击 = 两个 POST = 两条 socket，应答体被消费的顺序**不保证**等于宿主 `rename`
的落地顺序；而每次应答都**无条件**覆盖本地表（rev-10 的 `writeSessionPatch`），所以本地表的终值取决于"哪个应答先被读完"。
它还会驱动铃铛与该会话的响铃判断，而 `refreshSessions()` 只在挂载时调过一次 → 不一致会持续到刷新页面。
**触发条件**：第二次点击落在"第一次 POST 未落地"的窗口内（审查者量到：本机每会话 POST 往返 median 3.33 ms、p99 6.81 ms；
两次人手点击 ≥40 ms 打不中，能打中的是"主线程长任务阻塞后两个 click 同突发派发"）。
**为什么不用 `revision >` 栅栏**：应答反序时，**新**表反而是骑在**后到**应答里、revision 更大，栅栏会接受旧表、跳过新表
（probe-18 I2 已把这条写进注解）。

- **修法（审查者 requiredFix 的选项②，只动 `lib/client.js` 的写入路径）**：新增 `sessionWrites.outstanding` 计数 ——
  每次写入 +1；每个应答落定后在 `settleSessionWrites()` 里 −1；**当计数归零（整张表再没有在飞的写入）时，
  重新 `refreshSessions()` 读一次宿主文件**，让本地表最终等于宿主文件。计数器属于整张表而不是单个 sessionId：
  「最后一个应答不是最后一个写入」这件事跨会话同样会破坏同一张表。
  写入返回的 promise 在"它是最后一个在飞写入"时会等到这次重读完成，所以 `await` 写完即已收敛。
- **拒绝路径不丢信息（选项②与"失败回滚+错误行"必须同时成立）**：写入被宿主拒绝时仍然回滚到点击前的副本、
  仍然把原因放进 `sessions.error`（popover 的错误行），而这次重读**只重读表、不覆盖该次写入的结论** ——
  重读成功后把 `sessions.error` 恢复成那次写入的原因（`settleSessionWrites(preservedError)`）。
- **一次点击只多一次 GET**：计数归零才重读，所以连点两次只重读一次（自测断言 `reads === 挂载 1 + 重读 1`）。
- **自测（新增 20 条，`verify/client-half.test.mjs` §5i）**：一个"应答可被扣住、由测试决定投递顺序"的存储桩 ——
  同一会话连点两次（`{enabled:false}` → `{enabled:null}`），**先放第二个应答、再放第一个**，然后断言：
  迟到的旧应答**不能**在本地表里留下记录、铃铛仍跟随全局、本地表与桩里的存储**逐字段相等**、
  只重读一次、无在飞写入、无错误行；另测"单次点击仍收敛"；另测"被拒写入仍解析为 `false` 且错误行不被重读抹掉"。
  **这条自测在修复前的字节上会报红**（实测：临时短路重读逻辑后 5 条断言失败，其中
  `the stale answer cannot leave a record behind` 正是 F-01 的现象；短路已还原，sha256 与修复版逐字节一致）。
- **复核（真实 HTTP，1500 轮/路，本轮实跑）**：
  - `node verify-independent/probe-18-r10-sessions.mjs --race-rounds=1500 --race-raw`
    → `I1 measurement (raw passthrough fetch, 1500 rounds): client-vs-store disagreements = 0/1500`；
    `I1b.one-POST-per-click` 绿（每轮仍是 `[mute, clear]`）。
  - `node verify-independent/probe-18-r10-sessions.mjs --race-rounds=1500 --race-sidechannel`
    → `I1 measurement (clone side channel, 1500 rounds): client-vs-store disagreements = 0/1500`。
  - 修前的同一测量：raw 1200 轮 1 例（`_raw/r10-ind-probe-18-race-evidence.txt:7`）、sidechannel 1500 轮 1 例。
  - 两路各有 **2 条 FAIL，都是"期望值过期"而非产品回归**，且都落在 t2 的探针里（builder 不改）：
    ① `I2.the-late-answer-wins-locally`（`probe-18-r10-sessions.mjs:1510`）—— 旧期望
    `midway === true && final === false` 编码的正是修复前的缺陷；修复后实测是 `midway=true, final=true`
    （迟到应答不再回退，且与桩里的空存储一致），即验收要求的「I2 改成"迟到应答不再回退"」。
    注意 `MUTATIONS` 里 `mute-ignored` 的 `expect` 列了这条 check id（`:649`），改名时需同步。
    ② `H6.stats-and-revision`（`probe-18-r10-sessions.mjs:1557`）—— 硬编码 `labels.includes('rev-10')` → 需改 `'rev-11'`。
    两路其余 **128 条断言全绿**（`assertions passed=128 failed=2`，总条数与修前 130 一致）。
- **锚定字节（rev-11）**：`lib/client.js` **137971 B / sha256 36BDD86B4D09A96492FCD6819913A50117E17EB6017F07914E98955A02D6E9CB**
  （rev-10 为 133812 B / 2078125F…）；**宿主半 `lib/index.js` 零改动** —— 46638 B / sha256
  03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938（与 rev-10 逐字节相同，已实测复核）。
  自测文件：`verify/client-half.test.mjs` 65661 B / 4FDA92CD5AF9A3F1526F8F02FF7AC435D23216429701D279E7E893C70D30068E
  （rev-10 为 58941 B / 818C9216…）、`verify/custom-audio.test.mjs` 19872 B / 8BE5C5EE…（仅版本戳一行）、
  `verify/_harness.mjs` 24822 B / 18C2055A…、`verify/host-half.test.mjs` 29652 B / E33F9889…、
  `verify/waterfall.test.mjs` 8888 B / 010811A5…（三者本轮未动）。
- **自测计数（rev-11）**：**522 项全绿（124 + 302 + 22 + 74）**，四套 exit 0；client-half 由 282 → 302（新增 20 条，见上）。
- **不做的事（边界）**：`verify-independent/**` 是 t2 的产物、不在 builder 的冻结范围（captain 明确划出），
  所以 **I2 的期望值与 H6 的版本戳都由 verifier 更新**，本轮只在文档登记（见上「复核」段）。
  审查者 F-02（`kit/rev4.mjs:254` 把挂载期那次 sessions 读取摘出 `calls` 后，`probe-10` 五处与 `probe-16:170`
  的「没有任何请求」字面失真）同样是 verifier 领地，**本轮未改那些文件**，登记在此备办。
- **未证实**：真机上"长任务阻塞后两个 click 同突发派发"的可达性仍无浏览器可测（审查者的上界：间隔 ≥5 ms 全部 0/400）。
  本轮修的是**不一致的收敛性**：无论应答以什么顺序到达、宿主的两次 `rename` 以什么顺序落地，本地表都会重读成文件的样子。
  README §9 H17 已按新行为改写。
- **文档**：CHANGELOG（本条 + rev-10 条目加"已知缺陷 → rev-11 修复"）、README（版本戳 rev-11、§3.2、§7 诊断新增
  `sessionWrites()`、§9 H17）、`docs/挂载与验收.md`（版本戳 rev-11、§10 的历史哈希标注为 rev-4 时点）。
- **OBS-1 更正（审查者指出）**：rev-10 条目里"仅 5 处期望值更新"**不准确**：按 `git diff -U0 -- verify/` 逐行核对，
  被改写的**断言行是 7 条**（2 条 rev 戳 + 1 条"等待的槽列表" + 4 条"数全部注册"改成按 `settings.section` 过滤，
  其中 4 条收得更紧），另有 4 行非断言改动（`fire(type, extra)` 形参、2 个常量、import 增补）。该行已按实测数字改写。

## rev-10 · per-session chime（按会话独立：小铃铛 + 覆盖 + 各响各的）

> ⚠️ **已知缺陷 → rev-11 修复**：同一会话连点两次、两次应答被反序投递时，本地表会与宿主文件相反且**没有收敛路径**
> （审查者 F-01，medium；实测证据见 rev-11 条目）。本条目保留为当时的记录 —— 下面的"写入=乐观更新、失败回滚"
> 描述的就是 rev-10 的写入路径，rev-11 在其后补了"最后一个在飞写入落定 → 重读一次宿主文件"。

需求（用户）：「② 每个会话可以单独设置提示音开关/音色/音量；③ 同时多个会话待审批时，每个会话各自响，
不要合并成一声」。选定的语义是 **①A**：会话覆盖只可能比全局**更安静**，不做「全局关时给单个会话强制打开」；
覆盖存**插件自己的文件**（不进设置文档、不进浏览器存储）。

- **会话头部小铃铛**（`lib/client.js`）：`ctx.slots.inject('conversation.session.header.actions')` +
  `register({name, id:'approval-chime', order:30, locale:NS})`。该槽是 `list`/`scope:'session'`
  （`dsh-cordis-client-runner/lib/client.js:3102-3157`），官方占用者实测 order = `agent-preset` -10
  （`dsh-client-ui-agent-preset/lib/client.js:264-270`）、`schedule-catalog` 10（`dsh-client-ui-schedule/lib/client.js:293-298`）、
  `job-list` 20（`dsh-client-ui-jobs/lib/client.js:266-271`），因此 **30** 既有空位、又不顶替任何人（id 自用）。
  组件只读 `props.sessionId`（官方占用者同样如此：`dsh-client-ui-jobs/lib/client.js:117`）。
- **两态图标 + 双语提示**：内联 SVG —— 开=实心铃铛（2 条 path），关=同一铃铛 + 一条斜杠（`.dacSlash`）；
  `title` 与 `aria-label` 取同一串**同时含中英**的文案（`本会话审批提示音：开 · Approval chime for this session: on`），
  刻意不走 `props.t`（那只给一种语言）。点击=切换：会响 → 写 `enabled:false`；被静音 → 写 `enabled:null`（清除覆盖、回跟随全局）。
- **caret popover（自绘，只有 react）**：音色（跟随全局 / 导入的音色 / 风铃 / 铃铛 / 蜂鸣）、
  音量（「跟随全局音量」勾选=清除覆盖，取消后 0..100 滑杆即该会话音量）、**恢复跟随全局**；
  `position:fixed` + `getBoundingClientRect` 自定位（视口底部向上翻、水平收进视口）、外部 `pointerdown` 与 `Escape` 关闭；
  写入**乐观更新**，宿主拒绝则回滚并把错误行显示在 popover 里。（平台自带的 `useDismissOnOutsidePointer` 在
  `dsh-client-ui-primitives`，不在可 require 的种子里，故自行实现。）
- **有效值**：`enabled/volume/tone = 会话覆盖 ?? 全局`（逐字段）。全局关 → 所有**未覆盖**会话静默；
  会话覆盖的 `custom:<uuid>` 若已不在名册里 → **回退全局音色**（并在 popover 说明），不报错、不静音。
- **各响各的**：同一批快照里 N 个可响会话各响一次，按快照顺序、相邻 **180 ms**（`BATCH_GAP_MS`；
  旧实现是「一批只响一声」）。被本会话静音的**不响**并计入新计数 `suppressedSession`
  （全局关导致的静默仍计 `suppressedDisabled`），设置页抑制行新增「因本会话提示音关闭而静音 ×N」。
- **存储（宿主半）**：`$DSH_HOME|~/.dsh` 下 `approval-chime/sessions.json`，形状
  `{version:1, sessions:{<sessionId>:{enabled?,volume?,tone?,updatedAt}}}`；目录递归创建；
  **原子写**=同目录临时文件（`.sessions.<pid>.<uuid>.tmp`）+ `rename()`（失败清理临时文件并回 500）；
  上限 **200** 条、按 `updatedAt` 淘汰最旧；空覆盖不落盘；缺失/损坏/非对象 → **空表 + 告警**，绝不抛错。
  home 规则按宿主 `@deepseek-ai/dsh-home-paths/lib/index.js:73-76` 重写（`$DSH_HOME` **去空白后非空**优先，否则 `homedir()/.dsh`；
  纯空白视为未设置）——**不 import 该包**（`link:` 插件解析不到裸模块，§B.6 的历史教训）。
- **两个 HTTP 端点（同一条 prefix 路由，两个方法）**：`GET /api/approval-chime/sessions` →
  `{ok:true, revision:<n>, sessions:{…}}`；`POST`（体 `{sessionId, patch}`）→ 应用后回**同样结构**。
  非法 `sessionId`（空/非字符串/超长 >200）、非法 `volume`（非 0..100 **整数**）、非法 `tone`（非 `chime|bell|beep|custom:<小写 uuid>`）、
  未知 patch 字段 → **400 且不落盘**（先校验后写）；`/sessions/...` 下未知路径 **404**、其它方法 **405**、超大请求体 **413**。
  沿用 `registerAudioRoutes` 的姿势：`webServer` 只可选注入，没有它就只是不注册路由（
  **为什么不能注册成两条同路径路由**：`dsh-host-webserver/lib/index.js:176-183` 用 `(kind, path)` 做键，重复即抛）。
- **零浏览器存储**：`localStorage`/`sessionStorage`/`indexedDB`/`caches.` 在 bundle 里一个都不出现（新增断言）。
- **零回退**：设置页（开关/音量/音色/导入/试听/恢复默认/413/上限 50/空白名回退/`::picker(select)` 三行可视）
  与音频路由、审批面板行为**逐项未动**（四套 harness 的既有断言一条未删；按新事实改写的**断言行 7 条**：
  2 条 rev 戳、1 条「等待的槽列表」、4 条「数全部注册」改成按 `settings.section` 过滤——其中 4 条收得更紧，
  另有 4 行非断言改动：`fire(type, extra)` 形参、2 个常量、import 增补。数字已按 `git diff -U0 -- verify/` 逐行核对，
  rev-11 条目里的 OBS-1 记录了这次更正）。
- **诊断面**：`window.__DSH_APPROVAL_CHIME__` 新增 `sessionSlot`/`sessionAction`/`batchGapMs`/`sessions()`/`sessionSettings(id)`/
  `toggleSession(id)`/`refreshSessions()`，**既有键一个未删**（新增断言逐键核对）；`REVISION` = `rev-10 · per-session chime`。
- **自测**：**56 → 124**（宿主半：路径规则/空表/合并与 null 清除/12 种非法补丁 400 且文件字节不变/413/404/405/HEAD/
  上限淘汰 205→200/5 种损坏形状退化/损坏后写入修复/原子写与失败清理）、**155 → 282**（浏览器半：槽注册形态与 id/order、
  铃铛两态 SVG 与中英提示、点击 POST 请求体、popover 内容与自定位翻转、Escape/外部点击关闭、拒绝写入回滚+错误行、
  有效值真值表 × 全局开与关、缺失 custom 回退、4 条 pending(1 静音)→3 响且 ≥180 ms 间隔、逐会话音量与顺序、
  `suppressedSession` 与设置页抑制行、诊断键核对、零浏览器存储）、**20 → 22**（瀑布零注册 + 两项槽计数）、**74**（不变，
  仅版本戳与槽查找跟进）。**合计 502 项全绿，4 套 exit 0。**
- 锚定字节：`lib/index.js` **46638 B / sha256 03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938**
  （rev-9 为 27592 B / 75188B4C…）、`lib/client.js` **133812 B / sha256 2078125FCADDDC3AF9CEADE6585A321BF65B79B91E64DB4D244133832FD7CBB4**
  （rev-9 为 84171 B / 5051558C…）；自测文件：`verify/_harness.mjs` 24822 B / 18C2055A…、
  `verify/host-half.test.mjs` 29652 B / E33F9889…、`verify/client-half.test.mjs` 58941 B / 818C9216…、
  `verify/waterfall.test.mjs` 8888 B / 010811A5…、`verify/custom-audio.test.mjs` 19872 B / D4FF3077…。
- **文档**：README（§3.2 新行为/存储路径/上限/有效值/端点/语义、§4 计数与覆盖面、§5 新验收信号、§6 触发改为逐会话、
  §7 诊断接口、§8 自绘 popover、§9 新增 H14-H18）；`docs/契约调研.md` 新增 **§L**（会话头部槽 + 待审批表以 sessionId 为键 +
  home 规则 + 覆盖文件自身的约束，全部带宿主 `文件:行号`）；`docs/挂载与验收.md` 新增 **§7.1**（9 步手工验收：
  铃铛两态、静音一个会话、两个会话各响各的、每会话音色覆盖、存储位置、恢复跟随全局、零回退）。
- ⚠️ **rev-10 改了两半**：新路由与新文件都在 `lib/index.js`，**必须重启 `dsh web`** 再刷新页面；
  只刷新会出现「铃铛在、写入报错」（客户端半对上了旧宿主半，404）。
- **未证实（照旧不写成通过）**：真机上的点击/悬浮观感与 popover 实际定位、`order:30` 的视觉落点
  （本机 profile 未装 `agent-team`，其 order 无法实测）、真实浏览器里 `position:fixed` 是否被带 `transform` 的祖先裁剪、
  同会话连续两次点击的应答乱序窗口（记录为 H17，未加请求序号）。这些都在沙箱里无法实测。

## rev-9 · slim switch（真机反馈：开关太胖 + 开启色改用音量条的蓝）

需求（用户，看过 rev-8 的真机画面）：「开关打开颜色改成跟音量进度调的颜色一样。开关太胖了你直接
照着苹果系统的开关弄就行了」。

- **改瘦**：轨道 51×31 → **38×22**，滑块 27px → **16px**（`top/left:2px`，行程
  `translateX(16px)`）。这就是苹果 macOS 开关的几何，也正好是 dsh-market 自己那排开关用的
  （`38×22` / 16px 钮 / 2px 内缩，`dshmarket/src/client/Market.module.css:622-626`）。
  rev-8 照的是 iOS 的 51×31 —— 放在 13px 的行里又高又壮，**只有真机才看得出来**，故本版按反馈收窄。
- **开启色统一**：`--dsw-alias-state-success-primary`（绿）→
  **`--dsw-alias-state-business-primary,#2563eb`**，与音量滑杆的 `accent-color` 是**同一个令牌**，
  所以「开」和进度条**构造上**同色，而不是两处各写一个值碰巧一样；测试直接断言两条规则里出现同一令牌。
- **关闭态更有形**：加 1px `--dsw-alias-border-l2` 描边 + `--dsw-alias-bg-layer-2` 底（沿用 dsh-market
  的做法），深色主题下关闭态也有清晰轮廓（原先只是一块半透明灰）。
- 动效由 `cubic-bezier(.4,0,.2,1) .22s` 换成 `.18s ease`（与 dsh-market 的 `.15s ease` 同量级）；
  `prefers-reduced-motion` 仍关闭过渡；焦点环改用同一蓝令牌的 35% 混色。
- **语义仍未动**：原生 `<input type=checkbox>` + `role="switch"` + `aria-checked` + clip（非 display:none），
  Tab 可聚焦、空格可切换、不可写时 50% 不透明。
- **自测**：`client-half` 154 → **155** 条（几何断言改为 38×22 / 16px 钮 / 16px 行程，并新增一条
  「开关与滑杆同令牌」的断言）；`custom-audio` 的版本戳跟进。现为 **56 + 155 + 20 + 74 = 305 项全绿**。
- 锚定字节：`lib/client.js` **84171 B / sha256 5051558C49168133DA24FB479742BE074DB6F5640F0F56344FD7F5FAC6596597**；
  宿主半未动（27592 B / 75188B4C…）；`verify/client-half.test.mjs` 30447 B / EE668935…、
  `verify/custom-audio.test.mjs` 19397 B / A8EEB61F…。
- **未证实（照旧不写成通过）**：真机观感仍待用户重启 `dsh web` + 硬刷新后确认（沙箱无浏览器引擎）。
  38×22 与 16px 钮取自苹果 macOS 开关，且与 dsh-market 的既有开关同尺寸 —— 两个独立来源一致。

## rev-8 · ios switch（「启用提示音」换成苹果式拨动开关）

> ⚠️ **已被 rev-9 取代**：几何（51×31/iOS → 38×22/苹果 macOS）与开启色（绿 → 音量条同款蓝）都改了。
> 本节保留为当时的记录 —— rev-8 的 51×31 只在真机上才暴露出「太胖」。

需求（用户，附参考图）：「把启动提示音开关弄成图片一样，图片是苹果的开关按钮」。

- **画法**：新增 `.dacToggle` / `.dacSwitch` / `.dacKnob` 三条规则 —— 轨道 51×31、圆角 999px，
  关闭态 `rgba(120,120,128,.32)`（iOS 的灰），开启态
  `var(--dsw-alias-state-success-primary,#34c759)`（宿主成功色，回退 iOS 绿）；滑块 27px 白色圆、
  `top/left:2px` + 双层投影，开启时 `translateX(20px)`（51 − 27 − 2×2 = 20，几何自洽），
  过渡 `0.22s cubic-bezier(.4,0,.2,1)`。
- **语义一个都没丢**：真正的控件仍是原生 `<input type="checkbox">`，另加 `role="switch"` 与
  `aria-checked`；它被 `clip:rect(0 0 0 0)` **裁掉而不是 `display:none`** —— 所以 Tab 仍能聚焦、
  空格仍能切换、`:focus-visible` 仍给出 3px 焦点环，禁用态经 `data-disabled` 降到 50% 不透明。
  状态由 `data-on` / `data-disabled` 投到被绘制的 span 上（CSS 读不到 React 的 `checked` prop）。
- `prefers-reduced-motion: reduce` 下关闭过渡（宿主自己的样式也是这么做的）。
- **自测**：`client-half` 由 143 → **154** 条（新增：input 报 `role=switch`、`aria-checked`、
  恰好一条轨道与恰好一个滑块、`data-on` 开/关两态、轨道 `aria-hidden`、可写时 `data-disabled=false`、
  CSS 几何四条、clip 而非 display:none、reduced-motion）；`custom-audio` 的版本戳断言跟进。
  现为 **56 + 154 + 20 + 74 = 304 项全绿**（4 套 exit 0）。
- 锚定字节：`lib/client.js` **83567 B / sha256 1D78FDEC0D201C2B404801C2A580DEC1366ADB79E1A49AA13C70217797D9A4D7**；
  宿主半未动（27592 B / 75188B4C…）；`verify/client-half.test.mjs` 30233 B / 5C2E442D…、
  `verify/custom-audio.test.mjs` 19397 B / B037DFCF…。
- **未证实（照旧不写成通过）**：真实浏览器里的观感 —— 开关的像素、过渡是否顺滑、深色主题下的对比
  与焦点环 —— 本沙箱内无法证实（无浏览器引擎，Edge 启动即 `FATAL:mojo platform_channel 0x5`）。
  尺寸与配色取自 iOS 规范值、几何由算术保证；真机仍需用户重启 `dsh web` + 硬刷新后确认。

## rev-7 · notifications section（设置入口从「插件」迁到「通知提醒」）

需求：把提示音插件的设置从「设置 → 插件 → 插件配置」迁出，改成独立的「设置 → 通知提醒」分区；
功能一项不丢，四套回归全绿。

- **注册槽换掉**：客户端半不再注册插件页那张卡片，改为
  `ctx.slots.inject('settings.section', …)` +
  `register({name:'settings.section', id:'approval-chime', order:16, label:<thunk>, locale:'approval-chime'})`。
  那张卡片原先由 `dsh-client-ui-settings-plugins` 的「插件配置」标签页按「宿主命名空间 × 卡片 key」派发
  （`lib/client.js:1140-1152`），不再注册即干净消失——**宿主半 `lib/index.js` 一个字节都没改**，
  它只负责注册设置命名空间，与入口位置无关。
- **新分区页**：`<section>` 容器（`max-width:720px` + `flex-direction:column` + `gap:12px`，照抄宿主
  `.section` 规则）→ 唯一一个 `<h2>`「通知提醒」+ 右上角 bundleRevision 徽标 → 一行 intro
  （旧的页级标题「审批提示音」不再出现，避免两个互相竞争的大标题）→ 原封不动的控件面板：
  启用勾选、音量滑杆 0..100、音色下拉（导入项在前）、导入按钮 + 隐藏 file input + 选中自定义音色时的「移除」、
  试听、恢复默认、抑制原因行、只读/已覆盖徽标、错误行、统计行。标题 16px/500/24、intro 14px/22 +
  `--dsw-alias-label-tertiary`，对齐宿主 `dsh-client-ui-settings-models` 的 `.title/.intro`
  （`lib/client.js:58` 的 `.zGbnIq_*` 规则）。
- **导航文案**：字典新增 `nav`（zh 通知提醒 / en Notifications）并与 `title` 同文；`label` 是
  **thunk**（每次投影重读，`dsh-cordis-client-runner/lib/client.js:3894`），内部解析
  `ctx.locale.bind(NS)` 返回的翻译器（`dsh-client-locale/lib/client.js:1283-1304`），因此切换语言后
  导航行立即跟随——测试断言 zh→en→zh。id `approval-chime` 为自用 id，不会顶替
  general/models/plugins/agent-presets 任何一行；order 16 紧跟「插件」15、在「Agent 预设」20 之前。
- **此前修好的缺陷原样保留**（未触碰）：`::picker(select)` 的 `box-sizing:content-box;max-height:84px`
  （= 3×28px 行高，第 4 项起滚动）、`border-radius:10px`、导入上限 50、空白名回退 id、
  超限 413 先读干再应答。断言仍覆盖这些常量（client-half 断言 CSS 两条；custom-audio 断言 84px/50/413/空白名）。
- **自测**：`client-half` 由 103 → **143** 条（新增设置注册形态/id/order/label thunk + 语言切换、
  「从未注册或提及插件页槽」、唯一 `<h2>` 与导航文案一致、intro、条件行（只读徽标/错误行/抑制原因行）、
  分区排版 CSS、rev-7 戳），旧的插件页槽断言全部替换；`custom-audio` 由 70 → **74** 条
  （修订戳与槽断言更新，新增唯一 `<h2>` 与「已覆盖」徽标）。现为 **56 + 143 + 20 + 74 = 293 项全绿**（4 套 exit 0）。
- 锚定字节：`lib/client.js` **80889 B / sha256 6B9C38CE738859C4D0007EE027B994353242D4C8C974B1E39A420CF48D54F5D1**
  （宿主半未改，仍 27592 B / 75188B4C…）。
- 文档：README §3 入口路径改为 设置 → 通知提醒、§4 计数/描述与 §7 自证接口同步；
  `docs/挂载与验收.md` §7 导航路径更新；`docs/契约调研.md` 新增 §K（`settings.section` 合同，带宿主 `文件:行号`）。
- **本机验收（交给 t5/用户执行；本轮未执行、未证实）**：需重启 `dsh web`（bundle 字节在启动时读入内存）→
  刷新页面 → **应**在设置面板左侧看到独立一行「通知提醒」（在「插件」之后）、进入后是分区页；
  **应**在插件页看不到本插件。**这一步本轮没有做**：真实 `dsh web` 端到端与浏览器渲染在本沙箱内未证实
  （沙箱无浏览器引擎、不允许起/替换 Web 服务器）；未证实清单见 `docs/rev7-独立验证.md` §8（5 项）与
  `docs/rev7-需求符合性审查.md` §10。请勿把本条读作已完成的真机验收（与 rev-1 条目里确实执行过的
  「真机验收」不同）。
- **未证实项（rev-7 新增）**：`settings.section` 未被官方文档写明为「第三方扩展点」（它是宿主设置外壳
  自己声明的槽，契约依据见 `docs/契约调研.md` §K）；真实浏览器里导航行的插入位置与图标未实测
  （未知 id 由宿主回退到齿轮图标，`dsh-client-ui-settings-general/lib/client.js:76-93`）。
  注册整体包在 try/catch 里：失败只丢导航行，不影响提示音。

### rev-7 · 文档修复（t4 repair-round-2：代码字节未动）

来源：`docs/rev7-需求符合性审查.md`（t3，verdict=needs_revision）的 DOC-R7-1/2/3 与观察项 OBS-R7-1。

- **DOC-R7-1（medium，已修）**：`docs/契约调研.md` 里仍把旧入口写成现行做法的两处已改写——
  §J「给下游的一页摘要」第 4 条改为 `settings.section` 注册形态
  （`{name:'settings.section', id:'approval-chime', order:16, label:<thunk>, locale:NS}`，指向 §K.2）；
  §E.3 挂载步骤第 5 步的验收信号改为「设置导航出现独立一行『通知提醒』；设置 → 插件 → 插件配置里不再出现本插件」。
  §K 的取代横幅**扩写到覆盖 §C / §E.3 / §G.3 / §J**，并声明 `docs/rev4-*`、`docs/rev5-*`、`docs/rev6-*`、`docs/验证报告.md`
  同属历史轮次记录（描述当时形态）；§G.3 的标题与代码块上方标注「**历史骨架：入口形态以 §K 为准**」。
- **DOC-R7-2（low，已修）**：本条目上方的「本机验收」已改写为「**交给 t5/用户执行；本轮未执行、未证实**」口径，
  并指向 `docs/rev7-独立验证.md` §8 的 5 项未证实清单（真实浏览器渲染 / 导航行外观 / 真实 `dsh web` 端到端 /
  真实文件对话框 / 真实音频输出）。
- **DOC-R7-3（low，已修）**：`docs/验证报告.md` 头部加 rev-7 横幅（入口路径已迁移 → `docs/契约调研.md` §K、
  `README.md` §3），其 §8 的人工清单标注为 **rev-1 形态**（第 1 项同时给出 rev-7 的等价步骤）。
- **OBS-R7-1（low，引用修正）**：agent-presets 的 `order: 20` 引用改为
  `dsh-client-ui-agent-preset/lib/client.js:1520-1522`（`docs/契约调研.md` §K.1 已改；occupants 清单
  `dsh-cordis-client-runner/lib/client.js:3911-3916` 保留为 **id 的第二来源**，因为它不含 order）。
  `lib/client.js:58` 与 `:1768` 携带**同一处**过期指针，但该文件是已验证并冻结的字节锚
  （t2 的独立验证 §1 与 t3 的审查都锚在这份 sha256 上），**按 captain 边界本轮有意不改**——
  取舍与正确引用已显式记在 `docs/契约调研.md` §K.1 表下方（「一处『有意不改』的过期指针」）。
- **本轮未动代码**：`lib/**`、`verify/**`、`verify-independent/**`、`README.md` 的 sha256 与 t2 收工基线
  `verify-independent/_raw/r7-baseline-after.txt` 逐行一致（本轮只改文档：本文 + `docs/契约调研.md` + `docs/验证报告.md`），
  因此上面的锚定字节 `lib/client.js 80889 B / 6B9C38CE…` 仍然有效（已与磁盘实测复核）。
- 四套 harness 只作回归复核（不承担验证职责）：56/143/20/74，四条 exit 0。

### rev-7 · 市场简介（package.json / README 文案；运行时代码零改动）

需求（用户）：「插件市场 → 已安装」里 `deepseek-harness-background` 那一行显示了一段作者简介，
而 `dsh-approval-chime` 那一行的灰色文字只有 `link:D:/…` 源路径 —— 给本插件也写一段详细介绍。

- 那段灰色文字是**依赖 spec**（`dshmarket:src/client/MarketSection.tsx:4606-4653`）：`link:` / `file:` /
  `github:` 这类 spec 是这一行**唯一**说明「插件从哪来」的地方，市场明确选择保留；只有 `version` 存在
  且 spec 是纯版本区间时才隐藏（`specRedundant`，`:4611`）。所以那行路径**不是**能替换成介绍文字的位置。
- 介绍文字在 spec 下方**独立一行**，来源只有两个（`:4681-4708`）：精选目录条目的 `description`
  （`:4683`，`entry?.description[lang] || entry.description.en`）或**用户自己的备注**
  （`notes[name]`，≤200 字符，`MAX_NOTE` 见 `dshmarket:src/hot.ts:308`，存 `<profile>/.dsh-market/state.json`）。
  本插件是本地 `link:` 安装、未上架精选目录（收录走 awesome-dsh-plugin 的 PR，见该插件 `README.zh.md:81`），
  目录里查不到它 ⇒ 该位置为空。**这不是我们的 bug，是市场的设计。**
- 本次落地：把详细介绍写进**两处我们自己的权威位置** —— `package.json` 的 `description`（169 字符，
  写在备注 200 字符上限之内，可原样粘贴）与 `README.md` 首段（同一文案）。想在市场卡片上看到它，
  点那颗「添加备注」把同一段贴进去即可 —— 备注位就是那个介绍位。
- 锚定字节：`lib/client.js` 80889 B / 6B9C38CE…（**未动**）、`lib/index.js` 27592 B / 75188B4C…（**未动**）；
  `package.json` 973 B / D483E65F094EC41299DD03894A840146FB9ADB4D42E3B55BB0B955A409097B4D、
  `README.md` 22131 B / A82F40CBA2C31252F6B49EFA3644AB49123FEF8F736D0F3BA2AC8613D508C7DD。
  README 因此在 t2 基线 `r7-baseline-after.txt` 之上有差异 —— **已验代码字节不受影响**（那条基线锚的是 `lib/**`）。
- 四套 harness 复跑 56/143/20/74，四条 exit 0（`package.json` 只改 `description`，`host-half` 的包结构断言不涉及该字段）。
- 说明性取舍：`description` 由英文改为中文（对齐参照插件的做法）；若将来上架 npm 需要英文元数据再补。

## rev-6 · case-closed ids（N3 收尾 + 文档校订）

来源：`docs/rev5-复验.md`（t3 复验）的 N3/R-RESID 与 `docs/rev5-需求复审.md`（t4 复审，verdict=pass）的 DOC-1。

- **N3（low，端到端可达）**：rev-4 的 D2 只修好了 `tone` 一侧 —— `custom[].id` 仍是裸字符串、
  浏览器半的 `CUSTOM_ID` 仍带 `/i`，而路由是大小写敏感的 ⇒ 手改设置文档塞入大写 id 会得到一个
  **"能选、但试听必然 404"的死选项**。现在两侧一致收紧为小写 uuid（schema `custom[].id` 加 pattern、
  浏览器半去掉 `/i`），大写 id 既不可存也不可渲染。
- **R-RESID（low）**：纯空白的显示名会被 trim 成空 → 回落到 id，不再渲染成一行"看起来空"的选项。
- **DOC-1（文档）**：`docs/rev4-独立验证.md` 追加 §8 校订，更正该报告 §5 U1 里"`::picker` 保持
  content-box、92px 正好 3 行"的推断（UA 实际给的是 border-box），并记录 rev-5 的修法与 rev-6 的收尾。
- 自测：`host-half` 新增两条正向断言（拒绝非小写 uuid 的 roster id）后为 **56/56**，其余不变
  （103/20/70），合计 **249 项全绿**。
- **残余 low（记录在案、不阻塞）**：
  - N1 未超上限的停滞上传没有插件级时间上界 —— 载体（Node http）默认 300 s 有界，加插件定时器反而会
    引入"慢但合法的上传被拒"的新失败模式；本地单人 GUI 下选择不加，若将来把 GUI 暴露到本机之外需重新评估。
  - N2 流式超过约 2× 上限会被 RST 而非 413 —— `refuseOversized` 注释里声明的宽限取舍；插件自身 UI 走不到
    （客户端先做体积预检）。
  - O4 弹层外框在 content-box 后为 94px，若 UA 以内容盒锚定宽度可能比选择框宽约 10px —— **未证实**，
    需要真实浏览器；真人验收时留意（若明显偏宽，改成 `border-box` + `94px` 即可，不影响判定）。

**验证状态（t5，独立窄复核，attempt 2）**：N3 ①②③④ 与 R-RESID **全部 PASS，未发现新缺陷**；
全量回归 4 套 harness 56/103/20/70 全绿 + 该成员 474 项探针断言 + reviewer 78 项，全部通过。
报告 `docs/rev6-复验.md`，一键复跑 `verify-independent/run-r6.ps1`。
锚定字节：`lib/client.js` 72730 B / sha256 5A925E1E…、`lib/index.js` 27592 B / 75188B4C…。

- **O-1（测试卫生，已修）**：`verify/custom-audio.test.mjs` 原先的"audio/ 目录为空"断言会被**任何**外部
  遗留文件误伤 —— 实跑时曾报出 2 个 13 B、无法归属来源的孤儿 `.mp3`（并发跑探针期间产生），使结果看起来像
  产品回归。现改为**与本次运行开始时的快照比较**；实测在 `audio/` 中故意放入外来文件后仍 70/70，
  且该外来文件原样保留（测试不再删别人的文件）。

## rev-5 · review fixes（修正两轮独立验证与需求审查发现的缺陷）

来源：`docs/rev4-独立验证.md`（宿主路由，455 断言 / 451 通过）、`docs/rev4-浏览器半独立验证.md`（262 断言）、`docs/rev4-需求符合性审查.md`（R5-1 等）。

### medium
- **R5-1 弹层第 3 行被裁、默认就有滚动条**：`::picker(select)` 的 `box-sizing` 由 UA 样式表定为
  `border-box`，原 `max-height:92px` 的实际内容区只有 `92-8-2=82px`，而 3 行需要 `3×28=84px`
  ⇒ **一个文件都没导入时打开下拉就已出现滚动条并裁掉第 3 行 2px**，与需求相反。
  修：该规则显式 `box-sizing:content-box` + `max-height:84px`。
- **D1 超限 413 永远到不了客户端**：原实现先 `reject` 再 `req.destroy()`，413 被写进已销毁的
  socket（客户端 0 字节或 `ECONNRESET`）。三次实测后定为：**先把剩余请求体读干（丢弃）再应答
  413**（`Connection: close`）—— 因为 Node 在「响应已结束但请求未读完」时会立刻销毁 socket，
  只有等发送方写完，413 才真的能到达。Content-Length 与 chunked 流式两种写法均已验过。
- **F1 同步抛错穿透宿主监听循环**：`fetch` 同步抛错时异常从 `playSample` → `chime()` 一路抛进宿主
  的 `pendingInteractions` 通知循环；导入路径同根因把按钮永久卡在「导入中…」。
  修：`loadSample`/`uploadAudio` 把同步抛错转成 rejection，`chime()` 与导入路径各加一层兜底
  （计数与 `lastError` 照常记录，不再逃逸）。

### low
- **D2** id 正则去掉 `i`：大写 uuid 曾被 schema 接受却永远 404，渲染成死选项。
- **D3** `findAudioFile` 改为**精确基名 + 已知扩展名**匹配，不再前缀扫描（`<id>.aaa` 不会顶替
  或错删 `<id>.mp3`）。
- **D4/F4** 浏览器半的显示名按**码点**收敛到 120 并剥离控制字节，与宿主同界（原可把 20 万字符
  的名字渲染成一个 20 万字符的 option）。
- **F5** 宿主 120 字截断改为**码点**截断，不再切断代理对（emoji 会变成替换字符）。
- **F6** 上传名先 `trim`，扩展名按**最后一个点**取；无扩展名时按 MIME 兜底 —— 原 `'audio'` 兜底
  与尾随空格名都必然被 415 拒绝，而文件其实完全合法。
- **F2（更正文档措辞）**：**审批触发**在 `volume=0` / 关闭时不创建 AudioContext；**「试听」是
  显式用户动作，会有意解锁音频上下文**（首次点击即解锁是刻意设计），但同样不发声。
- **F3** `enabled=false` 时的试听也计入 `suppressedDisabled`（此前只有审批路径计数，卡片上
  "为什么没响"的一行会随入口不同而不同）。
- **R4-CAP** 名册满 50 时**先拒绝导入**（竞态兜底里会删掉刚上传的文件），不再把第 51 个显示成
  「（文件缺失）」——那是对一个真实存在的文件说谎。
- **R4-RACE** 导入成功后在**写入时刻**重读名册再追加（多标签页并发的残留窗口记为已知限制）。

### 残留 FAIL 说明（复跑独立探针时可见）
两份探针的期望表里有多条编码的是 **rev-4 的旧行为**，rev-5 有意改变，故仍显示 FAIL：
`.mp3` 与 `payload.mp3 ` 的 415（现按 F6 接受）、大写 uuid 被接受（现按 D2 拒绝）、
`rev-4` 版本戳（现为 rev-5）、20 万字符名不被截断（现按 D4 截断）、`max-height:92px`（现为
`content-box;84px`）、`enabled=false` 试听不计数（现按 F3 计数）、以及 probe-8 那三条
"同步抛错会逃逸"（现按 F1 不再逃逸 —— 这三条由 FAIL 转为"nothing was thrown"正是修复证据）。

## rev-4 · custom audio（导入自定义音频）
- 新增「导入音频」按钮（在音色选择框右侧）：选择本地音频 → 浏览器 `POST` 到宿主半新增的
  `/api/approval-chime/audio` → 宿主写入插件目录 `audio/<uuid>.<ext>` → 把 `{id, name}` 追加进
  设置文档的 `custom` 名册并立即选中播放。
- 名册**按导入先后**排列，渲染在三个内置音色之前：第一个导入的排第一。
- 弹出列表固定显示 **3 行**，第 4 项起滚动（`::picker(select)` 的 `max-height`）。
- 选中导入音色时出现「移除」：删文件 + 出名册；「恢复默认」不删文件。
- schema：`tone` 从「三个 const 的 union」放宽为「三个 const ∪ `custom:<uuid>` 模式」——
  **仍然拒绝**任意字符串，只是精确开了这一个口子；新增 `custom` 数组字段（默认 `[]`）。
- 安全/边界：id 必须是 uuid（路径形状的 id 到不了文件系统）；扩展名白名单（否则 415）；
  5 MB 上限且**拒绝而非截断**（413）；GET/HEAD/DELETE 齐备，缺失文件删除幂等。
- 降级：`webServer` 走**可选注入**（`ctx.get` + `ctx.inject`），不是硬依赖 —— 没有 web server
  时只打一行警告，内置音色照常工作，绝不把 profile 的启动拖下水。
- 新增 `verify/custom-audio.test.mjs`（70 项）：真实 fs 上跑完整 上传→取回→删除 与全部拒绝路径、
  schema 仍然拒绝垃圾音色、渲染顺序（含丢弃畸形/重复名册项）、3 行滚动 CSS、以及自定义音色
  真正播放（fetch 一次、decode 一次、增益 = `volume/100 × MASTER_GAIN`、二次触发不重取）。
- ⚠️ 改的是宿主半 → **必须重启 `dsh web`** 才生效（路由与 schema 在宿主进程内）。

## rev-3 · rounded picker
- 音色下拉的**弹层**改为可定制渲染：`appearance:base-select` + `::picker(select)`。
  弹层四角 10px 圆角、与卡片同源的底色与文字色、选项 7px 圆角并带 hover/选中反馈。
- 动机：原生 `<select>` 弹层由浏览器绘制，`border-radius` 无法作用于它（选项背景能改、
  圆角改不了）。
- 降级：不支持该特性的浏览器（Chrome/Edge < 135）忽略该 `@supports` 块，退回 rev-2 的
  「深色方角」观感，功能不受影响。
- 复跑：`client-half` 103/103、`waterfall` 20/20，`node --check` 通过。

## rev-2 · dark tone menu
- 修正展开后选项列表沿用浏览器浅色默认、在深色主题下文字发灰的问题：选项背景与文字
  改用**卡片自身同源的宿主设计变量**（`--dsw-alias-bg-layer-1` / `--dsw-alias-label-primary`），
  而不是写死深色，因此切换主题时下拉会跟着变。
- 动机：用户反馈「选项背景跟周围不一致、文字看不清」。

## rev-1 · pending-interactions
- t2 交付 → t3 独立验证（331 项独立断言）→ t4 评审 **verdict=pass** 的修订。
- 锁定哈希：`lib/index.js` E5E2008A…、`lib/client.js` 1F3E5B60…、`package.json` 7C633060…、
  `cordis.patch.yml` 2DC7C5B1…。
- 真机验收：真实审批请求 → `approvalsSeen: 1` / `triggers: 1`，音量 50 → `lastGain: 0.3`，
  设置落盘 `settings.yaml` 的 `approval-chime` 段。
