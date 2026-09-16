# rev-5 复验报告（任务 t3 · verifier）

> **一句话结论**：两轮验证提出的 **3 个 medium（R5-1 / D1 / F1）+ 9 个 low（D2、D3、D4、F5、F6、F2、F3、R4-CAP、R4-RACE）逐条复核为"确实修好"**，每条都有原始命令与原始输出；修正新引入的四条路径（`refuseOversized`、`extensionOf`、`uploadName`、`clampName`/`deleteAudio`/导入上限分支）经对抗性攻击**未发现 medium 及以上缺陷**；新增 **3 条 low 缺陷 + 4 条观察**（其中 2 项是只能靠真实引擎定论的视觉后果，已列未证实）。
> 回归：实现者 4 套 harness **54 + 103 + 20 + 70 = 247 全绿**；本人 10 支独立探针 **454 项断言通过**（probe-13 另计 11/14，3 项失败全部是环境限制）。
> 未把任何未验证项写成通过（§4）。

**独立性**：本轮探针全部在 `dsh-approval-chime/verify-independent/`，**未 import `verify/_harness.mjs` 的任何一行**；新增 `kit/hostserver.mjs`（真实 `node:http` 载体 + 裸 socket 驱动器 + 定时器生命周期仪器），并用**真实 `@deepseek-ai/schemastery`** 校验 schema。未修改 `lib/**` 与 `verify/**`。

---

## 0. 环境、被测修订与复现

| 项 | 值 |
| --- | --- |
| 节点 / Shell | `node v24.21.0` / Windows PowerShell 5.1（沙箱 `workspace-write`） |
| 被测修订 | `lib/client.js` 72360 B mtime `2026-09-15 21:12:24` → SHA-256 `E4B32C042355B5B06DF72BDA98185A4F0D5EA0D9E9B712DE6378B9B57B068CFF`<br>`lib/index.js` 27191 B mtime `2026-09-15 21:16:30` → SHA-256 `8288C803E38849B4A8A8228B0FB13BDD5144C4D5063C71D40A8D3F74D1DB3630` |
| 哈希锚定 | 复跑前 H1 与复跑后 H2 完全相同；4 套 harness 文件 mtime `18:37–21:12`、`lib/*.js` 最后改动 `21:12:24 / 21:16:30`，而**本报告的全部探针运行发生在 21:18–21:31**，即全部晚于最后一次改动（`_raw/r5-*` 时间戳可查） |
| 浏览器 | Edge 153 在，但沙箱禁命名管道 → Chromium Mojo FATAL，**无引擎可测**（probe-13 原始日志） |

复现（一条命令跑完 4 套 harness + 10 支探针并归档原始输出）：

```powershell
cd '<workspace>'
powershell -ExecutionPolicy Bypass -File dsh-approval-chime/verify-independent/run-r5.ps1
# 期望：全部 exit 0，唯独 probe-13 exit 1（它记录本沙箱无法完成的测量）
```

原始输出（`r5-` 前缀为本次复验，rev-4 的 `ind-probe-*-r4-*` 归档原样保留不被覆盖）：

```
verify-independent/_raw/r5-dev-host-half.txt        r5-dev-client-half.txt
verify-independent/_raw/r5-dev-waterfall.txt        r5-dev-custom-audio.txt
verify-independent/_raw/r5-ind-probe-7-r4-roster.txt          40/40
verify-independent/_raw/r5-ind-probe-8-r4-playback.txt        61/61   （F1 复验）
verify-independent/_raw/r5-ind-probe-9-r4-concurrency.txt     38/38
verify-independent/_raw/r5-ind-probe-10-r4-volume.txt         66/66   （F2/F3 复验）
verify-independent/_raw/r5-ind-probe-11-r4-css-rows.txt       31/31   （R5-1 复验）
verify-independent/_raw/r5-ind-probe-12-r4-injection.txt      47/47   （D4/F5/F6 复验）
verify-independent/_raw/r5-ind-probe-13-r4-browser.txt        11/14   （环境限制）
verify-independent/_raw/r5-ind-probe-14-r5-http-413.txt       36/36   （D1 + refuseOversized 攻击）
verify-independent/_raw/r5-ind-probe-15-r5-names-files.txt    88/88   （D2/D3/D4/F5/F6）
verify-independent/_raw/r5-ind-probe-16-r5-cap-race.txt       47/47   （R4-CAP/R4-RACE）
verify-independent/kit/hostserver.mjs   新增：真实 node:http 载体 + 裸 socket + 定时器仪器
verify-independent/run-r5.ps1           一键复跑
```

