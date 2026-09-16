# rev-4「导入自定义音频」独立对抗性验证

> 独立验证者：本次验证由**独立探针**完成，未 import `verify/_harness.mjs`，未修改 `lib/**` 与 `verify/**`。
> 被测文件哈希（运行前后一致，`verify-independent/_raw/rev4-probe-*.txt` 头部均有记录）：
>
> - `lib/index.js` sha256 `a3df98244e13a7acc0aa71349daf6fc23e799adae19c3b642337256288faa301`
> - `lib/client.js` sha256 `a4e452380184c0fb3ec4f4094b18d2516b11b769a18560de29fb23562d67383b`
>
> 环境：Windows 10.0.26100 / PowerShell 5.1 / node v24.21.0 / 工作区 `<workspace>`。
>
> **文件归属**：`verify-independent/` 下同时存在另一组并行探针（`probe-*-r4-*.mjs`、`kit/rev4.mjs`、`kit/cdp.mjs`、`run-r4.ps1`、`_raw/ind-*.txt`、`docs/rev4-浏览器半独立验证.md`），由另一位验证者维护，**不属于本次验证**。本报告的每一条结论只来自 `kit/rev4-kit.mjs` + `probe-{7,8,9,10}-*.mjs` + `_raw/rev4-probe-*.txt`。

## 0. 结论摘要

| 探针 | 断言 | 结果 |
| --- | --- | --- |
| `probe-7-host-audio-http.mjs`（宿主路由，真实 http + 裸 socket） | 184 | **180 通过 / 4 失败** |
| `probe-8-client-roster-render.mjs`（schema + 名册 + 渲染 + CSS + 导入/移除） | 118 | 118 通过 / 0 失败 |
| `probe-9-client-playback.mjs`（播放失败路径 + 并发 + 缓存 + 增益） | 66 | 66 通过 / 0 失败 |
| `probe-10-startup-resilience.mjs`（4 种 ctx 形状 + 敌意 ctx） | 87 | 87 通过 / 0 失败 |
| 合计 | 455 | **451 通过 / 4 失败** |

**全部 4 条失败指向同一个缺陷 D1**（超限上传的 `413` 永远不会到达客户端）及其派生的 3 条断言。
另有 3 条 LOW 缺陷与 9 条观察项；「未证实项」见 §5，其中包含**必须真实浏览器**才能确认的滚动条外观与真实 WebAudio 行为。

原始输出归档：`dsh-approval-chime/verify-independent/_raw/rev4-probe-{7,8,9,10}-*.txt`（每次运行覆盖写入，日志头部含 ISO 时间戳、cwd、两个被测量的 sha256）。

复现命令（在工作区根目录执行）：

```powershell
node dsh-approval-chime/verify-independent/probe-7-host-audio-http.mjs
node dsh-approval-chime/verify-independent/probe-8-client-roster-render.mjs
node dsh-approval-chime/verify-independent/probe-9-client-playback.mjs
node dsh-approval-chime/verify-independent/probe-10-startup-resilience.mjs
```

## 1. 探针与桩（自建，独立于 verify/）

