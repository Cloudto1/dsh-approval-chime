# rev-4「导入自定义音频」需求符合性审查（任务 t2 · reviewer）

> **一句话结论**：用户的 5 条原话里 **R1 / R2 / R3 / R4 通过**，**R5 部分不达标**——`lib/client.js:988` 的 `max-height:92px` 在 Chromium 的 UA 样式表（`::picker(select){box-sizing:border-box}`）下只有 **82px 内容区**，而 3 个内置选项就有 **84px**：**默认状态（一个文件都没导入）打开音色下拉就会出现滚动条，并裁掉第 3 行 2px**，与「3 个选项时不应滚动、第 4 个起才滚动」不符。因此最终判定为 **需修正**（一行 CSS 即可修好；R1–R4 与导入→选中→播放→移除 主流程可交付）。
>
> 本审查**没有修改任何产品代码**（`lib/**`、`verify/**` 的 SHA-256 与两份报告记录一致，见 §0.2）。我自写了一支与两份报告都无关的探针（`.scratch/reviewer-r5/reqcheck.mjs`，**39 项断言全绿**，含 50 项上限场景），并且**复核了两份验证报告的证据强度**：其中 DSH 报告的 U1 推断（"所以 `::picker` 保持初始 content-box"）**不成立**，这正是 2px 误差能够存活两轮验证的原因（§3）。
>
> ⚠️ **rev-5 更新（任务 t4）**：本文的 R5 判定与 R5-1 / D1 / F1 等缺陷均已在 rev-5 修复，**最终结论改为「可交付」**——见文末**附录 B** 与 `docs/rev5-需求复审.md`。上文保持 rev-4 的冻结记录不变。

---

## 0. 审查对象、取证环境与本次审查的独立性

### 0.1 审查对象与上游材料

| 项 | 值 |
| --- | --- |
| 被测修订 | `lib/client.js` **rev-4 · custom audio**（`REVISION` 常量），`dsh-approval-chime` 包 |
| 被测文件哈希（本审查实测，与两份报告逐字节一致） | `lib/client.js` 66 998 B `A4E452380184C0FB3EC4F4094B18D2516B11B769A18560DE29FB23562D67383B`（mtime 2026-09-15 20:34）<br>`lib/index.js` 22 684 B `A3DF98244E13A7ACC0AA71349DAF6FC23E799ADAE19C3B642337256288FAA301`（mtime 2026-09-15 20:35） |
| 报告 A | `dsh-approval-chime/docs/rev4-独立验证.md`（DSH 路由半；探针 `verify-independent/probe-{7..10}-*.mjs`，455 断言 / 4 失败） |
| 报告 B | `dsh-approval-chime/docs/rev4-浏览器侧独立验证.md`（t1 产出；探针 `probe-{7..13}-r4-*.mjs`，262 断言全绿 + probe-13 记录环境限制） |
| 用户原话来源 | 任务 t2 描述（5 条逐字引用，见 §1） |
| 平台事实来源 | `node_modules/@deepseek-ai/dsh-client-ui-settings/lib/client.js`（DSH 安装里的客户端 bundle；`~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-settings` 是指向它的 junction，字节相同，sha256 `479002D654490D19CBC89ED4582198603EDDF2A62E3D233BBD30748F1BC0D862`） |
| 外部事实来源 | Chromium UA 样式表 `third_party/blink/renderer/core/html/resources/html.css`（main 分支，本文引用其 `select:not(:-internal-list-box)::picker(select)` 规则）；WHATWG HTML Rendering §15.5.16 的 UA 样式表文本；CSSWG issue #10857（该 UA 样式表的提案与讨论） |

### 0.2 本次审查做了什么、没做什么

- **做了**：逐条把 5 条原话折成可检验命题；对照真实代码逐行核对（`文件:行`）；**自写**一支独立探针驱动真实 `lib/client.js`（自带 React hook 运行时、自带 settings-scope 桩、假 DOM/假 WebAudio/假 fetch），在 vm 里实测 DOM 顺序、原生文件选择通路、导入后**无需重新挂载**的选项刷新、3 次导入 + 移除中间项 + 再导入的顺序，以及 CSS 几何；机械化复核两份报告的哈希/时间戳/原始输出/探针来源；用 UA 样式表这一**代码之外的事实**重算了 R5 的盒模型。
- **没做**：没有修改 `lib/**`、`verify/**`、`verify-independent/**`（我的脚本放在仓库外的 `.scratch/reviewer-r5/`）；没有起浏览器（沙箱不允许，见 §4）；没有重复 DSH 报告的 socket 级工作。
- **环境限制（我独立确认过）**：Edge `153.0.4234.32` 存在但 Chromium 无法启动——`verify-independent/_raw/ind-probe-13-browser-launch.log` 里有 `FATAL:mojo\public\cpp\platform\platform_channel.cc:183 Check failed: . : 拒绝访问。 (0x5)`，本会话 `workspace-write` + 审批禁用，无法放开。另一个取证途径也被证否：我用**自己的**两条对照串扫了 348 MB 的 `msedge.dll`（`.scratch/reviewer-r5/scan-dll.mjs`），`::picker(select)` **0 命中**、`input[type=` 只有 2 处密码表单告警文本（非 CSS）→ 与报告 B 的结论一致：**UA 样式表不以明文存放在二进制里**，无法从本机浏览器字节里读出该规则。

---

## 1. 逐条判定总表