---

## 1. 复核总表

| # | 修正项 | 判定 | 关键原始证据 |
| --- | --- | --- | --- |
| 1 | **R5-1** 弹层第 3 行被裁/默认就有滚动条 | **PASS** | `box-sizing:content-box` + `max-height:84px` 同规则；84 = 3×28 **精确**；旧值 92 在 UA border-box 下 = 82px，比 3 行短 **2px**（算术自洽）；`overflow-y:auto` 与圆角仍在同一 `@supports` 块 |
| 2 | **D1** 超限 413 到不了客户端 | **PASS** | 真实服务器 + 裸 socket：content-length / chunked 快 / chunked 慢(4ms 帧) **三种都收到可读 413 JSON**；3 秒兜底 timer 仅 1 个、`unref`、完成后清除 |
| 3 | **F1** 同步抛错穿透监听循环 + 按钮卡死 | **PASS** | ①④ 不抛异常 ② 监听器收不到异常、`subscribeErrors` 为空 ③ `suppressedFailed=1`、`lastError` 有值 ④ 按钮回到「导入音频」并显示「导入失败」 |
| 4 | **D2** uuid 大小写不对称 | **PASS（+1 观察）** | 真实 schemastery：小写 `custom:<uuid>` 过、大写**被拒**；路由 GET/DELETE 大写 → 404「unknown audio id」。观察：浏览器半 `CUSTOM_ID` 仍留 `/i`（§3-N3） |
| 5 | **D3** 前缀扫描拿错/删错文件 | **PASS** | `<id>.aaa` + `<id>.mp3` 并存 → GET 返回 `.mp3`（type `audio/mpeg` + `.mp3` 字节）、HEAD 报 `.mp3` 长度、DELETE 删 `.mp3` 后 `.aaa` **仍在**、二次 DELETE `removed:false` |
| 6 | **D4/F5** 显示名收敛（码点） | **PASS** | 宿主与浏览器半都是 **120 码点**：emoji 边界名 120 码点/121 UTF-16 单元、emoji 完好、**无孤立代理**；控制字节两侧都剥；两侧同输入结果逐字节相同 |
| 7 | **F6** 扩展名 / 尾随空格 / MIME 兜底 | **PASS** | `ring.mp3`、`ring.mp3 `、` .mp3`、`..mp3`、`x.MP3`、`C:\music\song.MP3`、`ring .mp3` 均 200 并落盘 `<id>.<ext>`；`a.`/`a.aaa`/`note txt`/`ring. mp3`/空白 均 415；浏览器半 `uploadName` 造出的 7 种名字**全部被真实路由接受** |
| 8 | **F2** 文档措辞 | **PASS** | README 已改为"审批触发不建 AudioContext；试听是显式动作、有意解锁"；实测审批路径 `contexts=0`、试听路径 `contexts=1/nodes=0/fetches=0` |
| 9 | **F3** 禁用时试听不计数 | **PASS** | 预览路径 `suppressedDisabled=1`（内置与导入两条都算） |
| 10 | **R4-CAP** 第 51 次导入 | **PASS** | 名册满 50 → **上传前拒绝**（0 POST、0 fetch、无节点、无写入）；竞态兜底分支真的 `DELETE` 掉了刚上传的文件；§7-5b 两条并发上传也只留 50 项 |
| 11 | **R4-RACE** 写入时刻重读名册 | **PASS** | 上传在途时他人追加 → 写入合并为 `[已有, 他人, 我的]`（无丢失）；他人占满 50 → 我的被删且不写 |
| 12 | 回归：实现者 4 套 harness | **PASS** | 54/54、103/103、20/20、70/70（`r5-dev-*.txt`） |
| 13 | 回归：本人 10 支探针 | **PASS** | 40/61/38/66/31/47/36/88/47 = **454 项断言全通过**；probe-13 11/14（环境） |