| 文件 | 作用 | 关键独立性 |
| --- | --- | --- |
| `kit/rev4-kit.mjs` | 自建桩：tee 日志、unhandledRejection/uncaughtException 记录、mini React（`useState/useEffect/useRef` + 同步重渲染）、假 DOM（捕获注入的 `<style>`）、假 AudioContext（记录真实音频图）、假 settings scope、`vm` 载入 `lib/client.js` | 只用 node 内置模块；**没有任何 `verify/**` 的 import** |
| `probe-7` | 把插件注册的 handler 挂到**真实 `node:http` 服务器**上，用**裸 socket** 发原始请求 | 派发逻辑逐字复刻真实路由匹配：`dsh-host-webserver/lib/index.js:231`（`new URL(req.url).pathname`，不解码）+ `:327`（`pathname === prefix \|\| startsWith(prefix + '/')`）。插件自带的 `verify/custom-audio.test.mjs` 用 `Readable` + 手写 res 对象驱动 handler，因此**看不到 socket 层事实**（这正是 D1 藏身之处） |
| `probe-8` | 真 schemastery + 浏览器半渲染树 + CSS 文本 | 渲染断言走真实 `React.createElement` 桩，直接读卡片元素树 |
| `probe-9` | 播放期路径，一律用 `process.on('unhandledRejection')` 兜底 | 断言「不得有未处理 rejection」而不是「看起来没事」 |
| `probe-10` | `apply()` 降级矩阵 | `effect: (cb) => cb()` 桩与 cordis 真实语义一致（`@deepseek-ai/cordis/lib/index.js:1249` `task = this._execute(runner)` 同步执行、`:1261` `throw reason` 同步重抛），因此「register 抛错」会被插件自己的 try/catch 接住这一结论是可测的 |

## 2. 逐条 claim 判定

### 2.1 宿主半

| # | 断言（出处） | 判定 | 证据（探针·raw 行） |
| --- | --- | --- | --- |
| H1 | 注册唯一 prefix 路由 `/api/approval-chime/audio`，`webServer` 为可选注入 | PASS | probe-7 §1：`route count=1`、`kind=prefix`、`path=/api/approval-chime/audio`、info 行存在；probe-10「a working webServer」同样是 1 条 |
| H2 | `POST` 落盘 `<插件目录>/audio/<uuid>.<ext>`，id 为 uuid | PASS | probe-7 §2：`{"ok":true,"id":"7cf3ca4e-…","name":"我的铃声.mp3","ext":"mp3","type":"audio/mpeg","bytes":22}`；文件存在且 sha 与上传字节一致 |
| H3 | 扩展名白名单，否则 `415` | PASS | probe-7 §4：`a.mp3.exe`/`a`/空/`.mp3`/`a.`/`a.mp3.`/`payload.mp3%20`/`notes.txt`/`archive.zip` → 415 且错误串列出白名单；`../../evil.mp3`、`..\..\evil.mp3`、`/etc/passwd.mp3`、`a.MP3`、`a.Mp3` → 200 且显示名被清洗 |
| H4a | 5 MB 上限：**恰好等于上限**应通过 | PASS | probe-7 §5：content-length 与 chunked 两种写法都 `200`，盘上文件恰好 5 242 880 B，GET 回来 sha 一致 |
| H4b | 5 MB 上限：超过应 `413`、且不写盘、不残留 | **FAIL（D1）** | 拒绝成立、盘上无残留（`no residue after the oversized uploads — actual=[]`），但 **413 到不了客户端**：客户端 `receivedBytes=0`；服务端 `{"aborted":true,"complete":false,"bytesRead":5243009,"writableEnded":true,"bytesWritten":0}` |
| H5 | id 必须是 uuid，路径形状的 id 到不了文件系统 | PASS | probe-7 §3：25 条用例全部 `404` + 插件 JSON（`unknown audio id`/`audio not found`），无一落到服务器兜底；`package.json`、`lib/client.js` 等 canary 哈希不变。唯一离开路由的是被 `URL()` 归一化掉的 `../../` 写法（`/api/package.json`），由服务器兜底 404，**从未进入 handler** |
| H6 | `GET|HEAD|DELETE` 齐备，HEAD 无 body 且 headers 一致，缺失删除幂等 | PASS | probe-7 §2/§6：GET `content-length=22 / audio/mpeg / no-store`；HEAD 线上 0 body 字节、`content-length`/`content-type` 与 GET 相同；DELETE 二次 `removed=false`；HEAD 404 也无 body |
| H7 | 文件名走 `x-chime-name`（URI 编码），显示名清洗且有界 | PASS | probe-7 §4/§4b：`%00a%01.mp3` → 显示名 `a.mp3`（控制字符被剥离）；5000 字符名 → 恰好 120；大小写 header 均可；缺 header → 415 |
| H8 | schema：`tone` = 3 个内置 ∪ `custom:<uuid>`，仍拒绝任意字符串；新增 `custom` 数组 | PASS | probe-8 §1：18 条 accept/refuse 用例；`garbage`/`Chime`/` chime `/`custom:`/`custom:not-a-uuid`/`custom:../../evil`/`custom:<uuid>x`/`custom:<uuid>\n` 全部被拒（`$` 锚点未被换行绕过） |

