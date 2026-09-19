# r13v — 独立复核报告（任务 t3，verifier）

**被复核的结论**（t1 + t2 的交付）：
1. 18 个声明变异都健全：真改写被求值的源 + 红集恰好等于声明 + 被抓住时 exit 0；
2. `run-r13.ps1` 干净：无 FAILURES 行、回归集里唯一非零是 probe-13（沙箱无浏览器引擎）、冻结路径前后逐字节一致；
3. 断言零删除（probe-11/17/18/19 + `.scratch` 遗留探针）；
4. `lib/**` 零改动（client.js 147062 B / 730D1C2F…，index.js 46638 B / 03778391…）。

**结论：四条全部独立复现，未发现与 t2 表述不一致之处。** 另有 1 条对抗性发现（不在 t2 的结论范围内，见 §7 V1）与 3 条方法学限制（§7 V2–V4、§8）。

复核方式：本报告的每个数字都由 verifier 自己的脚本从**真实字节**重新产生（声明从探针源码静态解析、红集从自己的运行日志里读、哈希自己算），t2 的表只用来做最后一步对照。

---

## 1. 命令与退出码

| # | 命令（cwd = `dsh-approval-chime`） | 退出码 | 结果 |
| --- | --- | --- | --- |
| C1 | `powershell -ExecutionPolicy Bypass -File verify-independent/run-r13v-mutation-matrix.ps1` | 0 | 18 个变异各自独立进程重跑，全 exit 0；guard 路径前后逐字节一致 |
| C2 | `node verify-independent/r13v-declaration-parse.mjs` | 0 | 从探针源码静态解析出 18 个声明的红集 |
| C3 | `node verify-independent/r13v-check-matrix.mjs --markdown=1` | 0 | 声明 vs 实测逐条精确相等；写 `_raw/r13v-mutation-matrix.md` |
| C4 | `powershell -ExecutionPolicy Bypass -File verify-independent/run-r13v.ps1` | 0 | 自带前缀的 r13 全量跑（见 §4） |
| C5 | `powershell -ExecutionPolicy Bypass -File verify-independent/run-r13.ps1` | 0 | **canonical 脚本本体**再跑一遍（见 §4） |
| C6 | `node verify-independent/r13v-assertion-inventory.mjs` | 0 | 零删除复核（见 §6） |
| C7 | `node verify-independent/r13v-declaration-diff.mjs` | 0 | 三条被更正的声明：3→9 / 1→3 / 3→6，0 条期望被删 |
| C8 | `powershell -ExecutionPolicy Bypass -File verify-independent/run-r13v-adversarial.ps1` | 0 | 4 个对抗性产物变异 + 5 个自测守卫（见 §5） |
| C9 | `node verify-independent/r13v-adv-bell-checker.mjs` | 0 | 用 shipped harness 自己复算 client-half 的 8 条铃铛事实 |
| C10 | `node verify/host-half.test.mjs` 等四套件逐个跑（本机 PowerShell 5.1 不支持 `&&`，改为顺序执行并各自取退出码） | 0 / 0 / 0 / 0 | 124/124、336/336、22/22、75/75 = 557 |

契约里列的 10 条 verify 命令全部由 C1（变异矩阵）与 C4/C5（运行器）覆盖；单独逐条跑的结果与矩阵一致（矩阵就是逐条独立进程调用）。

---

## 2. 18 个变异逐个重跑（变体确实被改写 / 红集恰好等于声明 / 抓住时 exit 0）

声明来自 `r13v-declaration-parse.mjs`（静态解析探针源码的 `MUTATIONS` 字面量），实测红集来自我自己的运行日志 `_raw/r13v-mut-*.txt`。`sourceChanged` 由日志里的 sha256 对（我自己比较，采信探针的计算结果）判定；probe-18 另外核对锚串在 shipped 字节里恰好出现 1 次。

