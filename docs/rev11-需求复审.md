# rev-11 需求复审（round 2 · 任务 t5）

> **一句话结论：`verdict = pass`。**
> 上一轮（rev-10，`docs/rev10-需求符合性审查.md`）判 needs_revision 的唯一理由是 **F-01**：铃铛写入路径的应答乱序窗口能让本地表与宿主文件长期相反、且无收敛路径（①A 的「开回来」在效果上不成立）。**t4 按我给的选项②修掉，本轮我用三重独立证据证明它闭合**：
> ① 代码路径（`lib/client.js:1192-1245`，整张表级的在飞计数归零 → 重读一次）；
> ② **我自己构造的端到端强制反序 A/B**（真 `lib/index.js` + 真 HTTP + 真文件）：修复版 **0/200 分歧**，把同一份代码的"重读"外科式删掉后同一实验 **71/200 分歧**；
> ③ 变异测试：删掉重读必须报红——t6 新增的 `convergence-reread-removed` 变异体 **9/9 精确命中** `I2`/`I2b`，我自己独立做的等价变异让 `verify/client-half.test.mjs` §5i **5 条报红**。
> 五条 acceptance 逐条成立（§4），零回退与文档-字节一致成立（§1/§2），残留只是**有界且已披露**的窗口（§5，全部 low、不阻断）。
> 本轮**只读**审查：未改 `lib/**`、`verify/**`、`verify-independent/**`、README/CHANGELOG；唯一交付物是本文件。

---

## 0. 判定

| # | acceptance（合同原文摘要） | 判定 | 本轮关键证据 |
| --- | --- | --- | --- |
| 1 | ①A 语义：默认跟随全局 / 关一个只影响那一个 / **开回来=真回到跟随全局（不写 true）** / 全局关时未覆盖静默 / 新会话天然跟随 | **成立** | round-1 的语义证据全部仍在（本轮重新复跑：`client-half` 302/302、`probe-18` C2/C2b/C2c、D1-D12、E1-E10 全绿）；**上一轮不成立的唯一原因 F-01 已闭合**（§3） |
| 2 | ②B 落点：插件自己的文件（非空 `$DSH_HOME` 优先）、原子写、设置文档无会话数据、无浏览器存储、200 条按 `updatedAt` 淘汰 | **成立** | `lib/index.js` **与 rev-10 逐字节相同**（§1）；我自己的宿主探针 **48/48** 重跑通过；`lib/**` 对浏览器存储 0 命中；`probe-18` F1-F13 全绿 |
| 3 | ③ 小铃铛：槽位/共存/两态图标/**中英双语 title+aria-label**/点击语义与 ①A 一致 | **成立** | `probe-18` A1-A5、B1-B8g、C1-C6c 全绿（131/0）；`client-half` 517-580 全绿 |
| 4 | 每会话声音独立：各响各的 + 每会话音色/音量覆盖 + 缺失自定义音色回退全局 | **成立** | `client-half` 766-812（4 pending → 3 响、0/240/440 ms、各自音量、`suppressedSession` 独立计数）；`probe-18` D/E 全绿 |
| 5 | 零回退 + 文档与字节一致：设置页未受影响 / 版本戳与诊断键 / 文档与磁盘 sha256 一致 / 未证实项如实标注 | **成立** | 四套 harness **522/522**（我复跑）；相对 rev-10 基线**只有 5 个文件变化**（§1）；诊断键 **0 删除 + 1 新增**；`CHANGELOG:57-63` 的 7 个字节锚点我逐个 `Get-FileHash` 核对一致；版本戳全链路一致（§6 口径说明） |

**为什么不是"再修一轮"**：F-01 的 requiredFix 原文是「①串行化 **或** ②最后一次未决写入落定后重读一次，让本地表最终等于宿主文件」。t4 选了②并满足其字面目标（本地表最终等于文件，与应答顺序、与两次 `rename` 顺序无关，§3），文档也逐条披露了②的固有边界（§5 OBS-B/C）。在实现者已按明确的"二选一"完成时改判①属于移动球门，故本轮判 pass；残留项进 backlog（§5），不影响交付。