### 2.2 浏览器半

| # | 断言 | 判定 | 证据 |
| --- | --- | --- | --- |
| C1 | 导入按钮 → `POST` → 名册**追加**（第一个导入排第一） | PASS | probe-8 §5：写入 `[{"id":"1111…","name":"uploaded.mp3"}]` → 第二次 `[{"1111…"},{"aaaa…"}]`（顺序保持）；渲染顺序 `[custom:1111…, custom:aaaa…, chime, bell, beep]`；请求形状 `POST /api/approval-chime/audio`、`credentials: same-origin`、`x-chime-name=encodeURIComponent(name)`、`body===File` |
| C2 | 导入后立即选中并试听 | PASS | probe-8 §5：`set('tone','custom:1111…')`；`stats().previews===1` |
| C3 | 选中导入音色时出现「移除」，删文件 + 出名册；移除选中项回落到默认 | PASS | probe-8 §3/§6：按钮序列 `导入音频 | 移除 | 试听 | 恢复默认`；`DELETE /api/approval-chime/audio/<id>` + `credentials: same-origin`；`custom=[{bbbb…}]`、`tone='chime'` |
| C4 | `custom` 选项渲染在内置音色**之前** | PASS | probe-8 §2/§3：`toneOptions()` 与渲染出的 `<option>` 值完全一致，导入项在前 |
| C5 | 弹出列表 3 行后滚动（`::picker(select)` 的 `max-height`，落在 `@supports (appearance:base-select)` 内） | PASS（文本与算式）；外观见 §5-U1 | probe-8 §4：`max-height:92px`、`overflow-y:auto`、`select{appearance:base-select;}` 均在 `@supports` 块体内；`max-height` 全表仅出现 1 次且无泄漏；行高算式自洽（`line-height:20px` + `padding:4px 9px` → 28px/行；`3×28+8=92`，`::picker` 的 `padding:4px`）；`diagnostics.toneRows===3` |
| C6 | 名册畸形项/重复 id/超过 50 项被处理 | PASS | probe-8 §2：`null`/字符串/非 uuid/重复 id 被丢弃，缺 name 回落到 id；60 项 → 恰好 50 项且保留前 50 |
| C7 | `tone` 指向已删除 id 时卡片仍渲染一行（不是空白） | PASS | probe-8 §3：`[custom:aaaa…, custom:1111…, chime, bell, beep]`，缺失行标签 `（文件缺失）`，`select.value` 命中某个 option；同时给出「移除」以便清理 |
| C8 | 播放失败只增 `suppressedFailed` + `lastError`，不得有未处理 rejection，且不影响内置音色 | PASS | probe-9 §2/§2b：404 / decode reject / decode 同步 throw / 无 `fetch` / fetch reject / `undefined` 响应 六种失败各 `suppressedFailed+1`、`previews` 不涨、`lastError` 有内容；`unhandledRejection` 计数全程 0；切回 `bell` 后仍产生 2 个振荡器、`suppressedFailed` 不再增长、`audio.state` 仍为 `running` |
| C9 | 样本 fetch+decode 一次后缓存，经**同一个主增益**播放 | PASS | probe-9 §1/§3：`gain.value===0.3`（volume 50 × 0.6）、source→master gain→destination；同一 id 反复播放 fetch 仍为 1、decode 仍为 1；不同 id 各 1 次、buffer 互不串（16 B vs 64 B） |
| C10 | 同一 id 并发播放只 fetch 一次 | PASS | probe-9 §3：同一 tick 两次 `preview()` → fetch 1 次、decode 1 次、2 个 source 共享同一 buffer 对象、计数 2 |
| C11 | 审批触发（非试听按钮）也会播放导入音色 | PASS | probe-9 §4：`triggers=1`、`previews=0`、`gain=0.6`（volume 100） |

