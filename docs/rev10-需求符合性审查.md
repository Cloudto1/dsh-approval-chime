# rev-10 需求符合性审查（质量门 · t3）

> ⚠️ **本文件是 rev-10 时点的判定记录（needs_revision），不再代表当前字节。**
> 其中唯一的阻断项 **F-01** 已由 rev-11（`lib/client.js` 137971 B / `36BDD86B…`）修复；`verify-independent/**` 的期望值由 t6 更新；
> 复审结论见 **`docs/rev11-需求复审.md`（verdict = pass）**。本文件引用的行号对应 rev-10 的字节（`lib/client.js` 133812 B / `2078125F…`），修复后已整体位移。

> **一句话结论：`verdict = needs_revision`。**
> 用户拍板的四条（①A 语义 / ②B 落点 / ③小铃铛 / 「每个会话声音独立」的三项）**逐条都有我本人复跑出来的正面证据**，
> 零回退与文档-字节一致也成立（五条 acceptance 里四条完全成立）；
> 但**第 ①A 条不能无条件判定成立**：铃铛的写入路径存在一个**实测、可复现**的应答乱序窗口
> （`F-01`，medium），窗口内本地表会与宿主文件相反、且**直到刷新页面都没有收敛路径**——
> 而逐点核对"①A 全成立"正是本合同的门槛，故本轮**不予背书**。
> 另有一条**验证基础设施**层面的 low 发现（`F-02`：重新基线化后 probe-10/probe-16 的"没有任何请求"断言字面已不成立）。
>
> 判断边界写在 §5/§6/§7：F-01 的可达性被我自己量出了上界（需两次点击落在同一个"POST 未落地"窗口内，
> 本机往返中位数 3.33 ms、p99 6.81 ms；间隔 ≥5 ms 的 2400 轮里 0 分歧、0 丢点击），
> 但**沙箱没有浏览器引擎**，我无法否证"真机上两个点击事件被同一个事件突发派发"这条路，
> 所以既不能把它写成"不可达"，也不能给 ①A 盖章。修法很小、且 t2 已证明"只加 revision 栅栏不够"。

---

## 0. 判定（按合同 acceptance 顺序）

| # | acceptance | 判定 | 主证（我本人复跑/亲读） |
| --- | --- | --- | --- |
| 1 | ①A 语义：默认跟随全局 / 关一个只影响那一个 / 开回来=真回到跟随全局（不是写 true）/ 全局关时未覆盖会话静默 / 新会话天然跟随 | **不成立（仅因 F-01）** | 正面：`lib/client.js:983-1004`（`覆盖 ?? 全局`）、`:1181-1184`（只写 `false`/`null`）、我自己的宿主探针 3b/3f/4a/4c/4d；反面：`lib/client.js:1153-1178` 的应答乱序窗口（F-01） |
| 2 | ②B 落点：插件自己的文件、原子写、设置文档无会话数据、无浏览器存储、200 条按 updatedAt 淘汰 | **成立** | 我自己的宿主探针 48/48（§3.2）；`lib/index.js:163-171/740-747/787-798/884-902`；`settings.yaml` 实测无会话数据；`lib/**` 无 `localStorage/sessionStorage/indexedDB/caches./document.cookie` |
| 3 | ③ 小铃铛：槽位在会话头部标题旁、与既有占用者共存、两态图标、中英双语 title/aria-label、点击语义与 ①A 一致 | **成立** | 宿主契约实测（`dsh-cordis-client-runner/lib/client.js:3102-3156`）；`client-half` 517-548/558-561；`probe-18` 日志 7-23/35-40 行 |
| 4 | 每会话声音独立：同批各响各的（顺序+间隔）/ 每会话可覆盖音色音量、缺省继承 / 缺失自定义音色回退全局 | **成立** | `client-half` 766-812（4 条 pending → 3 响、180 ms、各自音量、静音计数）；`probe-18` 日志 68-78 行；`client-half` 738-762 |
| 5 | 零回退 + 文档与字节一致：全局设置页未受影响 / REVISION=rev-10 且诊断既有键未删 / 文档与磁盘 sha256 一致 / 未证实项如实标注 | **成立** | 四套 harness 502/502（我复跑）；诊断键 18→25 **零删除**（我直接对 HEAD 字节比对）；CHANGELOG:61-62 与实测 sha256 一致；README §9 H14-H18 + `docs/rev10-独立验证.md` §11 |

**结论**：四条完全成立，①A 因 `F-01` 不能无条件盖章 → `needs_revision`。
F-01 的**最小修法**（不是重做需求）见 §5.1；其余部分**可交付**（§6「可交付清单」已逐项列明）。