| # | 探针 | 变异 | exit | 声明数 | 实测红集 | 缺失 | 多出 | 源真改写 | 锚串次数 | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | probe-11 | `card-cap-92px` | 0 | 3 | 3 | 0 | 0 | true | – | 恰好按声明抓住 |
| 2 | probe-17 | `slot` | 0 | 9 | 9 | 0 | 0 | true | – | 恰好按声明抓住 |
| 3 | probe-17 | `order` | 0 | 3 | 3 | 0 | 0 | true | – | 恰好按声明抓住 |
| 4 | probe-17 | `heading` | 0 | 2 | 2 | 0 | 0 | true | – | 恰好按声明抓住 |
| 5 | probe-17 | `picker` | 0 | 2 | 2 | 0 | 0 | true | – | 恰好按声明抓住 |
| 6 | probe-17 | `rogue` | 0 | 6 | 6 | 0 | 0 | true | – | 恰好按声明抓住 |
| 7 | probe-18 | `mute-ignored` | 0 | 14 | 14 | 0 | 0 | true | 1 | 恰好按声明抓住 |
| 8 | probe-18 | `unmute-writes-true` | 0 | 5 | 5 | 0 | 0 | true | 1 | 恰好按声明抓住 |
| 9 | probe-18 | `batch-gap-zero` | 0 | 6 | 6 | 0 | 0 | true | 1 | 恰好按声明抓住 |
| 10 | probe-18 | `session-id-constant` | 0 | 8 | 8 | 0 | 0 | true | 1 | 恰好按声明抓住 |
| 11 | probe-18 | `custom-tone-no-fallback` | 0 | 1 | 1 | 0 | 0 | true | 1 | 恰好按声明抓住 |
| 12 | probe-18 | `batch-merge-first-only` | 0 | 6 | 6 | 0 | 0 | true | 1 | 恰好按声明抓住 |
| 13 | probe-18 | `evict-newest-first` | 0 | 5 | 5 | 0 | 0 | true | 1 | 恰好按声明抓住 |
| 14 | probe-18 | `convergence-reread-removed` | 0 | 2 | 2 | 0 | 0 | true | 1 | 恰好按声明抓住 |
| 15 | probe-18 | `home-blank-accepted` | 0 | 1 | 1 | 0 | 0 | true | 1 | 恰好按声明抓住 |
| 16 | probe-19 | `popover-dropped-from-shared-picker` | 0 | 9 | 9 | 0 | 0 | true | – | 恰好按声明抓住 |
| 17 | probe-19 | `popover-list-resplit-12px` | 0 | 7 | 7 | 0 | 0 | true | – | 恰好按声明抓住 |
| 18 | probe-19 | `popover-cap-loses-one-row` | 0 | 3 | 3 | 0 | 0 | true | – | 恰好按声明抓住 |

**与 t2 的表逐条一致**（`_raw/r13c-mutation-table.md` 的 18 行：声明/实测/exit 全部相同）。红集互不重复也被我复算：probe-17 5/5、probe-18 9/9、probe-19 3/3 个不同的红集（probe-19 自己的 `--mutate=all` 断言了逐对不等，实测 exit 0）。

组模式与 shipped 模式（我自己的运行）：

| 命令 | exit | 实测摘要 |
| --- | --- | --- |
| `node probe-11-r4-css-rows.mjs` | 0 | 32/32 independent checks passed |
| `node probe-17-r7-section.mjs` | 0 | 94/94 independent checks passed |
| `node probe-18-r10-sessions.mjs` | 0 | assertions passed=131 failed=0 |
| `node probe-19-r12-select-parity.mjs` | 0 | 66/66 independent checks passed |
| `node probe-18-r10-sessions.mjs --mutate=all` | 0 | 9/9 mutations detected exactly as declared |
| `node probe-19-r12-select-parity.mjs --mutate=all` | 0 | 3 个变异各红各自声明，逐对不同的非空子集 |
| `node probe-11-r4-css-rows.mjs --list-mutations` | 0 | 1 个变异 |

