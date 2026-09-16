# dsh-approval-chime

DSH 审批提示音插件：宿主向你申请权限的那一刻响一声，音量、音色、开关都在**「设置 → 通知提醒」**里调。
内置风铃、铃铛、蜂鸣三种合成音色，支持试听与恢复默认，还能导入本地音频（≤5MB、最多 50 个）当音色；
WebAudio 现场合成、不加载音频文件，配置持久化到宿主设置文档，另附已触发次数与上次触发时间，
静音环境下也能自证是否生效。

> 上面这段同时是「插件市场 → 已安装」那一行**灰色介绍位**要显示的文字。市场只对精选目录里的插件
> 自动显示作者简介；本插件是本地 `link:` 安装、未上架，那个位置要用市场自己的「添加备注」粘贴
> （≤200 字符）。原因见 CHANGELOG 的「rev-7 · 市场简介」条。

当宿主向用户**申请权限**（审批请求）时播放一声音，并在**「设置 → 通知提醒」**（独立分区，rev-7 起）提供一页设置：
启用开关（苹果式拨动开关 38×22，开启色与音量条同一个令牌；rev-9 起）、音量进度条（0..100）、音色选择（chime / bell / beep）、试听、恢复默认，
以及**已触发次数 / 上次触发时间**等可见指示（无声环境下也能自证）。

- 提示音是 **WebAudio 现场合成**（正弦/三角/方波 + 包络），不加载任何音频文件。
- 设置持久化到**宿主设置文档**（默认 `$DSH_HOME\settings.yaml` 的 `approval-chime:` 段），
  写入走平台既有的 revision-fenced 通路（浏览器 `ctx.settingsScope.bind({namespace}).set/unset`
  → `remote.settings.mutate` → 宿主文档）。插件自己不碰任何浏览器存储。
- **完全不参与审批瀑布**：不注册任何 `approval/request` 监听，内置审批面板的决策路径一个字节都没变。
- **按会话独立（rev-10）**：会话标题行挂一个**小铃铛**（开=实心铃铛 / 关=带斜杠），点一下只静音**这个会话**；
  铃铛旁的 caret 还能给该会话单独指定**音色与音量**（默认跟随全局）。这些覆盖**不进设置文档、不进浏览器存储**，
  而是由宿主半写进插件自己的文件 `$DSH_HOME|~/.dsh\approval-chime\sessions.json`（原子写、上限 200 条、按 `updatedAt` 淘汰）。
  多个会话同时待审批时**各响各的**（不再合并成一声）：同一批按快照顺序逐个响、相邻 180 ms。
- **写入收敛（rev-11）**：同一会话的两次点击是两个 POST、两条 socket，**应答被消费的顺序不保证等于宿主写盘的顺序**，
  所以"最后一个应答落地"并不足以决定本地表。最后一次在飞的写入落定后，插件会**重读一次宿主文件**，
  让本地表最终等于文件 —— 因此铃铛显示的状态不会再与宿主的记录长期相反（rev-10 的 F-01 已修，见 §9 H17）。

本 README 是 t2 的交付说明，也是 **t5 挂载/重启验收** 的操作手册。
实现依据：`docs/契约调研.md`（t1 的宿主契约调研，全部结论带 `文件:行号`；rev-10 的会话槽/待审批表/home 规则见 §L）。

---

## 1. 包结构

```
dsh-approval-chime/
  package.json                 name/type=module/exports{./client,./cordis.patch.yml}/
                               dsh.bundle.patch=./cordis.patch.yml, dsh.client.platform='web'
  cordis.patch.yml             insert 一行 {id: dsh-approval-chime, name: dsh-approval-chime}
  lib/index.js                 宿主半：注册 approval-chime 设置命名空间（默认 enabled=true, volume=70, tone=chime）
                               + 音频路由 + 按会话覆盖路由与 sessions.json（rev-10）
  lib/client.js                浏览器半：审批监听 + WebAudio 合成 + 「通知提醒」设置分区 + 会话头部小铃铛
                               + 写入落定后的收敛重读（rev-11）（经典脚本，只有 factory 闭包）
  verify/_harness.mjs          自测脚手架（vm 经典脚本加载器 / 模拟 React / 模拟 AudioContext / 模拟服务与 locale / 假 HTTP 请求-应答）
  verify/host-half.test.mjs    自测 1：包结构 + 宿主半注册与降级 + 按会话存储与路由（rev-10）
  verify/client-half.test.mjs  自测 2/3：浏览器半装载、两个槽注册、分区页、铃铛两态与 popover、响铃语义、按会话有效值、
                               写入收敛（rev-11：应答反序仍与存储一致）、batch 间隔、自动播放策略
  verify/waterfall.test.mjs    自测：审批瀑布零注册（静态 + 运行时 + 真 cordis 对照实验）
  verify/custom-audio.test.mjs 自测 4/4：导入音频（路由、413、名册、自定义音色播放）
  node_modules/@deepseek-ai/schemastery   指向上游自愈副本的 junction（见 §2，必须存在）
  docs/契约调研.md             t1 产出（本插件所有宿主契约的唯一依据；rev-10 的 §L 见下）
  docs/挂载与验收.md           t5 的挂载/验收手册（§7.1 = rev-10 手工步骤）
```

