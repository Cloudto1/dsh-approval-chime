# rev-5「导入自定义音频」需求复审（任务 t4 · reviewer）

> **结论：可交付。** 用户 5 条原话在 rev-5 上**逐条达标**：R1 / R2 / R3 / R4 **PASS**，R5（三行窗口）**PASS** —— `box-sizing:content-box` 与 `max-height:84px` 写在同一规则里，**内容盒 84px = 3 × 28px 行高**，第 3 项不再溢出（84 ≤ 84），第 4 项才是第一个溢出（112 > 84）的那一行；旧值 `92px` 在 UA `border-box` 下只有 82px 内容区的机制已按我的建议彻底绕开（不再依赖 UA 盒模型）。
> 我**独立复跑了自写探针**（`.scratch/reviewer-r5/reqcheck-rev5.mjs`，**69/69**；`.scratch/reviewer-r5/reqcheck-host-413.mjs`，**9/9**），并复核了 t3 的 `docs/rev5-复验.md`：**未发现伪造或错引证据**，其三处未证实项（真实渲染 / UA 盒模型 / 300 s 载体超时）保留得当。rev-5 的 low 修正**没有带来需求层面的回退**（§3）；残余 **N1/N2/N3 三条 low + 一条沿用观察（纯空白显示名）**都属"手改文档才可达"或"第三方客户端才可达"，**不影响任何一条原话，也不阻塞交付**（§6–§7）。
> **未修改任何产品代码**（`lib/client.js` 72 360 B `E4B32C04…`、`lib/index.js` 27 191 B `8288C803…`，与 t3 报告的锚定哈希逐字节一致）。

---

## 0. 复审对象与本次独立取证

| 项 | 值 |
| --- | --- |
| 被测修订 | `rev-5 · review fixes`（`lib/client.js:81` 的 `REVISION`） |
| 哈希（本次实测，与 t3 报告一致） | `lib/client.js` `E4B32C042355B5B06DF72BDA98185A4F0D5EA0D9E9B712DE6378B9B57B068CFF`（mtime 21:12:24）<br>`lib/index.js` `8288C803E38849B4A8A8228B0FB13BDD5144C4D5063C71D40A8D3F74D1DB3630`（mtime 21:16:30） |
| 我的独立仪器 1 | `.scratch/reviewer-r5/reqcheck-rev5.mjs` —— 我 t2 探针的 rev-5 版：自带 React hook 运行时 / 镜像真实平台的 settings-scope 桩 / 假 DOM、假 WebAudio、假 fetch，在 `node:vm` 里执行**真实 `lib/client.js`**；**不 import** `verify/_harness.mjs`、也不 import `verify-independent/kit/**`（与 t1、t3 的仪器都无关）。**69 项断言全绿** |
| 我的独立仪器 2 | `.scratch/reviewer-r5/reqcheck-host-413.mjs` —— 真实 `node:http` 服务器 + 插件**真实路由处理器**（经 `registerAudioRoutes` 捕获）+ 裸 socket。**9 项断言全绿**，`audio/` 目录前后一致 |
| 被复审的报告 | `docs/rev5-复验.md`（t3，27 930 B，317 行） |
| 上游两轮 | `docs/rev4-独立验证.md`（DSH 侧）、`docs/rev4-浏览器侧独立验证.md`（t1）、`docs/rev4-需求符合性审查.md`（我 t2） |
| 环境限制 | Edge 153 在，但沙箱禁命名管道 → Chromium Mojo FATAL，**无引擎可测**（该限制由 t1 的 probe-13 日志记录，我在 t2 已独立复核）；本机无 React |

**本次复审覆盖的原始输出**（我的）：

```
node .scratch/reviewer-r5/reqcheck-rev5.mjs        → 69 passed / 0 failed（R1–R5 + R4-CAP/RACE + F3/F6/D4/F1）
node .scratch/reviewer-r5/reqcheck-host-413.mjs    →  9 passed / 0 failed（D1 的 socket 级复现 + 正常上传往返 + 零残留）
```