---

## 1. 被审字节：相对 rev-10 基线到底动了什么

我拿 t2 在 rev-10 时记录的冻结基线 `verify-independent/_raw/r10-baseline-before.txt`（11 个文件，`lib/**` + `verify/**` + README/CHANGELOG/package.json/cordis.patch.yml）与**现在的活体树**逐文件比对（脚本 `.scratch/reviewer-r10/baseline-diff.mjs`）：

```
=== live tree vs the rev-10 baseline ===
changed (5): lib/client.js (133812 -> 137971), verify/client-half.test.mjs (58941 -> 65661),
             verify/custom-audio.test.mjs (19872 -> 19872), README.md (34613 -> 37316), CHANGELOG.md (33954 -> 42552)
added (0): (none)     removed (0): (none)

=== live tree vs the rev-11 baseline (t6) ===
changed (0): (none)   added (0): (none)   removed (0): (none)
```

* **`lib/index.js` 未变**（宿主半零改动）✓；**`verify/_harness.mjs` / `host-half.test.mjs` / `waterfall.test.mjs` 未变** ✓（`package.json`、`cordis.patch.yml` 也未变）。
* `verify/custom-audio.test.mjs` 体积不变、内容变了 = 只有那行版本戳（`:267` `includes('rev-11')`）✓ 与 t4 的说法一致。
* 活体树与 **t6 的 r11 基线完全相同** → "被验证的字节 = 被复审的字节"，验证与复审之间没有漂移。
* 关键哈希（我用 `Get-FileHash` 实测，与 `CHANGELOG.md:57-63` 逐个一致）：
  `lib/client.js` 137971 B / `36BDD86B4D09A96492FCD6819913A50117E17EB6017F07914E98955A02D6E9CB`；
  `lib/index.js` 46638 B / `03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938`；
  `verify/client-half.test.mjs` 65661 B / `4FDA92CD5AF9A3F1526F8F02FF7AC435D23216429701D279E7E893C70D30068E`；
  `verify/custom-audio.test.mjs` 19872 B / `8BE5C5EE7D32E30958F2FF5D1EFA81ED2E8C1DBF9604372DF33FF7D11558D50C`；
  `verify/_harness.mjs` 24822 B / `18C2055A…`；`verify/host-half.test.mjs` 29652 B / `E33F9889…`；`verify/waterfall.test.mjs` 8888 B / `010811A5…`。

**"既有断言一条未删"的算术复核**：`client-half` 282 → 302，而 §5i（`:867-932`）恰好 **20** 条 `report.*` 调用（我逐行数过）→ 302 − 20 = 282，没有旧断言被删。`custom-audio` 74 → 74（只有版本戳）。

---

## 2. 我自己复跑的命令与结果（不只读 t4/t6 的报告）

