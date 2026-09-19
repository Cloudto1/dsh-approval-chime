# r13w — 补齐独立覆盖：把 rev-13/14 铃铛外观纳入声明式变异（任务 t6）

**来源**：t3 的对抗性发现（`verify-independent/r13v-independent-review.md` §7 V1）。t3 实测：4 个**未声明**的铃铛外观变异（A1 静音态也填蓝 / A2 删掉 `.dacBell[data-muted="false"]:hover` / A3 蓝底写死 `#2563eb` / A4 静音态图标改色）在 probe-18 的 131 条断言下**红集为 0**；probe-11/17/19 直接读盘、无内存源钩子，且没有一条断言提到 `.dacBell`。也就是说 rev-13/rev-14 的铃铛外观在**独立探针层完全没有变异覆盖**（作者套件 `verify/client-half.test.mjs:721-752` 能抓住，所以不是"无人守"，是独立层缺一层）。

**本轮结论**：A1–A4 已由新探针 `probe-20-r14-bell-appearance.mjs` 的**声明式变异**逐条补齐（用变异体字节证明是同一个变异，不是长得像的另一个，见 §3），并新增 7 条 rev-13 几何/前景变异；canonical `run-r13.ps1` 已接入，整轮仍 **exit 0 / 0 条 FAILURES / 回归集唯一非零 = probe-13**；既有四探针与 `lib/**` 逐字节未动。

---

## 1. 选择"新建 probe-20"而不是扩展 probe-11（理由）

1. probe-11 的 shipped 哈希（`8F044EA6…`）被 r13 / r13v / r13-final 三轮证据引用；改它会同时污染三份记录，而**新建探针让本轮的断言清单变化是纯增量**（§5 可证）。
2. probe-11 的变异形状是"改**注入后的样式表字符串**"，无法表达 rev-13 的几何变异（`BELL_GLYPH_PX`、渲染出的 `<svg width>`）——那需要**源码级**变异。
3. 契约的 Verify 命令本身就是 `probe-20-…mjs`，独立文件便于逐条单独跑与逐条判词。

## 2. probe-20 读的是什么（独立性）

| 来源 | 怎么读 | 用在哪 |
| --- | --- | --- |
| 真 `lib/client.js` | 本探针**自己的** vm 沙箱把 bundle 当 classic script 跑（自己的 document/AudioContext/React 桩） | 全部 |
| bundle 自己 append 的样式表 | `<style id="dsh-approval-chime/styles">` 的 `textContent` | 全部 CSS 事实 |
| `window.__DSH_APPROVAL_CHIME__.sessionIcon` | 诊断面 | 令牌与几何基准 |
| 渲染结果 | 本探针自己的函数组件驱动（useState/useRef/useEffect）渲染 session-header 槽位 → 读 `<svg width/height>` | 铃铛/箭头图标尺寸 |

CSS 规则用本探针自己的**层叠模型**解析（先比 specificity，再比书写顺序），不是 first-match 查表 —— t3 引用的作者套件注释（`verify/client-half.test.mjs:691-696`）明确指出 first-match 曾放过"把静音态也填充"这类缺陷。**没有**复用作者 harness 的断言文本；`verify/` 只被当作**被验证对象**使用。

22 条断言 = 5 条控制 + 17 条主张：

* 控制：bundle 无 load error / 产出 contract 且注册两个槽位 / 只注入一个 `<style>` / 样式表含 `.dacBell`+`.dacCaret` / 诊断面暴露 `sessionIcon`
* 几何（rev-13）：`sessionIcon` 报告 **28/16/22/11x16**；`.dacBell` 盒子 = `bellBoxPx` 正方；`.dacCaret` 宽 `caretBoxPx`、高 `bellBoxPx`；渲染铃铛 svg = `bellGlyphPx²`；渲染箭头 svg = `caretGlyph`
* 会响态填充（rev-14）：解析值 === `sessionIcon.onBackground`；必须是 `var(--` 设计令牌；**赢的规则必须是 `.dacBell[data-muted="false"]`**（不是裸类）；填充上的前景 === `sessionIcon.onForeground`
* 静音态：静音解析为 `transparent`；裸 `.dacBell` 解析为 `transparent`；**没有任何命名静音态的规则声明 background**；静音图标是 caption 令牌且不是填充/前景色
* 悬停：存在命名 `.dacBell[data-muted="false"]:hover` 的 background 规则；解析值 === `sessionIcon.onBackgroundHover`；该值**派生自**同一令牌；且不是通用灰色 hover