## 2. 必须存在的 junction（t5 预检项）

工作区插件是以 `link:` 依赖挂载的，Node 会把链接解析到**真实路径**
（`D:\...\dsh-approval-chime\lib`），因此它的裸导入**不会**去 profile 目录找包。
本包自带一个 junction，指向上游每次启动自愈的依赖闭包：

```powershell
# 已由 t2 创建；预检/重建用
$ns = '<repo>\node_modules\@deepseek-ai'
New-Item -ItemType Directory -Force -Path $ns | Out-Null
New-Item -ItemType Junction -Path "$ns\schemastery" `
  -Target '$DSH_HOME\profiles\node_modules\@deepseek-ai\schemastery'
```

预检命令（应输出 `True` 且两个 realpath 相同）：

```powershell
Test-Path '<repo>\node_modules\@deepseek-ai\schemastery\package.json'
(Get-Item '<repo>\node_modules\@deepseek-ai\schemastery').LinkType   # Junction
```

`lib/index.js` **故意不用顶层静态 `import '@deepseek-ai/schemastery'`**：缺链接时静态导入会让整行
loader entry 导入失败。它按 `import.meta.url`（junction）→ `ctx.baseUrl`（profile 目录）→
`$DSH_HOME/profiles`（宿主自愈镜像）的顺序尝试解析，再退到动态 `import()`，全失败就打印警告并保持惰性——
**绝不抛出、绝不阻断 `dsh web` 启动**。自测 1 用子进程 + 空 `DSH_HOME` + 包外副本实测了这条降级路径。

## 3. 设置项

| 字段 | 类型/范围 | 默认值 | 含义 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 关闭后**任何**声音都不产生（包括试听，且会计入 `suppressedDisabled`）；审批触发路径连 AudioContext 都不创建 |
| `volume` | number 0..100 | `70` | 音量。主增益 = `volume / 100 × 0.6`（`MASTER_GAIN`），`volume = 0` 时不发声 |
| `tone` | `chime` \| `bell` \| `beep` \| `custom:<uuid>` | `chime` | 音色。前三个为现场合成（bell 为三角波+双分音，beep 为两声方波短鸣）；`custom:` 前缀指向一个导入文件 |
| `custom` | `[{ id, name }]` | `[]` | 导入的音色名册。**顺序即含义**：按导入先后排列，渲染时排在三个内置音色**之前** |

- 命名空间：`approval-chime`（匹配 `/^[a-z][a-z0-9-]*$/`，`dsh-settings` 强制校验）。
- **入口（rev-7）**：设置 → **通知提醒**（`settings.section` 的独立分区，id `approval-chime`、order 16）。插件页不再出现本插件的行。
- 落盘：`$DSH_HOME/settings.yaml` → `approval-chime:` 段；`applies: 'live'`，改完立即对插件生效。
- 「恢复默认」= 对 `enabled/volume/tone` 依次 `scope.unset()`（**不动** `custom`：导入的文件是用户的素材库，不是一项偏好）。
- 音量/开关与「试听」的边界（rev-5 更正措辞）：**审批触发**在 `volume = 0` 或关闭时既不建音频节点也不建 AudioContext；但**「试听」是显式用户动作**，会先解锁音频上下文（刻意设计：让你第一次点击就能解除浏览器自动播放限制），只是同样不发声。原文档"不创建任何音频节点"的说法过宽，已按实测更正。
- 非 loopback 页面（远程浏览器）平台只把写入留在内存（`persistence = isLoopback ? 'host' : 'memory'`）。**该模式下分区页渲染为空**（导航行仍在）：命名空间拿不到 `status === 'ready'`，分区组件返回 `null`，因此不会出现"内存保留"之类的提示行（该提示分支不可达，属历史措辞）。验收请用 `http://127.0.0.1:3080`。

### 3.1 导入自定义音频（rev-4）

