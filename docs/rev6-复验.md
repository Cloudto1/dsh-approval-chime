# rev-6 复验报告（任务 t5 · verifier）

> **一句话结论**：**N3 大小写闭环 ①②③④ 与 R-RESID 空白名回落，五条全部 PASS**（每条都有原始输出）；全量回归 4 套 harness **56/103/20/70 全绿**、本人 10 支探针 **474 项断言全通过**（probe-13 11/14 为环境限制）、reviewer 两支持平（**69/0**、**9/0**）。**未发现新缺陷**；另有 3 条观察与 3 条继承的未证实项。
> 本轮为**窄复核**：只判定 rev-6 的这批改动 + 回归，不复述 rev-5 的结论（rev-5 见 `docs/rev5-复验.md`）。

**独立性**：探针与原始输出都在 `dsh-approval-chime/verify-independent/`（`r6-` 前缀，**未覆盖** rev-4/rev-5 归档：`ind-probe-*-r4-*`、`r5-*` 原样保留）。未 import `verify/_harness.mjs`；未改 `lib/**`、`verify/**`。

---

## 0. 被测字节锚定与复现

| 项 | 值 |
| --- | --- |
| 被测文件 | `lib/client.js` 72730 B mtime `2026-09-15 21:53:15` → SHA-256 `5A925E1E96D55755513FE47436EFDA4EA135607B1240CEE1FE8141568F584A13`<br>`lib/index.js` 27592 B mtime `2026-09-15 21:52:10` → SHA-256 `75188B4C0F37FAFA3241BF2712C3C3E62ECAD48E3E74939E090CFAE5CF1AE35E` |
| 时间锚定 | 两份文件最后改动为 `21:52:10 / 21:53:15`，而**本轮全部套件与探针运行发生在 22:35:06–22:35:42**（`_raw/r6-*` 时间戳可查）⇒ 被测字节晚于最后一次改动 |
| 哈希一致性 | 复跑前 H1 = 复跑后 H2（逐字节相同，见 §2.7 输出） |
| 复现命令 | `powershell -ExecutionPolicy Bypass -File dsh-approval-chime/verify-independent/run-r6.ps1`（一条命令跑完 4 套 harness + 我的 10 支探针 + reviewer 的 3 支探针，并按 `r6-` 前缀归档） |

原始输出归档：

```
verify-independent/_raw/r6-dev-host-half.txt        56/56      verify-independent/_raw/r6-dev-client-half.txt    103/103
verify-independent/_raw/r6-dev-waterfall.txt        20/20      verify-independent/_raw/r6-dev-custom-audio.txt    70/70
verify-independent/_raw/r6-ind-probe-7-r4-roster.txt          43/43
verify-independent/_raw/r6-ind-probe-8-r4-playback.txt        61/61
verify-independent/_raw/r6-ind-probe-9-r4-concurrency.txt     38/38
verify-independent/_raw/r6-ind-probe-10-r4-volume.txt         66/66
verify-independent/_raw/r6-ind-probe-11-r4-css-rows.txt       31/31
verify-independent/_raw/r6-ind-probe-12-r4-injection.txt      47/47
verify-independent/_raw/r6-ind-probe-13-r4-browser.txt        11/14（环境限制，见 §4）
verify-independent/_raw/r6-ind-probe-14-r5-http-413.txt       36/36
verify-independent/_raw/r6-ind-probe-15-r5-names-files.txt   105/105
verify-independent/_raw/r6-ind-probe-16-r5-cap-race.txt       47/47
verify-independent/_raw/r6-reviewer-reqcheck-rev5.txt         69 passed / 0 failed
verify-independent/_raw/r6-reviewer-reqcheck-host-413.txt      9 passed / 0 failed
verify-independent/_raw/r6-reviewer-reqcheck.txt              34 passed / 5 failed（旧版探针，期望值属 rev-4，见 §2.7）
verify-independent/run-r6.ps1    一键复跑（含 audio/ 目录预检）
```

---

## 1. 判定总表