---

## 2. 逐条详情（原始命令与输出）

### 2.1 R5-1 —— 三行窗口的盒模型

命令：`node dsh-approval-chime/verify-independent/probe-11-r4-css-rows.mjs`（`_raw/r5-ind-probe-11-r4-css-rows.txt`）
方法不变：**执行真实的 `injectStyles()`**，解析它塞进 `<style>` 的 `textContent`，用大括号配平切规则。

```
--- claim 7b ---
    · rule = .dacCard select::picker(select) { appearance:base-select;margin-top:4px;padding:4px;
             border:1px solid …;border-radius:10px;…;box-sizing:content-box;max-height:84px;
             overflow-x:hidden;overflow-y:auto; }
    · rule = .dacCard select option { border-radius:7px;padding:4px 9px;line-height:20px; }
[PASS] rev-5 R5-1: the picker pins its own box model to content-box
[PASS] `max-height` is declared on the picker (rev-5 R5-1: 84px, not 92px)
[PASS] `overflow-y:auto` is in the SAME rule as max-height
--- claim 7c — the arithmetic, step by step ---
    · step 3 — one row is = 20 + 4 + 4 = 28px
    · step 4 — 3 rows are = 3 × 28 = 84px
    · step 6 — with box-sizing:content-box the max-height IS the content box = max-height 84px vs content needed 84px
[PASS] max-height equals exactly 3 rows: the 4th row is the first one that overflows
[PASS] and the UA's own box model can no longer change that (the author declaration wins)
[PASS] the padding and border are ADDED to that 84px, not subtracted from it（外框 = 84 + 8 + 2 = 94px）
    · the old value under the reviewer's UA=border-box claim = 92 - 8 - 2 = 82px of content → 2.9286 rows，
      即比三行短 2px
[PASS] the reviewer's mechanism is arithmetically consistent (92px border-box would have been 2px short)
```

**逐步推导（不依赖注释声称）**：`line-height:20px` + `padding:4px 9px`（上下各 4px）+ `height` 未设置 ⇒ 一行 = 20+4+4 = **28px** ⇒ 三行 = **84px**；该规则显式声明 `box-sizing:content-box`，因此 `max-height:84px` 量的是**内容盒**，与 UA 样式表给 `::picker(select)` 的 `box-sizing` 无关 ⇒ **内容区恰好 84px = 3 × 28px，第 4 行才是第一个溢出、出现滚动条的行**。
**旧值为什么裁第 3 行**：若 UA 是 `border-box`，`max-height:92px` 量的是边框盒 ⇒ 内容区 = 92 − 8（padding）− 2（1px 边框） = **82px**，比三行所需 84px **少 2px** ⇒ `overflow-y:auto` 立刻出现滚动条，且第 3 行底部被裁 2px。该 92→82 的算式已被探针独立复核（`92 - 8 - 2 === 84 - 2`）。
`overflow-x:hidden`/`overflow-y:auto`/`border-radius:10px` 与 `max-height` **在同一规则内**；整块仍在**唯一**一处 `@supports (appearance:base-select)` 内，块外 0 处 `max-height`/`overflow-y`；选项圆角规则（`option{border-radius:7px;…}`）也在同一块内。

### 2.2 D1 —— 413 与 `refuseOversized` 的三种对抗

命令：`node dsh-approval-chime/verify-independent/probe-14-r5-http-413.mjs`（`_raw/r5-ind-probe-14-r5-http-413.txt`）
载体：真实 `node:http` 服务器（复刻 `dsh-host-webserver` 的 `new URL(req.url).pathname` + 前缀派发）+ 裸 TCP socket 控制分帧与节奏；`setTimeout`/`clearTimeout` 被包成仪器，记录**定时器生命周期**。