关键实测片段（节选，完整输出见上述两个脚本的 stdout）：

```
--- R5 ---
    · picker rule = …;border-radius:10px;background:…;box-shadow:…;box-sizing:content-box;max-height:84px;overflow-x:hidden;overflow-y:auto;
    · row height (line-height + option padding) = 20 + 4*2 = 28px
    · declared max-height = 84px        · box-sizing = content-box (author-pinned)
[PASS] R5-1 fix: the picker pins its own box model, so it no longer depends on the UA default
[PASS] the cap IS the content box: max-height === exactly 3 rows — 84px vs 3×28=84px
[PASS] 3 options do NOT overflow (84 <= 84): no scrollbar in the default state
[PASS] the 4th option is the first one that overflows (112 > 84): scrolling starts exactly there
[PASS] padding/border are ADDED to the cap, not subtracted from it (outer box = 84+8+2 = 94)

--- D1（我的独立 socket 复现）---
[PASS] POST is answered 200 with an id — {"ok":true,"id":"a536e0f6-…","name":"probe ring.mp3","ext":"mp3","type":"audio/mpeg","bytes":26}
[PASS] GET returns the exact bytes and an audio content type — HTTP/1.1 200 OK; bytes=26
[PASS] DELETE removes it (removed:true) — {"ok":true,"removed":true}
[PASS] the client RECEIVES a status line (not a reset, not silence) — HTTP/1.1 413 Payload Too Large
[PASS] the 413 body is readable JSON naming the limit — {"ok":false,"error":"file exceeds the 5 MB limit"}
[PASS] a streamed overflow also gets a readable 413 — HTTP/1.1 413 Payload Too Large
[PASS] the audio directory is exactly as it was before the probe — [] -> []
```

---

## 1. 逐条判定总表（与 t2 同一口径）

| # | 用户原话 | t2（rev-4） | **t4（rev-5）** | 决定性证据（`文件:行` 或实测） |
| --- | --- | --- | --- | --- |
| R1 | 「在选择音色的按钮右边加一个导入按钮」 | PASS | **PASS** | 音色行 DOM 顺序实测 `["span.dacLabel","select","input[file].dacFile","button(导入音频)",…]`；`lib/client.js:1404`（音色行）/`:1406-1422`（select，`:1409` value）/`:1424-1430`（隐藏 file input）/`:1431-1443`（导入按钮，`:1442` 文案） |
| R2 | 「点击之后可选择用户电脑里的自定义音频文件」 | PASS | **PASS** | 原生 `input[type=file][accept="audio/*"]`（实测）+ 按钮 `onClick → fileRef.current.click()`（实测 `click() calls=1`）；全卡无拖拽/路径输入 |
| R3 | 「加入音频文件之后要在选择框内出现」（无需刷新） | PASS（通路级） | **PASS（通路级）** | 实测：写入触发的 scope 通知 → 卡片 store 订阅 → hook#0 变更，**同一挂载实例**（`renders=2, effects=1`）后 options 即为 `[custom:A, chime, bell, beep]`；平台侧 `@deepseek-ai/dsh-client-ui-settings/lib/client.js:1040-1055`（`acceptView`）→ `:990`（mirror→derive）→ `:1083-1105` |
| R4 | 「第一个文件放第一个，第二个放第二个，依次类推」 | PASS | **PASS** | 写入时刻重读名册再追加：`lib/client.js:1301-1314`（`:1313` `commit({ custom: latest.concat([entry]), … })`）；渲染顺序 `:1257-1265`；移除 `filter` 保序 `:1330-1333`；实测 3 次导入顺序=导入顺序、移除中间项后 `[A,C]`、再导入落末尾、并发追加合并为 `[first, other-tab, mine]` |
| R5 | 「显示三个选项，当有第四个选项时变成可滚动」 | **PARTIAL/不达标** | **PASS** | `lib/client.js:1090` 同规则声明 `box-sizing:content-box;max-height:84px`，`:1092` 行高 20px+padding 4px → 28px/行；实测 3 行 = 84px = 内容盒（不滚动），第 4 行 112px > 84px（滚动）；`overflow-y:auto` 同规则、整块在唯一 `@supports` 内 |