### 2.3 启动降级

| # | 断言 | 判定 | 证据 |
| --- | --- | --- | --- |
| S1 | 无 `webServer` → 只警告 | PASS | probe-10：`web server unavailable — imported audio cannot be stored; built-in tones still work`，routes=0，errors=0 |
| S2 | `webServer.register` 抛错 → `apply()` 不抛且只警告 | PASS | probe-10 §2：`audio route registration failed: duplicate route`（经 `ctx.get` 与经 `ctx.inject` 两条路径各测一次） |
| S3 | `ctx.get` 抛错 → 不抛且只警告 | PASS | probe-10 §3：`get` 抛错 + `inject` 可用 → 仍注册成功（1 条路由）；`get` 抛错 + 无 `inject` + `ctx.webServer` 存在 → 仍注册成功；`get` 抛错 + 无回退 → 仅警告；`get` 为**会抛的 getter** → 仅警告 |
| S4 | `ctx.inject` 抛错 → 不抛且只警告 | PASS | probe-10 §4：`audio route skipped: inject exploded`；`inject` 为会抛的 getter 同理；`inject` 从不回调也不抛 |
| S5 | 敌意形状 | PASS | probe-10 §5：`apply(null)`、`apply(undefined)`、**每个属性 getter 都抛的 Proxy**、`logger.warn` 抛错、`logger` getter 抛错、完全无 logger（回落 console.warn，实测各 2 行）、`settings.register` 抛错、`settings.describe()` 抛错 —— 整个探针共 **24 种 ctx 形状**（其中 6 种连 logger 都没有），**无一抛出、无一条 error 级日志** |

## 3. 缺陷清单

### D1 · MEDIUM · `lib/index.js:367-383` + `:414-420` — 超限上传的 `413` 永远不会到达客户端

**现象**：`readUpload()` 在超过 5 MB 时 `reject()` 后立刻 `req.destroy()`（`:373-377`），把 socket 拆掉；随后 `receiveAudio()` 的 catch 调 `respond(res, 413, …)`（`:418`），而 `respond()`（`:331-341`）只能写进一个已经销毁的 socket——**一个字节也发不出去**。

**原始证据**（probe-7 §5，`_raw/rev4-probe-7-host-audio-http.txt`）：

```
RAW POST MAX+1 run 1 socket:  why=close error=none receivedBytes=0 elapsedMs=12
RAW POST MAX+1 run 1 server-side record:
| [{"method":"POST","rawPath":"/api/approval-chime/audio","aborted":true,"complete":false,
    "bytesRead":5243009,"writableEnded":true,"bytesWritten":0}]
RAW paced chunked overflow socket outcome:
| why=close writeError=none framesSent=… bytesReceived=0
RAW paced chunked overflow server-side record:
| res.writableEnded=true socket.bytesWritten=0 req.complete=false req.aborted=true bytesRead=…
FAIL  an oversized POST is refused with a readable 413 — statuses=,, bytesReceived=0,0,0
FAIL  a streamed overflow yields a readable 413 to the client — received="" writeError=ECONNRESET
FAIL  a SLOW streamed overflow still yields a readable 413 (not a race) — received=0B writeError=none
FAIL  every answer the handler produced actually reached the socket —
      6 response(s) wrote 0 bytes: POST /api/approval-chime/audio ×6
```

服务端 `res.writableEnded=true` 且 `socket.bytesWritten=0`，说明响应对象「结束」了但**没有任何字节上线**；客户端侧三种写法（content-length 单次写、chunked 快写、chunked 慢写 4 ms/帧）全部收不到状态行——不是竞态。对照：同一台服务器上 `415`（缺 `x-chime-name`，1 MB body）能正常送达（`receivedBytes=321`，`socket=complete/no-error`），说明只有「destroy 后再 respond」这一条路径坏了。