```
--- 1 — content-length overflow (the D1 repro) ---
    · raw response head = HTTP/1.1 413 Payload Too Large
      content-type: application/json; charset=utf-8 / cache-control: no-store / connection: close
    · plugin deadline timers = [{"delay":3000,"ref":false,"cleared":true}]
[PASS] the client RECEIVES a response — expected 413, got 413
[PASS] the 413 body is readable JSON naming the limit — "{\"ok\":false,\"error\":\"file exceeds the 5 MB limit\"}"
[PASS] exactly one 3 s deadline timer was armed / that timer was unref'd / and it was cleared when the request completed
--- 2 — chunked overflow, fast sender ---   bytes written = 5 309 306 → 413 (19–27 ms)
--- 3 — chunked overflow, 4 ms per 16 KB frame ---
    · response = status=413 … elapsed=1813ms   ← 由 end 路径回答，未用兜底
[PASS] answered by the END path, before the 3 s deadline
--- 4a — cap trips, then the sender halts and never finishes ---
    · response = status=413 … elapsed=3016ms   ← 兜底 3 秒生效
--- 4b — sender stays UNDER the cap and never finishes (pre-cap stall, 见 §3-N1) ---
    · response = status=null … elapsed=7002ms；plugin deadline timers = []
--- 5 — cap trips, then a slow endless stream ---
    · response = status=413 … elapsed=3018ms；wroteBytes=6 932 109 / 7 405 568（远未读完）
--- 6 — grace sweep ---
    · total=7.50 MB → 413 (28 ms)    · total=10.00 MB → 413 (34 ms)    · total=11.25 MB → ECONNRESET
--- 7 — disconnects ---
    · disconnect mid-body / 刚过 cap 就断开 / 收到答案前消失 三种都无 crash
[PASS] every socket of these scenarios is gone (no leaked connection) — {"idle":true,"count":0}
--- 8 — oversized 与正常上传并发 ---
[PASS] the oversized request still gets its 413 / the normal upload is accepted / 落盘字节完全一致 / 再次删除
[PASS] no uncaught exception / unhandled rejection in the whole probe
[PASS] the audio directory is exactly as it was before the probe — before=[] after=[]
```

**行为写清**：
- **3 秒兜底**：`refuseOversized` 在超过上限那一刻挂一个 `setTimeout(answer, 3000)`，并 `unref()`；请求正常结束（或发送方停止后被判定结束）→ `clearTimeout`。实测 4a 场景 `elapsed=3016ms` 收到 413，仪器记录 `{delay:3000, ref:false, cleared:true}` —— **既不悬挂也不阻塞进程**。
- **"多送一个 cap 宽限"**：cap 触发后服务端继续**排空**最多**一个 `MAX_AUDIO_BYTES`（5 MB）的多余请求体；`extra > MAX_AUDIO_BYTES` 立即 `req.destroy()`（RST）。实测边界落在 **10.00 MB（→413）与 11.25 MB（→RST）之间**，即约 2× cap。插件自身的导入路径到不了该分支（`lib/client.js:1284` 先按 `file.size` 拒绝）。
- 不无限读：场景 5 中发送方准备送 7.4 MB，服务端在约 6.9 MB 处就把连接关掉（3 秒兜底先到）。
- 不泄漏 socket：每个场景后 `server.getConnections() == 0`；整个探针 `audio/` 目录前后一致。

### 2.3 F1 —— 同步抛错不再逃逸

命令：`node dsh-approval-chime/verify-independent/probe-8-r4-playback.mjs`（`_raw/r5-ind-probe-8-r4-playback.txt`）

```
--- F1 (rev-5) — `fetch` throws SYNCHRONOUSLY: it must be converted, not escape ---
[PASS] ① the preview call does not throw            [PASS] ① it reports "scheduled" like any other sample attempt
[PASS] ③ suppressedFailed is updated exactly once   [PASS] ③ lastError carries the thrown message
[PASS] ③ the built-in tone still plays afterwards
[PASS] ② nothing escapes the pendingInteractions listener
[PASS] ② the approval was still counted as seen     [PASS] ② and the failure landed in the counters
[PASS] ② the app-side subscriber error log stays empty — []
--- F1 (rev-5) — a synchronous throw from `uploadAudio` must not wedge the import button ---
    · buttons after the throw = ["导入音频","试听","恢复默认"]
[PASS] ④ nothing escapes the change handler
[PASS] ④ the import button is back to 导入音频 and enabled
[PASS] ④ no button is stuck on 导入中…
[PASS] ④ the failure is reported on the card（"导入失败: probe: fetch threw synchronously on POST"）
```