| # | 命令 | 结果 |
| --- | --- | --- |
| 1 | 四套 harness（`verify/*.test.mjs`，在插件目录内跑） | **124 + 302 + 22 + 74 = 522/522，四个 exit 0** |
| 2 | `probe-18-r10-sessions.mjs`（**t6 更新后的现行版**） | **131/0，exit 0** |
| 3 | `probe-18 … --race-rounds=1500 --race-raw` | **131/0**，`I1 … disagreements = 0/1500` |
| 4 | `probe-18 … --race-rounds=1500 --race-sidechannel` | **131/0**，`I1 … disagreements = 0/1500` |
| 5 | `probe-18 … --mutate=all` | **`mutation summary: 9/9 mutations detected exactly as declared`**，exit 0（含新增的 `convergence-reread-removed`） |
| 6 | `.scratch/reviewer-r10/host-sessions-probe.mjs`（我 round-1 自写的宿主探针） | **48/48**（②B 全项：落点/原子写/上限淘汰/400/404/405/413/500/回退全局/设置文档未动） |
| 7 | `.scratch/reviewer-r10/diagnostics-keys-r11.mjs` | 诊断键 26 个：相对我 round-1 逐字记录的 rev-10 的 25 个 → **removed = none，added = `sessionWrites`** |
| 8 | `.scratch/reviewer-r10/baseline-diff.mjs` | §1 的两段 diff（rev-10 基线 / t6 的 r11 基线） |
| 9 | `.scratch/reviewer-r10/probe-18-race2.mjs`（**我自己的强制反序 A/B**，见 §3.2） | 修复版 `0/200` 分歧（131/0）；把重读删掉的等价版 `71/200` 分歧（129/2） |
| 10 | `.scratch/reviewer-r10/mutate-convergence.mjs`（**我自己的变异**：把副本里的重读短路后跑副本的 `client-half`） | **297/302**，红的 5 条全是 §5i（含 `the stale answer cannot leave a record behind — got {"enabled":false,…}`）；插件自身的 `lib/client.js` 哈希在跑后仍为 `36BDD86B…` |
| 11 | `.scratch/reviewer-r10/probe-18-gap.mjs`（我给 probe-18 加的"两次点击之间真等 N ms"旋钮） | gap = 0/5/20/60/400 ms 各 400 轮：**分歧全为 0/400**；"宿主文件停在静音"仅 gap=0 出现 185/400，gap ≥5 ms 全 0/400 |
| 12 | `probe-10` / `probe-16` / `probe-15` / `probe-17`（t6 改过的那几个） | 70/70、50/50、105/105、94/94，四个 exit 0 |
| 13 | `lib/**` 的浏览器存储 grep（`localStorage|sessionStorage|indexedDB|caches.|document.cookie|window.name|cookieStore`） | **0 命中** |

> **时间线与取样说明（重要，便于复核）**：t6 的探针维护（`kit/rev4.mjs` 0:47、`probe-10` 0:47、`probe-16` 0:48、`probe-18` 0:48、`run-r11.ps1`/`probe-17` 0:50）**发生在我这次复审的过程中**。我在 0:5x 之前跑的第一次 `probe-18` 是 **t4/t6 之间的旧修订版**（那时它报 `I2.the-late-answer-wins-locally` + `H6` 两条红，即 F-01 的旧签名与硬编码的 rev-10 戳）；现在再跑是 **131/0**。§2 第 2-5 行与 §3 引用的都是**现行版**的结果。

---

## 3. F-01 是否真的闭合（三重独立证据）

### 3.1 代码路径（我逐行读的字节）

* `lib/client.js:1192-1221` `writeSessionPatch`：乐观改本地表 → `sessionWrites.outstanding += 1`（`:1199`）→ POST；成功分支把应答写进本地表后 `return settleSessionWrites('')`（`:1207`），失败分支回滚 + `sessions.error = message` 后 `settleSessionWrites(message)`（`:1216`）。
* `:1234-1245` `settleSessionWrites`：`outstanding -= 1`；仍 > 0 就直接返回（**不发重读**）；**归零**时 `return refreshSessions()`（重读宿主文件），并且只在"这次写入被拒绝"时把 `preservedError` 补回错误行。
* 计数器是**整张表**级的（`:425-433` 的注释写明了理由：上一次应答不是最后一次写盘，跨会话同样会破坏同一张表）。
* `postSessionPatch`（`:1109-1130`）在 `fetch` 同步抛出时返回 rejected promise（不会同步抛出）→ 计数器不会漏减；`refreshSessions()` 永不 reject（`:1066-1106`）→ 重读不会制造未处理 rejection（`client-half` 的"no unhandled rejection"断言green）。

### 3.2 端到端强制反序 A/B（我自己的构造：真宿主 + 真 HTTP + 真文件）