**最小复现**：对运行中的宿主 `POST /api/approval-chime/audio`，带 `x-chime-name: over.wav` 与 `Content-Length: 5242881` 的 body，任意客户端观察结果：连接被关闭/重置，**收不到 413**（等价于 `curl --data-binary @5242881B.bin -H "x-chime-name: over.wav" -v http://127.0.0.1:<port>/api/approval-chime/audio`）。或直接跑 `probe-7` §5。

**影响与缓解**：
- 文档/变更记录承诺的「超限 → 413」这一**对外契约不可观测**；任何客户端（未来的导入器、脚本、真实浏览器的 `fetch`）只能看到「网络错误」，无法区分「文件太大」与「宿主崩了」。
- 安全性未受损：不写盘、不残留（实测 `audio/` 与基线一致，`no residue` / `back to its baseline` 两条均 PASS）；拒绝发生在累计读入超过 5 MB 之后，是「拒绝而非截断」，`readUpload` 从不写文件。
- 缓解：浏览器半在 `lib/client.js:1182` 用同样的 5 MB 常量先做本地拒绝，因此**自带 UI 走不到这条路径**——这也是现有自测全绿的原因。
- 修法提示（不在本次范围内）：先 `res.end(413 body)`/`res.writeHead` 并等待 flush 后再 `req.destroy()`（或 `req.pause()` + `connection: close`），而不是先 destroy。

### D2 · LOW · `lib/index.js:87` ↔ `:352` — uuid 大小写不对称，大写 id 是对不上的「死选项」

`ID_PATTERN` 带 `i` 标志（`:87`）因此**接受**大写 uuid；但落盘名来自 `randomUUID()`（小写），而查找用大小写敏感的 `entry.startsWith(`${id}.`)`（`:352`）→ 大写 id 一律 `404 audio not found`。浏览器半同样接受大写（`lib/client.js:96` 的 `CUSTOM_ID` 带 `i`、`:231` `normalizeTone`），因此**名册里的大写条目会被渲染成一个必然失败的选项**。

**原始证据**：

```
probe-7:  RAW uppercase uuid of an EXISTING file: HTTP/1.1 404 Not Found | {"ok":false,"error":"audio not found"}
          PASS  uppercase uuid of an EXISTING file -> 404
probe-8:  PASS  accepts custom:<UPPERCASE uuid> — {"tone":"custom:11111111-…"}
          PASS  malformed/duplicate entries are dropped… — 含 {"id":"AAAAAAAA-BBBB-…","name":"UPPERCASE uuid"}
```

**最小复现**：上传一个文件得到小写 id，然后 `GET /api/approval-chime/audio/<ID 的大写形式>` → 404；或把 `settings.yaml` 的 `custom[0].id` 改成大写，卡片会显示该音色，点试听只增加 `suppressedFailed`。

**可达性**：正常流程永远拿不到大写 id（路由只发小写），只有手改设置文档才会遇到。建议：要么 `ID_PATTERN` 去掉 `i`（配合 `toLowerCase()` 归一化），要么 `findAudioFile` 改成大小写不敏感匹配。

### D3 · LOW · `lib/index.js:344-357`（尤其是 `:352`）— 查找是「前缀扫描」而不是「精确文件名」，可能拿到/删掉错误的文件

`const match = names.find((entry) => entry.startsWith(`${id}.`))`：只要 `audio/` 里存在任何 `<id>.<别的后缀>` 的文件，就会**先命中它**（`readdir` 顺序）。实测把 `<id>.aaa` 放在真文件 `<id>.mp3` 旁边后：

```
probe-7:  · stray "<id>.aaa" planted next to the real "<id>.mp3":
            GET /<id> -> 200, content-type=application/octet-stream, body="STRAY-SHADOW"
          · after DELETE /<id> with the stray present:
            removed=true, left on disk=["6d02eda3-d150-46b5-90fd-cd4c2b0829a5.mp3"]
```

