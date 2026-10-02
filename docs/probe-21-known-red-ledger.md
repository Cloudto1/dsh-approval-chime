# probe-21 已知红台账（r30 收尾轮 · 用户裁决 **甲**）

> **这份文件是给未来的人看的**：`verify-independent/probe-21-native-toast.mjs` 是一个**发布轮仪器**，
> **不在**每次体检（`verify-independent/run-r13.ps1`）的执行清单里，所以它红着也不影响验收。
> 下面每一条红都写清"为什么红、能不能修、谁判的"，以后翻到**不用再查一遍**。

---

## 1. 它为什么不在体检里

它要求三样东西，**任何一台新克隆的机器都没有**：

1. `verify-independent/_raw/r25-evidence/r25-{t1,t25}-reanchor.json`、`_raw/r29/release/r29-reanchor.json`
   三份历史记录（`_raw/` 被 git 忽略，不进仓库）；
2. 一个"先跑一次"的夹具 `r25-t18-selftest-shadow.mjs`（**本机也没有**）；
3. **一个能真的弹通知、并把通知读回来的桌面会话**（受限沙箱里"弹"这一步直接失败）。

它是 rev-25 发布轮的工具，不是常驻闸门。**体检给它的保护是另一条**：见 §5。

## 2. 当前状态（三次实测，同一份插件代码）

| 时点 | 通过/总数 | 红 | 说明 |
|---|---|---|---|
| r30 收尾轮开始（改动前） | 395/434 | **39** | `probe21-after-anchor.log` |
| 修完 4 条 + 抖动命中 | 397/434 | 37 | `probe21-after-reanchor.log` |
| 修完 4 条 + 无抖动 | 399/434 | 35 | `probe21-run3.log` |
| **提交后（实测）** | **400/434** | **34** | `probe21-after-commit.log`；名单 `probe21-34-red-final.txt` |
| **红线重画后（用户选 1，实测）** | **401/434** | **33** | `probe21-after-redraw.log`；名单 `probe21-after-redraw.failures.txt` |
| **verify6 复核修正后（实测）** | **402/435** | **33** | `probe21-after-banrestore.log`；名单 `probe21-after-banrestore.failures.txt`（总数 434→435：为"只有一份定义"单独立了一条断言） |
| **补掉 innerHTML 洞后（实测）** | **402/435** | **33** | `probe21-after-htmlban.log`；名单 `probe21-after-htmlban.failures.txt`（判据变严、红数不变：区域里这两处本来就是 0 次） |
| **"数括号"修正后（实测，当前）** | **402/435** | **33** | `probe21-after-bracematch.log`；名单 `probe21-after-bracematch.failures.txt`（修的是尺子自身的假绿，红数不变） |

**33 条的实测构成**：**真机通知环境 25 条 · 证据缺失 8 条 · 待裁决 0 条** —— 与本文档 §4 的分组逐条吻合
（原来的第 34 条已按用户裁决关闭，见 §4.3）。

**抖动**：它自己有一段并发竞态测量（`r3/G1 (cross)`，20 轮 POST/GET 同时发），在这个受限沙箱里
**同一份插件代码**（探针自身在各轮之间被改过）**多次跑出 35 / 37 / 35** —— **三次里有两次**带着这 2 条红（`no round delivered the decision twice`、
`every round is one of the two legal outcomes`）；verify6 复核自己那次也带着它们（那次读数 **399/434、35 条**）。
**这 0–2 条是计时抖动，不是产品问题**（插件字节每次完全相同）。

## 3. 本轮已关闭的 6 条（裁决 **甲** = 修；下面第一条按用户**选 1** 重画判据，详见 §4.3）

| 红的条目 | 根因 | 怎么关的 | 证据 |
|---|---|---|---|
| `the native-notification block builds no UI of its own…`（旧名：`the client never creates a DOM node inside its native-notification block`） | 老规矩"两条横幅之间一律不许 `createElement`"被第二批修复（白纸页）挪进来的**共用标题栏**顶掉了 | **用户选 1：重画判据** —— 提名允许那**一个**共用标题栏，并按大小钉死（见 §4.3） | `native-block-redraw-check.log`；`probe21-after-redraw.log` |
| `the probe is reading the anchored revision…` | r30 的部署批次改了 4 个脚本（install/uninstall/selftest/activate），没人更新它的小抄 | 4 行按盘上真值重锚：install `21E7B0CE…`/18500、uninstall `5F674BFF…`/6221、selftest `F681293C…`/12470、activate `474DA965…`/2639 | `fix-report-4-residuals.md` §6 |
| `activate.vbs starts PowerShell with SW_HIDE (Run cmd, 0, False)` | r30 把那句拆成 `Set shell = …` + `shell.Run cmd, 0, False`，**行为没变**（`0` 仍是隐藏窗口） | 断言改成现在的真写法 | 同上 |
| `the Host suite still carries its two literal single-line default-value expectation rows` | 2026-10-01 事故把原件毁了，**重建件里只有 1 条**（原本 3 条），探针记的是旧数 | 期望值 2 → 1，并写清"这是重建件的性质" | `probe-21:2371-2377` |
| `the suite description still names the switch in its defaults row` | 探针找 `nativeToast:false`（无空格），文件里一直是有空格的 `nativeToast: false` | 断言改成真写法 | `probe-21:2395-2397` |
| `every entry git reports under verify-independent/** is one … declared` | 本轮新增 `probe-23-cli-args.mjs`、`probe-24-anchor-drift.mjs` 时是未跟踪文件 | **提交后消失**（tracked 文件不再出现在 `git status`） | `git status` |