| # | 验收项 | 判定 | 原始证据 |
| --- | --- | --- | --- |
| 1 | 重新锚定被测字节（sha256 + mtime + 晚于最后一次改动 + 复跑前后一致） | **PASS** | §0 表 + §2.7 的 H1/H2 输出 |
| 2 | N3 ① 大写 uuid 的 roster 条目无法写入（真实 schemastery 拒绝） | **PASS** | `custom:[{id:'<大写>'}]` 被 schema 拒；小写同型通过；非 uuid 仍被拒 |
| 3 | N3 ② 手改文档里的条目在浏览器半被丢弃（不再渲染） | **PASS** | `roster:[]`、只渲染三个内置；同文档小写孪生仍保留（对照） |
| 4 | N3 ③ `tone=custom:<大写>` 回落默认音色 | **PASS** | `settings().tone === 'chime'`；真实路由**零请求**、`previews=1/suppressedFailed=0`、`lastTone='chime'` |
| 5 | N3 ④ 小写正常路径不受影响（导入→渲染→播放） | **PASS** | 真实路由 200 → `previews=1`、`suppressedFailed=0`、`bufferSources=1`；导入顺序/追加仍成立（probe-7 E 组） |
| 6 | R-RESID 纯空白显示名回落到 id | **PASS** | 4 种空白/控制字节名全部回落为 id，无空标签；宿主上传路径 trim 后非空 |
| 7 | 期望表更新（旧行为断言逐条记录 + 不弱化） | **PASS** | §2.6 表格（probe-7 A/D、probe-15 D2 + 新增 R-RESID 组、等待方式由固定 tick 改条件等待） |
| 8 | 全量回归（4 套 harness + probe-7..16 + reviewer 两支） | **PASS** | §2.7：56/103/20/70；43/61/38/66/31/47/11/36/105/47；69/0 与 9/0 |
| 9 | 新缺陷 | **未发现新缺陷**（明确；观察与未证实项见 §3/§4） | §3 |

---

## 2. 逐条详情（原始命令与输出）

命令统一为：
```powershell
cd '<workspace>\dsh-approval-chime'
node verify-independent/probe-15-r5-names-files.mjs      # N3 ①~④ + R-RESID 宿主侧
node verify-independent/probe-7-r4-roster.mjs            # 浏览器半名册（含 R-RESID、大小写）
# 全量：powershell -ExecutionPolicy Bypass -File verify-independent/run-r6.ps1
```

### 2.1 N3 ① —— 大写 uuid 的 roster 条目写不进去（真实 schemastery）

`_raw/r6-ind-probe-15-r5-names-files.txt`：

```
[PASS] the real schemastery module was resolvable — …/@deepseek-ai/schemastery/lib/index.cjs
[PASS] a lowercase custom tone passes schema validation — expected true, got true
[PASS] an UPPERCASE custom tone is REFUSED by the schema — expected false, got false
[PASS] a mixed-case uuid inside the roster array is now REFUSED by the schema (rev-6 N3) — expected false, got false
[PASS] a lowercase uuid inside the roster array still passes (rev-6 N3 closure, positive side) — expected true, got true
[PASS] a non-uuid roster id is refused (as before) — expected false, got false
[PASS] a roster entry with a legal id and any name is still accepted — expected true, got true
```

源码对照：`lib/index.js:288-298` 的 `custom[].id` 现在带小写 uuid pattern（与 `tone` 同型）；`lib/client.js:100` 的 `CUSTOM_ID` 去掉了 `/i`。

### 2.2 N3 ② —— 手改文档的条目在浏览器半被丢弃

```
    · browser half with an uppercase tone value and roster id = {"tone":"chime","roster":[],"rendered":["chime","bell","beep"]}
[PASS] ② the uppercase roster entry is dropped (nothing rendered for it) — expected 0, got 0
[PASS] ② only the three built-ins are rendered — expected ["chime","bell","beep"], got ["chime","bell","beep"]
[PASS] ② control: the lowercase twin of that document is kept — ["custom:00000061-aaaa-…","chime","bell","beep"]
```

（对照很关键：丢弃是因为**大小写**，不是因为形状 —— 同一份文档把小写 id 放进去就被保留。）

### 2.3 N3 ③ —— `tone` 回落默认音色，且真实路由**零请求**

```
    · previewing with the uppercase document against the real route =
      {"requests":[],"suppressedFailed":0,"previews":1,"lastError":"","lastTone":"chime"}
[PASS] ③ the uppercase tone value falls back to the default tone — expected "chime", got "chime"
[PASS] ③ the select shows the fallback tone — expected "chime", got "chime"
[PASS] ③ the fallback tone really plays (no 404, no suppressedFailed) — expected "[1,0]", got "[1,0]"
[PASS] ③ and the audio route was never contacted at all — expected [], got []
[PASS] ③ the last played tone is the fallback — expected "chime", got "chime"
```