**PASS 的口径说明（重要）**：R5 的"PASS"指**所有可静态判定的事实都已证实**（选择器、box-sizing、max-height、行高、溢出阈值、规则位置），且**修复不再依赖任何未证实的 UA 行为**。真实引擎的**滚动条外观/used value** 仍是需要真人确认的收尾项（§5-M1/M2），但它不再影响"3 行不滚、第 4 行起滚"这一判定——因为内容盒高度由我们自己的声明决定。

---

## 2. R5 详判：哪部分是算术可证的，哪部分必须真人浏览器

### 2.1 算术与声明（可证，硬）

```
.dacCard select::picker(select){ appearance:base-select;margin-top:4px;padding:4px;
  border:1px solid …;border-radius:10px;background:…;color:…;box-shadow:…;
  box-sizing:content-box;max-height:84px;overflow-x:hidden;overflow-y:auto; }   ← lib/client.js:1078-1091（同一规则）
.dacCard select option{ border-radius:7px;padding:4px 9px;line-height:20px; }    ← lib/client.js:1092
```

1. 行高 = `line-height:20px` + 上下 padding `4px+4px` = **28px**（`option` 未设 height/border，UA 的 `min-block-size: max(24px,1lh)=24px` 小于 28px，不参与）。
2. 3 行 = **84px**；`max-height` = `TONE_ROWS × TONE_ROW_PX` = **84px**，与 3 行**精确相等**。
3. `box-sizing:content-box` 是**作者声明**，因此这个 84px 量的**就是内容盒**：3 项时 `scrollHeight == clientHeight == 84` → 不溢出、不出滚动条；4 项时内容 112px > 84px → 溢出、出滚动条。
4. padding 8px 与 border 2px 现在**加在 84px 之外**（外框 = 84+8+2 = **94px**），不再从内容区里扣——这正是 t2 反证（旧 `92px` 在 UA `border-box` 下 = 92−8−2 = **82px** < 84px）所要求的方向。
5. 与 UA 样式表**解耦**：无论 UA 给 `::picker(select)` 的 `box-sizing` 是什么，作者声明都胜出（同一逻辑属性组的层叠：作者层 > UA 层）。这一点是本轮修复最关键的工程价值——它把一个"依赖 UA 默认值"的实现换成了"自己定死"的实现。
6. 规则位置：`max-height`/`overflow-y`/`overflow-x` 同规则；块外 0 处 `max-height`/`overflow-y`；整块位于**唯一**一处 `@supports (appearance:base-select)` 内（不支持该特性的浏览器整块丢弃 → 原生弹窗完整列出，**不截断内容**，但也**不存在**"3 行上限"，由原生弹窗自行按视口滚动）。

### 2.2 必须真人浏览器看的（未证实，收尾项）

| # | 未证实 | 为什么 | 建议怎么验 |
| --- | --- | --- | --- |
| M1 | `getComputedStyle(select,'::picker(select)').boxSizing` 与展开后的 `clientHeight/scrollHeight` 是否就是 84/84（3 项）与 84/112（4 项） | 沙箱禁命名管道 → 无引擎；UA 样式表不在 Edge 二进制明文里（t1 证否、我 t2 用不同对照串独立复现） | 支持 `base-select` 的 Chrome/Edge：展开下拉后读该伪元素的计算值与 `scrollHeight` |
| M2 | 3 项时的**外观**：滚动条是否出现、是否遮挡、主题下是否协调 | 纯视觉 | 默认状态（不导入）截图；再加到 4 项截图对比 |
| M4 | t3 观察 O4：`box-sizing:content-box` 使 UA 的 `min-inline-size:anchor-size(self-inline)` 落到**内容盒**，弹层外框可能比 select **宽 10px** | 引擎的锚定尺寸行为未实测 | 展开下拉，量 `::picker(select)` 的边框盒宽度 vs select 的宽度；若介意可改用"`box-sizing:border-box` + `max-height:94px`"（内容盒仍是 84px，外框与 select 同宽语义） |
| M5 | 不支持 `base-select` 的浏览器里的降级（原生弹窗列全、取色） | 无此类引擎 | Chrome<135 / Firefox 目视 |