## 4. 剩下的 33 条（按根因分组，均已定性）

### 4.1 这台机器上跑不了（25 条）—— 要真弹通知再读回来

| 组 | 条数 | 代表条目 |
|---|---|---|
| 弹一条真通知 + 读 History | 5 | `the product raise.ps1 exits 0 for a real toast — expected 0, got 5`；`History.GetHistory accepts the call`；`exactly one notification sits in the history for that AUMID` |
| 通知内容原样往返（tag/group/按钮/文案/参数/XML） | 9 | `the captions survive the round trip — expected ["接受","拒绝"], got []`；`the whole read-back XML normalises to the XML that was raised` |
| 产品 AUMID 那条 + 撤销 | 7 | `the product AUMID delivers a toast without any registry key being written — expected 0, got 5`；`History.Remove took the product own toast back off the screen` |
| 200 字截断 / 转义字符两条边界 | 4 | `LoadXml accepts the 200-character truncated XML (raise exits 0) — expected 0, got 5`；`the escaped metacharacters survive as their literal characters` |

**已核实**：本机**注册表协议键在、标记纸条也在（365 字节）** → 不是"通知没装好"，是受限会话里弹不出来/读不到。
**唯一消除途径**：在一个正常的桌面会话里手工跑一次发布流程（屏幕上会真弹一条测试通知）。**不消除也不影响产品验收。**

### 4.2 证据缺失，**补不回来**（8 条）

| 条目 | 缺什么 | 为什么补不回来 |
|---|---|---|
| `the t4 re-anchor record is on disk and names 11 files` | `_raw/r25-evidence/r25-t1-reanchor.json` | 全盘搜不到；生成它的 `r25-t1-reanchor.mjs` **也不在**。手写一份等于**伪造证据**，不做 |
| `the t25 re-anchor record … 5 files` | `_raw/r25-evidence/r25-t25-reanchor.json` | 同上（`r25-t25-reanchor.mjs` 不在） |
| `the r29 re-anchor record …` | `_raw/r29/release/r29-reanchor.json` | 该位置没有；`.scratch/r29-release/r29-reanchor.json` 有一份**不同位置**的记录，但记录里预测的指纹已过期，搬过去也仍然红（**未搬，等需要时再试**） |
| `the records cover every re-anchored instrument` | 随上面三条 | — |
| `every declared instrument still hashes to the byte image its latest record predicted` | 随上面三条（expected 全为 null） | — |
| `the r24 (pre-rev-25) log pins three switch/track/knob rows` | `_raw/r24-dev-client-half.txt` | 搜不到；`_raw` 不进 git |
| `the browser suite grew instead of shrinking` | 同上（拿 r24 旧日志当基线） | 同上 |
| `the verifier own shadow matrix proves each of the SIX checks can go red…` | 夹具 `r25-t18-selftest-shadow.mjs` | 脚本不在盘上 |

另：它自己那份"改前字节存档"（`_raw/r25-evidence/archive/probe-21-…6002b747….txt`）在 git 历史的 4 个版本里
**没有一个防伪码对得上** → 同样无法复原。

### 4.3 已按用户裁决关闭（1 条 → 现为 0）

`the client never creates a DOM node inside its native-notification block` —— 探针把 `lib/client.js` 里
"windows notifications" 到 "approval watch" 两条横幅之间的整段划为**只准发请求、不准建界面元素**的区块。
为修**第 9 条**（白纸页），`8530452` 把页面标题栏抽成共用的一份 `sectionHead()` 并上移进该区块：

| 版本 | 区块范围（横幅注释→横幅注释，1 基行号） | 区块内 `createElement` |
|---|---|---|
| `f1fe6cf`（修复前） | 1648–2385（738 行） | **0** → 当时绿 |
| `887a356`（第一批修复后） | 1665–2402（738 行） | **0** → 仍然绿 |
| `8530452`（第二批修复） | 1665–2431（767 行） | **3** → 从此红 |
| `HEAD` | 1673–2444（772 行） | 3 |