四探针的 shipped 数字与 t1/t2 报的 32/94/131/66 **完全一致**。

---

## 3. t2 的三处声明更正：是"更正"而不是"删断言"

用 pre-t1 归档字节（`_raw/r13-reverse-probe-17-r7-section.mjs`，sha256 与我重算的一致）对照（C7）：

```
slot     declared  3 ->  9   always 2 -> 2   expectations dropped: 0
order    declared  1 ->  3   always 0 -> 0   expectations dropped: 0
heading  declared  2 ->  2   always 0 -> 0   expectations dropped: 0
picker   declared  2 ->  2   always 0 -> 0   expectations dropped: 0
rogue    declared  3 ->  6   always 3 -> 3   expectations dropped: 0
assertion names pre-t1 -> shipped: 97 -> 98; names present before and gone now: 0
```

即：三条声明是**变大**到实测红集，旧期望一条没删、断言名一个没丢（95→95 条字面量名，加 1 条模板字面量名）。与 t2 的"期望值一字未改"一致。

---

## 4. run-r13 干净性（我跑了两遍：自带前缀副本 + canonical 本体）

`run-r13.ps1` 在 15 处硬编码 `r13-` 日志前缀，直接跑会覆盖 t2 的 r13 证据，因此：

1. 先把 t2 的 101 个 `r13*` 证据文件归档到 `_raw/r13-t2-archive/`，并写 `MANIFEST.sha256.txt`；事后逐文件重算：**101 个全部逐字节一致，0 个变化**。
2. `r13v-make-prefixed-runner.mjs` 由 canonical 文件机械派生 `run-r13v.ps1`（`'r13-'`→`'r13v-'` 共 15 处），并**反向替换证明这就是唯一差异**：反向替换后 sha256 = `AAE3FDDA…`（与 canonical 完全一致），行数 565→565。`run-r13.ps1` 本体未被改动（36065 B / `AAE3FDDA51B5E5607602EFF6F6A795563CD47058E0B85AB8C276BF7315EB2BA5`）。
3. 然后两道都跑：C4（`run-r13v.ps1`，日志 `_raw/r13v-*`）、C5（`run-r13.ps1` 本体，日志 `_raw/r13-*`，t2 原件已在第 1 步归档）。

| 检查项 | C4 `run-r13v.ps1` | C5 `run-r13.ps1` 本体 |
| --- | --- | --- |
| 进程退出码 | 0 | 0 |
| `^FAILURES:` 行数 | **0** | **0** |
| 冻结清单 before/after | `r13v-frozen-diff.txt` = `identical`（9 行） | `r13-frozen-diff.txt` = `identical`（9 行） |
| 9 个冻结文件哈希 | 全部等于 manifest（0 处 mismatch） | 同 |
| 回归集（13 探针 + 18 变异 + 竞态 + 4 套件）非零项 | **只有 probe-13-r4-browser（exit 1）** | **只有 probe-13-r4-browser（exit 1）** |
| 4 套件 | 124 / 336 / 22 / 75 = 557 全 exit 0 | 同 |
| 18 个变异（2b/2c/2d/§3） | 全 exit 0 | 全 exit 0 |
| legacy（10 个 rev-1…rev-3 探针） | 8 个非零，全部落在 `$expectedLegacyNonZero` 名单且有逐条理由 | 同 |
| reviewer（4 个 `.scratch` 探针） | 退出码与登记一致（1 / 1 / 0 / 1），`probe-r7-reqcheck` 打印"the 7 red assertion(s) are EXACTLY the registered set" | 同 |
| 头部声明 | "唯一允许非零的是 probe-13" | 同 |

两跑的控制台都是 187 行，摘要段落一致（`_raw/r13v-run-console.txt`、`_raw/r13v-canonical-console.txt`）。