- 操作：分区页「音色」右侧的 **导入音频** → 选择本地文件 → 浏览器把字节 `POST` 到 `/api/approval-chime/audio` → 宿主半写入插件目录的 `audio/<uuid>.<ext>`，并把 `{id, name}` **追加**进 `custom` 名册，随后自动选中并试听。
- **两处分开存**是刻意的：名册（顺序、显示名）随设置文档走，音频字节落在插件目录 —— 设置文档要保持小、可读、可合并，而浏览器存储是按浏览器且会被清理的。
- 上限 **5 MB**；允许扩展名 `mp3 / wav / ogg / oga / opus / m4a / aac / flac / webm`。超限 → `413`（**先把剩余请求体读干再应答**，否则 Node 会在请求未读完时销毁 socket，413 根本到不了客户端），扩展名不支持 → `415`，**拒绝而非截断**（被截断的音频会解码成怪声，比明确失败更糟）。
- 名册上限 **50 个**：满了以后「导入音频」直接拒绝并说明原因，不会先把文件传上去再把它显示成"（文件缺失）"。
- 文件名处理：先 `trim`，扩展名按**最后一个点**判断；没有扩展名时按 MIME 兜底（`audio/mpeg` → `.mp3`）。id 是**大小写敏感**的小写 uuid。
- 选中导入音色时右侧出现 **移除**：删除文件并从名册去掉该项；「恢复默认」不会删文件。
- 音量对导入音色同样生效：样本经与合成音**同一个主增益**播放，`lastGain` 仍然是 `volume/100 × 0.6`。每个文件只 fetch+decode 一次，之后复用解码后的 buffer。
- 弹出列表显示 **3 行**，第 4 项起滚动（`select::picker(select)` 的 `max-height`，依赖 `appearance:base-select`，见 §8 的浏览器前提）。
- ⚠️ **改 `lib/index.js`（宿主半）必须重启 `dsh web`**：音频路由和 `custom` 字段的 schema 都活在宿主进程里；只改 `lib/client.js` 时刷新页面即可。
  （rev-10 起宿主半还多了按会话覆盖的路由与 `sessions.json`，所以 **rev-10 及之后的验收必须先重启宿主**，见 §3.2。）

### 3.2 按会话独立（rev-10，写入收敛 rev-11）

- **入口**：会话标题行（`conversation.session.header.actions`，本插件 id `approval-chime`、order 30，已取证的官方占用是 -10/10/20）
  里的一个小铃铛 + 更小的 caret。铃铛 **开=实心铃铛 / 关=带斜杠铃铛**，`title` 与 `aria-label` **同时**给中英两种文案
  （`本会话审批提示音：开 · Approval chime for this session: on` / `…：关 · … off`）。
- **铃铛语义（①A：只可能更安静，不可能更响）**：点击 = 切换该会话的 `enabled` 覆盖 ——
  当前会响 → 写 `enabled:false`（只静音这个会话）；当前被静音 → **清除** `enabled` 覆盖（回到跟随全局）。
  **不提供**「全局关时给单个会话强制打开」。全局关时每个未覆盖会话都静默，铃铛也显示为「关」。
- **有效值**：`enabled = 会话覆盖 ?? 全局`、`volume = 会话覆盖 ?? 全局`、`tone = 会话覆盖 ?? 全局`（逐字段）。
  会话覆盖的音色是 `custom:<uuid>` 而名册里已经没有这个文件时，**回退到全局音色**并在 popover 里说明（不报错、不静音）。
- **caret popover**（自绘、只有 react 依赖）：音色（**跟随全局** / 导入的音色 / 风铃 / 铃铛 / 蜂鸣）、
  音量（勾选「跟随全局音量」= 清除覆盖，取消勾选后 0..100 滑杆即为该会话的音量）、**恢复跟随全局**。
  `position:fixed` + `getBoundingClientRect` 自定位（贴到视口底部时向上翻），**外部 pointerdown 与 Escape 关闭**。
  写入是**乐观更新**：先本地生效，宿主拒绝则回滚并在 popover 里显示错误行。
- **写入收敛（rev-11）**：每次写入 +1 一个"在飞写入"计数；**计数归零时重读一次宿主文件**，
  让本地表最终等于文件 —— 因此两次点击的应答即使被反序投递（rev-10 的 F-01），铃铛也不会与宿主的记录长期相反。
  被拒绝的写入仍然回滚并保留错误行（这次重读只重读表、不覆盖该次写入的结论）。
  代价是每次写入多一个 `GET`（连点两次只多一次，因为它是"归零才读"）；重读本身失败时退化为"无覆盖"并保留原因。
- **落盘**：`$DSH_HOME\approval-chime\sessions.json`（未设 `DSH_HOME` 时 `~\.dsh\approval-chime\sessions.json`，
  规则与宿主 `@deepseek-ai/dsh-home-paths` 一致：**纯空白的 `DSH_HOME` 视为未设置**）。
  形状：`{"version":1,"sessions":{"<sessionId>":{"enabled"?:bool,"volume"?:0..100,"tone"?:string,"updatedAt":number}}}`。
  三个字段都可缺省；`POST` 里字段值 `null` = **清除该字段**（回到跟随全局）；三个字段全缺省的记录**不落盘**。
- **两个 HTTP 路由**（沿用既有 `webServer` 注册与「没有 web 服务器就只是不做路由」的降级姿势）：
  `GET /api/approval-chime/sessions` → `{ok:true, revision:<n>, sessions:{…}}`；
  `POST /api/approval-chime/sessions`，体 `{sessionId, patch}` → 应用后返回**同样的结构**。
  非法 `sessionId`（空/非字符串/超长 >200）、非法 `volume`（非 0..100 整数）、非法 `tone`（非 `chime|bell|beep|custom:<小写 uuid>`）、
  未知 patch 字段一律 **400 且不落盘**；未知路径 **404**；非 GET/POST/HEAD 方法 **405**。