即 `GET` 返回了**非音频文件**（`application/octet-stream`，浏览器解码失败），`DELETE` 删掉了杂散文件却把真正的音频留在盘上（名册条目已被移除 → 变成孤儿文件）。

**最小复现**：`copy nul "dsh-approval-chime\audio\<某个已上传 id>.aaa"`，随后 `GET /api/approval-chime/audio/<id>` 得到 `application/octet-stream`；`DELETE` 后真 `.mp3` 仍在。

**可达性**：杂散文件无法经 HTTP 写入（扩展名白名单挡住了），只能来自其它工具/手工拷贝/历史残留，因此不是远程可利用漏洞；但「删除只删一个、GET 可能拿错」这一行为与「文件落在 `<uuid>.<ext>`」的模型不一致。建议按「`<id>` 精确匹配 uuid 后取唯一候选」或在多候选时选择白名单扩展名。

### D4 · LOW · `lib/index.js:399` 与 `lib/client.js:654` — 显示名只有一处截断，名册里的名字无上限

上传响应里的显示名被截到 120 字符（`lib/index.js:399`），但：

- schema 对 `custom[].name` 无长度约束（`lib/index.js:282`，实测 5000 项 × 1000 字符 / 单字段 20 万字符都通过校验）；
- 浏览器半 `readRoster` 原样透传名字（`lib/client.js:654`），实测 20 万字符的名称**不截断**，会成为 20 万字符的 `<option>` 文本；
- 卡片上限只管条数（`CUSTOM_LIMIT=50`），不管单条长度。

**原始证据**：`probe-8: PASS a 200k-character display name is NOT bounded on the client — actual=200000 expected=200000`；`PASS the schema accepts an unbounded roster (5000 entries, 1000-char names) — 5000 entries kept`。

**最小复现**：把 `settings.yaml` 里 `approval-chime.custom[0].name` 换成 20 万个字符 → 卡片渲染出超长选项文本（无崩溃，纯布局与观感破坏）。

**可达性**：正常流程写进名册的名字来自宿主响应（≤120 字符），只有手改设置文档才会超长。建议在 `readRoster` 里也做一次 `slice(0, 120)`。

## 4. 观察项（非缺陷，但值得知道）

| # | 观察 | 证据 |
| --- | --- | --- |
| O1 | 重复的 `x-chime-name` 头被 Node 合并，显示名变成 `"a.mp3, b.mp3"`（仍 200，文件正常落盘） | probe-7 §4b |
| O2 | 非法百分号编码不被拒绝：`%ZZ.mp3` → 200，显示名**原样**保留 `%ZZ.mp3`（`decodeURIComponent` 失败时回落原文，`lib/index.js:389-392`） | probe-7 §4 |
| O3 | `POST /audio/`（尾斜杠）、`//<id>`、`///<id>` 都被当成合法写法（`rest` 先 `slice` 再 `replace(/^\/+/,'')`）；`?query` 被忽略 | probe-7 §3/§6 |
| O4 | `DELETE` 空 id（裸路由 / 尾斜杠 / 仅斜杠）返回 **405** 而不是 404/200；405 响应没有 `Allow` 头 | probe-7 §6 |
| O5 | 缺 `x-chime-name` 时**先判扩展名再读 body**：1 MB body 的请求收到干净的 415（线上仅 321 B，连接未被 reset）——与 D1 形成对照 | probe-7 §4b |
| O6 | schema 的 `custom[].name` 实际是**可选**字段（`{id, name?}`，schemastery 对象成员默认 optional），与文档写的 `[{id,name}]` 有出入；浏览器半对缺失 name 回落到 id | probe-8 §1/§2 |
| O7 | `id, name` 之外的字段被 schema 丢弃（`custom` 数组元素是封闭对象） | probe-8 §1 |
| O8 | 导入音色失败时卡片只显示 `mutedFailed`「音频节点创建失败 ×N」，而真实原因只写在 `lastError`；`describeAudio` 仅在 `audio.state==='error'` 时展示 `lastError`（`lib/client.js:1016-1022`），因此 fetch 404 这类失败在卡片上看不到原因（控制台 `__DSH_APPROVAL_CHIME__.audio().lastError` 可见） | probe-9 §2 + 代码 |
| O9 | **同一次渲染内并发两次导入会丢一条**：两个 handler 捕获同一份导入前名册，各自 `roster.slice().push(entry)` 后写回 → 后写覆盖前写（实测两次写入 `[["race-2.mp3/aaaa…"],["race-2.mp3/aaaa…"]]`，第一条丢失，但两个文件都已上传到宿主 → 孤儿文件）。**UI 不可达**（导入中按钮禁用 `lib/client.js:1318` + 文件对话框是模态的），属于 read-modify-write 的健壮性缺口，不作为缺陷计 | probe-8 §5b |