`.scratch` 遗留探针的"有理由非零"我也逐条对照了当前事实：

* `reqcheck-rev5.mjs`：`TypeError: Cannot read properties of undefined (reading 'props')` at `.scratch/reviewer-r5/reqcheck-rev5.mjs:260`，**崩在任何断言之前**（日志里没有任何断言输出）；`reqcheck.mjs` 同型，位置 `:251`。
* 原因是 rev-5 的"最后一次 register 即卡片"shim：`lib/client.js:2999-3000`（settings.section）之后 `lib/client.js:3024-3025`（session-header bell）又多了一次注册 → 抓到 bell → 无 sessionId 时渲染为空 → `row.props` 未定义。t2 的表述与当前字节逐字对得上。
* `probe-r7-reqcheck.mjs`：82 passed / 7 failed，7 条红**逐条等于**登记集合（rev-7 版本戳 / 两次注册 / 两次 inject / 旧标题串 / 版本戳上页 / rev-12 前的 co-location 正则）。
* `reqcheck-host-413.mjs`：9 passed / 0 failed（本就绿）。
* 四个 `.scratch` 文件的 mtime 全部是 **2026-09-15**（rev-5 / rev-7 评审当天），本轮（2026-09-18）没有被改过；调用点/断言名实测 69/39/9/90 与 69/39/9/89（`reqcheck-host-413` 9/9）。

---

## 5. 对抗性变异（自造，如实报告）

### 5.1 产物变异 × 现有自测：**没抓住（发现）**

四个**没有任何人声明**的产物变异，注入 rev-14 的"蓝色铃铛"外观语义，交给 probe-18 的 131 条断言（用 probe-18 自己的内存源覆盖钩子，`expect: []` = 测量模式）：

| 用例 | 变异（内存字符串，磁盘不动） | 变体源 sha256 | 实测红集 | 结论 |
| --- | --- | --- | --- | --- |
| A1 | 蓝底从 `[data-muted="false"]` 挪到裸 `.dacBell`（静音也变蓝） | `6E748820…` ≠ shipped | **0 条** | 没抓住 |
| A2 | 删掉 `.dacBell[data-muted="false"]:hover` 规则 | `8D467907…` ≠ shipped | **0 条** | 没抓住 |
| A3 | 蓝底写死 `#2563eb/#fff`（不再用设计令牌） | `F4C45D30…` ≠ shipped | **0 条** | 没抓住 |
| A4 | 静音态颜色改 `#000`（丢掉 caption grey） | `44D4F9F5…` ≠ shipped | **0 条** | 没抓住 |

复现：`node verify-independent/r13v-adv-probe-18.mjs --mutate=adv-muted-bell-filled`（A1；A2–A4 换名字即可），日志 `_raw/r13v-adversarial-A1..A4.txt`。四个用例在 `--list-mutations` 里也可见，锚串在 shipped 字节里各出现 **恰好 1 次**。

为什么 probe-11/17/19 也不会看到：它们直接 `readFileSync(lib/client.js)`，没有内存源覆盖钩子；而且它们的断言名里**没有任何一条**提到 `.dacBell`/`muted`/`fill`（唯一的 `:hover` 断言是 probe-19 的下拉 option 高亮）。所以这四类外观变异对这四个独立探针整体不可见 —— 这是**独立探针集的覆盖空白**。

它是否等于"没人管"？不是。我用 shipped harness 自己的 vm 沙箱复算了 `verify/client-half.test.mjs:715-752` 的 8 条铃铛事实（C9，含 shipped 字节的对照组，8/8 通过）：

| 用例 | 被哪几条抓住 |
| --- | --- |
| A1 | C1（`verify/client-half.test.mjs:721`）、C4（`:749`）、C8（`:744`） |
| A2 | C5（`:729`） |
| A3 | C1（`:721`）、C4（`:749`） |
| A4 | C7（`:739`） |