- **上限与淘汰**：最多 `MAX_SESSIONS = 200` 条，按每条记录的 `updatedAt` 淘汰最旧；文件缺失/损坏/非对象时**退化为空表并告警**，
  绝不抛错中断插件（下一次成功写入会把文件重写成合法内容）。
- **原子写**：同目录临时文件（`.sessions.<pid>.<uuid>.tmp`）+ `rename()` 覆盖目标；写失败会清掉临时文件并回 `500`。
- **多会话各响各的**：同一批快照里 N 个**可响**会话各自响一次，按快照顺序、相邻 **180 ms**（`BATCH_GAP_MS`）；
  被本会话静音的**不响**并计入 `suppressedSession`（设置页抑制行显示「因本会话提示音关闭而静音 ×N」）。
  全局关导致的静默仍计 `suppressedDisabled`（语义不变）。
- **跨机器说明（②B 的固有属性，不修）**：覆盖表在**宿主所在的机器**上，因此换机器/换 profile 不会跟着走；
  设置文档里的全局值照旧按平台通路同步。详见 §9。
- ⚠️ **rev-10 改了两半**：新路由与新文件都在宿主半，**必须先重启 `dsh web`**；只刷新页面会出现「铃铛在、写入报错」。

**手工验收判据（摘要；逐步操作见 `docs/挂载与验收.md` §7.1）**：

| 判据 | 通过的样子 |
| --- | --- |
| 铃铛存在且两态 | 会话标题行有 20px 小铃铛 + 更小的 caret；开=实心、关=带斜杠；hover 同时显示中英文案 |
| 只静音一个会话 | 把 A 的铃铛点成「关」后 A 不响、B 照响；设置页出现「因本会话提示音关闭而静音 ×N」；全局开关不变 |
| 「开回来」= 清除覆盖 | 再点一次铃铛，`sessions.json` 里 A 的 `enabled` 字段**消失**（不是写入 `true`） |
| 多会话各响各的 | 两个未静音的会话同时待审批 → `triggers` 连续 +2（相邻约 180 ms），不是一声 |
| 每会话音色/音量 | caret → 选 bell、音量 30 后，该会话 `stats().lastTone === 'bell'`、`lastGain === 0.18`，其它会话与设置页不变 |
| 数据落点 | `$DSH_HOME\approval-chime\sessions.json` 出现该会话记录；`settings.yaml` 无会话数据；浏览器无任何存储项 |
| 上限 | 最多 200 条，最旧的 `updatedAt` 先被淘汰（自测用 205 条种子文件断言） |
| 写入收敛（rev-11） | 同一会话连点两次后，`sessionWrites().outstanding === 0` 且本地表与 `sessions.json` 逐字段一致（应答顺序无关） |
| 零回退 | 设置页与本轮之前逐项一致；审批面板按钮行为不变 |

## 4. Headless 自测（无需浏览器、无需宿主、无需装包）

```powershell
cd '<workspace>'
node --check dsh-approval-chime/lib/index.js
node --check dsh-approval-chime/lib/client.js
node dsh-approval-chime/verify/host-half.test.mjs      # 124 项
node dsh-approval-chime/verify/client-half.test.mjs    # 302 项
node dsh-approval-chime/verify/waterfall.test.mjs      # 22 项
node dsh-approval-chime/verify/custom-audio.test.mjs   # 74 项（导入音频）
```

全部打印 `[PASS]` 并以退出码 0 结束（合计 **522 项**）；任何一项失败会打印 `[FAIL]` 并置退出码 1。

各自证明什么：

1. **host-half**：package.json/cordis.patch.yml 的挂载契约（`exports['./client']`、`dsh.bundle.patch`、
   `dsh.client.platform`、只 insert 一次、id=name）；junction 存在且指向宿主镜像；
   `ctx.settings.register('approval-chime', schema, {applies:'live'})` 注册了**真的 schemastery schema**
   （默认值 `{enabled:true,volume:70,tone:'chime'}`，拒绝 `volume=200 / -1 / tone='nope' / enabled='yes'`）；
   重复注册会被跳过；`ctx`/`settings` 缺失、`describe()` 抛错、`register()` 抛错都不外抛；
   **在包外副本 + 空 `$DSH_HOME` 的子进程里，schema 不可解析时 apply 依旧不抛且什么都不注册**；
   **rev-10 新增**：按会话覆盖的存储与路由 —— 路径规则（`$DSH_HOME\approval-chime\sessions.json`；纯空白 `$DSH_HOME` 视为未设置）、
   目录递归创建、`GET` 空表/`POST` 合并与 `null` 清除、12 种非法补丁（含非整数音量、大写 custom id、未知字段）一律 400 且**文件字节不变**、
   413/404/405/HEAD、上限 200 与按 `updatedAt` 淘汰最旧（205 条种子文件 → 读回 200 条）、
   5 种损坏形状退化为空表并告警、损坏后写入可修复、**原子写**（临时文件同目录 + `rename`，写失败清理临时文件并回 500、目标不变）。