| # | 用户原话 | 判定 | 决定性证据 | 证据强度 |
| --- | --- | --- | --- | --- |
| R1 | 「在选择音色的按钮右边加一个导入按钮」 | **PASS** | 音色行子节点顺序实测 `["span.dacLabel","select","input[file].dacFile","button(导入音频)",…]`（我的探针）；代码 `lib/client.js:1285-1360`（行）、`:1289-1305`（select）、`:1307-1313`（隐藏 file input）、`:1314-1326`（导入按钮） | 硬（渲染树 + 源码双证） |
| R2 | 「点击之后可选择用户电脑里的自定义音频文件」 | **PASS** | `<input type="file" accept="audio/*" class="dacFile">`（实测）+ 按钮 `onClick → fileRef.current.click()`（`:1320-1323`）；全卡无拖拽/路径输入（实测 0 处） | 硬（结构+通路）；真实对话框外观需人工 |
| R3 | 「用户加入音频文件之后要在选择框内出现」（无需刷新） | **PASS**（通路级） | 实测：settings 写入触发的 scope 通知 → 卡片 `store` 订阅 → hook#0 状态变更，**同一挂载实例**（`renders=2, effects=1`）后选项即为 `[custom:…, chime, bell, beep]`；平台侧 `dsh-client-ui-settings/lib/client.js:1040-1055`（写入应答 `acceptView`）→ `:990`（mirror 订阅 → derive）→ `:1083-1105`（新快照） | 硬（插件半实测 + 平台源码）；真实 DSH+浏览器端到端待人工 |
| R4 | 「第一个文件放第一个，第二个放第二个，依次类推」 | **PASS** | 追加写入 `:1194-1198`；渲染顺序 `:1155-1159`；移除用 `filter` 保序 `:1209-1211`；实测 3 次导入顺序 = 导入顺序、移除中间项后剩 `[A, C]`、再导入落在末尾 | 硬（实测 + 源码） |
| R5 | 「显示三个选项，当有第四个选项时变成可滚动」 | **PARTIAL / 不达标** | 行高 28px、3 行 84px、`max-height:92px`（`:988`、`:990`）实测；但 UA 样式表把 `::picker(select)` 定为 `box-sizing:border-box` → 内容区只有 `92-8-2=82px` < 84px ⇒ **3 个选项就溢出 2px（滚动条出现、第 3 行被裁 2px）**，第 4 项起才滚动这一点成立 | 几何＝硬（样式表实测）；盒模型＝外部一手资料（Chromium UA CSS / WHATWG / CSSWG），**本机无法起引擎实测** |

**总体：4 条通过、1 条部分不达标。** 「可交付 / 需修正」的结论见 §6。

---

## 2. 逐条证据与判定

### 2.1 R1 「在选择音色的按钮右边加一个导入按钮」

**判定：PASS（DOM 顺序确认在音色控件右侧）。**

`lib/client.js:1285-1360` 是音色那一行（`.dacRow`，`:960` 定义为 `display:flex;gap:10px;flex-wrap:wrap`），子节点按数组顺序渲染，无需任何猜测：

```
tone row children, in DOM order =
["span.dacLabel","select","input[file].dacFile","button(导入音频)","button(试听)","button(恢复默认)"]
```

- 音色选择控件是 `<select>`（`:1289-1305`），不是 `<button>`——用户口语里的"音色的按钮"指的就是它；导入按钮紧跟在它右侧（中间只有一个 `display:none` 的隐藏 `<input type=file>`，`:997` 的 `.dacCard .dacFile{display:none;}`，不占位、不出现在视觉流里）。
- 导入按钮是 select 之后的**第一个**可见 button（`:1314-1326`），在它之后才是「移除」（仅当选中导入音色时出现）／「试听」／「恢复默认」。
- 我的探针断言：`select@1 < import@3`，且 `select+1..import-1` 只有隐藏 file input。

**残余（低，不构成 FAIL）**：该行 `flex-wrap:wrap`，在极窄容器下按钮可能换到下一行（视觉换行，DOM 顺序不变）；这是响应式折行，不是位置错误。

### 2.2 R2 「点击之后可选择用户电脑里的自定义音频文件」

**判定：PASS（确实是原生文件选择，不是拖拽或路径输入）。**

| 事实 | 证据 |
| --- | --- |
| 存在原生 `input[type=file]` | 实测 `{"type":"file","accept":"audio/*","className":"dacFile"}`，源码 `lib/client.js:1307-1313` |
| 带扩展名/类型过滤 | `accept: 'audio/*'`（`:1309`）；DSH 再按扩展名白名单二次校验（`lib/index.js:74-84`、`:406-413`，不合法 → 415） |
| 点击按钮才打开选择器 | `onClick: () => fileRef.current.click()`（`:1320-1323`）；我的探针把 `input.click` 换成计数器后测得 `click() calls=1` |
| 不是拖拽/路径输入 | 全卡 `onDrop/onDragOver/text input` 命中 0 处（实测）；无任何路径输入框 |
| 选同一个文件两次仍然有效 | `:1180` 把 `input.value=''` 复位后再读 `files[0]` |
| 5 MB 上限在浏览器侧先拒绝 | `:1182-1185`（`file.size > MAX_AUDIO_BYTES` → 卡片提示"文件超过 5 MB 上限"，不发请求；报告 B 的 probe-7 shape F 实测请求数 0） |

**残余（需人工）**：`accept` 只是过滤器，用户在系统对话框里切到"所有文件"仍可选 `.txt`——此时 DSH 415，卡片显示「导入失败: unsupported audio type …」（有反馈、不静默）。真实对话框能否弹出属 §4 的人工项（headless 环境无法验证，`display:none` + 程序化 `click()` 是现代浏览器通行写法，但需要一次真人确认）。

### 2.3 R3 「用户加入音频文件之后要在选择框内出现」（无需刷新）

**判定：PASS（通路级）。** 走的是"**持久层写入 → 快照广播 → 卡片重渲染**"，不是本地乐观状态，也不需要刷新页面。

通路（每一步都有 `文件:行` 或实测）：