> **本表更正过一次（r30 尾轮）**：`f1fe6cf` 那行原写 `1646–2383`，是**PowerShell 逐行扫描的读数误差**（偏 2 行）。
> 独立复核指出后改用 node 直接量 blob 重测，得到上表；`887a356` 一行是新补的，用来把责任**钉到第二批修复**
> （第一批之后仍是 0）。原始测量输出：`.scratch/audit-r30/banner-range-check.log`。

**功能上是对的**（一个标题栏定义、两页共用、不会走样）；**红线确实被跨过**。

**用户裁决（r30 尾轮）：选 1 —— 认这条红线改了，把判据改成按意思划界，产品代码一行不动。**

新判据（`probe-21-native-toast.mjs`，检查已改名）：

- 硬禁令**一条不少**：区域里**不许**出现 `Notification`（**整词**，不是只禁 `new Notification`）、**不许**出现 `MessageBox`；
- 区域里**允许且只允许一处**界面构造：共用的 `sectionHead()` 标题栏。判定方式是
  "全区域的 `createElement` **调用**数 == 标题栏函数体内的调用数 == 3"（外框 div + 标题 h2 + 版本号 span）；
- `sectionHead()` 在整个 client 里**必须只有一份定义**（**单独的断言**，不再搭在区域判据里）；
- 于是：**区域里多任何一处界面构造 → 红；标题栏里多写一个 `createElement` → 红；整块没有界面代码 → 绿**（回到老样子）。

**可证伪性（实测，14/14 按声明）**：取证脚本**从探针源码里抽取判据原文**再求值（不是照抄一份；
`endOfFunction` 也是从探针里抽的，不是复写一份）。
Part A 十一例：正本 → 绿；区域里加 `createElement` → 红；标题栏里加第四个 → 红；加 `MessageBox(` → 红；
删掉标题栏（区域无界面代码）→ 绿；`Notification.requestPermission()` → 红；
`new window.Notification('x')` → 红；`const N = window.Notification; new N('x')` → 红；
标题栏里写 `el.innerHTML = …` → 红；区域里写 `insertAdjacentHTML(…)` → 红；
**"三处同时改"的假绿（标题栏减成 2 次调用 + 结束大括号缩进改两格 + 后面塞一个 rogue 调用）→ 红**。
Part B 三例（"只有一份定义"）：正本 1 → 绿；加第二份定义 2 → 红；全删 0 → 红。
输出：`.scratch/audit-r30/native-block-redraw-check-v4.log`（v3 = 13 例，v2 = 11 例，v1 = 5 例）。

**第一版重画被 verify6 复核挑出 3 处，已修**（这是独立复核的价值所在）：

1. **真退步**：第一版只禁 `new Notification`，于是 `Notification.requestPermission()`、
   `new window.Notification(…)`、`const N = window.Notification` **三种写法都能溜过去**，而老规矩全都抓得住
   → 已把**整词 `Notification`** 禁令装回来（区域里本来就是 0 处，装回来不影响正本）。
2. **"只有一份定义"被短路**：区域里没有界面代码时判据会提前返回，**两份定义也能绿** → 已拆成**独立断言**。
3. **措辞过宽**：写的是"钉死三个元素"，实际钉的是**三个 `createElement` 调用** → 已改成准确说法。

**verify7 复核（补完 innerHTML 洞之后）又指出一条"我自己的尺子"的弱点，已修**：

4. **假绿（不安全方向）**：标题栏"到哪儿结束"原来是**找文字**（`indexOf('\n      }')`），于是把
   ①标题栏减成 2 次调用 ②结束大括号缩进改两格 ③后面塞一个 rogue 调用 —— **三处同时改**就能骗过
   （单独改任何一处都会报红，是 verify7 实测的 M1）。→ 已改成**数括号**（跳过字符串与注释），
   `endOfFunction()` 现在按真正的大括号配对找结束位置；上面 14/14 里那条"三处同时改"已实测**报红**。

**洞的处理（用户已裁决）**：

| 洞 | 现在 | 说明 |
|---|---|---|
| 标题栏里用 `innerHTML` / `insertAdjacentHTML` 加第四个元素 | **已补**：区域里两条禁令 | 正本这两处本来就是 0 次，补了不影响正本；可证伪：两例都报红（见上面 14/14） |
| 拼接成员名绕开**所有**字面禁令（`React['create'+'Element']`、`el['inner'+'HTML']` …） | **保留为已知、已裁决的洞** | 文字匹配**天生**看不见（老规矩也一样）；要补得真解析代码结构（贵），**用户选择不付这个代价** |
| 建造函数定义在区域外、在区域里被调用 | **保留为已知洞（存量）** | verify7 实测可绕；**老规矩同样瞎**，本轮没改 |
| 别的出口没列全（`el.outerHTML`、`document.write`） | **保留为已知洞（存量）** | 同上；用户本轮只选了"修我自己的那条弱点"，没选把出口列全（选项 C） |