## 3. A1–A4 逐条对照（是否真的补上）

`r13w-close-t3-gap.mjs` 从原始日志比对 **t3 的变异体 sha256** 与 **probe-20 的变异体 sha256**：字节相同即同一个变异。

| t3 未声明变异 | probe-20 声明变异 | 变异体 sha256（t3 = probe-20） | probe-18 红集 | probe-20 红集（=声明） | 判定 |
| --- | --- | --- | --- | --- | --- |
| `adv-muted-bell-filled`（A1） | `muted-bell-filled` | `6E748820…` 相同 | **0** | 3 | 已抓住 |
| `adv-bell-hover-dropped`（A2） | `audible-hover-dropped` | `8D467907…` 相同 | **0** | 4 | 已抓住 |
| `adv-bell-token-hardcoded`（A3） | `fill-hardcoded-hex` | `F4C45D30…` 相同 | **0** | 2 | 已抓住 |
| `adv-muted-bell-recolored`（A4） | `muted-icon-recolored` | `44D4F9F5…` 相同 | **0** | 1 | 已抓住 |

（probe-18 的红集 0 来自 t3 的 `_raw/r13v-adversarial-A1..A4.txt`；probe-20 的来自本轮的 `_raw/r13w-ind-probe-20-mut-*.txt`。）

## 4. 11 个声明变异（逐个单独跑，全部 exit 0）

`--mutate=all`：**11/11 mutations detected exactly as declared**，且 55 组两两红集比较全部 `[PASS]`（无两个变异红同一个集合）。

| # | 变异 | 覆盖 | 锚串次数 | 变异体 sha256（vs shipped `730D1C2F…`） | 声明 | 实测 | exit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `muted-bell-filled` | 填蓝挪到裸类 → 静音也蓝 | 1 | `6E748820…` changed=true | 3 | 3 | 0 |
| 2 | `audible-hover-dropped` | 删会响态 `:hover` | 1 | `8D467907…` | 4 | 4 | 0 |
| 3 | `fill-hardcoded-hex` | 填充写死 `#2563eb` | 1 | `F4C45D30…` | 2 | 2 | 0 |
| 4 | `muted-icon-recolored` | 静音图标改 `#000` | 1 | `44D4F9F5…` | 1 | 1 | 0 |
| 5 | `audible-foreground-recoloured` | 填充上的前景不再白 | 1 | `AAAF230D…` | 1 | 1 | 0 |
| 6 | `muted-rule-declares-fill` | 静音规则自己带 background | 1 | `8236C791…` | 2 | 2 | 0 |
| 7 | `bell-glyph-shrunk-to-14` | 铃铛图标 22→14（rev-13 前） | 1 | `EEBBD554…` | 1 | 1 | 0 |
| 8 | `bell-svg-hardcoded-14` | 渲染 svg 写死 14 | 1 | `70510011…` | 1 | 1 | 0 |
| 9 | `caret-css-hardcoded-12` | 箭头盒子 CSS 写死 12 | 1 | `1A6FF149…` | 1 | 1 | 0 |
| 10 | `caret-svg-hardcoded-9` | 渲染箭头 svg 写死 9 | 1 | `AFE30B75…` | 1 | 1 | 0 |
| 11 | `bell-css-hardcoded-20` | 铃铛盒子 CSS 回 20（rev-13 前） | 1 | `B7E04CC5…` | 1 | 1 | 0 |

第 5/6/10 条是**探针自查逼出来的**：`r13w-assertion-count.mjs` 会检查"每条主张断言是否至少被一个已声明变异染红"，首轮报出 3 条**装饰性断言**（渲染箭头图标、填充上的前景、静音规则自带 background），补上这三条变异后归零（§5）。

## 5. 零删除 / 零放宽 / 零装饰

`r13w-assertion-count.mjs`（我自己的计数器，规则同 r13v）：