1. 上传成功 → `lib/client.js:1192-1200`：`roster.slice()` 追加后 `commit({ custom: next, tone: 'custom:<id>' })`，随后 `playPreview`。
2. `commit`（`:1079-1103`）把每个字段串成 `scope.set(field, value)` 链（`:1087-1092`）。
3. 平台侧写入（`@deepseek-ai/dsh-client-ui-settings/lib/client.js`）：
   - `SettingsScopeController.set` → `mutate`（`:1015-1021`、`:1040-1055`）→ `ctx.remote.settings.mutate(ns, ops, revision)`；
   - 应答 ok 时 **`this.mirror.acceptView(response.value)`（`:1053`）**；
   - `acceptView`（`:1265-1278`）把该命名空间的新视图 `store.set(...)` 进镜像 → 镜像订阅者被通知；
   - 每个绑定 scope 在构造时就订阅了镜像：`mirror.subscribe(() => this.derive())`（`:990`），`derive()`（`:1083-1105`）把新的 `user/value/revision` 写进 scope 自己的 store → **scope 订阅者被通知**。
   - 另有一条独立刷新路径：DSH 转发 `settings/document-updated` 时镜像整体重读（该包 README.md:54 / README.zh.md:54），即使写应答折叠失败也会补上。
4. 插件侧：`applyInner` 里 `scope.subscribe(() => publish())`（`lib/client.js:1477-1493`）→ `publish()`（`:796-830`）重新 `readScopeSnapshot()` 折叠出 `custom` 选项 → `store.update` 发布新快照。
5. 卡片侧：`React.useEffect` 里 `store.subscribe(() => setSnapshot(store.getSnapshot()))`（`:1051-1060`）→ 重渲染。选项完全来自快照（`:1155-1162`），没有本地缓存需要失效。
6. 面板可见性：卡片在 `snapshot.available !== true` 时渲染 `null`（`:1062`），而 scope 状态在写入前后都保持 `ready`（`derive()` 只在命名空间缺失时才置 `unavailable`），因此**导入过程中卡片不会先消失再出现**。

**我的实测输出**（不同于 t1 的做法：我给 scope 桩加了"通知深度"标记，能区分"状态变化来自写入广播"还是"来自我手动重渲染"）：

```
[PASS] import #1 appears in the select with no re-mount (fresh options)
       — ["custom:1111…","chime","bell","beep"]
[PASS] the settings write pushed a new snapshot into the mounted card
       (hook-0 change during a scope notification)
       — [{"hook":3,"duringScopeNotify":false},{"hook":3,"duringScopeNotify":false},
          {"hook":0,"duringScopeNotify":false},{"hook":0,"duringScopeNotify":false},
          {"hook":0,"duringScopeNotify":true},{"hook":0,"duringScopeNotify":true}]
[PASS] the store push came from the scope subscription, not from a re-mount
       — renders=2 effectsRun=[5]
```

两条 `duringScopeNotify:true` 的 hook#0 变更正是 `set('custom')` 与 `set('tone')` 两次写入广播的结果。

**未证实（§4-5）**：真实 `dsh web` DSH 进程 + 真实浏览器里的端到端（写入落盘、广播、UI 刷新）。平台传输层我读到的是**实际被服务的 bundle 字节**（junction 同哈希），但"真实进程里从点击到看见"这一步仍需人工确认。

### 2.4 R4 「用户添加的文件要放在选择框第一个，第二个放第二个，依次类推」

**判定：PASS（导入顺序 = 渲染顺序，且移除后其余项相对顺序不变）。**

| 环节 | 代码 | 我的实测 |
| --- | --- | --- |
| 导入时**追加**（不是前插） | `:1194-1198` `var next = roster.slice(); next.push(entry);` 注释也写死 "APPENDED, not prepended" | 第 1/2/3 次导入后渲染顺序 = `[custom:A, custom:B, custom:C, chime, bell, beep]`；持久层 `custom` 顺序 = `[A,B,C]` |
| 导入项排在 3 个内置音色**之前** | `:1155-1159`（先 customs），`:1160-1162`（后 built-ins） | 同上，`custom:` 前缀项始终占据前 3 位 |
| 选中态跟随新导入项 | `:1198` 写入 `tone: custom:<id>` | 实测 `select.value === custom:<A>` |
| **移除中间项**后其余项相对顺序不变 | `:1209-1211` `roster.filter(entry => entry.id !== id)` | select 中间项 → 出现「移除」→ 点击后选项为 `[A, C, chime, bell, beep]`，持久层 `[A, C]`；被移除项的文件收到 `DELETE …/<B>`；选中项回落到 `chime` |
| 移除之后**再导入**仍追加在末尾 | 同上（append） | 选项为 `[A, C, D, chime, bell, beep]`（不会跳到最前） |

**上游材料交叉**：报告 A 的 C1/C3、报告 B 的 probe-7 shape E 独立测到同样的顺序（"写入顺序 `[first, second]`"、"两条写入 `[1111…]`→`[1111…, aaaa…]`"）。我这一轮额外覆盖了它们都没测的两点：**3 项以上移除中间项**与**移除后再导入**。

**残余风险（低，见 §5-R4RACE 与 §5 其他观察）**：`onImport` 的 `next` 取自**最近一次快照**而不是 scope 的实时值（`:1194`），理论上两次导入并发完成时后写覆盖前写（报告 A 的 O9 实测过）。UI 上不可达（导入中按钮 disabled `:1318` + 系统文件对话框是模态），但仍属 read-modify-write 缺口。另外 50 项上限只在渲染侧截断，第 51 次导入会被显示成"（文件缺失）"（我实测，见 §5）。

### 2.5 R5 「选择框显示三个选项，当有第四个选项时变成可滚动」

**判定：PARTIAL / 不达标**——「第 4 个起可滚动」成立，但「3 个选项时不出现滚动条」不成立。

**几何（我实测解析真实 `injectStyles()` 产物，与两份报告一致）**：

```
.dacCard select::picker(select){ … padding:4px; border:1px solid …;
                                 max-height:92px; overflow-x:hidden; overflow-y:auto; }
.dacCard select option{ border-radius:7px; padding:4px 9px; line-height:20px; }
row = 20 (line-height) + 4 + 4 (option padding) = 28px      ← 3 行 = 84px
picker: padding 4px×2 = 8px，border 1px×2 = 2px
```