即：产物事实有断言守着（author 套件），缺的是**独立探针**这一层；该套件本身也是被"把静音态也填充"这类对手打磨过的（`client-half.test.mjs:691-696` 的注释明确写了 first-match 版本曾放过这个变异）。

### 5.2 自测守卫对抗（针对 t2 的"死变异再也混不过去"）：**全部咬住**

对 shipped 探针做**故意破坏**的副本（每个补丁都断言锚串恰好出现 1 次才生成）：

| 用例 | 破坏 | exit | 关键输出 |
| --- | --- | --- | --- |
| B1 | probe-18 的 `mute-ignored` 锚串改成不存在 | 1 | `Error: mutation 'mute-ignored': anchor not found (0 occurrences)`（`r13v-adv-probe-18-deadanchor.mjs:727`） |
| B2 | probe-18 删掉声明里的 `'D3'`（声明漂移） | 1 | `observed red set (14): …` / `extra reds beyond the declaration: D3` / `NOT DETECTED as declared` |
| B3 | probe-11 `to` 改成与 `from` 相同（空转替换） | 1 | `[FAIL] the mutation really rewrote the stylesheet under test — sha256 D14B9B4D50EA6188 vs D14B9B4D50EA6188 … DEAD MUTATION` |
| B4 | probe-17 `order` 锚串改成 `order: `（shipped 里 6 次） | 1 | `Error: mutation anchor is not unique (2+ occurrences): order` |
| B5 | probe-19 首个变异锚串改成不存在 | 1 | `Error: mutation anchor not found: DEAD-ANCHOR::picker(select),…`（`r13v-adv-probe-19-deadanchor.mjs:701`） |

复现：`powershell -ExecutionPolicy Bypass -File verify-independent/run-r13v-adversarial.ps1`（返回 0 = 4 个测量用例照常、5 个守卫全部非零）。日志 `_raw/r13v-adversarial-B1..B5.txt`。

---

## 6. 断言清单对照（零删除）

我用**自己的计数器**（`.check(`/`.same(`/`.deep(`/`.ok(` 调用点 + 首参字符串字面量），对四个探针复算，并与 t2 的数字对照：

| 文件 | 调用点 before → after | 断言名字面量 before → after | rev-N 归一化 | 模板名字 | t2 报的数 | 一致? |
| --- | --- | --- | --- | --- | --- | --- |
| probe-11-r4-css-rows.mjs | 34 → 35 | 33 → 33 | 33 → 33 | 1 → 2 | 34→35 | 是 |
| probe-17-r7-section.mjs | 102 → 103 | 95 → 95 | 95 → 95 | 2 → 3 | 102→103 | 是 |
| probe-18-r10-sessions.mjs | 99 → 99 | 94 → 94 | 94 → 94 | 0 → 0 | 99→99 | 是 |
| probe-19-r12-select-parity.mjs | 73 → 73 | 68 → 68 | 68 → 68 | 0 → 0 | 73→73 | 是 |

`before` 侧：probe-17/18/19 用 pre-t1 归档字节（sha256 与 `_raw/r13-reverse-substitution.txt` 记录一致，脚本里强制校验）；t1 只动字面量（该文件已证明），所以它同时也是 pre-t2 的断言集。probe-17 出现的 4 个"名字漂移"是 `rev-12`→`rev-14` 的字面量重锚（归一化后 0 丢失）。

独立的运行时旁证（t2 最终编辑**之前** 1:34 那次跑的日志 → 之后 1:43 的日志，同一变异）：

```
probe-11  31/34 -> 32/35   运行时检查总数 34 -> 35 (+1)
probe-17  89/98 -> 90/99   运行时检查总数 98 -> 99 (+1)
probe-18  passed=128 failed=1  ->  passed=128 failed=1   总数 129 -> 129 (+0)
probe-19  62/65 still pass ->  62/65 still pass          总数 65 -> 65 (+0)
```