**关于 t3 §4-U2 的措辞**：t3 把我 t2 的"UA = `border-box`"称为**外部资料结论**、并注明"92→82px 只是条件结论"。这个保留是**诚实且正确**的——它确实不是在本机引擎里测出来的，而是来自三份一手资料：Chromium 自己的 UA 样式表（`third_party/blink/renderer/core/html/resources/html.css` 的 `select:not(:-internal-list-box)::picker(select){ box-sizing: border-box; … }`）、WHATWG HTML Rendering 的同段 UA 样式表文本、以及 CSSWG issue #10857 的提案原文。而 rev-5 的修复**不需要**这个前提成立，所以这条分歧现在已无关紧要——这正是它应该被处理的方式。

---

## 3. rev-5 的 low 修正有没有带来需求层面的回退？（逐条）

### 3.1 名册满 50 时**拒绝导入**（含竞态兜底删除刚上传的文件）→ 不构成回退，UX 反而变好

- 实测（我的探针）：满 50 时 `POSTs=0`（**上传前**就拒绝）、卡片显示「导入音色已达上限（50 个）」、名册仍 50、`tone` 未变、按钮**没有**卡在「导入中…」、无预览无节点。README `README.md:81` 已把该行为写成对外说明。
- 竞态两条路径实测通过：上传在途时他人**填满**名册 → 对刚上传的 id 发 `DELETE`（`DELETE /api/approval-chime/audio/00000096-…`）、名册保持他人的 50 项、卡片给出同样的上限提示、**不再出现"（文件缺失）"假行**；上传在途时他人**追加** → 写入合并为 `[first, other-tab, mine]`（谁都不丢），渲染顺序与之一致。
- 与用户原话 4 的关系：原话没有规定数量上限；50 是产品级护栏（README 已声明）。对 ≤50 个文件的正常使用，顺序语义完全不变（实测 3 次导入 + 移除中间项 + 再导入）。
- 唯一 UX 小遗憾（**低**，非回退）：按钮在满额时**仍可点击**，用户要等系统文件对话框选完文件才看到上限提示。建议：满额时把按钮置灰或在 `title` 里带上上限（纯提示层，不影响行为）。

### 3.2 显示名按**码点**截到 120 → 不构成回退

- 实测：200 000 字的名字渲染为 **120 码点**；控制字节被剥（`'a\u0000b\u001f.wav'` → `ab.wav`）；`119×'x' + 😀 + tail` 截断后 emoji **完好**、无孤立代理；空名回落到 id；浏览器侧与 DSH**同界**（我的探针动态 import DSH：`NAME_LIMIT === 120`）。
- 可读性：120 字符远超文件名常规长度，正常上传路径的显示名本来就 ≤120（DSH 侧同值），所以**只有手改 settings 文档**才可能看到截断；截断不改变"顺序/可选性"任何语义。
- 残余观察（**低**，与 rev-4 相同、非新增）：`clampName` 不做 trim，纯空白名（`'   '`）仍会渲染成"看似空行"的选项（我的探针实测 `renderedAs="   "`）。DSH 上传路径会 trim，因此正常路径不可达。若要彻底闭合 F4 的原始描述，可在 `clampName` 里加一次 `trim`。

### 3.3 F6 让 `.mp3` 与尾随空格名被接受 → **不**与 README「扩展名白名单」冲突

- 白名单仍严格生效：DSH `extensionOf` 取**最后一个点**后的子串，非白名单仍 415（t3 实测 `a.` / `a.aaa` / `note txt` / `ring. mp3` / 空白 / 空 → 415；我复核了 `lib/index.js:424-427`、`:527-535`）。变的只是"取扩展名之前先 trim、且允许基名为空/点开头"这两点——`ring.mp3 ` 在 macOS/Linux 是合法文件名，接受它是**修好了原本的误拒**。
- 文档同步：`README.md:80`（5 MB / 白名单 / 413 先读干再应答 / 415）与 `README.md:82`（**先 trim、扩展名按最后一个点、无扩展名按 MIME 兜底、id 是大小写敏感的小写 uuid**）都已更新 → 承诺与行为一致。
- 观感项（**低**，t3 的 O2）：名字本身就是扩展名时（`.mp3`、`..mp3`）显示名原样成为选项标签 —— 仅观感。