---

## 1. 被审字节与产物边界

| 项 | 我实测的值 |
| --- | --- |
| `lib/index.js` | 46638 B / sha256 `03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938` |
| `lib/client.js` | 133812 B / sha256 `2078125FCADDDC3AF9CEADE6585A321BF65B79B91E64DB4D244133832FD7CBB4` |
| `REVISION` | `rev-10 · per-session chime`（`lib/client.js:128`；`probe-18` 日志 166 行的页面文案也带它） |
| 对照基线（上一轮） | `git show HEAD:lib/client.js` = 84171 B / `5051558C…`，`HEAD:lib/index.js` = 27592 B / `75188B4C…`，`REVISION = 'rev-9 · slim switch'` |

本轮审查**只读**：没有改动 `lib/**`、`verify/**`、`verify-independent/**`、`README.md`、`CHANGELOG.md`（§9 末尾有 `git status` 证据）。
唯一交付物是本文件；复核脚本与日志放在 **`.scratch/reviewer-r10/`**（该目录是审查者自用的取证脚本，不是交付物）。

---

## 2. 我自己复跑的命令（不只读 t2 报告）

| # | 命令 | 结果 |
| --- | --- | --- |
| 1 | `node verify/host-half.test.mjs` / `client-half` / `waterfall` / `custom-audio` | 124/124、282/282、22/22、74/74，**合计 502/502，四个 exit=0** |
| 2 | `cd verify-independent && node probe-18-r10-sessions.mjs` | `assertions passed=130 failed=0`，exit 0（与 t2 的 130/0 一致） |
| 3 | `node .scratch/reviewer-r10/host-sessions-probe.mjs`（**我自己写的**宿主探针：真 `lib/index.js` + 真 HTTP + scratch `$DSH_HOME`） | **48 assertions passed=0 failed**（§3.2 全表） |
| 4 | `node .scratch/reviewer-r10/diagnostics-keys.mjs`（对 `HEAD:lib/client.js` 与当前字节比对诊断键） | rev-9 的 18 键**一个未删**，新增 7 键（`sessionSlot`/`sessionAction`/`batchGapMs`/`sessions`/`sessionSettings`/`toggleSession`/`refreshSessions`） |
| 5 | `node .scratch/reviewer-r10/probe-18-gap.mjs --race-rounds=400 --race-raw --click-gap=<0,5,20,60,150,400>`（probe-18 的**副本**，只加"两次点击之间真等 N ms"） | §5.2 表：gap=0 时宿主文件 201/400 轮停在"静音"、客户端 0/400 分歧；**gap≥5 ms 全部 0/400** |
| 6 | `node .scratch/reviewer-r10/post-latency.mjs` | 每会话 POST 往返（本机 loopback，n=200）：min 2.03 / median 3.33 / p90 4.36 / **p99 6.81** / max 24.90 ms |
| 7 | `node --input-type=module -e "…DSH_HOME='   '; USERPROFILE=…"` | 纯空白 `$DSH_HOME` → `C:\Users\fake-home-for-review\.dsh\approval-chime\sessions.json`；设了值 → `D:\real-home\approval-chime\sessions.json` |
| 8 | 对 `lib/**` 全文 grep `localStorage|sessionStorage|indexedDB|caches.|document.cookie|window.name|cookieStore` | **0 命中** |
| 9 | 读活体设置文档 `~/.dsh/settings.yaml`（`$DSH_HOME` 实测 = `~/.dsh`） | `approval-chime: { volume: 50, tone: chime, enabled: true }` —— **只有三个全局键，没有任何会话数据** |
| 10 | 读宿主契约源码（只读）：`dsh-cordis-client-runner/lib/client.js:3102-3156`、`dsh-client-ui-agent-preset:1475-1477`、`dsh-client-ui-schedule:294-296`、`dsh-client-ui-jobs:267-269` | 槽是 `list`/`session`、"Title-adjacent"；id 必填且**新 id 是"增添"、复用官方 id 才是"顶替"**；`standardProps` 含 `sessionId`；已装占用者 order = **-10 / 10 / 20**，本插件 30 在它们之后；`agent-team` 包本机**不存在**（0 命中） |
| 11 | `git diff -U0 -- verify/` 逐行核对"既有断言一条未删" | 被删的 7 行断言**每一条都有同名/同主题的替换**，且多为**更强**（按槽名过滤而非数总数）；另有 4 行非断言改动（helper 形参、2 个 const、import 增补）→ §6 OBS-1 |
| 12 | 试图对真实 `dsh web` 发 `GET http://127.0.0.1:3080/api/approval-chime/sessions` | **401**（平台鉴权在路由之前），无法据此判定线上宿主半的新旧 → 仍列"未证实"（§7） |