**关键的一步（两份报告都留作"未证实"，本轮用代码之外的一手资料定案）**：`.dacCard select::picker(select)` **没有声明 `box-sizing`**，而 UA 样式表为它声明了 `box-sizing: border-box`：

```css
/* Chromium: third_party/blink/renderer/core/html/resources/html.css */
select:not(:-internal-list-box)::picker(select) {
    box-sizing: border-box;                 /* ← 关键 */
    border: 1px solid -internal-auto-base(light-dark(#767676,#858585), currentColor);
    padding: 0; … max-block-size: stretch; overflow: auto; …
}
```

同一份 UA 样式表文本也出现在 WHATWG HTML Rendering §15.5.16（`::picker(select){ box-sizing: border-box; border: 1px solid; padding: 0; … }`），其来源是 CSSWG issue #10857（Joey Arhar 依 Chromium 原型提出的 `<select>` base 外观 UA 样式表）。作者的 `padding:4px` / `border:1px` 是**作者层**声明，按 CSS 层叠优先于 UA 声明，但 `box-sizing` 作者没写，于是保留 UA 的 `border-box`；同理作者层 `max-height:92px` 优于 UA 的 `max-block-size:stretch`（同一逻辑属性组内作者层胜出），所以 92px 的上限确实生效——只是它量的是**边框盒**：

```
可用内容区 = 92 − 8 (padding) − 2 (border) = 82px
3 个选项需要 84px  →  溢出 2px  →  overflow-y:auto 出现滚动条，且第 3 行底部被裁 2px
（若盒模型是 content-box，则内容区 92px ≥ 84px，3 项不滚、4 项才滚 —— 这正是两份报告默认的情形）
```

**我的探针输出**：

```
[PASS] the option geometry was parsed from the real stylesheet — row=28 max-height=92
[PASS] with an empty roster (the default card state) the popup holds exactly 3 options
       — ["chime","bell","beep"]
    · content box if the UA sheet says box-sizing:border-box = 82px → 2.9286 rows
    · content box if box-sizing:content-box = 92px → 3.2857 rows
[PASS] under border-box: with exactly the 3 built-in options the content overflows
       (scrollbar appears) — 3 rows=84 > 82 by 2px
[PASS] under content-box: with 3 options it would NOT scroll and with 4 it would
```

**为什么这算需求不符而不是"纯观感"**：用户描述的正是"3 个选项"这个状态，而**默认状态就是 3 个内置音色**（`custom: []` + `chime/bell/beep`，`:1160-1162`）——用户第一次打开下拉看到的就是带滚动条的 3 行列表，与「有第四个选项时才变成可滚动」直接矛盾。严重度评为 medium（需求符合性门禁）/ 用户可见影响 low（只裁掉 2px 下内边距，文字仍完整）。修正见 §5-R5-1。

**降级路径（不支持 `appearance:base-select` 的浏览器）**：整块 `@supports` 内容被丢弃（`:978-993`），块外没有任何 `max-height/overflow-y`（我的探针：`max-height declarations outside the block = []`）→ 退回原生弹窗，**不会截断任何选项**；但"3 行上限"在这些浏览器里也不存在（原生弹窗按视口自行滚动）。这是合理降级，只是顺带说明该需求的"3 行"语义只在支持 base-select 的浏览器（Chromium ≥ 135 一类）里成立。

---

## 3. 证据强度复核（两份报告）

### 3.1 报告 A：`docs/rev4-独立验证.md`（DSH 路由半）

**是实测的（硬）**

- 真实 `node:http` 服务器 + **裸 socket** 发原始请求，而不是用手写 res 对象驱动 handler：路由注册（route count=1/kind=prefix/path 正确）、POST 落盘 `<uuid>.<ext>` 且 sha 与上传字节一致、扩展名白名单 415、id 必须是 uuid（25 条路径形状全部 404，canary 哈希不变）、GET/HEAD/DELETE 语义、缺失删除幂等、文件名清洗与 120 上限、4 种 ctx 形状 + 敌意 ctx 的 `apply()` 降级矩阵（24 种），断言总数 455、4 条失败。
- **D1 是真实协议层现象**，不是推断：三种客户端写法（content-length 单次写、chunked 快写、chunked 4ms/帧慢写）**都收不到状态行**，服务端记录 `aborted:true, writableEnded:true, bytesWritten:0`；同机对照 415 能正常送达。我复核了代码路径与承诺：`lib/index.js:373-377`（超限 `reject` + `req.destroy()`）→ `:417-419`（catch 里 `respond(res, 413, …)`）→ `:331-341`（`respond` 写进已销毁 socket），以及 `README.md:79` / `CHANGELOG.md:20` 对外承诺"超限 → 413"，确认这是**文档契约与实测不一致**。
- 探针/原始输出可核查：`_raw/rev4-probe-{7,8,9,10}-*.txt` 存在，尾部计数 `180 passed, 4 failed` / `118 passed, 0 failed` / `66 passed, 0 failed` / `87 passed, 0 failed`，与报告摘要一致；日志头带 ISO 时间戳、cwd、`lib/**` 的 sha256，且**与当前文件哈希一致**；mtime 2026-09-15 20:58:23-25，晚于 `lib/**` 的 20:34/20:35。

**是推断/代理的（软）**

- 浏览器侧的 C1–C11 全部经 **mini React 桩 + 假 AudioContext + 假 DOM**：断言的是"插件构建的元素树/音频图/scope 写入"，不是真实 React/引擎行为。作为**插件逻辑**证据是充分的（顺序、计数、缓存身份、增益值），作为**浏览器行为**证据不足。
- 启动降级的 `effect` 同步语义是从 cordis 源码读出来的（`:1249/:1261`），并用桩复现——属"读源码 + 桩"，不是真实 DSH 启动。
- U1–U7 未证实项列得基本完整（真实浏览器、真实 WebAudio、真实 DSH 激活、真实 fetch 时序、真实端到端），态度合格。