2. **client-half**：`lib/client.js` 以 `vm` 经典脚本方式装载（等同 `<script src>`），
   `id='dsh-approval-chime'`、只 `require('react')`、factory 返回 `{name, inject, apply}`；
   apply 后：绑定 `{namespace:'approval-chime'}`、注册 **`settings.section`** 一项
   （`id='approval-chime'`、`order=16`、`label` 是随 locale 重读的 thunk、`locale=NS`），
   并断言**从未**注册/等待/提及插件页那张卡片的槽；
   **rev-10 新增**：注册 **`conversation.session.header.actions`** 一项（`id='approval-chime'`、`order=30`、`locale=NS`，
   断言 id 不撞官方四个占用者）；铃铛**两态**（实心/带斜杠的差异断言在 SVG 上）、`title` 与 `aria-label` **同时**含中英两种文案、
   点击写 `POST {sessionId, patch:{enabled:false}}`、再点写 `{enabled:null}`；caret popover 的内容（跟随全局 + 3 内置音色）、
   自定位（视口底部**向上翻**、水平收进视口）、Escape 与外部 pointerdown 关闭、拒绝写入**回滚 + 错误行**；
   有效值真值表（未覆盖/仅静音/音色覆盖/音量覆盖 × 全局开与关）、缺失 custom 音色回退全局音色、
   4 条 pending（其中 1 条被本会话静音）→ **3 响**、相邻 **≥180 ms**（120 ms 时仍为 1 响）、逐会话音量与快照顺序、
   `suppressedSession +1` 且设置页显示该原因；诊断对象既有键一个不删 + 新增 `sessions()`/`sessionSettings(id)`；
   **rev-11 新增**：一个"POST 应答可被扣住、由测试决定投递顺序"的存储桩 —— 同一会话连点两次后**先放第二个应答、再放第一个**，
   断言迟到的旧应答不能在本地表里留下记录、铃铛仍跟随全局、本地表与桩里的存储逐字段相等、只重读一次、无在飞写入；
   另测单次点击仍收敛、被拒写入仍解析为 `false` 且错误行不被重读抹掉（这条新自测在 rev-10 的字节上会报红——已实测）；
   零浏览器存储断言（`localStorage`/`sessionStorage`/`indexedDB`/`caches.` 均不出现）；
   注册 zh/en 词典（含 `nav`/`title`/`intro` 与 rev-10 的会话文案）、订阅 `uiSession.pendingInteractions`、**remote 订阅数为 0**；
   分区页渲染出唯一的 `<h2>`「通知提醒」（与导航行文案一致）、一行 intro，以及
   range(0..100)/checkbox（rev-8 起 `role=switch`，绘制为苹果式拨动开关）/select(3 音色)/导入+隐藏 file input/试听/恢复默认/计数器文本/抑制原因行/
   只读与已覆盖徽标/错误行/bundleRevision 徽标（条件行各有一条断言）；
   拖动在释放时写 `set('volume',…)`（一次鼠标拖拽会先后触发 `pointerup` 与 `mouseup`，
   因此同一值**可能写两次**；平台的写队列串行化并携带 `pendingRevision`，语义等价于一次），
   开关/音色立即写，恢复默认走 `unset`；
   一次审批 = 一个连到 destination 的主增益且其值 **等于 `volume × MASTER_GAIN`**，
   同 key 重复发布不再响、替换请求（新 key）再响一次、非 approval 条目不响，
   `volume=0` / `enabled=false` 时**音频节点数为 0**；
   首个用户手势解锁 AudioContext 并释放监听、解锁前/不支持的浏览器只计数不抛异常，
   全程无 unhandled rejection。
3. **waterfall**：静态断言 `lib/client.js`/`lib/index.js` 里没有审批事件名、没有 `$on`、没有 `.on(`、
   没有 `waterfall(`；运行时断言 apply 后 remote 订阅为 0；
   用宿主**真实 cordis** 复跑 t1 的实测：不调用 `next()` 的监听器切断整条链、其后注册者永不执行、
   决策返回值原样返回、`{prepend:true}` 在 `ctx.on` 上确实生效（所以问题只在 `$on` 只转发两个参数，
   并由 `dsh-api-gateway/lib/client.js` 的 `$on(event, listener)` 源码签名佐证）；
   最后在这种"敌对环境"里证明本插件照样响铃。

> 自测会在 `%TEMP%` 下建一个临时目录（包外副本 + 空 DSH_HOME + 子进程脚本），
> 结束时删除；不写工作区其它位置，不碰 profile，不装任何包，不联网。

## 5. 挂载 + 重启验收步骤（交给 t5）

前置：§2 的 junction 存在；自测全绿。

1. **改 profile（唯一需要动 profile 的一步）** —
   `$DSH_HOME\profiles\web\package.json`：
   - `dependencies` 增加 `"dsh-approval-chime": "link:<repo>"`；
   - `dsh.profile.bundles` **追加** `"dsh-approval-chime"`（追加即最后一层；本插件对行序无要求）。