### 3.4 F3 让 `enabled=false` 的试听也计数 → 不误导，反而补齐了"为什么没声"

- 实测：禁用时 `preview()` 返回 `false`、不建节点、不发请求、`suppressedDisabled` **恰好 +1**，随后卡片渲染出「因"启用"关闭而静音 ×1」。`README.md:65` 已写明"关闭后任何声音都不产生（包括试听，且会计入 `suppressedDisabled`）"。
- 正常路径可达性：关闭时「试听」按钮本身是 disabled（`lib/client.js:1456-1467`，`:1461` 的 `disabled: view.enabled !== true`），因此这个计数在正常操作里主要来自**"关闭状态下导入文件"**（导入成功仍会写名册、选中，只是不试听）——此时给出一句"静音原因"是**有用**信息，不是误导。
- 一处**低**观察（非回退）：该计数器现在把"审批被静音"与"显式/自动试听被静音"合并计数，而卡片文案是通用的"因'启用'关闭而静音 ×N"。若想更精确，可拆成"审批 N / 试听 M"或把文案改为"被静音 N 次"。

---

## 4. t3 报告（`docs/rev5-复验.md`）证据强度复核

### 4.1 哪些是**实测**（硬）

| 结论 | 仪器 | 强度 |
| --- | --- | --- |
| D1 修复：413 真的上线 | **真实 `node:http` + 裸 socket**：content-length / chunked 快 / chunked 4ms 帧三种都收到 `HTTP/1.1 413` + 可解析 JSON；3 s 兜底定时器 1 个、`unref`、用后清除（实测 3016 ms 收到）；宽限边界 10.00 MB→413 / 11.25 MB→RST | 硬（**我用自写 socket 探针独立复现了 content-length 与 chunked 两种，并补了正常上传往返与零残留**） |
| F1 修复 | 四条子要求逐条断言 + "app 侧订阅错误日志为空"这一独立观测面 | 硬（我独立复现：不抛、计数 +1、`lastError` 有值、按钮复位、名册未写、无未处理 rejection） |
| D2 / D3 修复 | **真实 `@deepseek-ai/schemastery`** 校验 schema；真实路由 + 真实文件对（`<id>.aaa` 与 `<id>.mp3` 并存 → GET 给 `.mp3`、DELETE 只删 `.mp3`） | 硬 |
| D4 / F5 / F6 修复 | 两侧同输入逐字节比对 + 14 种名字的接受/拒绝表 + 浏览器侧真实请求头 → 真实路由接受 | 硬（我独立复现 D4 的 120 码点/控制字节/代理对，以及 F6 的 7 种请求头） |
| R4-CAP / R4-RACE 修复 | 上传前拒绝用"0 请求"证明；竞态用 deferred fetch 精确制造；并发两条只留 50 项 | 硬（我独立复现：0 POST、DELETE 新 id、合并不丢） |
| F2/F3 措辞与计数 | 预览/审批两条入口分别测 | 硬（我独立复现 F3） |
| R5-1 的**算术**部分 | 执行真实 `injectStyles()` 解析样式表 + 盒模型算术 | 硬（我独立复现，结论一致） |
| 回归 | 实现者 4 套 harness 54/103/20/70 + t3 的 9 支探针 454 断言 | 硬（原始输出 `_raw/r5-*.txt` 尾部计数逐一核对一致） |

### 4.2 哪些是**推断/未证实**（t3 自己已列，我核对无误）