probe-18 自带的 `I1` 指标在**自然**竞态下位于噪声底（修复前也只有 ≈0.06%），所以"0/1500"本身**不能**区分修复前后——这一点我在报告里明说，不拿它当证据。我另建了一个旋钮（`.scratch/reviewer-r10/probe-18-race2.mjs`，由 `make-race-probe.mjs` 生成，基于**同一份** probe-18 源码）：`--reverse-answers` 会把每条 POST 的**应答体扣住**，等两条都在手时**先放开第二条、再放开第一条**（客户端于是按与宿主写盘相反的顺序消费应答），并且 `--plugin=` 可以指向另一棵树。

| 被测字节 | 同一实验的结果 |
| --- | --- |
| **修复版**（活体 `lib/client.js` 36BDD86B…） | `client-vs-store disagreements = 0/200`，`assertions passed=131 failed=0` |
| **等价于修复前的版本**（把 `return refreshSessions().then(` 外科式换成 `return Promise.resolve(true).then(`，其余逐字节相同） | `client-vs-store disagreements = 71/200`，`assertions passed=129 failed=2`（正是 `I2.late-answer-does-not-stick` 与 `I2b.convergence-reread-issued`） |

即：**同一实验在"删掉重读"的字节上会以约 1/3 的轮次把缺陷打出来，在修复版上一次都不出现**。这比 probe-18 的 I1 数字强得多，也是我这轮判 pass 的主要依据。

### 3.3 变异测试（"删掉重读必须报红"）

* **t6 的**：`probe-18 --mutate=all` → `9/9`；新增变异体 `convergence-reread-removed` 声明的红点集恰为 `['I2.late-answer-does-not-stick','I2b.convergence-reread-issued']`，实测一致（我自己复跑，见 §2 第 5 行）。
* **我自己的**：把 `lib/client.js`+`verify/` 复制进 scratch，只短路副本里的那次重读，跑副本的 `client-half` → **5 条 §5i 报红**，第一条就是 `the stale answer cannot leave a record behind — expected undefined, got {"enabled":false,…}`（F-01 的原签名）。两条互不相同的变异路径都精确报红 → 这条修复是**承重**的，不是"顺带绿了"。

### 3.4 自然竞态与点击间隔扫描（含"这些数字不能证明什么"）

| 测量（我跑） | 数值 |
| --- | --- |
| `probe-18` 自然 race，raw 1500 轮 / sidechannel 1500 轮 | `0/1500` / `0/1500`（修复前同一探针：raw 1200 轮 1 例、sidechannel 1500 轮 1 例） |
| 我的 gap 扫描 400 轮 × {0,5,20,60,400} ms | 分歧全为 **0/400**；"宿主文件停在静音"= gap0 **185/400**、gap≥5 ms **0/400** |
| 每会话 POST 往返（round-1 实测，本轮沿用同一宿主路径） | median 3.33 ms / p90 4.36 / p99 6.81 / max 24.90 ms |

**校准（不夸大）**：① `0/1500` 与修复前的 `0/1500` 在统计上无法区分——它只能说明"没有新的分歧被观察到"，不能证明收敛；**能证明收敛的是 §3.2 与 §3.3**。② 真正人手两次点击（≥40 ms）打不中窗口；能打中的只有"主线程长任务阻塞后两个 click 同突发派发"这条**沙箱无法否证**的路（§7）。③ gap=0 时仍有 185/400 轮"宿主文件停在静音"——那是**选项②不去解决的**"第二次点击在存储层被覆盖"，但 UI 现在**诚实**（分歧 0/400，铃铛显示 = 文件状态），而且一次点击即可改回；这条我登记为 OBS-C（§5），不当作缺陷。

---

## 4. 五条 acceptance 逐条取证（本轮复核）