**证据强度缺陷（EV-1，low，但结论方向性错误）**：U1 一行里的推断 ——「核对了 DSH CSS…**没有**全局 `*{box-sizing:border-box}` 复位…所以 `::picker` 保持初始 `content-box`，92px=84px 行+8px 内边距在算术上正好 3 行」——**不成立**：
1. `box-sizing` 是**非继承**属性，`*` 选择器**不匹配伪元素**（`::picker(select)` 的样式只能由匹配它的规则或 UA 样式表给出），所以"DSH CSS 有没有 `*` 复位"与本题无关；
2. 决定该伪元素盒模型的是 **UA 样式表**，而 Chromium 的 UA 样式表明确写 `box-sizing: border-box`（§2.5）。
   报告把 U1 整体列为"未证实"的处理是对的，但这句中间推断必须撤回/更正——它恰好把唯一没有外部证据的一步（盒模型）引向了与事实相反的方向。**这正是 2px 误差能穿过两轮验证的原因。**

### 3.2 报告 B：`docs/rev4-浏览器侧独立验证.md`（t1）

**是实测的（硬）**

- 名册断言落在**卡片渲染出的 `<option>` 序列**上（6 种输入形状 + 真实导入路径），并与 `diagnostics.toneOptions()`、scope 写入顺序三方交叉；并发/缓存按 **AudioBuffer 对象身份（`===`）** 断言；主增益按"唯一接到 destination 的 gain 节点"**结构识别**（不是读源码字符串）；注入面用 10 类 HTML sink 全 0 + 载荷只作字符串子节点进树；DSH `displayName` 用**真实路由处理器**驱动并做 POST/DELETE 往返、清理上传物。
- 262 项断言全绿、0 条被证伪，`_raw/ind-probe-{7..13}-r4-*.txt` 存在且尾部计数与报告一致，mtime 20:56:50-20:57:01 晚于 `lib/**` 的 20:34/20:35。
- **未证实项处理正确**：U1（`box-sizing` 决定第 3 行是否裁 2px）、U2（引擎里 value 匹配 option 不空白）、U3（React 文本节点不执行）、U4（降级弹窗取色）都单列，没有写成通过。probe-13 专门记录"环境让哪些测量做不了"（Edge 能写出 `DevToolsActivePort`，随后 Mojo 命名管道被拒 FATAL 0x5）——我独立复核了启动日志里的该行，确认这是环境限制而非被测实现的问题。

**是推断/代理的（软）**

- 同样是 mini React / 假 AudioContext / 假 DOM；引擎级结论（真实 `<select>` 空白行为、真实 React 转义、真实渲染几何、真实解码与自动播放策略）全部悬空。
- 输入形状覆盖 ≥6 种（含稀疏数组、`>CUSTOM_LIMIT`、大小写、纯空白名、5000 字名），对抗性足够。

**表述问题（EV-2，low，可接受）**：CSS 那一条的断言名是 `max-height equals 3 rows + the picker padding, EXACTLY (content-box arithmetic)`——括号里已经点明是 content-box 算术，但"EXACTLY"与 §1 的"静态 PASS"容易被读成"3 行语义已满足"。§4-U1 又把它标为未证实，两处口径需要读者自己对齐。更准确的说法是「**在 content-box 假设下行高算术自洽**」。

### 3.3 是否存在循环论证？

**（a）"测试与被测代码同一作者"——不成立。**

- 被测代码在 `dsh-approval-chime/lib/**`；实现者的自测桩在 `verify/_harness.mjs` + `verify/*.test.mjs`；两份报告的仪器分别是 `verify-independent/kit/rev4.mjs`（t1）与 `verify-independent/kit/rev4-kit.mjs`（DSH 侧）、`kit/platform.mjs`（另一个成员早先的 kit）。
- 机械化核查一：`verify-independent/**/*.mjs` 里**没有任何 import 指向 `verify/**`**（全文仅注释提到"不 import"）。
- 机械化核查二（我做的）：把 `verify/_harness.mjs` 与两份 kit 去掉空行与注释后逐行比对，重合行数分别为 **1 行**（t1 kit 的 `return Promise.resolve();`）与 **15 行**（DSH kit，全是 `addEventListener(type, handler){`、`const a = JSON.stringify(actual);`、`import vm from 'node:vm';` 之类通用样板）→ 不是复制实现者仪器，独立性成立。

**（b）"断言复述实现"——部分成立，而且正是 R5 出问题的位置。**

- 名册/顺序/去重/计数/缓存/音量/注入面的断言都落在**渲染产物、scope 写入、音频图、未处理 rejection 仪器**上，不是复述内部函数返回值 → 不是复述。
- 但 CSS 那一条是**半复述**：两份报告都是"解析作者自己写的那份样式表 + 复述作者注释里的算式（`20+4+4=28`、`3×28+8=92`）"。这类断言只能证明**代码内部自洽**，对"浏览器里到底显示几行"零信息量；缺的正是**代码之外的事实**（UA 样式表的 `box-sizing`）。我本轮补上该事实后，结论从"静态 PASS"变成"3 项即溢出 2px"——这正好演示了半复述断言的盲区。

**（c）共同的盲区（不是循环论证，但必须点明）**：所有仪器都是代理（mini React / 假 AudioContext / 假 DOM），**没有任何一个断言在真引擎里做过对照**；唯一一次真引擎尝试因沙箱拒绝命名管道而失败。所以"代理与真引擎一致"这一层假设，两份报告都只能默认成立。

**（d）我独立复核到的与报告一致之处**：两份报告记录的哈希与当前 `lib/**` 一致；原始输出文件存在且尾部计数与摘要一致；时间戳晚于最后一次代码改动；probe-13 的 Mojo FATAL 行真实存在；"UA 样式表不在二进制明文里"这一负面结论我用**不同对照串**独立复现。→ 两份报告**没有伪造或错引原始证据**。

---

## 4. 仍需真人浏览器 / 真实 DSH 确认项