---

## 3. 逐条取证

### 3.1 ①A 语义（用户原话「默认跟随全局，手动关掉哪个会话就只有它不响」）

| 要证的事 | 证据 |
| --- | --- |
| 默认跟随全局（新会话无需任何动作） | `lib/client.js:983-990`：`enabled = record?.enabled ?? globals.enabled`（volume/tone 同构）。断言：`client-half:703-706`（未覆盖 → 三字段都等于全局）、`:544`（无记录的会话铃铛是"开"）、`probe-18` 日志 54 行 D1 |
| 关掉一个只影响那一个 | 我自己的宿主探针 **3b**（文件里只有 `session-A` 一条）、**3f**（再关 B，A/B 都在，C 无记录）；`client-half:569`（"the bells of the other sessions are unaffected"）、`probe-18` 日志 47-48 行 C6/C6b（只静音 A，A 不响、B 照响，chime 里只有 B） |
| 开回来 = 真回到「跟随全局」 | `lib/client.js:1181-1184`：`view.enabled === true ? { enabled: false } : { enabled: null }` —— **只可能写 false 或 null**；`lib/index.js:928-931`：清空后的记录被删除（不落盘空行）。我自己的宿主探针 **4a**（记录消失）、**4c**（磁盘上只剩 B）、**4d**（文件里从不出现 `"enabled":true`）；`client-half:732` 直接断言这条源码串，`:580` 断言"可听回来了"；`probe-18` 日志 38-40 行 C2/C2b/C2c |
| 全局关掉 → 所有未覆盖会话静默 | `client-half:726-728`（未覆盖/仅音色/仅音量的会话全部 `enabled=false`）、`:736`（全局重新打开后恢复）；`probe-18` 日志 55/57-58/61 行 D2/D4/D8；`:1294-1301` 被本会话静音计 `suppressedSession`、被全局关闭计 `suppressedDisabled`（`probe-18` 日志 78 行 E10） |
| 不是三态、不是全局开关的复制品 | `client.js:2273-2278`（注释与实现都只有"两态 + 无 force-on"）；`probe-18` 日志 43 行 C3（点铃铛 `scope.sets=[]`，**全局设置一个字没动**） |

### 3.2 ②B 落点（用户原话「插件自己存一个小文件」）

我自己的宿主探针（`.scratch/reviewer-r10/host-sessions-probe.txt`，**48/48**）逐条：

```
ok 0a.sessions-file-under-DSH_HOME   :: <scratch>\approval-chime\sessions.json
ok 0b.route-path / 0c.cap-is-200     :: /api/approval-chime/sessions ; 200
ok 1a.exactly-one-registration / 1b.prefix-kind / 1c.one-row-carries-both-methods
ok 2a.empty-answer {"ok":true,"revision":0,"sessions":{}} / 2b.GET-does-not-create-the-file / 2c.GET 不碰 settings.yaml
ok 3a..3f 关 A：文件里恰好 A 一条（enabled:false + updatedAt），再关 B 时 A 不受影响
ok 4a..4d 开回来：A 记录消失、B 仍静音、磁盘无空行、文件里从不出现 enabled:true
ok 5a..5c 每会话音色/音量：{volume:30,tone:"bell",updatedAt} 且没有 enabled 键；settings.yaml 字节未变
ok 6.*    12 种非法输入 400（未知字段/非整数音量/字符串音量/大写 custom/非布尔 enabled/空白 id/…）且文件字节不变
ok 6h/6i/6j  未知路径 404、DELETE 405、>64 KiB 413；413 后文件字节仍不变
ok 7a/7b  目录里没有残留 .tmp；临时名形状 = .sessions.<pid>.<uuid>.tmp（lib/index.js:888）
ok 8a..8c 把 sessions.json 做成目录让 rename 必失败：500、目标逐字节不变、临时文件被清掉
ok 9a..9g 205 条种子 → 读回恰好 200；被淘汰的**恰好是最旧的 5 条**（s000..s004），最新 s204 保留；
          GET 不重写文件（仍是 205 条）；再 POST 一条后磁盘 200 条、最旧的被淘汰、新记录在
ok 10a/10b 整个 scratch home 里只多了 approval-chime/sessions.json
```

