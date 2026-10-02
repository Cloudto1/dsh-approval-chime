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

**34 条的实测构成**（用名单逐条分类）：**真机通知环境 25 条 · 证据缺失 8 条 · 待裁决 1 条** —— 与本文档 §4 的分组逐条吻合。

**抖动**：它自己有一段并发竞态测量（`r3/G1 (cross)`，20 轮 POST/GET 同时发），在这个受限沙箱里
**同一份代码三次跑出 35 / 37 / 35** —— 其中一次有 2 条红（`no round delivered the decision twice`、
`every round is one of the two legal outcomes`）。**这 0–2 条是计时抖动，不是产品问题**（插件字节三次完全相同）。

## 3. 本轮已关闭的 5 条（用户裁决 甲 = 修）

| 红的条目 | 根因 | 怎么关的 | 证据 |
|---|---|---|---|
| `the probe is reading the anchored revision…` | r30 的部署批次改了 4 个脚本（install/uninstall/selftest/activate），没人更新它的小抄 | 4 行按盘上真值重锚：install `21E7B0CE…`/18500、uninstall `5F674BFF…`/6221、selftest `F681293C…`/12470、activate `474DA965…`/2639 | `fix-report-4-residuals.md` §6 |
| `activate.vbs starts PowerShell with SW_HIDE (Run cmd, 0, False)` | r30 把那句拆成 `Set shell = …` + `shell.Run cmd, 0, False`，**行为没变**（`0` 仍是隐藏窗口） | 断言改成现在的真写法 | 同上 |
| `the Host suite still carries its two literal single-line default-value expectation rows` | 2026-10-01 事故把原件毁了，**重建件里只有 1 条**（原本 3 条），探针记的是旧数 | 期望值 2 → 1，并写清"这是重建件的性质" | `probe-21:2371-2377` |
| `the suite description still names the switch in its defaults row` | 探针找 `nativeToast:false`（无空格），文件里一直是有空格的 `nativeToast: false` | 断言改成真写法 | `probe-21:2395-2397` |
| `every entry git reports under verify-independent/** is one … declared` | 本轮新增 `probe-23-cli-args.mjs`、`probe-24-anchor-drift.mjs` 时是未跟踪文件 | **提交后消失**（tracked 文件不再出现在 `git status`） | `git status` |

## 4. 剩下的 34 条（按根因分组，均已定性）

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

### 4.3 待裁决（1 条）

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
两个选择：**(1)** 认这条红线改了，按语义重新划界；**(2)** 把 `sectionHead()` 挪回横幅之后（要动 `lib/client.js`
→ 重锚冻结清单第 427 行 + 重跑全套）。**用户尚未裁决。**

## 5. 防复发（本轮新增，已在体检里生效）

- 新增 `verify-independent/probe-24-anchor-drift.mjs` 并登记进 `run-r13.ps1` 的探针清单：
  **每次体检**都重新解析 probe-21 的 `REVISION_ANCHORS` 11 行、逐行对磁盘重算 sha256 与字节数，
  任何一行不符 → **体检当场红**（这正是 r30 部署批次漏更新时没人发现的坑）。
- **它自己能被证伪**（三种坏账本实测）：改一个哈希数字 → 红；改一个字节数 → 红；删掉一行（只剩 10 行）→ 红；
  正本 5/5 通过、exit 0。日志：`.scratch/audit-r30/probe24-{shipped,falsify-*}.log`。
- 体检输出里印明：probe-21 是**有意不跑**的发布轮仪器，它的锚由 probe-24 每轮复核，已知红见本文件。
- 与本轮无关、但已知的一条（独立复核顺手记下的）：`probe-13-r4-browser.mjs` 的红集**没有逐条钉住**
  （这个沙箱里没有浏览器引擎，`run-r13.ps1:508-512` 已声明容忍）。**既有状态，不是本轮引入的。**

## 6. 怎么才能让它真正"全绿"

只有两条路，**都不建议**：

1. **放松它的判据**（把"缺证据"和"真机通知"那几类改成不算红）—— 那是**改验收标准**，用户已明确不选（选了甲）。
2. **在正常桌面会话里手工跑一次发布流程** —— 能消掉 4.1 的 25 条，但 4.2 的 8 条**永远消不掉**，所以**仍然不会全绿**。

**结论**：这 34 条**不是产品问题**。产品由另外两把锁把关，且都是绿的：
六套件 **126/639/22/76/377/29** + 冻结清单 **13/13**。本文件的作用是让这 34 条**有据、有主、不再突然冒出来**。

---

## 7. 证据索引

| 内容 | 路径 |
|---|---|
| 三次 probe-21 原始日志 | `.scratch/audit-r30/probe21-{after-anchor,after-reanchor,run3}.log` |
| 35 条/37 条红名单 | `.scratch/audit-r30/probe21-after-reanchor.failures.txt` |
| 逐条清单（含 39 条时的原始分析） | `.scratch/audit-r30/probe21-red-list.md` |
| 本轮修复报告（含独立复核结论） | `.scratch/audit-r30/fix-report-4-residuals.md` |
| 独立复核报告 | `.scratch/audit-r30/verification-of-fix-4-residuals.md` |
| probe-24 正本 + 三种坏账本日志 | `.scratch/audit-r30/probe24-{shipped,falsify-flip-sha,falsify-wrong-bytes,falsify-row-removed}.log` |