| # | 项目 | 为什么现在定不了 | 怎么验（可直接照做） |
| --- | --- | --- | --- |
| M1 | **`::picker(select)` 的 `box-sizing` 与真实 used value**（决定 R5 定案） | 本机无法启动浏览器（Mojo 命名管道被沙箱拒绝，审批禁用）；UA 样式表不在二进制明文里 | 支持 `base-select` 的 Chrome/Edge 里打开插件卡片，控制台：`getComputedStyle(document.querySelector('.dacCard select'),'::picker(select)').boxSizing`，以及 `document.querySelector('.dacCard select').showPicker?.()` 后量 `::picker` 的 clientHeight/scrollHeight |
| M2 | **3 个选项时到底有没有滚动条**（R5 的用户可见表现） | 同上（需要真实排版） | 默认状态（不导入任何文件）打开音色下拉截图；`select` 展开时量 picker 的 `scrollHeight > clientHeight` |
| M3 | **滚动条外观/主题协调性、下拉是否遮挡卡片** | 纯视觉 | 明/暗两主题各截一张图 |
| M4 | **真实文件选择对话框 + `accept="audio/*"` 过滤** | 系统对话框无法 headless 触发 | 点「导入音频」，确认弹出系统选择器且默认过滤音频；再试"所有文件"选 `.txt`，确认卡片显示「导入失败: unsupported audio type …」 |
| M5 | **真实音频可听性**：mp3/wav/ogg 实际解码、音量档位听感、审批触发时是否响 | 假 AudioContext 只记录音频图，不解码 | 导入一段短音频 → 试听 → 触发一次审批；听 5 档音量的响度梯度 |
| M6 | **自动播放策略下的解锁**：未点过页面前审批到达是否静音、点「试听」后是否恢复 | 需要真实 AudioContext 的 suspended/resume 时序 | 刷新页面后不点击，等一次审批（应计数 `suppressedPolicy`）；再点「试听」后触发第二次审批（应发声） |
| M7 | **端到端"无需刷新"**：真实 DSH 里的 `settings.mutate` → `document-updated` → 卡片刷新 | 需要真实 `dsh web` 进程 + 浏览器 | 导入一个文件，确认下拉里立刻出现且被选中，不刷新页面；再开第二个标签页看是否同步 |
| M8 | **持久化**：重启 `dsh web` 后名册仍在、音频文件仍能播 | 未重启 DSH | 导入 → 重启 → 打开卡片：选项仍在、能试听（`audio/` 目录里应存在 `<uuid>.<ext>`） |
| M9 | **DSH 413 契约（D1）在真实 `fetch` 下的表现** | 需要真实 socket（已在裸 socket 层证实收不到 413） | 上传 >5 MB 文件（或用脚本 POST），确认浏览器只报 network error 而非 413；卡片路径因 `lib/client.js:1182` 本地先拒绝而不可达 |
| M10 | **React 是否把文件名渲染成文本节点**（注入面收尾） | 本机无 React | 文件名 `<img src=x onerror=alert(1)>.wav` 导入后，断言 `document.querySelector('.dacCard img') === null` |
| M11 | **不支持 `base-select` 的浏览器里的降级**（原生弹窗完整列出、取色是否符合注释） | 无此类引擎 | Chrome<135 / Firefox 上打开下拉截图 |

---

## 5. 缺陷 / 风险清单（严重度 + 最小复现）

### R5-1（medium · 需求符合性，**本轮新发现**）3 个选项即出现滚动条并裁掉第 3 行 2px

- 位置：`lib/client.js:988`（`'max-height:' + String(TONE_ROWS*TONE_ROW_PX+8) + 'px'` = 92px，同规则内 `:989` 的 `overflow-y:auto`）、`:990`（option `line-height:20px`、`padding:4px 9px` → 28px/行）；UA 侧：Chromium `html.css` 的 `select:not(:-internal-list-box)::picker(select){box-sizing:border-box;…}`。
- 机理：92px 量的是**边框盒** → 内容区 82px < 3×28=84px → `overflow-y:auto` 出现滚动条；第 3 行底部被裁 2px。
- 最小复现：`node .scratch/reviewer-r5/reqcheck.mjs`（输出 `3 rows=84 > 82 by 2px`）；或浏览器里默认状态打开音色下拉看滚动条 / `getComputedStyle(select,'::picker(select)').boxSizing`。
- 建议修法（**必须显式定死盒模型**，这样在两种 UA 行为下都成立）：
  - 方案 A（推荐）：该规则加 `box-sizing:content-box;`，并把 `max-height` 改成 `TONE_ROWS*TONE_ROW_PX`（= 84px，内容区正好 3 行）→ 3 项 84≤84 不滚；4 项 112>84 滚动且正好显示 3 行；
  - 方案 B（最小 diff）：只加 `box-sizing:content-box;` 保留 92px → 3 项不滚、4 项滚动（第 4 行会露出 8px）；
  - 方案 C：保留 border-box，改 `max-height:94px`（= 84+8+2）。
- 附带：修好后注释里的"20px line box + 4px padding twice"仍是 28px 的唯一依据，建议把盒模型写进注释，避免下一次再按 content-box 误算。

### D1（medium · DSH 契约，转述报告 A，我复核了代码路径与承诺）超限上传的 413 到不了客户端

- 位置：`lib/index.js:367-383`（`:375` 在 `reject` 后立刻 `req.destroy()`）→ `:414-420`（catch 里 `respond(res, 413, …)`）→ `:331-341`（写进已销毁 socket）。
- 实测（报告 A，裸 socket 三种写法）：客户端 `receivedBytes=0`；服务端 `writableEnded:true, bytesWritten:0`。与 `README.md:79`、`CHANGELOG.md:20` 承诺的"超限 → 413"不一致。
- 最小复现：`curl --data-binary @5242881B.bin -H "x-chime-name: over.wav" http://127.0.0.1:<port>/api/approval-chime/audio` → 连接被断/reset，收不到 413；或跑 `verify-independent/probe-7-host-audio-http.mjs` §5。
- 缓解现状：卡片路径走不到（`lib/client.js:1182` 本地先按 `file.size` 拒绝）→ 用户不受影响；但脚本/未来客户端无法区分"文件太大"与"DSH 挂了"。
- 建议修法：先 `writeHead/end(413)` 并等待 flush，再 `req.destroy()`（或 `req.pause()` + `connection: close`）。