结论：四个探针的断言调用点与名字**没有减少**，`probe-11/17` 各只 +1（t2 新增的"红集恰好等于声明"和"变异真改写"两条自检），与 t2 的"零删除"一致。`.scratch` 探针本轮未被改动（mtime 2026-09-15，见 §4）。

---

## 7. 发现与限制

**V1（low，发现，不阻塞本轮）** — 独立探针集对 rev-13/rev-14 的铃铛外观无覆盖。
`file:line`：`verify-independent/probe-18-r10-sessions.mjs`（131 条断言全绿于 4 个外观变异）；`verify-independent/probe-11/17/19` 均 `readFileSync(lib/client.js)`，无内存源钩子。
复现：`node verify-independent/r13v-adv-probe-18.mjs --mutate=adv-muted-bell-filled`（实测红集 0）。
现状对照：`verify/client-half.test.mjs:721-752` 守着这些事实（我的复算逐条命中）。建议（不属于本轮 inScope，未实施）：若要给"外观"这一层补独立变异覆盖，可在 probe-11 那类 CSS 解析探针里加"静音态/裸类不得被填充"与"填充必须用 `sessionIcon.onBackground` 令牌"两条，并按 probe-11 的 `expectFail` 纪律声明红集。

**V2（info）** — probe-11 的"真改写源"改写的是**注入后的样式表字符串**（`api.cssText()`），不是 `lib/client.js` 字节；改动后的样式表 sha256 `21B4B74D26C64C5F…` vs shipped `D14B9B4D50EA6188…` 由探针打印、我复核。这符合 probe-11 的设计（它攻击的是真实 bundle 注入的 CSS），但"真改写源码"这句话在 probe-11 上应理解为"真改写被求值的产物"。

**V3（info，方法学限制）** — 工作区里**不存在** probe-11 的 pre-t2 字节副本（git 无提交）。它的 before=34 来自两处：删掉 t2 记录的三段插入（脚本强制要求每段逐字存在且恰好 1 次）+ 1:34 运行时日志的 31/34。仅凭计数无法排除"删一条、加两条"的等量补偿；不过当前 35 个调用点在 shipped 与 18 个变异模式下全部被真实执行（32 + 变异裁决），且 18 个变异的红集恰好等于声明，这条残余风险我如实登记。

**V4（info，状态变更）** — 为了满足"canonical 脚本本体跑一次"，我执行了 `run-r13.ps1`，它按设计覆盖了 `_raw/r13-*` 的逐命令日志。t2 的原件已先归档到 `_raw/r13-t2-archive/`（101 个文件 + sha256 清单，事后 101/101 逐字节一致）。t2 的外置控制台捕获 `_raw/r13-run-console.txt` 未被脚本触碰（mtime 仍是 1:45:12）。

**V5（info）** — 本轮我**没有**修改任何 `lib/`、`verify/`、`package.json`、`README.md`、`CHANGELOG.md`、`docs/`、`.scratch/` 下的文件；`audio/` 运行前后都是 0 个文件；`lib/` 仍 2 个文件、`verify/` 仍 5 个文件。新增文件全部在 `verify-independent/`（inScope）内。

---

## 8. 不可验证清单（如实登记）

1. **probe-13-r4-browser.mjs 的失败原因**：沙箱没有浏览器引擎。我只能确认它的退出码 1 属于登记例外、且是回归集里唯一的非零；"真机里铃铛多大/多蓝/悬停是否发灰"这类事实在本机无法验证。
2. **像素与观感**：真实 picker 弹层高度、颜色观感、`color-mix()` 的实际渲染结果、明暗主题下的对比度、字体度量 —— 一律无法在本沙箱验证（探针自己也这么声明）。
3. **"蓝色与用户截图里的蓝色一致"**：我能验证的是"填充用的是 `sessionIcon.onBackground` 这个令牌、且与开关/滑块同源"（令牌等值），不是"这个令牌在真实 DSH 里就是截图里的那个蓝"。
4. **四个 `.scratch` 探针"非零即正确"**：我验证了它们的退出码/红集与登记一致、字节自 2026-09-15 未改、崩溃点与 t2 引用的 file:line 一致；但它们**作为 rev-5/rev-7 评审记录是否应当保持红色**是历史判断，我只能核对"与当时记录一致"，不能追溯评审当时的意图。
5. **上一轮那张"6 个报红是设计使然"的变异表**：本轮未提供该表的可核验载体，我没有复核它。
6. **probe-18 竞态测量（1500 轮）的统计性质**：我只复现了它 exit 0 与打印的 I1 测量行；"零残余分歧"是统计观测，不是证明。