**这正是 N3 的收口**：rev-5 时同一场景是"渲染出可选中行 → 试听 404 → `suppressedFailed+1`"（见 `_raw/r5-ind-probe-15-r5-names-files.txt` 的 `OBSERVATION: it is a DEAD row`），现在连请求都不会发出。

### 2.4 N3 ④ —— 小写正常路径（导入→渲染→播放）不受影响

```
    · previewing the lowercase tone against the real route =
      {"played":true,"wait":{"ok":true,"waitedMs":18,"polls":3},
       "requests":[{"url":"/api/approval-chime/audio/00000061-aaaa-…","status":200,"ok":true}],
       "previews":1,"suppressedFailed":0,"bufferSources":1,"lastError":""}
[PASS] ④ the lowercase roster renders first, before the built-ins
[PASS] ④ the stored lowercase tone is kept as-is
[PASS] ④ the real route answered 200 for that id — expected [200], got [200]
[PASS] ④ it plays through the real route (one fetch, one buffer source, no failure) — expected "[1,0,1]", got "[1,0,1]"
```

导入链路本身（追加而非前插、写入时刻重读名册）由 probe-7 E 组与 probe-16 覆盖，本轮复跑仍全绿（`r6-ind-probe-7-r4-roster.txt` / `r6-ind-probe-16-r5-cap-race.txt`）。

### 2.5 R-RESID —— 纯空白名回落到 id

```
--- R-RESID (rev-6) — a name of nothing but whitespace falls back to the id ---
    · R-RESID rendered rows = [{"value":"custom:…65…","label":"…65…"},{"value":"custom:…66…","label":"…66…"},…]
[PASS] all four entries still render (they are not dropped)
[PASS] every blank name now shows the id instead of an empty label — ["00000065-…","00000066-…","00000067-…","00000068-…"]
[PASS] none of the four labels is blank (the empty-row bug is gone)
    · host-side name for "   .wav" = .wav
[PASS] the host accepts a whitespace-padded name — expected 200, got 200
[PASS] the host trims it rather than storing blanks
```

四种输入分别是 `'   '`、`'\t \n '`、`''`、`'\u0007\u0001'`（后两者在 rev-6 前会分别由"空名→id"和"控制字节剥离后为空"分支处理，前者正是 R-RESID 指的空行）。probe-7 shape A 另有一条独立断言：

```
[PASS] A (rev-6 R-RESID): a whitespace-only name falls back to the id instead of a blank row — expected "00000005-…"
[PASS] A: every rendered label is non-blank (no empty-looking option)
```

### 2.6 期望表更新（逐条记录，且**不弱化**）

| 探针 / 断言 | rev-5 时的期望 | rev-6 期望 | 依据 | 为什么不是"放水" |
| --- | --- | --- | --- | --- |
| probe-7 shape A 渲染集合 | 含 `custom:<大写>` 一行（7 条自定义） | **丢弃**该行（6 条自定义） | N3 | 断言从"存在该行"变成"该行不存在"，并且新增一条"任何行的值都已是小写"的集合级断言 |
| probe-7 shape A 空白名 | `label === '   '`（空行） | `label === id` | R-RESID | 从"容忍空标签"变为"禁止空标签"：另加 `every(label.trim().length>0)` |
| probe-7 shape D | 仅大小写的两条**都渲染**、断言"大小写敏感去重" | **混合大小写那条被丢弃**（4 行），断言"所有渲染值已小写" | N3 | 原断言描述的是缺陷行为；新断言是可证伪的集合不变量 |
| probe-15 D2 | "混合大小写 uuid 在 `custom[].id` 里仍被接受" | **被 schema 拒**；另加小写正向、非 uuid 反向、合法 id+任意名正向三条 | N3 ① | 期望方向反转（接受→拒绝）+ 补正向对照 |
| probe-15 D2 末尾 | "死选项端到端 404"观察 | 端到端**零请求 + 回落播放** + 小写孪生对照 | N3 ②③ | 从"记录缺陷"变为"证明缺陷不可达"，并加对照排除误判 |
| probe-15（新增组） | 无 | R-RESID 四输入 + 宿主 trim 正向 | R-RESID | 新增覆盖，不涉及弱化 |
| probe-15 等待方式 | 正式网络步骤后 `await settle(30/40/60)`（固定事件循环 tick） | **`waitFor(条件, 超时)`** | 探针自检（非产品） | 固定 tick 等真实 loopback I/O 会偶发假阴性（实测同一探针连跑出现 0/1 分歧）；改为条件等待后连跑 3 次均 105/105，**断言内容不变** |