源码侧：`lib/index.js:163-171`（`$DSH_HOME` 去空白非空优先，否则 `homedir()/.dsh`）、`:740-747`（路径拼接）、
`:787-798`（`MAX_SESSIONS=200`，按 `updatedAt` 升序淘汰、同刻按 id 定序）、`:884-902`（**同目录**临时文件 + `rename`，失败 `unlink` 临时文件）、
`:842-870`（缺失/损坏/非对象/无 `sessions` 键 → 空表 + warn）、`:1014-1077`（一条 prefix 路由承载 GET/HEAD/POST，其余 404/405/413/400）。
`lib/index.js:311-333` 的 schema 只有 `enabled/volume/tone/custom` **四个全局键**——会话数据在结构上无处可进设置文档。
活体设置文档 + 我的 scratch 文档两处实测均无会话数据；`lib/**` 无任何浏览器存储 API（§2 #8）。
`probe-18` 日志 85 行 F2d（"不是设置文档"）、158-159 行 G1/G2（字节与运行时各 0 命中）、81-142 行 F1…F13c（HTTP 全谱）、
`r10-ind-probe-18-mutations.txt` 8/8 变异体精确报红（含"上限/原子写/400 校验"这几条声明）。

### 3.3 ③ 小铃铛

| 要证的事 | 证据 |
| --- | --- |
| 位置在会话头部标题旁、与既有占用者共存 | 槽合同实测：`kind:"list"`、`scope:"session"`、summary "Title-adjacent Session actions"（`dsh-cordis-client-runner/lib/client.js:3102-3106`）；`id` 必填且**"新 id 增添、复用官方 id 顶替"**（`:3109-3112`）、`replaceRisk:"none"`（`:3155`）；占用者清单含 `agent-preset`/`job-list`/`schedule-catalog`/`agent-team`（`:3149-3154`）。本插件用**自己的 id** `approval-chime`（`client.js:163`）、order=30（`:171`）；已装占用者实测 -10/10/20 → 30 在它们之后且不相等。注册形态断言：`probe-18` 日志 7-9 行（A1/A2/A3）。`agent-team` 本机**未安装**，其视觉落点仍属未证实（§7） |
| 开=实心铃铛、关=带斜杠 | `client.js:2177-2204`（未静音 2 条 path；静音时追加第 3 条 `className:'dacSlash'`）；断言 `client-half:521`（无 slash）、`:535`（恰 1 条 slash）、`probe-18` 日志 20 行 B4（`{unmuted:{pathCount:2,hasSlash:false}, muted:{pathCount:3,hasSlash:true}}`） |
| hover 提示与无障碍名都是「本会话审批提示音：开/关」且英文齐备 | `client.js:2230-2233` `sessionLabel()` 直接拼 `DICT.zh[key] + ' · ' + DICT.en[key]`（**不经过 `props.t`**，两种语言恒在）；`:2415-2416` `title` 与 `aria-label` 同一串；文案 `:1483-1484`（中）/`:1536-1537`（英）。断言：`client-half:526-527`（开：中英同串）、`:538-539`（关：中英同串）、`probe-18` 日志 17-18 行（`title=本会话审批提示音：开 · Approval chime for this session: on`） |
| 点击切换语义与 ①A 一致 | `client.js:2418` `onClick: toggle` → `:2395-2397` `toggleSession(sessionId)` → `:1181-1184`；`probe-18` 日志 36-40 行（C1 `{enabled:false}`、C1b JSON POST、C2 `{enabled:null}`、C2b `never-writes-true`）；`client-half:558-561`（POST 目标/方法/`content-type`） |
| 只读 `props.sessionId`；没有 sessionId 不渲染 | `client.js:2298`、`:2370`；断言 `client-half:548`、`probe-18` 日志 15/21 行（B1/B5） |
| 点铃铛不动全局设置 | `probe-18` 日志 23/43 行（B7 `scope.sets=[]`、C3 `scope.sets=[]`） |

### 3.4 每会话声音独立（用户原话「对了每个会话声音是独立的」= 三件事）