- §4-U1 真实渲染（3 整行 + 滚动条）与 O4 的 10px 外扩：无引擎 → **留白正确**（也正是我 §2.2 的 M1/M2/M4）。
- §4-U2 UA 对 `::picker(select)` 的 `box-sizing`：t3 明确写成"外部资料结论、条件成立"→ **措辞比 t1/DSH 报告更严谨**；且与 rev-5 修复无关。
- §4-U3 载体在 300 s 处断开未完成请求的实际行为（N1 的兜底）：只读了载体源码与 Node 默认值 → 留白正确。
- O3（`displayName` 的 `audio.<ext>` 兜底不可达）是**推导**不是断言，t3 已标注"未单独断言"。

### 4.3 是否存在"测试与实现同源"的循环论证？——**不存在，但有一条需要点明的自洽性边界**

- 机械化核查：`verify-independent/**` 里**没有任何 import 指向 `verify/**` 或 `_harness.mjs`**（`probe-*.mjs` 的 import 只有 `./kit/rev4.mjs`、`./kit/platform.mjs`、`./kit/hostserver.mjs` 与 node 内置；`require(` 命中均为 domino / `createRequire` 解析 schema 路径这类无关用途）。实现者本轮只动了 `verify/custom-audio.test.mjs`（21:16，加 rev-5 用例），**没有碰** `verify-independent/**`；t3 的探针在 `verify-independent/`（21:19–21:29）。→ 三侧作者分离成立。
- **需要点明的边界**：t3 为了复验 rev-5，**修改了 t1 六支旧探针的期望表**（`probe-7/8/10/11/12`，mtime 21:24–21:27；`docs/rev5-复验.md:240-253` 逐条列出 8 处变更）。因此这六支探针在 rev-5 下显示"全绿"，含义是"**与更新后的期望一致**"，而不是"旧的独立期望仍成立"。缓解证据有三条：(1) 每处变更都对应 CHANGELOG/README 里**声明的有意行为变更**，不是为了让测试变绿而放宽；(2) 断言**总数只增不减**（39→40、48→61、65→66、27→31、45→47，新增 14 条；另外新增 probe-14/15/16 共 171 条）；(3) 我这一轮用**自己的探针**（不同仪器、不看 t1/t3 的断言）独立复现了所有载荷结论（69/69）。结论：**不构成循环论证**，但这六支探针的"绿"应当按"同仪器 + 更新期望 + 变更已文档化"来解读——真正新增的 rev-5 证据是 probe-14/15/16 + 我的 78 条独立断言。

### 4.4 我 t2 报告里那条被更正的推断（U1）——现状与更新

- t2 我指出**DSH 报告**（`docs/rev4-独立验证.md`）U1 里的推断「DSH CSS 没有 `*{box-sizing:border-box}` 复位……所以 `::picker` 保持初始 `content-box`」**不成立**（`box-sizing` 非继承、`*` 不匹配伪元素；决定它的是 UA 样式表，而 Chromium 的 UA 样式表写的是 `border-box`）。
- **该文本至今未被更正**：`docs/rev4-独立验证.md` mtime 仍为 21:02（早于我 21:10 的审查），U1 单元格（现第 189 行）仍写着"所以 `::picker` 保持初始 `content-box`，92px = 84px 行 + 8px 内边距在算术上正好 3 行 … 当前不成立"。对 **rev-4** 而言这句话与事实相反；对 **rev-5** 而言它已**失去意义**（作者显式声明 `content-box`，92px 也不存在了）。
- 因此我在 `docs/rev4-需求符合性审查.md` 末尾追加了「rev-5 后续状态（t4 更新）」小节：R5-1 已修、EV-1 的**行为影响已消除**、但**报告文本仍需一行更正**（历史记录正确性）。t3 的 §4-U2 已经把这条更正的精神吸收进自己的表达（"条件结论、与修复无关"）。

---

## 5. 仍需真人浏览器 / 真实 DSH 确认项（收尾清单）