### 2.4 D2 / D3

命令：`node dsh-approval-chime/verify-independent/probe-15-r5-names-files.mjs`（`_raw/r5-ind-probe-15-r5-names-files.txt`）

```
--- D2 --- （schema 用真实 @deepseek-ai/schemastery/lib/index.cjs）
[PASS] a lowercase custom tone passes schema validation
[PASS] an UPPERCASE custom tone is REFUSED by the schema
[PASS] the three built-in tone ids still pass      [PASS] a junk tone id is still refused
[PASS] GET with an uppercase id is refused (404)   [PASS] DELETE with an uppercase id is refused (404)
[PASS] the two refusals use the same "unknown audio id" wording as a malformed id
--- D3 ---    · planted files = ["<id>.aaa","<id>.mp3"]
[PASS] GET serves the .mp3 content type (not the .aaa stray) — "audio/mpeg"
[PASS] GET serves the .mp3 BYTES                [PASS] HEAD reports the .mp3 length — [200,"17",0]
[PASS] the .aaa stray is STILL there (nothing wrong was deleted) — ["<id>.aaa"]
[PASS] a second DELETE is idempotent — [200,false]
```

### 2.5 D4 / F5 —— 码点收敛，两侧同界

同 probe-15：

```
[PASS] the host exports the bound it promises — 120
[PASS] emoji sitting exactly on the old UTF-16 boundary: equals strip-control-bytes + trim + code-point bound
[PASS] the emoji survived the cut instead of becoming U+FFFD — tail="xxxxxxxxxx😀"
[PASS] UTF-16 length is 121 while code points are 120（旧 slice 正是在这里切断）
[PASS] emoji one code point past the boundary / a 5 000-character name / control bytes: 都是 120 码点且无孤立代理
    · browser-half labels = [{"points":120,"tail":"xxxx😀"}, {"label":"ab.wav"}, {"points":120}]
[PASS] browser half: identical to the host result for the same input
[PASS] browser half: a 200 000-character name is bounded to 120 code points
    · a 20 000-character header value（≈60 KB 编码后）= status 431 ← 载体先拒，200k 名字根本到不了路由
```

### 2.6 F6 —— 尾随空格、最后一点取扩展名、MIME 兜底

同 probe-15：

```
[PASS] "ring.mp3 " → accepted as .mp3 — [200,"mp3","ring.mp3"]        （尾随空格 = 修复前必然 415）
[PASS] " .mp3" / "..mp3" / "x.MP3" / "C:\music\song.MP3" / "ring .mp3" 均 200 且落盘 <id>.<ext>
[PASS] "a." / "a.aaa" / "note txt" / "ring. mp3" / "   " / "" → 415（可读 JSON）
[PASS] no extension, typed audio/mpeg: the browser sends "recording.mp3" / the real route accepts that header
[PASS] empty name, typed audio/mpeg → "audio.mp3"；unknown type → "mystery.wav"；ogg → "voice.ogg"
[PASS] dotted name with no real extension → "y..mp3"（仍被路由接受）
```

（`uploadName` 的 MIME 兜底是**浏览器半**的职责；宿主对无扩展名依旧 415 —— 这是设计分工，不是缺陷，probe-12 里保留了该 415 断言。）

### 2.7 R4-CAP / R4-RACE

命令：`node dsh-approval-chime/verify-independent/probe-16-r5-cap-race.mjs`（`_raw/r5-ind-probe-16-r5-cap-race.txt`）