### F1（medium · 健壮性，t1 发现，我复核了不对称点）采样路径未防"同步抛错"

- 位置：`lib/client.js:444-469`（`:448` 的 `fetch` 无 try/catch）、`:486-505`、`:577-590`（custom 分支只挂 `.catch`，与内置分支 `:592-603` 的 `try/catch` 不对称）、`:737`（审批路径 `chime()` 在 `try` 之外）、`:1186-1192`（`setImporting(true)` 后调用 `uploadAudio`，抛错则永不复位）。
- 实测（t1 probe-8）：`fetch` 同步抛错 → `suppressedFailed`/`lastError` 都不动；异常穿出 `pendingInteractions` 监听器；导入路径按钮永久停在「导入中…」+disabled。
- 最小复现：控制台 `window.fetch = () => { throw new Error('x') }; window.__DSH_APPROVAL_CHIME__.preview()` → 抛异常、`stats().suppressedFailed` 仍为 0。
- 可达性：真实浏览器里 `fetch` 不会同步抛错（且 `typeof fetch !== 'function'` 有前置判断），**需要非常规环境**；属健壮性缺口而非用户可见缺陷。
- 建议修法：custom 分支与 `onImport/onRemove` 包 `try/catch`，状态复位放 `finally`。

### F2–F6（low，转述 t1 报告，我逐条核对过代码位置成立）

| id | 摘要 | 位置 | 最小复现 |
| --- | --- | --- | --- |
| F2 | 文档说 `volume<=0` 不建 AudioContext，但试听路径先 `attemptUnlock` 再进闸门（实测 contexts=1/nodes=0） | `:545-550` 文档 vs `:678-682`（`:680` 的 `attemptUnlock`）、闸门 `:564-568` | 音量 0 → 点「试听」→ `audio().state` 变为 running/suspended（无声、无节点） |
| F3 | `enabled=false` 时试听不计数 `suppressedDisabled`，卡片无法解释"为什么没声" | `:678-682` 早退，不过 `:558-562` | 关开关 → `preview()` 返回 false 且 `stats().suppressedDisabled === 0` |
| F4 | 浏览器侧对名册 `name` 无 trim/长度收敛（纯空白名渲染成空行、5000 字原样） | `:654` | 手改 settings 文档 `custom[0].name = '   '` → 下拉首行看似空白 |
| F5 | DSH 120 字 `slice` 会切断代理对（实测末位 `U+D83D`） | `lib/index.js:399` | 文件名 119×`x` + `😀` + `tail.wav` → 返回名末位为孤立高代理 |
| F6 | 客户端兜底名 `'audio'` 无扩展名必被 DSH 415；尾随空格名同样 415 | `lib/client.js:524` vs `lib/index.js:406-413` | 空 `file.name` 或 `'padded.wav '` → 415 |

### R4-RACE（low · 健壮性，我的补充）并发导入的 read-modify-write

- 位置：`lib/client.js:1194`（`roster` 来自最近一次快照，而非 scope 实时值）→ `:1198` 整体覆写 `custom`；`:1197` 先复位 `importing` 再 `commit`，理论上按钮可在两次写入落地前再次可用。
- 影响：并发完成两次导入时后写覆盖前写，丢一条名册项（文件已成为孤儿）。报告 A 的 O9 实测到了这一形状。
- 可达性：**极低**（导入中按钮 disabled `:1318` + 系统对话框模态 + 需要人在写回窗口内完成第二次选择），不作为发布阻断项。
- 建议修法：`next` 取自 `effectiveSettings(readScopeSnapshot()).custom`，或用一个"导入中"互斥标志覆盖到写入落地。

### 其他观察（不计为缺陷）

- **上限语义（R4-CAP，我实测）**：`CUSTOM_LIMIT = 50`（`:105`）只在**渲染**时截断（`:647` 的 `roster.length < CUSTOM_LIMIT`）。实测第 51 次导入：文件上传成功、`custom` 落成 **51 项**、`tone` 也指向它，但下拉里的**真实名册行只有前 50 项**，被选中的第 51 项只能以卡片补的 `（文件缺失）` 合成行出现在第一位——**文件明明在，却被显示成"文件缺失"**，用户会以为导入失败。低风险（要导入 51 个文件才触发），建议：达到上限时拒绝并提示，或把上限也应用到写入。
- **失败采样无负缓存**（报告 A/B 的 O1）：`samples.pending/ready` 失败后不记录 → 每次播放重新请求；对"文件已删但名册仍引用"的场景会产生一次性 404 请求，功能正确。
- **大小写 id 死选项**（O2/D2）：`CUSTOM_ID` 带 `i`（`:96`）而 DSH `findAudioFile` 大小写敏感（`lib/index.js:352`）→ 大写 id 呈现为"（文件缺失）"；正常路径不可达（`randomUUID()` 恒小写）。
- **`@supports` 未覆盖 `::picker()`**（O3）：若某浏览器支持 `appearance:base-select` 值但不支持该伪元素，3 行上限会静默丢失（不截断内容，只是不滚）；未观测到此类浏览器。
- **DSH 前缀扫描取文件**（D3，报告 A）：`audio/` 里若存在人工放入的 `<id>.aaa`，GET 会返回它、DELETE 会删它而留下真音频；杂散文件无法经 HTTP 写入，属防御性缺口。

---

## 6. 结论：**需修正**

**理由（为什么不是"可直接交付"）**：用户第 5 条原话是"显示三个选项，当有第四个选项时变成可滚动"，而**默认状态（0 个导入、3 个内置音色）就会出现滚动条并把第 3 行裁掉 2px**——这不是"锦上添花的观感问题"，而是这条原话明文要求的反面；且成因已被定位到一处 CSS 声明（`box-sizing` 未显式声明，UA 默认是 `border-box`），修正风险极低、不需要改逻辑。