| # | 项目 | 为什么现在定不了 | 怎么验 |
| --- | --- | --- | --- |
| M1 | `::picker(select)` 的 `boxSizing` 与 `clientHeight/scrollHeight`（3 项应 84/84，4 项应 84/112） | 无引擎（沙箱禁命名管道；UA CSS 不在二进制明文） | 支持 `base-select` 的 Chrome/Edge：展开下拉后读计算值与 `scrollHeight` |
| M2 | 3 项时**有没有**滚动条、外观是否协调 | 纯视觉 | 默认状态 + 导入 1 个文件后各截一张图 |
| M3 | 文件选择对话框与 `accept="audio/*"` 过滤 | 系统对话框无法 headless 触发 | 点「导入音频」→ 确认弹系统选择器、默认过滤音频；再选一个 `.txt` 看「导入失败: unsupported audio type …」 |
| M4 | t3 的 O4：弹层是否比 select 宽 10px | 引擎锚定行为未实测 | 量 `::picker(select)` 边框盒宽 vs select 宽；介意就改用 `border-box + 94px` |
| M5 | 真实音频解码与听感（mp3/wav/ogg）、自动播放策略解锁 | 假 AudioContext 只记图，不解码 | 导入短音频试听；刷新页面不点击等一次审批（应计 `suppressedPolicy`），再点试听后触发第二次 |
| M6 | 真实 DSH 端到端"无需刷新"（含持久化） | 需真实 `dsh web` + 浏览器 | 导入 → 下拉立刻出现且选中；重启 DSH 后名册仍在、可试听；开第二个标签页看同步 |
| M7 | 不支持 `base-select` 的浏览器降级（原生弹窗列全、取色） | 无此类引擎 | Chrome<135 / Firefox 目视 |
| M8 | N1 的载体兜底：未完成请求在 300 s 处是否真的被断开 | 需等 5 分钟且要观测载体内 | 裸 socket 发 chunked 一帧后挂住，观察 300 s 后连接被断（亦可给 `readUpload` 加同款 `unref` 兜底，见 §6） |

---

## 6. 残余缺陷与风险清单（rev-5 之后）

> 三项均为 t3 发现、我复核认可；**都不影响用户 5 条原话中的任何一条**，也不阻塞交付。

| id | 严重度 | 摘要 | 位置 | 最小复现 |
| --- | --- | --- | --- | --- |
| **N1** | low | **未过 cap 的 stagnant 请求没有插件级时间上界**：客户端发 chunked 一帧后不动（<5 MB）→ 7 s 内无应答、无插件定时器；最终由载体（未覆写 `requestTimeout`，Node 默认 300 s）兜底 | `lib/index.js:461-493`（`readUpload` 只在超 cap 时 reject）、`:362-415`（`refuseOversized` 只在超限后启动） | `node dsh-approval-chime/verify-independent/probe-14-r5-http-413.mjs` 的 `4b` 组（实测 `status=null, elapsed=7002ms, timers=[]`）；或裸 socket 发一帧后挂住 |
| **N2** | low | **超过约 2× cap 的流式请求被 RST 而非 413**（"多送一个 cap"的宽限用尽后硬切断，注释已声明） | `lib/index.js:391-394`（`extra > MAX_AUDIO_BYTES → giveUp()`） | probe-14 `5`/`6` 组：7.50 MB / 10.00 MB → 413；11.25 MB → `ECONNRESET`。自带 UI 到不了（`lib/client.js:1284` 先按 `file.size` 拒绝） |
| **N3** | low | **`custom[].id` 仍大小写不敏感（半边校验）**：schema 里 `custom[].id` 是裸字符串、浏览器侧 `CUSTOM_ID` 带 `/i`，而路由与查文件大小写敏感 → 手改文档写大写 id 会渲染出一行**永远播不响的"死选项"** | `lib/index.js:288`、`lib/client.js:96`、`lib/index.js:93` + `:424-450` | 手改 `settings.yaml` 的 `approval-chime.custom[0].id` 为大写 → 卡片可选中该行，试听只增 `suppressedFailed`（真实路由 404）。**补充（我的复核）**：rev-5 把 `tone` 收紧为小写模式后，(a) 选中该行会**写入失败并显示错误**（不再静默存下死音色）；(b) 若手改文档里连 `tone` 也是大写，则该节 schema 校验失败 → scope 永远不 ready → **卡片整块不渲染**（平台对非法节的通用行为，属手改路径的副作用）。建议：客户端 `CUSTOM_ID` 去 `/i`（把大写条目从名册里丢掉），即可让"死选项"消失 |
| **R-RESID** | low | **纯空白显示名仍渲染成空行**（`clampName` 不 trim；与 rev-4 相同，非新增） | `lib/client.js:724-729` | 手改 `custom[0].name = '   '` → 选项行看似空白（我的探针实测 `renderedAs="   "`） |
| 观察 | — | `.mp3` / `..mp3` 的标签原样显示（观感）；满额时按钮仍可点（提示延迟到选完文件）；`suppressedDisabled` 合并"审批 + 试听"两种来源；`audio/` 里手工造同名目录时 GET 返回干净的 500 JSON | — | 见 t3 §3 观察项 O1–O4 与本文 §3.1/§3.4 |