2. **让 profile 的 `node_modules` 出现该 junction**：
   推荐（t5 实测路径，等价于手改）：`node dsh-approval-chime/deploy/mount.mjs`
   —— 它先备份、再幂等地写入上面两处 JSON 改动并建 junction；`--dry-run` 只看不改。

   > ⚠️ **CLI 语义更正（t5 实测源码，`@deepseek-ai/dsh/lib/plugin-Ddi42qoW.js`）**：
   > `dsh plugin --profile <name> <args…>` 只是**把参数转发给 profile 目录里的 pnpm**
   > （`spawnSync('pnpm', args, { cwd: profileDir })`），成功后再按「已安装依赖」重算 `dsh.profile.bundles`。
   > 因此 **`dsh plugin --profile web install` 只是 `pnpm install`**：它本身**不会新增依赖**；
   > 只有当 `package.json` 已声明该 `link:` 依赖时，它才会建立 junction（并补上缺失的 bundles 项）。
   > 想用一条命令完成「依赖 + junction + bundles」，正确形式是
   > `dsh plugin --profile web add "link:<repo>"`；
   > **该形式本任务未实测**（会跑 pnpm、改写 `pnpm-lock.yaml` 并动 `node_modules`，风险大于收益），
   > 本插件采用的是上一条的等价手工/脚本路径。详见 `docs/挂载与验收.md` §8。

   退化路径（连脚本也不想跑时）：
   `New-Item -ItemType Junction -Path "$DSH_HOME\profiles\web\node_modules\dsh-approval-chime" -Target "<repo>"`。
   ⚠️ **不要**再往 `profiles/web/cordis.patch.yml` 里写同 id 的 `insert`：所有层的 patch 会合并成一个数组，
   重复 id 直接抛 `duplicate loader entry id` → 启动失败。临时停用请用 id 定向覆盖：
   `- id: dsh-approval-chime` + `disabled: true`。
3. **重启宿主**：宿主半不会热加载（宿主把 bundle 字节读进内存）。
   停掉当前 `dsh web` 进程，重新 `dsh web`，然后浏览器**刷新一次**页面。
4. **验收信号（可观测）**：
   - 宿主日志无 `failed to import loader entry dsh-approval-chime`、无 `client-modules: … failed to compose`；
   - 浏览器控制台：`window.__DSH_BOOT__.entries` 里出现 `{id: 'dsh-approval-chime'}`；
   - 控制台：`window.__DSH_APPROVAL_CHIME__` 存在（见 §7 自证接口）；
   - 设置导航里出现独立一行 **「通知提醒」**（在「插件」之后、「Agent 预设」之前），进入后是标题「通知提醒」+ 一行说明 + 本插件的全部控件，右上角带构建戳（当前 `rev-11 · per-session chime (race fix)`），**且「启用提示音」是苹果式拨动开关（开启=与音量条同色的蓝底白钮、关闭=灰底）**；
   - **反向判据**：设置 → 插件 → 插件配置里**不再**出现本插件的行（rev-7 起不再注册那张卡片）；
   - `$DSH_HOME\settings.yaml` 出现 `approval-chime:` 段（点一次试听/改一次音量后）。
   - **rev-10 的新信号（rev-11 起写入收敛）**：任意会话标题行出现**小铃铛 + caret**（开=实心 / 关=带斜杠，hover 中英双语）；
     控制台 `await fetch('/api/approval-chime/sessions').then(r => r.json())` 返回 `{ok:true, revision:…, sessions:{…}}`；
     `$DSH_HOME\approval-chime\sessions.json` 在点过铃铛/caret 后出现；连点两次后
     `__DSH_APPROVAL_CHIME__.sessionWrites().outstanding === 0`（写入已落定并重读过）。
     手工步骤见 `docs/挂载与验收.md` §7.1。
   - **分区页空白时先看宿主日志**：搜 `dsh-approval-chime`。若是
     `could not load @deepseek-ai/schemastery; settings namespace "approval-chime" is not registered`，
     就是 §2 的 junction 缺失（重建后重启即可，导航行仍在但页面为空）；若是 `settings service unavailable`，说明 profile 里没有
     `dsh-settings`（本插件对它是硬依赖，只影响本插件）。
5. **功能验收（不依赖听力）**：
   - 分区页「已触发」计数在审批出现时 +1，「上次触发」显示时间；没有声音时下面的提示行会说明原因
     （被开关关闭 / 音量为 0 / 浏览器自动播放策略 / 不支持 WebAudio）；
   - 先点一次页面任意处或「试听」解锁 AudioContext，再触发一次审批（让宿主申请一次权限），
     应能听到提示音；把音量拖到 0 或关掉开关后，计数只能看到"静音原因"，不应有任何声音；
   - 刷新页面后音量/音色/开关保持（值来自宿主设置文档）。
6. **回滚**：删掉 `dsh.profile.bundles` 里那一行与 `dependencies` 里那一行 → 重启；
   可选删除 profile 里的 junction 与 `settings.yaml` 里的 `approval-chime:` 段。三层独立可回滚。