| acceptance | 本轮复核结论与证据 |
| --- | --- |
| ①A：默认跟随全局 / 关一个只影响那一个 / 开回来=清覆盖（不写 true） / 全局关→未覆盖静默 / 新会话天然跟随 | 代码路径与 rev-10 相同（`lib/client.js:1004-1025` 的 `覆盖 ?? 全局`、`:1248-1251` 的 `toggleSession` 只发 `{enabled:false}`/`{enabled:null}`）；`client-half` 703-736 真值表、732「UI 永不写 force-on」、544/580/696-736 全绿；`probe-18` C2/C2b/C2c、C6/C6b/C6c、D1-D12、E9/E10 全绿。**唯一曾不成立的原因（F-01）已闭合（§3）** |
| ②B：插件自己的文件 / 原子写 / 设置文档无会话数据 / 无浏览器存储 / 200 条按 updatedAt 淘汰 | `lib/index.js` 与 rev-10 **逐字节相同**（§1）→ 落点、原子写、400/413/404/405、上限淘汰、home 规则全部沿用；我的宿主探针本轮**重跑 48/48**；`probe-18` F1-F13（含 F7/F8 淘汰最旧、F9 原子写、F10 损坏退化、F11 写失败 500 不清目标）全绿；活体 `settings.yaml` 仍只有三个全局键；浏览器存储 grep 0 命中 |
| ③ 小铃铛：槽位/共存/两态/中英双语/点击语义 | `probe-18` A1（两个 `slots.inject`）、A2（`{name,id:'approval-chime',order:30,locale}`）、A3（已装 order −10/10/20，本插件 30）、B2/B3（`title=本会话审批提示音：开/关 · Approval chime for this session: on/off`）、B4（两态 path 数 2/3 + slash）、C1/C1b/C2/C2b 全绿；`client-half` 517-580 全绿 |
| 每会话声音独立：各响各的 / 覆盖音色音量 / 缺失自定义音色回退 | `client-half` 766-812：4 条 pending → `lastBatchSize=4`、`lastBatchPlayed=3`、`triggers` 在 0/240/440 ms 三次 +1、三条 gain 分别用 70/30/90 的音量、`suppressedSession=1` 而 `suppressedDisabled=0`；738-762 缺失音色回退与提示；`probe-18` D5-D7（音频图上 volume 30 → gain 0.18、tone bell → triangle）、E1-E8 全绿 |
| 零回退 + 文档与字节一致 | 522/522（四套 exit 0）；相对 rev-10 基线只有 5 个文件变化、其中 3 个 verify 文件里两个只多了一行戳/20 条新断言（§1）；诊断键 0 删除（§2 第 7 行）；`CHANGELOG:57-63` 的 7 个锚点与磁盘一致（§1）；`r11-run-console.txt` 末尾"every harness suite exited 0 … frozen paths are unchanged" + `r11-frozen-diff.txt = identical`；`README:366` H17 已按新行为改写并写明残留窗口；未证实项见 §7 |

---

## 5. 残留与观察（全部 low / 不阻断，进 backlog）