| 要证的事 | 证据 |
| --- | --- |
| 各管各的开关互不影响 | §3.1 的 C6/C6b + 我的探针 3b/3f/4b |
| **同时待审批时各叫各的（不再合并成一声）** | `client.js:1290-1310`：把这一批"新出现的 approval"逐个求 `sessionSettings` → `playable` 各 `schedule(entry, index * BATCH_GAP_MS)`，`BATCH_GAP_MS = 180`（`:178`）。断言：`client-half:782-803`（4 条 pending → `lastBatchSize=4`、`lastBatchPlayed=3`、`triggers` 在 0/240/440 ms 三次 +1、三个 **不同音量**的 gain 各成一声、`suppressedSession=1`、`suppressedDisabled=0`、`approvalsSeen=4`）；`probe-18` 日志 68-78 行 E1-E10（三次 chime `at=0/180/360`、顺序=快照顺序、静音会话不发声且单独计数） |
| 每会话可单独覆盖音色与音量、缺省继承全局 | `client.js:986-990`；断言 `client-half:712-722`（仅音色/仅音量/仅开关各自的真值表 + `overridden` 账本）、`probe-18` 日志 56-65 行 D3-D12（在**音频图**上验：音量 30 → gain 0.18；bell → triangle/659.25 Hz） |
| 自定义音色文件缺失 → 回退全局、不报错、不静默整段 | `client.js:989-990`（`customMissing` → `tone = globals.tone`）；断言 `client-half:739-743`（回退到**当前**全局音色并置 `customMissing`）、`:746-750`（名册空/有名册两种）、`:759-762`（下拉仍展示缺失项并写明"回退全局音色"，不会渲染成空白行）；`probe-18` 日志 64 行 D11 |
| 静音会话仍然被计数、但不发声 | `client-half:785-787`（`batchGains().length=1`、`suppressedSession=1`、`suppressedDisabled=0`）、`:803`（`approvalsSeen=4`）；`:808-812`（设置页出现"因本会话提示音关闭而静音 ×1"）；`probe-18` 日志 76-77 行 E9/E9b |

### 3.5 零回退 + 文档与字节一致

| 要证的事 | 证据 |
| --- | --- |
| 全局设置页未受影响 | 四套 harness **502/502**（我复跑，§2 #1；t1 报的 305→502 与 t2 的 502 一致）；`probe-18` 日志 162-172 行 H1-H11（开关/音量/音色/导入/试听/恢复默认/三行可视/`CUSTOM_LIMIT=50`/413 相关探针 `r10-ind-probe-14-r5-http-413.txt` 36/36、`probe-11` 31/31）；`r10-dev-waterfall.txt` 22/22（仍证"无审批瀑布注册"） |
| REVISION=rev-10 | `client.js:128`；`probe-18` 日志 166 行页面文案带 `rev-10 · per-session chime` |
| 诊断对象既有键未删 | 我直接对 `HEAD:lib/client.js` 提取诊断字面量：rev-9 的 18 键 → rev-10 的 25 键，**removed = none**（§2 #4） |
| 文档与磁盘 sha256 一致 | `README.md` 无字节/sha 断言（无冲突）；`CHANGELOG.md:61-62` 的 `46638 B / 03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938`、`133812 B / 2078125FCADDDC3AF9CEADE6585A321BF65B79B91E64DB4D244133832FD7CBB4` 与我的 `Get-FileHash` **逐字符一致**；`docs/rev10-独立验证.md:4-5` 同值一致；`docs/契约调研.md §L.1-L.4`（1226-1282）在册，`docs/挂载与验收.md §7.1`（257-278）在册 |
| 冻结路径前后一致 | `r10-frozen-diff.txt` = `identical`，`r10-run-console.txt` 末尾"frozen paths are unchanged"（t2 记录；我复核了这两个文件的内容） |
| 未证实项如实标注 | `README.md:338-352` H14（槽是否官方扩展点，未证实）、H16（`position:fixed` 被 `transform` 祖先裁剪，未在真机验证）、H17（连点写序残留，明确写"不声称已解决"）、H18（不做 force-on）；`docs/rev10-独立验证.md:262-271` 四条"未证实"，且把连点窗口**升级为"已复现"** |

---

## 4. 主动找反例（任务点名的 7 项 + 追加）