**尺子自身的一个"误报"方向（verify8 发现，**安全方向**）**：`endOfFunction()` 跳过字符串与注释，但**不跳正则字面量** ——
如果标题栏里写了含大括号的正则（例如 `const re = /\}/;`），计数会提前收尾而**误报红**（实测：`/\}/` → inside=0 红，`/{/` → -1 红）。
方向是**安全**的（只能多报、藏不住东西），而且该区域**目前一个正则字面量都没有**（实测）；
区分"正则"与"除号"需要真解析代码结构，**未改**，已在探针注释里写明。

**实测效果**：probe-21 从 400/434（34 条红）→ **402/435（33 条红）**（补洞后仍是 402/435、33 条红），
两条相关断言都 PASS；体检每次 **EXIT=0**。

## 5. 防复发（本轮新增，已在体检里生效）

- 新增 `verify-independent/probe-24-anchor-drift.mjs` 并登记进 `run-r13.ps1` 的探针清单：
  **每次体检**都重新解析 probe-21 的 `REVISION_ANCHORS` 11 行、逐行对磁盘重算 sha256 与字节数，
  任何一行不符 → **体检当场红**（这正是 r30 部署批次漏更新时没人发现的坑）。
- **它自己能被证伪**（三种坏账本实测）：改一个哈希数字 → 红；改一个字节数 → 红；删掉一行（只剩 10 行）→ 红；
  正本 5/5 通过、exit 0。日志：`.scratch/audit-r30/probe24-{shipped,falsify-*}.log`。
- 体检输出里印明：probe-21 是**有意不跑**的发布轮仪器，它的锚由 probe-24 每轮复核，已知红见本文件。
- 与本轮无关、但已知的一条（独立复核顺手记下的）：`probe-13-r4-browser.mjs` 的红集**没有逐条钉住**
  （这个沙箱里没有浏览器引擎，`run-r13.ps1:495` 已声明容忍）。**既有状态，不是本轮引入的。**

## 6. 怎么才能让它真正"全绿"

只有两条路，**都不建议**：

1. **放松它的判据**（把"缺证据"和"真机通知"那几类改成不算红）—— 那是**改验收标准**，用户已明确不选（选了甲）。
2. **在正常桌面会话里手工跑一次发布流程** —— 能消掉 4.1 的 25 条，但 4.2 的 8 条**永远消不掉**，所以**仍然不会全绿**。

**结论**：这 33 条**不是产品问题**。产品由另外两把锁把关，且都是绿的：
六套件 **126/639/22/76/377/29** + 冻结清单 **13/13**。本文件的作用是让这 33 条**有据、有主、不再突然冒出来**。

---

## 7. 证据索引

| 内容 | 路径 |
|---|---|
| 各阶段 probe-21 原始日志 | `.scratch/audit-r30/probe21-{after-anchor,after-reanchor,run3,after-commit,after-redraw,after-banrestore,after-htmlban,after-bracematch}.log` |
| 各阶段红名单 | `.scratch/audit-r30/probe21-{after-reanchor,after-commit,after-redraw,after-banrestore,after-htmlban,after-bracematch}.failures.txt`（33 条的当前名单见 `after-bracematch`） |
| 逐条清单（含 39 条时的原始分析） | `.scratch/audit-r30/probe21-red-list.md` |
| 本轮修复报告（含独立复核结论） | `.scratch/audit-r30/fix-report-4-residuals.md` |
| 独立复核报告（甲） | `.scratch/audit-r30/verification-of-fix-4-residuals.md` |
| 独立复核报告（plan 甲 全套） | `.scratch/audit-r30/verification-of-plan-jia.md` |
| 独立复核报告（红线重画 verify6） | `.scratch/audit-r30/verification-of-redraw.md` |
| 横幅范围重量（node，含更正说明） | `.scratch/audit-r30/banner-range-check.log` |
| 红线重画的可证伪性（14 例，当前版） | `.scratch/audit-r30/native-block-redraw-check-v4.log`（v3 = 13，v2 = 11，v1 = 5） |
| 独立复核报告（补洞后 verify7） | `.scratch/audit-r30/verification-of-htmlban.md` |
| 各阶段 canonical 日志与退出码侧车 | `.scratch/audit-r30/canonical-*.log`、`canonical-*.exit.txt` |
| probe-24 正本 + 三种坏账本日志 | `.scratch/audit-r30/probe24-{shipped,falsify-flip-sha,falsify-wrong-bytes,falsify-row-removed}.log` |
| probe-23 CLI 契约 + 变异日志 | `.scratch/audit-r30/probe23-mutant.log`、`probe23-mutant.exit.txt` |