* **OBS-A（失败态，low）**：收敛重读若拿到"不可用应答"（非 2xx 或非 JSON），`refreshSessions` 会把本地表**清空**（`lib/client.js:1084-1091` 的 `sessions.table = Object.create(null)`；传输层 rejection 只置错误、不清表 `:1099-1104`）。rev-11 之前这条分支只在挂载时可达，现在每次写入突发都可能走到——后果是"刚被静音的会话在 UI 里变回跟随全局（可能响）"，直到下一次成功读取。文档已披露这个降级（`README:128`、`:366`），但建议下一轮加一行硬化：**只对挂载期那次读取清表，收敛重读失败时保留上一张表**。（可达性：宿主路由对损坏文件都答 200 空表，所以要真 5xx/坏响应；属失败态、非正常路径。）
* **OBS-B（瞬时，low，已披露）**：应答被反序消费时，本地表可能在"最后一次写入落定"到"重读应答落地"之间（一次 GET 往返，round-1 实测 median 3.33 ms）短暂显示旧表；期间该会话的响铃判断也会用旧值（方向通常是"多静音一次"，不会凭空多响一声）。`README:366` H17 已把这一瞬写进残留窗口。
* **OBS-C（选项②的固有边界，low，已披露）**：两次点击**完全重叠**时，宿主文件可能停在第 1 次写的状态（我实测 gap=0 时 185/400 轮）——选项②修的是"UI/文件不一致"，不是"存储层丢第二次点击"（那是选项①的职责）。现在 UI 诚实（分歧 0/400）、一次点击即可改回、人手点击（≥5 ms，2400 轮）全对；`README:366` 已写明"未加请求序号/串行化"。
* **OBS-D（我上一轮的两条红已关闭）**：`I2`（旧期望编码了缺陷本身）已由 t6 拆成 `I2.late-answer-does-not-stick` + `I2b.convergence-reread-issued`（后者还断言"恰好一次重读"），`H6` 改用 `EXPECTED_REVISION = 'rev-11 · per-session chime (race fix)'` 并**同时**断言 live 值与期望常量；`probe-18` 由 130 → **131** 条。**我的 F-02 也已关闭**：`kit/rev4.mjs` 新增 `trafficOf()`/`onlyMountReadTraffic()`/`mountReadShape()`，`probe-10` 的 5 处、`probe-16:170` 的"没有任何请求"改成"除挂载期那一次读取外没有任何请求"（打印 `{"audioUploadCalls":0,"mountSessionReads":1}`），并各加"exactly one mount-time sessions read per boot"与"it is a GET of the sessions route"两条；我复跑 probe-10 **70/70**、probe-16 **50/50**。
* **OBS-E（记录）**：`r11-reviewer-probe-r7-reqcheck.txt` 仍是 83 passed / 6 failed（rev-7 时点的槽/戳期望），`run-r11.ps1` 把它当 informational 记录——与 round-1 的 OBS-3 同一口径，未变。

---

## 6. 版本戳口径（"REVISION=rev-10"这条怎么判）

合同 acceptance 写的是 `REVISION=rev-10`，而本轮字节的戳是 `rev-11 · per-session chime (race fix)`（`lib/client.js:139`）。我按**意图**判定成立，理由与证据：

1. 该条的目的（结合上下文）是"版本戳必须命名当前构建、且文档/探针之间不能各说各话"，而不是"永远停在 rev-10"——本轮修复必然要求新戳，否则运维/用户无法区分"修好的 bundle"与"有缺陷的 bundle"（`docs/挂载与验收.md:247/248/264` 正是靠戳来判）。
2. 全链路一致且**没有残留的"当前构建=rev-10"的说法**：`client-half:315` 断言 `startsWith('rev-11')`；`probe-18` H6 双断言 `rev-11`；README `:259/:308/:324`、`CHANGELOG:10/13`、`挂载与验收:247/248/257/264/333` 均为 rev-11。（`CHANGELOG:78-126`、`docs/rev10-独立验证.md`、`docs/rev10-需求符合性审查.md` 里的 `rev-10` 都是**历史条目/历史报告**，不是当前状态声明。）
3. 若有异议，这属于**判据措辞**问题，不该由实现者承担；本报告把它显式记录，便于 captain 在需要时按字面口径复议。

---

## 7. 未证实（本沙箱不可证实，**不背书**；沿用 round-1 并补齐本轮）