```
--- 1 — roster at 50: the 51st import is refused before any upload ---
[PASS] no upload request was made（0 POST、0 GET、0 节点）
[PASS] the card says the roster is full（"导入音色已达上限（50 个）"）
[PASS] the settings document was not touched（仍 50）      [PASS] the buttons are not stuck on 导入中…
--- 2 — roster hits 50 while the upload is in flight ---
[PASS] exactly one DELETE was issued for the just-uploaded file — /api/approval-chime/audio/00000096-…
[PASS] the roster was NOT written (still the other tab's 50) / nothing leaked / the tone was left alone
--- 3 — another tab appends during the upload: the write MERGES ---
[PASS] the write kept the other tab's entry AND appended ours — [first, other-tab, mine]
--- 5b — two concurrent uploads ---
[PASS] the roster ends at exactly 50, never 51 / the second one is not in it
[PASS] and its file was deleted again / both concurrent imports survive the write — [one, two]
--- 5 — a stored roster of 51 (older document) ---
[PASS] only 50 imported rows render / the selected 51st tone renders as the synthetic missing row
--- 6 — a refused import makes no sound and fetches nothing ---
[PASS] previews did not move / no audio node was built / no request of any kind was made
--- 5c — `deleteAudio` 的兜底（新增路径）---
    · 无 `fetch` 时点「移除」：不抛异常、名册条目仍被删除、音色回退 chime（`deleteAudio` 恒返回 resolved Promise）
    · 竞态分支与「移除」路径共用它：失败/被拒的删除都不会变成未处理 rejection（整个探针 crash 列表为空）
```

### 2.8 回归与期望表变更（没有"测试放水"）

- 实现者 4 套 harness：`r5-dev-*.txt` 中 `54/54`、`103/103`、`20/20`、`70/70`，exit 0。
- 本人 10 支探针复跑：`40/61/38/66/31/47/36/88/47 = 454` 全通过；probe-13 11/14（3 项为环境限制）。
- **期望表变更**（每条都对应 CHANGELOG 里"有意改掉的旧行为"，且新断言不弱于旧断言）：

| 探针 | rev-4 旧期望 | rev-5 新期望 | 依据 |
| --- | --- | --- | --- |
| probe-7 shape A | 5000 字名字原样渲染（`length === 5000`） | 收敛到 120 码点，且等于源名前 120 码点 | D4/F4 |
| probe-8 | "同步抛错逃逸调用方"3 条 + "按钮卡死" | 不抛、计数与 `lastError` 更新、按钮复位并报错 | F1 |
| probe-10 claim 6c | 禁用时预览**不**计数 | 计数（内置与导入各 +1） | F3 |
| probe-10 备注 | 引 `lib/client.js:548-550` 指责文档 | 引 `lib/client.js:618-621` + README 的"有意解锁"措辞 | F2 |
| probe-11 | `max-height:92px` = 3 行 + 8px padding | `box-sizing:content-box` + `max-height:84px` = 恰好 3 行；并复核 92px 在 UA border-box 下短 2px | R5-1 |
| probe-12 group C | `padded.wav ` → 415 | 200，名字 `padded.wav` | F6 |
| probe-12 group C | emoji 被切成孤立高代理 U+D83D | 120 码点、emoji 完好、无孤立代理 | F5 |
| probe-12 group C | 客户端兜底名 `audio` → 415 | 宿主规则不变，但改注为"客户端现在会补扩展名"（见 probe-15） | F6 |

> 我**没有**把任何一条"为了让它变绿"的断言改弱：例如 emoji 那条从"期望孤立代理"改成"期望 emoji 完好 + 码点数 + UTF-16 单元数三个量同时断言"；R5-1 那条从"字符串等于 92px"改成"内容盒算术精确等于 3×28 + 显式 box-sizing + 旧值算术自洽 + 4 条同规则/同块断言"。

---

## 3. 新缺陷清单（rev-5 引入或残留）

### N1 · low · 未过 cap 的"stalled"请求没有插件级时间上界