## 6. 触发设计（为什么不用审批瀑布）

t1 的实测结论（`docs/契约调研.md` §A）：

- `ctx.remote.$on(event, listener)` **只有两个形参**，第三个 `{prepend:true}` 被静默丢弃
  （`dsh-api-gateway/lib/client.js:1472-1474` → `remote-events.js:32-35`）。
- 内置 `ui-approval` 的行由 `dsh-web-app` 的 patch 插在我们前面，且它的正常路径是
  `return await pending.result` —— **不调用 `next()`**，cordis 的事件链到此为止，其后注册者永不执行。
- 因此加入这条链只有两种结果：不响，或者把用户的审批面板吞掉。**本插件一行都不碰它。**

实际做法：订阅 `ctx.uiSession.pendingInteractions`（`getSnapshot()` / `subscribe() => disposer`），
按快照里**新出现的** `kind === 'approval'` 条目的 `key` 去重后响铃：

- 同一 `key` 永远只响一次（快照因无关原因重发不重复响）；替换请求是新 `key`，会再响一次；
- **一批新审批（多个会话同时等待）各响各的**（rev-10）：快照里每个可响的会话各响一次，按快照顺序、相邻 180 ms；
  被该会话自己静音的条目不响并计入 `suppressedSession`（旧行为「一批只响一声」已按用户要求改掉）；
- 每条审批用的是**它自己那个会话**的有效值（`会话覆盖 ?? 全局`：音色/音量/开关逐字段）；
- 页面加载时若已有待审批条目，会补响一次（同样是逐会话）；
- 已见 key 保留最近 256 个（FIFO 淘汰）。

**已知宿主限制（记录，不绕过）**：每个 session 只暴露一个 pending interaction（按 precedence 取大者），
同会话同时有待审批与待回答问题时审批可能被遮蔽 → 那一次会漏响。见 `docs/契约调研.md` §H3。

## 7. 无声环境自证接口

浏览器控制台：

```js
window.__DSH_APPROVAL_CHIME__.revision      // 'rev-11 · per-session chime (race fix)'（判断页面是否旧 bundle）
window.__DSH_APPROVAL_CHIME__.slot          // 'settings.section'（分区页注册的槽）
window.__DSH_APPROVAL_CHIME__.sessionSlot   // 'conversation.session.header.actions'（铃铛注册的槽，rev-10）
window.__DSH_APPROVAL_CHIME__.sessionAction // {id:'approval-chime', order:30}（铃铛的格子与排序，rev-10）
window.__DSH_APPROVAL_CHIME__.batchGapMs    // 180（同一批相邻两声的间隔，rev-10）
window.__DSH_APPROVAL_CHIME__.stats()       // {triggers, previews, approvalsSeen, lastAt, lastTone, lastVolume, lastGain, suppressedXxx…, lastBatchSize, lastBatchPlayed}
window.__DSH_APPROVAL_CHIME__.audio()       // {state:'idle|running|suspended|unsupported|error', unlocked, lastError}
window.__DSH_APPROVAL_CHIME__.settings()    // 当前生效的全局 {enabled, volume, tone, custom}
window.__DSH_APPROVAL_CHIME__.preview()     // 按当前设置响一次（开关关闭时返回 false，不发声）
window.__DSH_APPROVAL_CHIME__.unlock()      // 手动解锁 AudioContext（等价于一次用户手势）
window.__DSH_APPROVAL_CHIME__.snapshot()    // 分区页读到的完整快照
window.__DSH_APPROVAL_CHIME__.sessions()    // rev-10：{ready, revision, error, sessions:{<sessionId>:{…}}}
window.__DSH_APPROVAL_CHIME__.sessionSettings('<sessionId>')
// rev-10：该会话的有效值 {enabled, volume, tone, overridden:{enabled,volume,tone}, customMissing, globals:{enabled,volume,tone}}
window.__DSH_APPROVAL_CHIME__.toggleSession('<sessionId>')  // rev-10：等价于点一次铃铛（乐观更新，失败回滚）
window.__DSH_APPROVAL_CHIME__.refreshSessions()             // rev-10：重新从宿主读覆盖表
window.__DSH_APPROVAL_CHIME__.sessionWrites()               // rev-11：{outstanding:<n>} 还在飞的会话写入数；0 = 已重读、本地表=宿主文件
```

`stats().lastGain` 就是那一枪实际挂到 destination 上的主增益值（`volume/100 × 0.6`），
所以「响没响、以多大声响、为什么没响」都能在不听声音的情况下判定；
`stats().suppressedSession` 是「被本会话静音」的次数（与全局关闭的 `suppressedDisabled` 分开计数，rev-10）。

## 8. 浏览器端依赖边界（实测结论）

可以 `require` 的种子模块（shell 产物 `staticModules` 实测）：
`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、
`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、
`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`
（外加模块图上存在的行 id）。