## 5. 未证实项（明确**不**计入通过）

| # | 未证实项 | 为什么这次证实不了 | 已证实到什么程度 |
| --- | --- | --- | --- |
| U1 | **弹出列表"正好 3 行后出现滚动条"的真实观感**（滚动条是否出现、是否遮挡、主题下是否协调） | 需要真实浏览器 + `appearance:base-select`（Chrome/Edge ≥ 135）。**本次验证没有接入任何浏览器**（没有 CDP、没有 GUI 会话），所以这一项在本次仪器下不可测；同目录那份并行的浏览器探针不属于本次验证，其结论也不由本报告背书 | 只证实了 CSS 文本与算式：规则确实位于 `@supports` 块内、`max-height` 全表仅 1 处、行高 28px 自洽、`3×28+8=92`；并核对了宿主 CSS（`dsh-web-frontend/dist/assets/index-DPX2bQLO.css`、`vendor-BNsW4eBh.css`）：**没有**全局 `*{box-sizing:border-box}` 复位、**没有**任何 `select/option/::picker` / `appearance` 规则（唯一相关的是 `button,input,select,textarea{font-family:inherit}`，被 `.dacCard select{font:inherit}` 覆盖），所以 `::picker` 保持初始 `content-box`，92px = 84px 行 + 8px 内边距**在算术上**正好 3 行。若将来宿主引入匹配 `::picker(select)` 的 `box-sizing:border-box`，92px 会变成内容区 82px（第 3 行被切 2px）——当前不成立 |
| U2 | **真实 `dsh web` 进程 + 真实 URL 的端到端** | 本次没有重启宿主、没有浏览器、没有走真实 profile | 用真实 `node:http` 服务器 + 逐字复刻的真实路由匹配逻辑验证了 handler 行为；`lib/index.js` 哈希与仓库一致 |
| U3 | **真实 WebAudio 行为**（真实 mp3 解码、自动播放策略、真实 `AudioContext` 时序） | 需要真实浏览器音频栈 | 用记录音频图的假 AudioContext 证实了图连接与增益值、失败计数与缓存语义；真实解码/策略未测 |
| U4 | **真实浏览器 `fetch` 上传 5 MB 文件的时序**（是否也会被 RST、`fetch` 抛什么） | 需要真实浏览器 | 用裸 socket 复现了三种写法（content-length / chunked 快 / chunked 慢），**三种都收不到 413**；浏览器大概率表现为 `TypeError: Failed to fetch`，但未实测 |
| U5 | **真实 cordis 中 `webServer` 在 `apply()` 时刻是否已激活**（决定走 `ctx.get` 还是延后的 `ctx.inject` 分支） | 需要真实宿主启动 | 两条分支都用桩覆盖了（都能注册成功或正确降级）；只读了 cordis 源码确认 `effect()` 同步执行/同步重抛（`lib/index.js:1249/1261`） |
| U6 | **`inject` 延迟回调 + `server.register` 抛错** 的组合 | 只有「effect 延迟执行」的合成 ctx 能构造，真实 cordis 的 `effect` 是同步的 | probe-10 §6 记录：`apply()` 不抛，但被延后调用的回调若抛错会逃出插件保护；已注明该形状在真实宿主不可达 |
| U7 | 真实浏览器里 `x-chime-name` 头对超长/非 ASCII 文件名的实际表现 | 需要真实浏览器 | 用裸 socket 验证了 5000 字符名（响应名截断 120）与 `%E6%88%91…`（中文名往返一致）在协议层可用 |