| # | 反例假设 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 设置文档里混进了会话数据 | **未发现** | 活体 `settings.yaml` 只有 `approval-chime: {volume,tone,enabled}`；schema 只有 4 个全局键（`index.js:311-333`）；我的探针 2c/5c/10a（scratch 文档字节不变、home 里只多 sessions.json） |
| 2 | 有浏览器存储 | **未发现** | `lib/**` 0 命中（§2 #8）；`probe-18` 日志 158-159 行 G1/G2（字节 0 命中 + 运行时 0 触碰） |
| 3 | 把"开回来"做成写 `true` 假装跟随 | **未发现** | `client.js:1183` 三表达式只有 `{enabled:false}` / `{enabled:null}`；我的探针 4a/4c（记录被删）+ 4d（文件里从无 `"enabled":true`）；`client-half:732`；`probe-18` 38-40 行 C2/C2b/C2c |
| 4 | 多会话仍只响一声 | **未发现**（确实各响各的） | `client-half:782-803`（3 声、180 ms、各自音量）；`probe-18` 68-70 行 E1-E3（`at=0/180/360`）；`client.js:1308-1310` |
| 5 | 静音会话仍被当成"响了"计数 | **未发现** | `client-half:785-787/803`；`probe-18` 74-77 行 E7/E9；`client.js:1294-1301`（静音只加 `suppressedSession`，`triggers` 不动） |
| 6 | 上限淘汰踢错了记录 | **未发现**（淘汰最旧、留最新） | 我的探针 **9a-9g**（205 条 → 恰好 `s000..s004` 出局、`s204` 保留、POST 后仍 200 且最旧出局）；`probe-18` 日志 110/114 行 F7/F8.d（键序升、`updatedAt` 降的对抗种子也只淘汰最旧）；`host-half` 的 205→200 断言 |
| 7 | 铃铛提示只是英文 / 只有图标没有文案 | **未发现** | `client.js:2230-2233` 双语恒在 + `:2415-2416` `title`=`aria-label`；`client-half:526-527/538-539`；`probe-18` 17-18 行 |
| 8 | （追加）"关一个"会不会顺手改全局 | **未发现** | `probe-18` 43 行 C3 `scope.sets=[]`；`client-half:696-736` 真值表 |
| 9 | （追加）原子写失败会不会破坏目标 / 留临时文件 | **未发现** | 我的探针 8a-8c（500 + 目标逐字节不变 + `.tmp` 清掉）；`probe-18` 134-135 行 F11/F11b |
| 10 | （追加）损坏文件会不会让插件整体不可用 | **未发现** | `probe-18` 123-131 行 F10.a-F10.i（8 种损坏形态 → 200 空表 + 告警，随后写入还能修复） |
| 11 | （追加）没有 `webServer` 时会不会拖崩启动 | **未发现** | `probe-18` 138-139 行 F12/F12b（只 warn）；`index.js:1089-1124` |

**反例 12（唯一的正面命中）**：同会话连点两次的应答乱序窗口 → 见 §5.1/§5.2。

---

## 5. Findings

### F-01（medium · 阻断本次"①A 全成立"的盖章）

* **file / line**：`lib/client.js:1153`（`writeSessionPatch`；相关行 `:1160-1168` 成功分支、`:1163` 记 `revision` 但从不比较、`:2739` 唯一的挂载期 `refreshSessions()`、`:983-1004` 这条本地表驱动铃铛与响铃判定）
* **problem**：每次 POST 的应答都**无条件**覆盖本地表，而两次并发 POST 走两条 socket，应答体被消费的顺序不保证等于宿主 `rename` 的落地顺序。于是存在一个实测状态：**铃铛显示"开"（本地表无记录）而宿主文件是 `{enabled:false}`**，即"这个会话会响"是假的；这个不一致还会驱动该会话的响铃判断（`:983-1004`），且**没有任何收敛路径**（`refreshSessions()` 只在 `:2739` 挂载时调一次），一直持续到刷新页面。同一窗口的另一半更常见：**用户第二次点击（想开回来）会被丢弃**——gap=0 的 400 轮里宿主文件有 **201 轮停在"静音"**。
  * 复现证据（t2，独立于实现）：`verify-independent/_raw/r10-ind-probe-18-race-evidence.txt:7`（1200 轮 1 例，round=320：patch 对正确、本地 159 条/文件 160 条，与 200 上限无关）；构造式反证 `r10-ind-probe-18-r10-sessions.txt:150`（I2：迟到应答把已恢复的 `true` 又打回 `false`）。
  * 根因与"为什么 revision 栅栏不够"：`docs/rev10-独立验证.md:224-258`。
* **为什么它阻断**：合同要求"①A 语义成立……把它开回来是真的回到「跟随全局」"逐条成立才 pass。上面那个状态里，"开回来"**在效果上不成立**、且 UI 会就"这个会话会不会响"给出错误答案；这属于团队从 rev-4 起就在收的"UI 显示与真实状态不一致"同一族（对照 `docs/rev4-需求符合性审查.md:297-302` 的 R4-RACE，当时判 low、rev-5 仍然修掉了）。
* **可达性上界（我自己量的，一并交给 captain 判断）**：窗口 = 第二次点击落在"第一次 POST 未落地"之内。本机每会话 POST 往返 n=200：median **3.33 ms**、p90 4.36 ms、p99 6.81 ms、max 24.90 ms；把两次点击拉开 ≥5 ms 后，**6 个间隔 ×400 轮 = 2400 轮全部 0 分歧、0 丢点击**（§5.2）。也就是说：**两次人手分别点击（≥40 ms）打不中这个窗口**；能打中的只剩"主线程被长任务阻塞后，两个 click 事件在同一个事件突发里被连着派发"这条路——而这条路**在无浏览器引擎的沙箱里我无法否证**，按合同"未证实不得背书"，我不能给 ①A 盖章。
* **requiredFix（最小、局部）**：二选一 —— ①**同一 `sessionId` 的写入串行化**（至多一个 POST 在飞，后到的点击排队/合并），或 ②**最后一个未决写入落定后重读一次表**（`refreshSessions()`），让本地表最终等于宿主文件。**不要只加 `revision >` 栅栏**：应答被反序投递时它会接受旧表、跳过新表（`probe-18` I2 已把这条写进探针注解 `r10-ind-probe-18-r10-sessions.txt:152-155`）。
* **修完的复核要求**：`probe-18 --race-rounds=1500 --race-raw` 与 `--race-sidechannel` 两路必须 0 分歧（且 I2 这条"构造式反证"要改成"迟到应答不再回退"），四套 harness 仍需 502/502。