**不能** `require` 的：平台卡片工具 `CardForm` / `numberField` / `ValueField` / `PluginCard` ——
`dsh-client-ui-settings-plugins` 的浏览器 bundle 只导出 `apply`/`inject`（`lib/client.js:1813-1814`）。
所以本插件的分区页是**自绘**的（原生 `input[type=range]`、`input[type=checkbox]`（rev-8 起被 CSS 画成
iOS 拨动开关，原生控件仍在、仍可 Tab 聚焦与空格切换）、`select`、`button`，
样式走宿主 CSS 变量 `var(--dsw-alias-*)`，分区/标题/intro 的排版照抄宿主
`dsh-client-ui-settings-models` 的 `.section/.title/.intro` 规则），但**写入仍走平台契约**：
`ctx.settingsScope.bind({namespace:'approval-chime'})` 的 `set`/`unset`，落到宿主设置文档。
rev-10 的会话 popover 同样是自绘的：**内联 SVG 图标 + `position:fixed` 自定位 + 自己实现的
「外部 pointerdown / Escape 关闭」**（平台提供的 `useDismissOnOutsidePointer` 来自
`dsh-client-ui-primitives`，而该包不在可 require 的种子里）；它的写入**不走设置文档**，
走宿主半自己的 `POST /api/approval-chime/sessions`（§3.2）。

本 bundle 只用 `require('react')`（自测里断言"只有 react 一个 require"）。

## 9. 已知风险 / 未证实项

| # | 事项 | 处置 |
| --- | --- | --- |
| H2 | `uiSession.pendingInteractions` 是否被官方列为第三方扩展点（**未证实**） | 取不到时打印明确警告并停用提示音，分区照常注册（自测覆盖） |
| H3 | 每 session 只暴露一个 pending | 记录为已知限制（§6） |
| H4 | 改 `lib/client.js` 后是否真的热替换（**未证实**） | 验收按"重启宿主 + 刷新页面 + 核对分区页上的 `REVISION`"执行，不依赖自动热替换 |
| H5 | 自动播放策略 | 全局首个手势解锁 + 分区页「试听」手势 + 每次被策略拦下都计数并在页面上提示 |
| H12 | 非 loopback 页面写入只在内存 | 该模式下 `status` 不会变成 `ready` → **分区页整体渲染为空**（导航行仍在，无提示行）；验收须用 `http://127.0.0.1:3080` |
| H13 | `settings.section` 是否被官方列为第三方扩展点（**未证实**；rev-7 新依赖） | 该槽由设置外壳声明（`dsh-client-ui-settings-general/lib/client.js:621-624`），宿主契约调研文档见 `docs/契约调研.md` §K；注册本身包在 try/catch 里，失败只丢导航行、不影响提示音 |
| H14 | `conversation.session.header.actions` 是否被官方列为第三方扩展点（**未证实**；rev-10 新依赖） | 该槽由会话头部组件声明（`dsh-cordis-client-runner/lib/client.js:3102-3157`，占位者可查 `:3149-3154`；官方占用者确实从 props 取 `sessionId`，`dsh-client-ui-jobs/lib/client.js:117`），见 `docs/契约调研.md` §L.1；注册包在 try/catch 里，失败只丢铃铛、不影响提示音与设置页 |
| H15 | **覆盖表不跨机器**（②B 的固有属性，设计如此） | 覆盖存在宿主机器的 `$DSH_HOME\approval-chime\sessions.json`，换机器/换 profile 不跟随；全局设置仍按平台通路走。**不提供同步**：跨端同步需要平台级存储，超出插件边界 |
| H16 | popover 的 `position:fixed` 若被带 `transform` 的祖先裁剪 | 头部行本身不裁剪（`dsh-client-ui-conversation/lib/client.js:14652` 的 `.headerActions` 无 overflow/transform）；若未来宿主给祖先加 `transform`，popover 可能被裁 → 目前按契约上溯不到该情形，**未在真机验证** |
| H17 | 同一会话铃铛连点两次的写序（**rev-11 已修**） | rev-10 的窗口：两次 POST 的应答被反序投递时，**后到**的应答会覆盖**更新**的那一次，本地表与宿主文件相反且没有收敛路径（审查者 F-01）。rev-11 起：每次写入 +1 一个在飞计数，**计数归零时重读一次宿主文件**，本地表最终等于文件（与应答顺序、与宿主两次 `rename` 的顺序都无关）。**残留窗口（如实记录）**：重读完成前的一瞬，本地表可能短暂停在被反序覆盖的状态（一次 `GET` 的往返，本机 median 3.33 ms）；重读失败时退化为"无覆盖"并在 popover 保留原因为错误行。未加请求序号/串行化（审查者给的选项①）：本实现选的是选项② |
| H18 | 「全局关时给单个会话强制打开」**故意不做**（用户选 ①A） | 会话覆盖只可能比全局更安静：铃铛只写 `enabled:false` 或清除覆盖。若手工把 `enabled:true` 写进 `sessions.json`，有效值公式仍会取它（`覆盖 ?? 全局`）——那是文件的语义，不是 UI 的入口 |