- **位置**：`lib/index.js:454-486`（`readUpload` 只在"超过 cap"时 reject）+ `:362-408`（`refuseOversized` 只在上限触发后被调用）。
- **现象（实测）**：客户端发出 `transfer-encoding: chunked` 请求头 + 32 KB 数据后**停止发送也不结束**（未到 5 MB）→ 7 秒内**没有任何应答**，且仪器显示**没有挂任何 deadline 定时器**（`plugin deadline timers = []`），连接保持打开。
- **最小复现**：`node verify-independent/probe-14-r5-http-413.mjs` 的 `4b` 组（原始输出 `· response = status=null … elapsed=7002ms; plugin deadline timers = []`）。等价手测：`nc`/裸 socket 发 `POST /api/approval-chime/audio` + `x-chime-name: x.wav` + `Transfer-Encoding: chunked`，发一帧后不动，观察连接 7 秒无响应。
- **影响与边界**：每个 stalled 请求占 1 个 socket + 1 个挂起的 Promise（内存上限被 cap 约束，不会无限增长；不会写盘）；载体层 `dsh-host-webserver` **未覆写** `requestTimeout`/`headersTimeout`（grep 无匹配），因此 Node 默认 `requestTimeout = 300 s` 最终会断开它。**未实测 300 s 事件**（见 §4-U3）。
- **建议**（不属本轮范围）：给 `readUpload` 也加一个与 `refuseOversized` 同款的 `unref` 兜底（例如请求头接收后 30 s 未完成则 408/413）。

### N2 · low · 超过约 2× cap 的流式客户端拿到 RST 而不是 413

- **位置**：`lib/index.js:391-394`（`extra > MAX_AUDIO_BYTES` → `giveUp()` → `req.destroy()`）。
- **现象（实测）**：总量 7.50 MB / 10.00 MB → **可读 413**；11.25 MB → **ECONNRESET，无 413**。也就是说"多送一个 cap"的宽限用尽后是硬切断，这是代码注释里写明的取舍（"robustness must not become an invitation to stream forever"）。
- **最小复现**：probe-14 `6` 组 / `5` 组。
- **影响**：插件自身的导入路径**到不了该分支**（`lib/client.js:1284` 先按 `file.size > 5 MB` 拒绝，根本不上传）。只有第三方客户端（脚本、未来的导入器）在被 reset 时无法区分"文件太大"与"宿主断链"。严重度 low（可达性受限）。

### N3 · low · 名册里的 id 大小写仍是"半边校验"：大写 id 能存能渲染，却永远播不出

- **位置**：`lib/index.js:288`（`custom: z.array(z.object({ id: z.string(), name: z.string() }))` —— id 是**裸字符串**，不校验大小写）↔ `lib/client.js:96`（`CUSTOM_ID` 仍带 `/i`）↔ `lib/index.js:93` + `:423-443`（路由与查找**大小写敏感**）。
- **现象（端到端实测）**：手改设置文档写 `custom:[{id:'<大写 uuid>',name:'upper.wav'}]` 且 `tone:'custom:<大写 uuid>'` → schema **接受**、卡片**渲染出可选中行**；按试听 → 真实路由 404 → `suppressedFailed=1`、`previews=0`，即**一行永远播不响的死选项**（rev-4 的 D2 修好了 `tone` 一侧，`custom[].id` 一侧仍留同型缺口）。
- **最小复现**：probe-15 的 D2 组末尾（`_raw/r5-ind-probe-15-r5-names-files.txt`：`OBSERVATION: it is a DEAD row — the real route answers 404 and nothing plays`）。文档路径：把 `settings.yaml` 的 `approval-chime.custom[0].id` 改成大写并同步 `tone`。
- **建议**：schema 里把 `custom[].id` 收紧为与 `tone` 相同的 `z.string().pattern(/^[0-9a-f-]{36}$/)`（小写），或让客户端 `CUSTOM_ID` 去掉 `/i` 与路由一致。

### 观察项（不计为缺陷）

