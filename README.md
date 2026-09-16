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

本 README 是 t2 的交付说明，也是 **t5 挂载/重启验收** 的操作手册。
实现依据：`docs/契约调研.md`（t1 的宿主契约调研，63.9KB，全部结论带 `文件:行号`）。

---

## 1. 包结构

```
dsh-approval-chime/
  package.json                 name/type=module/exports{./client,./cordis.patch.yml}/
                               dsh.bundle.patch=./cordis.patch.yml, dsh.client.platform='web'
  cordis.patch.yml             insert 一行 {id: dsh-approval-chime, name: dsh-approval-chime}
  lib/index.js                 宿主半：注册 approval-chime 设置命名空间（默认 enabled=true, volume=70, tone=chime）
  lib/client.js                浏览器半：审批监听 + WebAudio 合成 + 「通知提醒」设置分区（经典脚本，只有 factory 闭包）
  verify/_harness.mjs          自测脚手架（vm 经典脚本加载器 / 模拟 React / 模拟 AudioContext / 模拟服务与 locale）
  verify/host-half.test.mjs    自测 1：包结构 + 宿主半注册与降级
  verify/client-half.test.mjs  自测 2/3：浏览器半装载、settings.section 注册、分区页、响铃语义、自动播放策略
  verify/waterfall.test.mjs    自测：审批瀑布零注册（静态 + 运行时 + 真 cordis 对照实验）
  node_modules/@deepseek-ai/schemastery   指向上游自愈副本的 junction（见 §2，必须存在）
  docs/契约调研.md             t1 产出（本插件所有宿主契约的唯一依据）
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

## 4. Headless 自测（无需浏览器、无需宿主、无需装包）

```powershell
cd '<workspace>'
node --check dsh-approval-chime/lib/index.js
node --check dsh-approval-chime/lib/client.js
node dsh-approval-chime/verify/host-half.test.mjs      # 56 项
node dsh-approval-chime/verify/client-half.test.mjs    # 143 项
node dsh-approval-chime/verify/waterfall.test.mjs      # 20 项
node dsh-approval-chime/verify/custom-audio.test.mjs   # 74 项（导入音频）
```

全部打印 `[PASS]` 并以退出码 0 结束；任何一项失败会打印 `[FAIL]` 并置退出码 1。

各自证明什么：

1. **host-half**：package.json/cordis.patch.yml 的挂载契约（`exports['./client']`、`dsh.bundle.patch`、
   `dsh.client.platform`、只 insert 一次、id=name）；junction 存在且指向宿主镜像；
   `ctx.settings.register('approval-chime', schema, {applies:'live'})` 注册了**真的 schemastery schema**
   （默认值 `{enabled:true,volume:70,tone:'chime'}`，拒绝 `volume=200 / -1 / tone='nope' / enabled='yes'`）；
   重复注册会被跳过；`ctx`/`settings` 缺失、`describe()` 抛错、`register()` 抛错都不外抛；
   **在包外副本 + 空 `$DSH_HOME` 的子进程里，schema 不可解析时 apply 依旧不抛且什么都不注册**。
2. **client-half**：`lib/client.js` 以 `vm` 经典脚本方式装载（等同 `<script src>`），
   `id='dsh-approval-chime'`、只 `require('react')`、factory 返回 `{name, inject, apply}`；
   apply 后：绑定 `{namespace:'approval-chime'}`、注册 **`settings.section`** 一项
   （`id='approval-chime'`、`order=16`、`label` 是随 locale 重读的 thunk、`locale=NS`），
   并断言**从未**注册/等待/提及插件页那张卡片的槽；
   注册 zh/en 词典（含 `nav`/`title`/`intro`）、订阅 `uiSession.pendingInteractions`、**remote 订阅数为 0**；
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
   - 设置导航里出现独立一行 **「通知提醒」**（在「插件」之后、「Agent 预设」之前），进入后是标题「通知提醒」+ 一行说明 + 本插件的全部控件，右上角带构建戳（当前 `rev-9 · slim switch`），**且「启用提示音」是苹果式拨动开关（开启=与音量条同色的蓝底白钮、关闭=灰底）**；
   - **反向判据**：设置 → 插件 → 插件配置里**不再**出现本插件的行（rev-7 起不再注册那张卡片）；
   - `$DSH_HOME\settings.yaml` 出现 `approval-chime:` 段（点一次试听/改一次音量后）。
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
按快照里**新出现的** `kind === 'approval'` 条目的 `key` 去重后响一次：

- 同一 `key` 永远只响一次（快照因无关原因重发不重复响）；替换请求是新 `key`，会再响一次；
- 一批新审批（多个会话同时等待）只响一声；
- 页面加载时若已有待审批条目，会补响一次；
- 已见 key 保留最近 256 个（FIFO 淘汰）。

**已知宿主限制（记录，不绕过）**：每个 session 只暴露一个 pending interaction（按 precedence 取大者），
同会话同时有待审批与待回答问题时审批可能被遮蔽 → 那一次会漏响。见 `docs/契约调研.md` §H3。

## 7. 无声环境自证接口

浏览器控制台：

```js
window.__DSH_APPROVAL_CHIME__.revision      // 'rev-9 · slim switch'（判断页面是否旧 bundle）
window.__DSH_APPROVAL_CHIME__.slot          // 'settings.section'（本 bundle 注册进去的槽）
window.__DSH_APPROVAL_CHIME__.stats()       // {triggers, previews, approvalsSeen, lastAt, lastTone, lastVolume, lastGain, suppressedXxx…}
window.__DSH_APPROVAL_CHIME__.audio()       // {state:'idle|running|suspended|unsupported|error', unlocked, lastError}
window.__DSH_APPROVAL_CHIME__.settings()    // 当前生效的 {enabled, volume, tone}
window.__DSH_APPROVAL_CHIME__.preview()     // 按当前设置响一次（开关关闭时返回 false，不发声）
window.__DSH_APPROVAL_CHIME__.unlock()      // 手动解锁 AudioContext（等价于一次用户手势）
window.__DSH_APPROVAL_CHIME__.snapshot()    // 分区页读到的完整快照
```

`stats().lastGain` 就是那一枪实际挂到 destination 上的主增益值（`volume/100 × 0.6`），
所以「响没响、以多大声响、为什么没响」都能在不听声音的情况下判定。

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