### F-02（low · 验证基础设施；本身不阻断，但按 captain 要求报出）

* **file / line**：`verify-independent/kit/rev4.mjs:254`（新增的 `if (call.url === SESSIONS_ROUTE)` 短路，`:255-256` 把它记进 `sessionReads` 并回固定空表，**不再进入 `calls`**）；受影响断言：`verify-independent/probe-10-r4-volume.mjs:87`、`:99`、`:112`、`:123`、`:172`（"NOTHING was fetched"），`verify-independent/probe-16-r5-cap-race.mjs:170`（"no request of any kind was made"）。
* **problem**：这三条断言的**字面**（"任何请求都没发"）在 rev-10 已不再为真——挂载期确实有 1 次 `GET /api/approval-chime/sessions`；重新基线化把它摘出 `calls` 后，断言仍绿但语义变成了"除那一次读取外没有请求"。另外 `sessionReads` 被记录下来却**没有任何探针断言它**（全仓 grep 仅 `kit/rev4.mjs` 三处）。**没有掩盖产品回归**：被摘掉的正是 rev-10 新增的、有意为之的那一次读取，且 `probe-18` 的 C0（`r10-ind-probe-18-r10-sessions.txt:35`，"1 GET … at mount"）独立证明了"每次挂载恰好一次"；音频/上传账本（`audioCalls()`/`uploadCalls()`/`deferred`）都不受影响。
* **requiredFix**：在 `probe-10`/`probe-16` 的相关断言旁补一条 `sessionReads.length === 1`（或在断言文案里写明"除挂载期那一次读取外没有任何请求"），让断言的文本与事实一致；`probe-15` 的两处短路同理（它已经在注释里写明）。
* **备注**：`verify-independent/**` 是 t2 自己的产物、且不在 run-r10 的冻结路径里，所以这次重新基线化**程序上没问题**；本条只是"断言该说真话"的洁癖级要求，可随 F-01 的修复一起做，也可以只在文档里登记。

---

## 6. 观察（不算缺陷，不改也要知道）

* **OBS-1（文档精度）**：`CHANGELOG.md:51` 说"既有断言一条未删，只按新事实改了 **5 处**期望值"。我逐行核对 `git diff -U0 -- verify/`：被替换的**断言行是 7 条**（2 条 rev 戳、1 条"等待的槽列表"、4 条"数全部注册"改成"按 `settings.section` 过滤"），另加 4 行非断言改动（`fire(type, extra)` 形参、2 个 `const`、import 增补）。"一条未删"**成立且偏保守**（每条被删断言都有同主题替换，其中 4 条更强：从"总数=1"变成"按槽名过滤后=1"），只是"5 处"这个数字不准，建议改成"7 处断言按新事实重写（其中 4 处收得更紧）"。
* **OBS-2（历史哈希）**：`docs/挂载与验收.md:325`（§10"本任务实际做/未做的事"）里写着未改 `lib/**`（哈希 `E5E2008A…`/`1F3E5B60…` 未变）——那是 rev-4 时点的事实陈述，与 rev-10 无关；`CHANGELOG:61-62` 与 `docs/rev10-独立验证.md:4-5` 的 rev-10 锚点与磁盘一致。只是 grep 字节哈希的人会看到一对过期值，建议在那行补"（rev-4 时点）"。
* **OBS-3（verification 语义）**：`r10-reviewer-probe-r7-reqcheck.txt` 是 83/6——6 条失败全是 rev-7 时点的期望（rev-7 戳、"恰一次 slots.inject"、"恰一次注册"、"恰一处调用点"、页面标题、页面戳），被 rev-10 新增的铃铛/第二次注册天然推翻；run-r10 把它当 informational 记录（脚本 `:268-271` 有声明），但没有像 r4/r5 探针那样重新基线化。口径不一致，属于可记录项。
* **OBS-4（可交付清单，给 captain 的正面结论）**：除 F-01 外，②B 落点、③铃铛形态/文案/槽位、每会话各响各的、每会话音色音量覆盖与回退、零回退（502/502 + H1-H11）、文档-字节一致，**均可交付**；F-01 的修法不触碰这些（只动 `lib/client.js` 的写入路径）。