| 项 | 阻塞原因 |
| --- | --- |
| 真实浏览器里铃铛的渲染/尺寸/`hover` 提示的实际弹出、popover 的实际定位与遮挡 | 无浏览器引擎（`r11-ind-probe-13-r4-browser.txt` 仍按声明非零）；只能证到元素树/属性层（`probe-18` B1-B8g） |
| `order:30` 的**视觉**落点 | 本机 `agent-team` 包 0 命中（我复核过），只能证"已装 −10/10/20 都不等于 30 且在它们之后" |
| 真实 `dsh web` 端到端 | 需要真浏览器 + 已挂载 profile；我上轮实测 `GET http://127.0.0.1:3080/api/approval-chime/sessions` → **401**（平台鉴权在路由之前），无法据此判定线上宿主半的新旧 |
| "主线程长任务阻塞后两个 click 同突发派发"在真机上的可达性 | 无浏览器；我能给的上界是"间隔 ≥5 ms 全部 0/400（本轮）+ 2400 轮（上轮）"，不能否证该路径 |
| rev-11 收敛重读在真机上的耗时占比 | 本机只有 loopback 数字（median 3.33 ms），真机磁盘/负载下未测 |

---

## 8. 复核指南（想推翻或确认本报告）

```powershell
cd '<workspace>\dsh-approval-chime'
# 1) 四套 harness（期望 124/302/22/74，全 exit 0）
foreach ($s in 'host-half','client-half','waterfall','custom-audio') { node "verify\$s.test.mjs" }
# 2) 现行 probe-18：全绿 + 9 个变异体 + 两路 race（期望 131/0、9/9、I1 0/1500）
cd verify-independent
node probe-18-r10-sessions.mjs ; node probe-18-r10-sessions.mjs --mutate=all
node probe-18-r10-sessions.mjs --race-rounds=1500 --race-raw
node probe-18-r10-sessions.mjs --race-rounds=1500 --race-sidechannel
# 3) 我自己的宿主探针（②B，期望 48/0）与诊断键比对（期望 removed=none）
cd ../.. ; node .scratch/reviewer-r10/host-sessions-probe.mjs ; node .scratch/reviewer-r10/diagnostics-keys-r11.mjs
# 4) 我自己的 F-01 A/B（强制反序，真 HTTP；期望修复版 0/200、删掉重读的副本 ~50%+ 分歧）
node .scratch/reviewer-r10/mutate-convergence.mjs            # 造出副本（并把插件自身哈希打印出来核对）
node .scratch/reviewer-r10/make-race-probe.mjs               # 生成 race2 探针
cd dsh-approval-chime/verify-independent
node ../../.scratch/reviewer-r10/probe-18-race2.mjs --race-rounds=200 --race-raw --reverse-answers
node ../../.scratch/reviewer-r10/probe-18-race2.mjs --race-rounds=200 --race-raw --reverse-answers --plugin=<workspace>/.scratch/reviewer-r10/mutation-tree
# 5) 相对 rev-10 基线的差异（期望只有 5 个文件变、index.js 与三套测试未变）
cd ../.. ; node .scratch/reviewer-r10/baseline-diff.mjs
```

---

## 9. 本次复审的边界

* **只读**：`lib/**`、`verify/**`、`verify-independent/**`、`README.md`、`CHANGELOG.md`、`docs/挂载与验收.md`、`docs/契约调研.md` 我一个字节都没改（`git status` 里这些文件的状态与 t4/t6 交付时相同）。
* **新增**：本文件（唯一交付物）+ `.scratch/reviewer-r10/**`（我自用的取证脚本与日志：`host-sessions-probe.{mjs,txt}`、`make-race-probe.mjs`、`probe-18-race2.mjs` + `r11-race2-*.txt`、`mutate-convergence.mjs` + `r11-mutation-*.txt` + `mutation-tree/`、`baseline-diff.mjs` + `r11-baseline-diff.txt`、`diagnostics-keys-r11.mjs`、`probe-18-gap.mjs` + `r11-gap-*.txt`、`r11b-probe*.txt`、`r11-suite-*.txt`）。它们不是交付物，删除后按 §8 可重建。
* **依赖的他人证据**（都注明来源，且关键结论我都自己复跑过）：t4 的修复说明与字节锚点、t6 的探针维护与 `verify-independent/_raw/r11-*.txt`、t2 的 `docs/rev10-独立验证.md`（含 t6 追加的附录 A）。