## 6. 原始输出归档

| 文件 | 内容 |
| --- | --- |
| `verify-independent/_raw/rev4-probe-7-host-audio-http.txt` | 宿主路由全部请求/响应原文（含 25 条 id 用例、22 条文件名用例、体积上限三种写法、方法矩阵、服务端 `bytesWritten` 记录、残留与 canary 校验） |
| `verify-independent/_raw/rev4-probe-8-client-roster-render.txt` | schema 27 条判定、名册规范化、渲染树、CSS 断言、导入/移除流程、并发导入丢条目观察 |
| `verify-independent/_raw/rev4-probe-9-client-playback.txt` | 六种播放失败路径、内置音色不受影响、并发只 fetch 一次、buffer 复用、审批触发、缓存失效 |
| `verify-independent/_raw/rev4-probe-10-startup-resilience.txt` | 24 种 ctx 形状的 `apply()` 结果、warn/info/error 行、正对照（真实 webServer → 1 条 prefix 路由） |

每个日志头部含：ISO 时间戳、cwd、`node --version`、被测文件 sha256。日志由探针自己**覆盖写入**（不是追加），因此文件即一次运行的完整证据。

## 7. 为什么自带的 `verify/custom-audio.test.mjs` 看不到 D1

该测试用 `Readable.from(body)` 造请求、用手写 `fakeResponse()` 收响应（`verify/custom-audio.test.mjs:63-83`），断言 `fakeResponse.state.status === 413`——它测的是「handler 决定回 413」而不是「413 上了线」。真实 socket 上 `req.destroy()` 先于 `respond()` 生效，所以结论在两种仪器下相反。这不是说自测有错，而是它无法覆盖「响应是否真的送达」这一类事实；本报告的 probe-7 就是为补这一类事实而写的。

---

## 8. 校订（rev-5 / rev-6 之后追加；上文原始结论保留不动）

- **§5 U1 的推断已不成立**：上文据「宿主 CSS 里没有匹配 `::picker(select)` 的规则」推出 `::picker` 保持初始
  `content-box`。但 **UA 样式表本身为 `::picker(select)` 声明了 `box-sizing:border-box`**（Chromium `html.css` +
  WHATWG HTML §15.5.16 + CSSWG #10857），于是 rev-4 的 `max-height:92px` 实际内容区只有 `92-8-2=82px`
  ⇒ **默认三个音色打开下拉就已出现滚动条并裁掉第 3 行 2px**。该结论由需求审查轮发现
  （`docs/rev4-需求符合性审查.md` R5-1），本报告当时的「算术上正好 3 行」是错的。
- **rev-5 的修法**：该规则改为显式 `box-sizing:content-box; max-height:84px`（= 3 × 28px），**不再依赖 UA 盒模型**；
  算术与探针复核见 `docs/rev5-复验.md` §1 与 `docs/rev5-需求复审.md`。
- **rev-6**：`custom[].id` 的大小写半边校验已收紧（宿主 schema 与浏览器半同为小写 uuid），
  `docs/rev5-复验.md` §3 的 N3 由此关闭。
- 本报告 §5 的 U4（真实浏览器 `fetch` 上传 5 MB 是否被 RST）在 rev-5 后需重新理解：超限上传现在**先读干再应答**，
  三种裸 socket 写法均已收到可读 413（`docs/rev5-复验.md` §2）。