---

## 7. 未证实（本沙箱无法证实，**不背书**）

| 项 | 阻塞原因（可复现） |
| --- | --- |
| 真实浏览器里铃铛的渲染/尺寸/`hover` 提示的实际弹出 | 无浏览器引擎（`r10-ind-probe-13-r4-browser.txt` 11/14，Edge 启动即 fatal）；只能证到元素树/属性层（`probe-18` B1-B8g） |
| popover 的实际定位与遮挡（贴底向上翻、水平收进视口、会不会被带 `transform` 的祖先裁剪） | 同上；只证到 `position:fixed`、矩形来自 `getBoundingClientRect`、Escape/外部 pointerdown 会关（`probe-18` 26-32 行） |
| `order:30` 的**视觉**落点 | 本机 `agent-team` 包 0 命中（我复核），只能证"已装占用者 -10/10/20、30 与它们都不等且在之后" |
| 真实 `dsh web` 端到端（页面 → 铃铛 → 点击 → 落盘 → 刷新读回） | 需要真浏览器 + 已挂载 profile。我**尝试**过对 `http://127.0.0.1:3080/api/approval-chime/sessions` 发 GET：**401**（平台鉴权在路由之前），无法据此判定线上宿主半的新旧；本报告的端到端只到"真字节 ⇄ 真 HTTP ⇄ 真 `lib/index.js` ⇄ 真文件"为止 |
| F-01 窗口在**真机浏览器事件派发**下的可达性 | 无浏览器；我只能给"间隔 ≥5 ms → 2400 轮全对"这个上界，不能否证"长任务阻塞后两个 click 同突发派发"。**这正是 ①A 不予盖章的原因** |

---

## 8. 复核指南（想推翻或确认本报告，跑这四条即可）

```powershell
cd '<workspace>\dsh-approval-chime'
# 1) 四套 harness（期望 124/282/22/74，全 exit 0）
foreach ($s in 'host-half','client-half','waterfall','custom-audio') { node "verify\$s.test.mjs" }
# 2) t2 的独立探针（期望 assertions passed=130 failed=0）+ 只读的 8 变异体
cd verify-independent; node probe-18-r10-sessions.mjs; node probe-18-r10-sessions.mjs --mutate=all
# 3) 我自己的宿主探针（期望 48/0：落点/原子写/上限/400/500/回退全局）
cd ../..; node .scratch/reviewer-r10/host-sessions-probe.mjs
# 4) F-01 的可达性曲线（gap=0 会看到宿主流失点击；gap>=5ms 期望 0/400）
node .scratch/reviewer-r10/make-gap-probe.mjs
cd dsh-approval-chime/verify-independent
foreach ($g in 0,5,20,60,150,400) { node '..\..\.scratch\reviewer-r10\probe-18-gap.mjs' --race-rounds=400 --race-raw "--click-gap=$g" | Select-String 'I1' }
```

---

## 9. 本次审查做了什么、没做什么

* **只读**：`lib/**`、`verify/**`、`verify-independent/**`、`README.md`、`CHANGELOG.md` 一个字节都没改（`git status --porcelain` 里这些文件的状态与 t1/t2 交付时相同）；
  宿主契约/`dsh-home-paths` 只读引用。
* **新增**：本文件（唯一交付物）+ `.scratch/reviewer-r10/`（3 个取证脚本 + 日志：`host-sessions-probe.{mjs,txt}`、`probe-18-gap.mjs` + `gap-*.txt`、`post-latency.mjs`、`diagnostics-keys.mjs`，以及从 `HEAD` 导出的 rev-9 字节副本用于对比），供复核。
* **依赖的他人证据**（我复跑过或逐行读过，均标注了来源）：t1 的实施说明与 `CHANGELOG`、t2 的 `docs/rev10-独立验证.md` 与 `verify-independent/_raw/r10-*.txt`。
* **裁决权说明**：F-01 是"能不能给 ①A 盖章"的问题，不是"需求做错了"的问题；若 captain 判断该窗口可以按"已复现残留 + README H17 已披露"接受并交付，请以书面理由覆盖本裁定（本报告的可达性数据已备好供其引用）；本审查只负责按合同的 pass 门槛给出结论。