```
probe-11-r4-css-rows.mjs           byte-identical  calls=35  distinct names=33  dynamic=2
probe-17-r7-section.mjs            byte-identical  calls=103 distinct names=95  dynamic=3
probe-18-r10-sessions.mjs          byte-identical  calls=99  distinct names=94  dynamic=0
probe-19-r12-select-parity.mjs     byte-identical  calls=73  distinct names=68  dynamic=0
probe-20-r14-bell-appearance.mjs   调用点=22  名字字面量=22  模板名=0
declared expectations: 17; declared names that are NOT a check name: 0
claim checks: 17; never reddened by any declared mutant: 0
```

即：四个既有探针**逐字节未变**（哈希与 t2/t5 记录相同）→ 调用点/名字数不可能变化；probe-20 是**纯新增**（22 调用点、22 个名字）；每个声明名都对应一条真实断言，且每条主张断言都至少被一个变异染红（**无装饰性断言**）。run-r13.ps1 只增加 section 2e 与注释、并改日志前缀，没有删除任何既有检查逻辑。

## 6. 接进 canonical `run-r13.ps1`

1. **先归档**上一版 runner（t1/t5 记录的 `AAE3FDDA…`）到 `_raw/r13w-archive-run-r13-AAE3FDDA….ps1`，再机械改前缀：`"r13-`×6 + `'r13-`×6 → `r13w-`（`r13w-patch-runner-prefix.mjs` 反向替换后哈希回到 `AAE3FDDA…`，行数不变）。
2. `$probes` 增加 `probe-20-r14-bell-appearance.mjs`（回归集，section 2 自动跑 shipped 模式）。
3. 新增 **section 2e**：`--mutate=all`（判"恰好按声明 + 两两不同"）+ 11 条逐条单独进程跑（打印锚串次数、变异体 sha256、红集、判词），任一非零即 FAILURES。
4. 头部注释与总结段落更新（18 → 29 个声明变异；唯一允许非零仍是 probe-13）。

本轮 canonical 运行（`_raw/r13w-run-console.txt`，我自己的前缀）：

| 检查项 | 结果 |
| --- | --- |
| 进程退出码 | **0** |
| `^FAILURES:` 行数 | **0** |
| 冻结清单 before/after | `r13w-frozen-diff.txt` = `identical`（9 文件） |
| 回归集（14 探针 + 29 变异 + 竞态 + 4 套件）非零项 | **只有 probe-13-r4-browser（exit 1）** |
| probe-20 shipped | `### probe-20-r14-bell-appearance.mjs: 22/22 independent checks passed` |
| probe-20 变异 | `### mutation summary: 11/11 mutations detected exactly as declared`；逐条 11/11 exit 0 |
| 既有 18 变异 | probe-11 1/1、probe-17 5/5、probe-18 9/9、probe-19 3/3 全部 exit 0 |
| 4 套件 | 124 / 336 / 22 / 75 = 557 |
| legacy / reviewer | 与登记一致（8 条 legacy 非零 + 3 条 reviewer 非零 + reqcheck-host-413 绿） |

**证据前缀隔离**（`r13w-evidence-manifest.mjs`）：run-r13.ps1 里旧前缀 `"r13-` / `'r13-` 的日志路径字面量 = **0**，新前缀 = 14；本轮只写 `r13w-*`（68 个文件）。`_raw` 下 486 个既有证据文件（t2/t5 的 155 个 r13 系 + t5 的 r13-final 归档 + t3 的 89 个 r13v + t2 归档 102 个）逐文件列出 sha256，未被覆盖。

## 7. 我没有覆盖到的外观事实（如实列出）