| # | 观察 | 证据 |
| --- | --- | --- |
| O1 | `audio/` 里若出现**目录** `<id>.mp3`（只能手工造），GET 变成 `500 {"error":"EISDIR…"}`（干净的 JSON、不崩） | probe-15 D3 组末 |
| O2 | 名字就是扩展名时（`.mp3`、`..mp3`）会原样成为显示名（选项标签是 `.mp3`），仅观感 | probe-15 F6 表 |
| O3 | `displayName` 的 `audio.<ext>` 兜底分支在当前正则/流程下**不可达**（能取到合法扩展名 ⇒ 清理后的基名必非空），属死代码 | probe-15 全表 + 推导；未单独断言 |
| O4 | `box-sizing:content-box` 让弹层外框 = 84+8+2 = 94px；**若** UA 用 `min-width:anchor-size(width)` 把内容盒锚到 select 宽度，弹层会比 select 宽出 10px（观感） | probe-11 算出 94px；**引擎行为未证实**（§4-U1） |

---

## 4. 未证实项（不得当作通过）

| # | 未证实 | 为什么 | 现有证据到哪一步 |
| --- | --- | --- | --- |
| U1 | R5-1 修复后的**真实渲染**：内容区是否真的恰好显示 3 整行、第 4 行才出现滚动条；以及 O4 的 10px 外扩是否真的发生 | 沙箱禁命名管道 → Chromium Mojo FATAL，无引擎可跑（probe-13 原始日志） | 样式表 + 盒模型算术已证（84 = 3×28，content-box 显式声明），且**不依赖** UA 的 `box-sizing`；引擎测量需另找环境 |
| U2 | UA 样式表给 `::picker(select)` 的 `box-sizing` 到底是 `border-box`（评审报告的外部资料结论） | Edge 二进制里 UA CSS 非明文（对照串 `input[type="checkbox"]` 也找不到），方法自证否 | 92→82px 的算式自洽，**但那只是"若 UA=border-box 则成立"的条件结论**；修复本身与该假设无关 |
| U3 | 未完成请求被载体在 300 s 处断开的**实际**行为（N1 的兜底） | 需要等 5 分钟且要能观测载体内部；本轮只读了载体源码（未覆写超时）与 Node 文档默认值 | 已实测"7 秒无应答、无插件定时器"；300 s 事件未实测 |

---

## 5. 证据强度自评

| 结论 | 强度 | 说明 |
| --- | --- | --- |
| D1 修复（413 真的上线） | **硬** | 真实 `node:http` + 裸 socket，三种分帧都收到可解析 JSON；并发了正常上传作对照；磁盘零残留 |
| `refuseOversized` 的兜底/宽限/切断 | **硬** | 定时器生命周期被仪器记录（1 个、unref、清除）；慢速/永久/中断三种发送方 + 宽限边界扫描（7.5/10/11.25 MB）实测 |
| F1 修复 | **硬** | 四条子要求逐条断言；含"app 侧订阅错误日志为空"这一独立观测面 |
| D2 / D3 | **硬** | schema 用真实 schemastery 校验；路由用真实服务器 + 真实文件对（`.aaa`+`.mp3`），服务/删除/剩留三者都对得上 |
| D4/F5 同界 | **硬** | 两侧同一输入逐字节比对；孤立代理用正则双向检测；200k 名在浏览器半实测 |
| F6 | **硬** | 14 种名字的接受/拒绝表 + 浏览器半真实请求头 → 真实路由接受，端到端闭环 |
| R4-CAP / R4-RACE | **硬** | 上传前拒绝用"0 请求"证明；竞态分支用 deferred fetch 精确制造；并发两条上传实测只留 50 项 |
| R5-1 的**算术**部分 | **硬** | 规则解析 + 盒模型算术 + 旧值条件算式，全部可复算 |
| R5-1 的**渲染**部分、O4 | **未证实** | §4-U1/U2 |
| N1/N2/N3 | **硬**（现象已复现），等级判断含主观 | 均给了最小复现与可达性边界 |

**方法与边界**：本轮只对 rev-5 的修正与新路径做复核，宿主路由的完整契约仍以 `docs/rev4-独立验证.md` 为准（我只补了 D1 的 socket 级复验与 D2/D3 的对象级验证）；需求符合性以 `docs/rev4-需求符合性审查.md` 为准。未改 `lib/**`、`verify/**`；探针写入 `audio/` 的临时文件全部删除并前后比对目录（`before=[] after=[]`）。