### 2.7 全量回归汇总（`run-r6.ps1` 原始输出）

```
=== preflight: audio/ 是套件与探针之间的共享可变状态 ===
audio/ before the run: 0 file(s)
=== implementer harness suites ===
host-half              exit=0 :: 56/56      client-half  exit=0 :: 103/103
waterfall              exit=0 :: 20/20      custom-audio exit=0 :: 70/70
audio/ after the suites: 0 file(s)
=== independent probes ===
probe-7 43/43   probe-8 61/61   probe-9 38/38   probe-10 66/66   probe-11 31/31
probe-12 47/47  probe-13 11/14（环境）  probe-14 36/36  probe-15 105/105  probe-16 47/47
=== reviewer probes（cwd = 工作区根目录，与它们自己的路径解析一致）===
reqcheck-rev5.mjs        exit=0 :: ### reviewer rev-5 conformance probe: 69 passed / 0 failed
reqcheck-host-413.mjs    exit=0 :: ### reviewer host-413 probe: 9 passed / 0 failed
reqcheck.mjs             exit=1 :: ### reviewer conformance probe (incl. cap scenario): 34 passed / 5 failed
audio/ after the reviewer probes: 0 file(s)
H1 = 5A925E1E…|75188B4C…    H2 = 5A925E1E…|75188B4C…    hashes identical: True
```

**旧版 `reqcheck.mjs` 的 5 条 FAIL 全部是陈旧期望**（该文件 mtime 21:09，早于 rev-5 修正），逐条对应：

| 失败断言 | 它的期望 | 现在的实现 | 性质 |
| --- | --- | --- | --- |
| `the select max-height rule lives only inside @supports…` | 硬编码 `/max-height:92px/` | `84px` | rev-5 R5-1 有意改动 |
| `the option geometry … row=28 max-height=84` | 只认 92px | 84px | 同上 |
| `the author rule never pins box-sizing` | 断言**没有** box-sizing | 显式 `content-box` | 同上（这条正是修复本身） |
| `the 51st import IS uploaded, persisted (51 entries) and selected` | rev-4 行为 | rev-5 R4-CAP 先拒绝（实测 `custom=50 tone=chime`） | rev-5 有意改动 |
| `and the card shows it as the synthetic 「（文件缺失）」 row…` | rev-4 行为 | 不再出现该行 | 同上 |

### 2.8 两处过程记录（都已定位、不影响判定）

1. **`custom-audio` 首轮 69/70，清空 `audio/` 后 70/70**：首次全量运行时它只失败在自身卫生断言 `the test left no audio file behind`，报出两个 `.mp3`（13 B，mtime `21:56:13`，早于我的全量运行）。`custom-audio.test.mjs:401` 断言的是**全局**空目录，因此任何其它工具留下的文件都会让它变红。我把目录清空（`~/.dsh/settings.yaml` 的 `approval-chime` 段只有 `volume/tone`、**没有 `custom` 列表**，这两个孤儿文件没有任何名册条目引用）后单跑即 **70/70**；随后单独复跑 reviewer 的两支探针各一次，目录前后均为 0 文件，故**无法把这两个文件的来源归属到某一支探针**（它们出现在我直接运行 reviewer 探针的时段，期间可能有队友并发运行自己的探针）。`run-r6.ps1` 现在带 `audio/` 预检与阶段前后清单，避免再出现"红得不明不白"。
2. **我自己的探针里有一处固有的不稳定等待**（正式网络步骤后用固定 `settle(n)`），表现为同一断言连续两次运行 0/1 分歧；已改为 `waitFor(条件, 超时)`（`kit/hostserver.mjs`）并连跑 3 次确认稳定。**这是探针侧的自我修正，不是产品缺陷。**