1. **真机像素与颜色观感**：`color-mix()` 的实际解析结果、屏幕上的蓝到底像不像用户截图里的蓝、对比度、暗色/亮色主题下的表现 —— 沙箱没有渲染引擎，probe-20 只能证明"哪条规则、用什么令牌、解析成什么字符串"。
2. **`sessionIcon` 令牌在真实 DSH 里的值**：我只验证"填充 === 该令牌"和"该令牌与开关/滑块同源"，不验证 DSH 主题里 `--dsw-alias-state-business-primary` 到底解析成什么颜色。
3. **图形细节**：铃铛/箭头的 SVG `path` 形状、描边宽度、`viewBox`、线条圆角 —— 只覆盖 `width`/`height`。
4. **焦点与交互态观感**：`:focus-visible` 的 3px 环、`:disabled` 的 `opacity:.5`、按下态、指针 hover 的过渡动画时间。
5. **弹层与卡片外观**：popover 的定位/阴影/圆角（probe-19 覆盖了它的 picker 盒模型事实，但外观观感不在本探针范围）。
6. **DSH CSS 覆盖**：真实 DSH 若用更高特异性的规则覆盖这些类名，本探针（读本 bundle 注入的样式表）看不到。
7. **UA 支持性**：`appearance:base-select` 真实浏览器是否支持 —— 属于 probe-13（沙箱无浏览器引擎，长期登记非零）。
8. **文案/无障碍**：`aria-label`/`title` 文本、`aria-pressed` 语义 —— 属于 probe-18 的领域，本探针不重复。
9. **变异手段的边界**：probe-20 的变异都是"改写 shipped 源码文本"；若外观被**运行时新加规则**或**外部注入**改动，本探针的变异机制覆盖不到（但这类改动同样躲不过 §2 的解析断言——读的是最终注入的样式表）。

## 8. 关键产物与命令

| 产物 | 字节 | sha256 |
| --- | --- | --- |
| `verify-independent/probe-20-r14-bell-appearance.mjs` | 34818 | `3A98939712EEC4A8AF8C5730B9A14E7FD16429B946F0941E55DC2FF7A71B28BF` |
| `verify-independent/run-r13.ps1`（接入后） | 40294 | `BA4910D9142D7EB2793AA094D681A9E0970E912C9EC39242AE7D170A00BF0513` |
| `_raw/r13w-archive-run-r13-AAE3FDDA….ps1`（上一版原文） | 36065 | `AAE3FDDA51B5E5607602EFF6F6A795563CD47058E0B85AB8C276BF7315EB2BA5` |
| `lib/client.js`（**零改动**） | 147062 | `730D1C2F7F58E19471D4B77EE43A221B4FD255BC06AD2AE3752A2C4443466BD5` |
| `lib/index.js`（**零改动**） | 46638 | `03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938` |

复现命令（全部 exit 0）：

```
node verify-independent/probe-20-r14-bell-appearance.mjs
node verify-independent/probe-20-r14-bell-appearance.mjs --mutate=all
node verify-independent/probe-20-r14-bell-appearance.mjs --mutate=muted-bell-filled   # 其余 10 条同理
node verify-independent/probe-19-r12-select-parity.mjs --mutate=all
node verify-independent/probe-11-r4-css-rows.mjs --mutate=card-cap-92px
node verify-independent/r13w-assertion-count.mjs          # 零删除/零装饰
node verify-independent/r13w-close-t3-gap.mjs             # A1-A4 已补上（变异体字节相同）
node verify-independent/r13w-evidence-manifest.mjs        # 前缀隔离
node verify-independent/r13w-make-guard-probes.mjs && 三个 guard 副本（见下）
powershell -ExecutionPolicy Bypass -File verify-independent/run-r13.ps1
```

**判词自测**（三份故意破坏的探针副本，`r13w-guard-probe-20-*.mjs`，由生成器逐补丁断言"锚串恰好 1 次"产出；三者全部 exit 1）：

| 情形 | 命令 | 判词（实测） |
| --- | --- | --- |
| 死锚串 | `node verify-independent/r13w-guard-probe-20-deadanchor.mjs --mutate=muted-bell-filled` | `DEAD MUTATION / broken anchor: anchor not found (0 occurrences)` |
| 声明过窄 | `node verify-independent/r13w-guard-probe-20-narrow.mjs --mutate=fill-hardcoded-hex` | `UNDECLARED red (the declaration is too narrow): ["that fill is a design token, never a literal colour"]` |
| 声明过宽 | `node verify-independent/r13w-guard-probe-20-wide.mjs --mutate=muted-icon-recolored` | `NOT DETECTED (declared but still green): ["a check that no mutation can redden (deliberately too wide)"]` |