**同时明确"其余部分可交付"**：

| 维度 | 结论 |
| --- | --- |
| R1 导入按钮位置 | PASS —— DOM 上就在音色 `<select>` 右侧，中间只有隐藏的 file input |
| R2 原生文件选择 | PASS —— `input[type=file][accept=audio/*]` + 按钮 `click()`，无拖拽/路径输入 |
| R3 无需刷新即出现 | PASS（通路级）—— 写入 → 平台镜像折叠 → scope 广播 → 卡片重渲染，插件半已实测；端到端待人工（M7） |
| R4 顺序 | PASS —— 追加写入、按导入先后渲染、移除保序、移除后再导入仍追加在末尾 |
| R5 三行滚动 | **PARTIAL / 不达标** —— 见 R5-1 |
| 上游验证质量 | 两份报告的证据**没有伪造/错引**，探针与实现者仪器相互独立（重合行 1/15 行且均为通用样板）；主要问题是报告 A 的 U1 中间推断方向错误、以及两份报告在 CSS 上"半复述实现"，导致 2px 误差两轮未暴露 |

**最小修正清单（建议按此顺序，全部为一行级改动）**

1. **必做（阻断发布）**：`lib/client.js:988` 所在的 `.dacCard select::picker(select)` 规则加 `box-sizing:content-box;`，并把 `max-height` 改为 `String(TONE_ROWS * TONE_ROW_PX) + 'px'`（=84px）；同步更正 `:984-988` 的注释（说明盒模型已显式定死）。
2. 建议（可选，不阻断）：修 D1（先 flush 413 再 destroy，或把 413 判断挪到读完/写响应之后）与 F1（custom 分支补 `try/catch`，状态复位进 `finally`）；F2/F6 只需改文案/兜底名。
3. 修正后需复核：R5 的盒模型算术（可用 `.scratch/reviewer-r5/reqcheck.mjs` 重跑，期望 "3 行 84px ≤ 内容区 84px"）+ 一次真人浏览器确认（M1/M2）。

**结论一句话**：**rev-4 的功能骨架满足用户第 1–4 条原话，第 5 条因 UA `box-sizing:border-box` 造成的 2px 溢出而部分不达标；修掉这一行 CSS（并顺带处理 D1/F1）后即可交付。**

---

### 附：本审查的可复现命令与产物

```powershell
cd '<workspace>'
node .scratch/reviewer-r5/reqcheck.mjs          # 我的独立需求符合性探针：39 项断言全绿（含 50 项上限场景）
node .scratch/reviewer-r5/scan-dll.mjs "C:\Program Files (x86)\Microsoft\Edge\Application\153.0.4234.32\msedge.dll" "::picker(select)" 300 3
                                                # 负面结论：UA 样式表不在二进制明文中（0 命中）
Get-FileHash dsh-approval-chime/lib/client.js,dsh-approval-chime/lib/index.js -Algorithm SHA256
```

- 我的探针：`.scratch/reviewer-r5/reqcheck.mjs`（自带 React hook 运行时 / scope 桩 / 假 DOM / 假 WebAudio / 假 fetch，**不复用** `verify/_harness.mjs` 或 `verify-independent/kit/**`）。
- 修正 R5-1 后本探针的期望变化：`content box` 从 82px 变为 84px，`3 rows=84 > 84` 不成立 → 3 项不再溢出。

---

## 附录 B · rev-5 后续状态（t4 复审更新）

> 本节由复审任务 **t4** 追加，**只记录状态变化，不改动上文**（上文是 rev-4 的冻结审查记录）。逐条判定与证据见 `docs/rev5-需求复审.md`。

| 本文条目 | rev-5 状态 | 证据 |
| --- | --- | --- |
| R5（本文判定 **PARTIAL/不达标**） | **已修**：`lib/client.js:1090` 在同一规则里显式声明 `box-sizing:content-box;max-height:84px`，行高 20+4+4=28px ⇒ 3 行 = 84px = 内容盒（不滚动），第 4 行 112px > 84px（滚动）；不再依赖 UA 盒模型。t4 独立探针 **69/69** 复现 | `docs/rev5-需求复审.md` §2 |
| R5-1（本文 §5，medium） | **已修**（同上）。仍待真人浏览器确认滚动条的真实 used value/外观（非阻塞） | 同上 §5-M1/M2 |
| D1（本文 §5，medium · DSH 413） | **已修**：t4 用自写裸 socket 探针复现 content-length 与 chunked 两种写法都收到 `HTTP/1.1 413` + JSON，并同测正常上传往返与 `audio/` 零残留（**9/9**） | 同上 §0/§4.1 |
| F1（本文 §5，medium） | **已修**：`loadSample`/`uploadAudio` 把同步抛错转成 rejection，`chime` 与导入路径各加兜底；t4 实测不抛异常、`suppressedFailed+1`、`lastError` 有值、按钮复位 | 同上 §4.1 |
| F2–F6、D2–D4、R4-CAP、R4-RACE（low） | **已修**（逐条原始输出见 `docs/rev5-复验.md` §1；t4 复核认可） | `docs/rev5-复验.md` |
| **EV-1**（本文 §3.1/§5：DSH 报告 U1 的推断「`::picker` 保持初始 `content-box`」不成立） | **行为影响已消除**（rev-5 显式声明 `content-box`，旧的 `92px` 已不存在）；**但文本未更正**：`docs/rev4-独立验证.md:189` 仍写"所以 `::picker` 保持初始 `content-box`……当前不成立"（该文件 mtime 21:02，早于本文 21:10 的写作时间，此后未再编辑），建议补一行更正 | 同上 §4.4 |
| 本文结论「**需修正**」 | **已被取代**：rev-5 的复审判定为 **可交付**（R1–R5 全部达标） | 同上 §7 |