---

## 3. 新缺陷清单

**未发现新缺陷。**

三条观察（不计为缺陷）：

| # | 观察 | 证据 / 影响 |
| --- | --- | --- |
| O-1 | `verify/custom-audio.test.mjs:401` 的卫生断言依赖 `audio/` **全局为空** —— 其它套件/探针（包括本人与 reviewer 的）留下的文件会让它报 69/70，看起来像产品回归 | §2.8-1（实测 69/70 → 清空后 70/70）。建议（不在本轮范围、也不允许我改 `verify/**`）：改为"与本次运行开始时的快照比较"而不是断言目录为空 |
| O-2 | 旧版 `reqcheck.mjs` 仍有 5 条 FAIL | §2.7 表：全部是 rev-4/修复前期望，`reqcheck-rev5.mjs` 才是权威版本（69/0） |
| O-3 | `displayName` 的 `audio.<ext>` 兜底分支仍不可达（宿主对 `'   .wav'` 存的是 `'.wav'`，非空） | §2.5 输出；与 rev-5 的 O3 同一结论，无影响 |

---

## 4. 未证实项（均为继承项，rev-6 未引入新的）

| # | 未证实 | 为什么 | 本轮是否有变化 |
| --- | --- | --- | --- |
| U1 | `::picker(select)` 的真实渲染：内容区是否恰好 3 整行、第 4 行才滚动；`content-box` 是否让弹层比选择框宽约 10px（前一轮 O4） | 沙箱禁命名管道 → Chromium Mojo FATAL（`platform_channel.cc:183` 0x5），Edge 153 无法驱动；UA 样式表非明文（对照串也找不到） | 无变化（rev-6 未动 CSS） |
| U2 | UA 给 `::picker(select)` 的 `box-sizing` 究竟是否 `border-box` | 同上 | 无变化；但 rev-5 起作者规则显式 `content-box`，结论已不依赖该假设 |
| U3 | 载体在 Node 默认 `requestTimeout`（300 s）处断开"未超上限的停滞上传"的实际行为（rev-5 的 N1） | 需等 5 分钟并观测载体内部；本轮只读源码（`dsh-host-webserver` 未覆写超时） | 无变化（rev-6 未动该路径，CHANGELOG 已把 N1 记为"接受为残留 low"） |

N3 与 R-RESID 本身**不需要浏览器**（它们是校验层/数据层行为），因此本轮两处收口都是**完全证实**，没有留下未证实子项。

---

## 5. 证据强度自评

| 结论 | 强度 | 说明 |
| --- | --- | --- |
| N3 ①（schema 拒绝大写 roster id） | **硬** | 用真实 `@deepseek-ai/schemastery` 对完整 namespace 对象做校验，含正向（小写通过）、反向（非 uuid 拒绝）与"合法 id + 任意名接受"的边界 |
| N3 ②（浏览器半丢弃条目） | **硬** | 直接读渲染出的 `<option>` 序列 + `diagnostics.custom()` 长度，并有"小写孪生保留"的对照 |
| N3 ③（tone 回落且零请求） | **硬** | 计数器 + `lastTone` + **真实路由请求数组为空**三重证据；对照 rev-5 的 404 死选项记录 |
| N3 ④（小写路径无回归） | **硬** | 真实 HTTP 200 + 一次 decode + 一个 buffer source + 无失败计数；导入链路另有 probe-7/16 覆盖 |
| R-RESID | **硬** | 4 种空白/控制输入逐条断言"标签 = id"，并加"任何标签非空"的集合不变量；宿主侧 trim 正向实测 |
| 全量回归数字 | **硬** | 一条脚本跑完并归档，原始输出可逐行复核；哈希前后一致 |
| 新旧探针差异解释 | **硬（有据）** | 旧 `reqcheck.mjs` 的 5 条失败逐条给出其硬编码期望与现值的对照 |

**边界**：本轮只判定 rev-6 的两处收紧与回归，不重开 rev-5 的结论（D1/F1/D2/D3/D4/F5/F6/R4-CAP/R4-RACE 见 `docs/rev5-复验.md`）；未改 `lib/**`、`verify/**`；`audio/` 目录在每次运行前后均为 0 文件；对孤儿文件的清理理由已写在 §2.8-1（用户设置文档无 `custom` 引用）。