---

## 9. 证据索引（verifier 自建，全部在 `verify-independent/` 内）

脚本：`r13v-declaration-parse.mjs`（声明静态解析）、`r13v-check-matrix.mjs`（矩阵裁决）、`r13v-assertion-inventory.mjs`（零删除）、`r13v-declaration-diff.mjs`（声明更正对照）、`r13v-make-prefixed-runner.mjs`（前缀派生+反向证明）、`run-r13v.ps1`（派生运行器）、`run-r13v-mutation-matrix.ps1`、`run-r13v-adversarial.ps1`、`r13v-adv-mutations.mjs`、`r13v-make-adversarial-probes.mjs`、`r13v-adv-bell-checker.mjs`、`r13v-adv-probe-18.mjs`、`r13v-adv-probe-18-deadanchor.mjs`、`r13v-adv-probe-18-drift.mjs`、`r13v-adv-probe-11-noop.mjs`、`r13v-adv-probe-17-nonunique.mjs`、`r13v-adv-probe-19-deadanchor.mjs`。

证据（`_raw/`）：`r13v-declared.json`、`r13v-mutation-matrix.tsv|.md`、`r13v-mut-*.txt`（18 个）、`r13v-shipped-*.txt`、`r13v-group-*.txt`、`r13v-run-console.txt`、`r13v-canonical-console.txt`、`r13v-frozen-diff.txt`、`r13v-baseline-before|after.txt`、`r13v-prefixed-runner.txt`、`r13v-assertion-inventory.txt`、`r13v-declaration-diff.txt`、`r13v-adversarial*.txt|.tsv`、`r13v-adv-bell-checker.txt`、`r13v-adversarial-build.txt`、`r13-t2-archive/`（101 个 t2 原件 + MANIFEST）。

被复核产物（本轮结束后重算，与 t2/t1 记录一致，未被任何一轮跑改动）：

| 文件 | 字节 | sha256 |
| --- | --- | --- |
| verify-independent/probe-11-r4-css-rows.mjs | 22590 | `8F044EA6FE26DCA3828642E4642F8F605A0A9D08EAA211E5709CD58B40AC048F` |
| verify-independent/probe-17-r7-section.mjs | 53912 | `9C331EBCC0C46672B6D13726822114FD522E1C35EB2F1E2477DACCCB20CC2F90` |
| verify-independent/probe-18-r10-sessions.mjs | 89646 | `F0EF23032FC93E13BDC59A76AFD11AB2B87303204AA1BE653F00E9CB845B8FDE` |
| verify-independent/probe-19-r12-select-parity.mjs | 53496 | `6C3B251815D19579D8087A9571D49EF2216BD78B9DD8980147A76B40F8CC645C` |
| verify-independent/run-r13.ps1 | 36065 | `AAE3FDDA51B5E5607602EFF6F6A795563CD47058E0B85AB8C276BF7315EB2BA5` |
| lib/client.js（零改动） | 147062 | `730D1C2F7F58E19471D4B77EE43A221B4FD255BC06AD2AE3752A2C4443466BD5` |
| lib/index.js（零改动） | 46638 | `03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938` |

9 个冻结清单文件我单独重算了一遍：**0 处 mismatch**。