---

## 7. 结论：**可交付**

**理由**

1. **R1–R5 逐条达标**，且 R5 的修复把结论从"依赖 UA 盒模型"变成"内容盒 84px = 3×28px 行高"的**自证式**声明：3 项不滚、第 4 项起滚，两个阈值都由我们自己的 CSS 决定（我的探针 69/69、t3 的 probe-11 31/31 独立复现）。
2. **rev-5 的 low 修正没有需求层面回退**：满额拒绝改为"上传前拒绝 + 明确文案 + 竞态删孤儿文件"、显示名按码点与 DSH 同界、扩展名白名单承诺不变且 README 已同步、禁用试听的计数与文案一致（§3）。
3. **证据强度足够**：t3 的硬结论都建立在真实 socket / 真实 schemastery / 真实路由之上，未证实项留白得当，无伪造或错引（hash、`_raw` 尾部计数、mtime、import 图谱逐一核对）；我另用**两套自写仪器**独立复现了 R5 算术、R4-CAP/RACE、F1/F3/F6/D4 与 D1（69 + 9 断言）。就"测试与实现是否同源"而言：三侧作者分离成立；唯一需要读者留心的是 t1 的六支旧探针被 t3 **按其声明的行为变更更新了期望**（断言只增不减，已文档化）。
4. **无阻塞项**：残余 N1/N2/N3 + 一条残余观察均为 low，且都属"手改文档才可达"或"第三方客户端才可达"；用户 5 条原话对应的交互路径全部正常。
5. **仍需真人确认的只有 M1–M8**（滚动条真实 used value/外观、对话框、听感、端到端与持久化、降级、300 s 兜底）。这些都是**收尾验证**，其中 M1/M2 不再影响 R5 的判定（内容盒几何已被作者声明与算术钉死），M4 若要消除 O4 的 10px 观感，可把该规则换成 `box-sizing:border-box;max-height:94px`（内容盒同为 84px，且外框语义与 UA 锚定尺寸一致）——**这是可选优化，不是修正项**。

**建议的收尾动作（不阻塞交付）**：① 真人浏览器过一遍 M1/M2/M3/M5/M6；② 若想让 N3 彻底闭合，客户端 `CUSTOM_ID` 去 `/i`（约 1 行）；③ 若想让 N1 更稳，给 `readUpload` 加一个与 `refuseOversized` 同款的 `unref` 兜底；④ `docs/rev4-独立验证.md:189` 的 U1 那句仍写着 rev-4 的 `content-box` 推断，建议补一行更正（历史记录正确性，无行为影响）。

---

### 附：本次复审的可复现命令

```powershell
cd '<workspace>'
node .scratch/reviewer-r5/reqcheck-rev5.mjs        # 69/69：R1–R5 + R4-CAP/RACE + F3/F6/D4/F1
node .scratch/reviewer-r5/reqcheck-host-413.mjs    #  9/9：413（content-length + chunked）+ 正常往返 + 零残留
# 期望副作用：无（两个探针都不写产品目录，第二个探针的 audio/ 前后一致）
```
