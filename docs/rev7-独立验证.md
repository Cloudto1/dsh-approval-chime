# rev-7 独立验证（verifier · 任务 t2）

对象：`dsh-approval-chime` rev-7「设置入口从『设置 → 插件 → 插件配置』迁到独立的『设置 → 通知提醒』分区」。
被验文件（只读）：`lib/client.js` / `lib/index.js`；冻结路径（未改）：`lib/**`、`verify/**`、`README.md`、`CHANGELOG.md`。

**结论（一句话）**：rev-7 的客户端半确实落在了 DSH `settings.section` 槽上（`id='approval-chime'`、`order=16`、`label` thunk、`locale='approval-chime'`），`settings.plugin.item` 在真实的字节与桩槽调用记录里都不存在，迁移前那批控件一项未丢；四套 harness + 全部独立探针 + 审查者探针重跑无新增失败。真实浏览器渲染、导航行像素、真实 `dsh web` 端到端、真实文件对话框在**本沙箱内未证实**（见 §8）。

| 项 | 结果 |
| --- | --- |
| 新探针 `verify-independent/probe-17-r7-section.mjs` | **94/94 通过，exit 0** |
| 探针反证能力（5 个变异体） | 全部按预期报红（§6） |
| 四套 harness | 56/143/20/74 = **293** 项全绿，exit 0 |
| 独立探针 probe-7..17 | 除 probe-13（沙箱无浏览器引擎，预期非零）全部 exit 0 |
| 审查者探针 | reqcheck-rev5 69/69 exit 0；reqcheck-host-413 9/9 exit 0；reqcheck.mjs 34/5 exit 1（**rev-7 之前就有的既有差异**，见 §7.4） |
| 冻结路径 sha256 前后一致 | **一致**（§9） |

---

## 0. 我的独立性（为什么这不是复用实施者的测试）

- 探针 `verify-independent/probe-17-r7-section.mjs` 的 import 只有 `node:crypto`、`node:fs`、`node:path`、`node:url`、`node:vm`（`:39-43`）。
  **没有** import `verify/_harness.mjs`，也**没有** import `verify-independent/kit/platform.mjs`：报告器（`:62`）、classic-script 加载器（`vm.createContext` + `window.__ModuleLoader__.load` 捕获，`:266-338`）、React 函数组件驱动器（真实 hook 槽，`:341-424`）、DOM 桩（`:202-239`）、插件上下文桩（`:427-560`）全部是本次新写的独立实现。
- 断言分组：`:566`（字节锚定）、`:580`（槽注册）、`:619`（旧槽消除）、`:640`（locale/id/order）、`:712`（控件渲染）、`:792`（导入态）、`:810`（写入与闸门）、`:843`（变异反证）。
- 探针只读两种真实字节：本插件 `lib/client.js`，以及 DSH 的 `@deepseek-ai/*/lib/client.js`（用于订单数字取证）。
- 运行器 `verify-independent/run-r7.ps1` 由 `run-r6.ps1` 派生，日志前缀 `r7-`，`r4`（`ind-probe-*-r4-*`）/`r5`（`r5-*`）/`r6`（`r6-*`）归档一律不覆盖。
- 命令（`verify-independent/` 下执行，或从仓库根调用 run-r7.ps1）：
  ```
  node  verify-independent/probe-17-r7-section.mjs
  node  verify-independent/probe-17-r7-section.mjs --mutate=<slot|order|heading|picker|rogue>
  &     verify-independent/run-r7.ps1
  ```

## 1. 字节锚定（先钉死后验对象）

`probe-17` 第 0 组断言（`_raw/r7-ind-probe-17-r7-section.txt:3-8`：`:4` 字节数、`:5` sha256、`:6-8` 三条断言）：

- `lib/client.js` = **80889 B**，sha256 = **6B9C38CE738859C4D0007EE027B994353242D4C8C974B1E39A420CF48D54F5D1**
  —— 与 `CHANGELOG.md:40` 锚定字节、与 t1 交付说明**逐字节相同**；实现者写入 CHANGELOG 的锚点没有漂移。
- `lib/index.js` = 27592 B / `75188B4C…`（`_raw/r7-baseline-before.txt`），与 `CHANGELOG.md:41` 一致 —— DSH 侧确实一个字节未动。
- `lib/client.js` 无顶层 `import`/`export`（经典脚本约束，`lib/client.js:5`），加载器按 `<script src>` 语义执行。

## 2. 我自己读的 DSH 合同（不是照抄实施者结论）

文件均在 `<dsh-install>\node_modules\@deepseek-ai\`：

| 合同 | 位置 | 我读到的内容 |
| --- | --- | --- |
| `settings.section` 槽声明 | `dsh-client-ui-settings-general/lib/client.js:621-624` | `"settings.section": { kind: "list", scope: "root" }`，由 `sidebar.settings` 那条注册的 `children` 声明（同文件 `:601-661`） |
| 每行投影 | `dsh-client-ui-settings-general/lib/client.js:560-582` | `entries("settings.section")` → `{id: e.options.id ?? "", order: e.options.order ?? 0, label: resolveSlotLabel(e.options.label) ?? ""}`，然后 `.sort((a,b) => a.order - b.order)`；`subscribe` 同时挂在槽账本与 locale revision 上 → **label thunk 每次投影重读，切语言即跟随** |
| 槽合同（选项语义） | `dsh-cordis-client-runner/lib/client.js:3872-3919` | `id` **required**，`"Use an id of your own: a fresh id is added beside the shipped entries, while reusing a shipped id puts you in THAT cell and replaces it"`（`:3882`）；`order` optional number（`:3885-3888`）；`label` `string | (() => string)`，`"A thunk is re-read on every projection…"`（`:3891-3895`） |
| 未知 id 的图标回退 | `dsh-client-ui-settings-general/lib/client.js:75-93` | `navIcon(id)` 只识 `models`/`agent-presets`/`plugins`，其余一律回退 `IconSettingsOutline16`（齿轮）→ 本插件那一行会显示齿轮图标（**外观未证实**，见 §8） |
| 插件页交集语义 | `dsh-client-ui-settings-plugins/lib/client.js:1099-1152` | `served = describe 镜像里被服务的命名空间集合`（`:1144`），`namespaces = entries().flatMap(entry => entry.options.key !== void 0 && served.has(entry.options.key) ? [entry.options.key] : [])`（`:1145`）——**卡片只有在注册了 `key` 且该 key 被服务时才会被派发** |
| 已占用 order | general `:651-655`=0、models `:2936-2940`=10、plugins `:1761-1765`=15、agent-presets `:1519-1523`=20 | 见 §4 的探针实测（探针每次运行都从这些文件重读） |
| 翻译器与「查不到」语义 | `dsh-client-locale/lib/client.js:1283-1291`（`bind(ns)` 返回 `(key,params)=>this.translate(ns,key,params)` 并按 ns 缓存）、`:1292-1296`（`lookup(...) ?? key`，即查不到原样返回 key） | 与 `lib/client.js:1075-1088` 的「拿回 key 就当 miss」判定方向一致 |

## 3. 「移走了」方向：`settings.plugin.item` 彻底不在（双证）

原始输出：`_raw/r7-ind-probe-17-r7-section.txt` 第 1、2 组。

**证 A —— 桩槽调用记录（行为级）**
```
· slots.inject calls   = ["settings.section"]
· slots.register entries = [{"name":"settings.section","id":"approval-chime","order":16,"locale":"approval-chime"}]
· the raw entry handed to slots.register = name=string id=string order=number label=function locale=string
```
- 断言 `exactly one slots.inject happened` = 1、`the injected slot name` = `settings.section`、`exactly one slots.register happened` = 1。
- `no settings.plugin.item slot was injected` = 0、`no settings.plugin.item registration ledger entry` = 0。
- `the bundle no longer claims a keyed-card key`：`entry.key === undefined` —— 插件页只派发带 `key` 的注册（`dsh-client-ui-settings-plugins/lib/client.js:1145`），没有 `key` 就是**结构上不可能**出现在「插件配置」里，与 DSH 是否服务该命名空间无关。

**证 B —— 源码字符串级反证（无条件）**
```
· literal occurrences in the shipped source (comments included) = []
```
断言 `the shipped source contains no settings.plugin.item registration`：整个 80889 B 里 `settings` + `.plugin.item` 一个字面出现都没有（注释也算）。另加 `plugin.item | plugins.tab | ConfigurablePlugins` 的联合判据 = 无匹配。

**与 `diagnostics` 自证面一致**：`diagnostics.slot === 'settings.section'`（`lib/client.js:1615`）。

## 4. 「在「通知提醒」上且紧跟「插件」之后」方向

原始输出：同文件第 3 组。探针**每次运行都从 DSH 文件重读订单数字**，实测：

```
· host section registrations read first-hand =
  general        line 652  id general        order 0
  models         line 2937 id models         order 10
  plugins        line 1762 id plugins        order 15
  agent-presets  line 1520 id agent-presets  order 20
```
（`dsh-client-ui-settings-general/lib/client.js:652`、`dsh-client-ui-settings-models/lib/client.js:2937`、`dsh-client-ui-settings-plugins/lib/client.js:1762`、`dsh-client-ui-agent-preset/lib/client.js:1520`）

- 本插件实测：`name = settings.section`、`id = approval-chime`、`order = 16`、`label` 是 function、`locale = approval-chime`。
- `order 16 落在 plugins(15) 与 agent-presets(20) 之间`：`15 < 16 < 20` ✓；同时 `> models(10) > general(0)` ✓。
- **按 DSH 自己的投影规则复算**（`sort by order`）：`['general','models','plugins','approval-chime','agent-presets']` —— 这一行就落在「插件」的下一格。
- **id 不撞车**：`approval-chime` 不等于 `general`/`models`/`plugins`/`agent-presets` 任何一个，即 DSH 合同里说的「fresh id 是新增一格，复用 shipped id 会顶替那一格」的反面判据成立。

**locale 反应性**（同一实例内翻转，不重新注册）：
- zh 实例：`label()` → `通知提醒`（dict `lib/client.js:980`）；en 实例：`label()` → `Notifications`（`:1023`）。
- 在**同一个** zh 实例上把 locale 翻成 `en` 再投影：`Notifications`；翻回 `zh`：`通知提醒` ✓（≈ `dsh-client-ui-settings-general/lib/client.js:560-582` 每次投影重读 thunk 的行为）。
- 绑定的翻译器是 `ctx.locale.bind('approval-chime')`（`lib/client.js:1751-1757`），thunk 读的是 `nav` 键（`lib/client.js:1104-1115`）；`nav` 与 `title` 同文（`:980-981` / `:1023-1024`），所以**导航行与页内 `<h2>` 不可能漂移**。

## 5. 「没丢东西」方向：控件逐项对照（React 桩渲染，一次都没少）

原始输出：同文件第 4、5、6 组。渲染的是**桩槽记录里真实注册的组件函数**（`ChimeSection`，`lib/client.js:1233`），props 只有 DSH 会给的 `close`。

| 迁移前控件/行为 | 断言 | 证据 |
| --- | --- | --- |
| 页级标题 | 唯一一个 `<h2>` 文本 = `通知提醒` | 与导航行同文（`lib/client.js:1595`，读 `t('title')`） |
| 说明行 | intro 文本 = `DSH 向你申请权限时响一次…` | `lib/client.js:1598` |
| 启用勾选 | 恰好 1 个 checkbox，默认 checked，且包在 `<label>` 里带文字 | `lib/client.js:1451-1466` |
| 音量滑杆 | 恰好 1 个 range，min0/max100/step1，值 70，`aria-label=音量`，可写时可点 | `lib/client.js:1474-1492` |
| 音色下拉 | 恰好 1 个 select，选项 `chime/bell/beep`，`aria-label=音色` | `lib/client.js:1500-1515` |
| 下拉「3 行可视高度」 | 注入 CSS 里 `::picker(select){…box-sizing:content-box;max-height:84px;…overflow-y:auto}`；且 `diagnostics.toneRows === 3`、行高实测 `line-height:20px` + padding 4px×2 = 28px，`3×28 = 84` 与 max-height 相符 | `lib/client.js:1168-1187`（`:1182` 是 `box-sizing`/`max-height`，`:1184` 是行高），`TONE_ROWS=3`/`TONE_ROW_PX=28` 在 `:161-162` |
| 下拉圆角 | `::picker(select){…border-radius:10px;…}` | `lib/client.js:1171` |
| 下拉配色（深色主题可用） | `select option{background-color:…;color:…}` 仍在 | `lib/client.js:1161-1162` |
| 导入按钮 | 按钮文本 `导入音频`，带 `title=customHint`，点击驱动隐藏 input | `lib/client.js:1517-1536` |
| 隐藏 file input | 恰好 1 个 `type=file`，`accept=audio/*`，`class=dacFile`，且 `display:none` 仍在注入 CSS 里 | `lib/client.js:1517-1523`、`:1191` |
| 删除 | 选中导入音色时出现 `移除` 按钮（第 5 组：导入项在前、roster 名作 label） | `lib/client.js:1537-1549` |
| 试听 | 按钮 `试听`，启用且绑定播放函数；关闭提醒时置灰 | `lib/client.js:1550-1560` |
| 恢复默认 | 按钮 `恢复默认` | `lib/client.js:1561-1569` |
| 计数行 | `已触发: 0` / `上次触发: 尚未触发` / `最近音色/音量: —` / `已见审批: 0` / `音频状态: 未创建…` | `lib/client.js:1571-1583` |
| 抑制原因行 / 只读徽标 / 已覆盖徽标 / 错误行 | 条件渲染仍在（第 6 组覆盖写入路径；条件分支按 `snapshot` 决定） | `lib/client.js:1440-1445`、`:1467-1468`、`:1585-1587` |
| bundleRevision 徽标 | 右上角 `.dacRev` 文本 = `rev-7 · notifications section` | `lib/client.js:108`（REVISION）、`:1596` |
| 「可用才渲染」闸门 | `status=loading` 渲染 `null`；转 `ready`（并按 DSH 语义通知 scope 订阅者）后有页面；转 `error` 又回到 `null` | `lib/client.js:1264` |
| 写入路径未变 | 拖杆→松手恰好 1 次 `set{volume:35}`；开关→`set{enabled:false}`；全程只走绑定的 settings scope | `lib/client.js:1280-1305` |

## 6. 反证能力：5 个变异体必须报红（变异只改内存字符串，磁盘零改动）

`verify-independent/_raw/r7-ind-probe-17-mutations.txt`（每次实验都先跑基线）：

| 变异体 | 命令 | exit | 结果 |
| --- | --- | --- | --- |
| 基线（真实字节） | `node probe-17-r7-section.mjs` | 0 | `[shipped]: 94/94` |
| 仍注册 `settings.plugin.item` | `--mutate=slot` | 1 | `[mutant:slot]: 91/98`；`every expected check failed … all 3 expected failures observed`（槽名、账本里那条 `settings.plugin.item`、`entry.key` 出现） |
| order 写错（16→99） | `--mutate=order` | 1 | `[mutant:order]: 93/96`；`all 1 expected failures observed`（`order is 16` 报红，且 DSH 投影复算把本行排到了 Agent 预设之后） |
| 控件缺失（删 `<h2>`） | `--mutate=heading` | 1 | `[mutant:heading]: 94/96`；`all 2 expected failures observed` |
| 播放下拉回归（删 3 行高度规则） | `--mutate=picker` | 1 | `[mutant:picker]: 95/96`；`all 1 expected failures observed` |
| 「旧的没删干净」：新分区之外再偷偷注册 `settings.plugin.item` | `--mutate=rogue` | 1 | `[mutant:rogue]: 93/99`；`all 3 expected failures observed`（`slots.inject` 变 2 次、`slots.register` 变 2 次、账本里出现插件页槽） |

每个变异体都额外自证「确实改写了被评估的源码」（字节数变化，或同字节的等长替换 + 前置断言报红）。
**注意**：变异模式 `exit 1` 是**设计如此**——它必须靠断言失败来证明探针会咬人；`every expected check failed …` 行才是变异实验的通过判据。

## 7. 全量回归（`run-r7.ps1`）

原始输出：`verify-independent/_raw/r7-run-console.txt`（逐 probe 汇总行 + 退出码表）。

### 7.1 四套 harness（只读重跑）
| 套 | exit | 汇总行 |
| --- | --- | --- |
| `host-half` | 0 | `=== host-half.test.mjs: 56/56 checks passed ===` |
| `client-half` | 0 | `=== client-half.test.mjs: 143/143 checks passed ===` |
| `waterfall` | 0 | `=== waterfall.test.mjs: 20/20 checks passed ===` |
| `custom-audio` | 0 | `=== custom-audio.test.mjs: 74/74 checks passed ===` |

合计 **293** 项，与 `CHANGELOG.md:36-39` 声明的 56+143+20+74 逐项吻合。`audio/` 目录跑前跑后都是 0 个文件（共享可变状态的卫生项保持干净）。
另：这些 harness 确实加载**真实** `lib/client.js`（`verify/_harness.mjs:21,27,189`），不是桩副本；`verify/client-half.test.mjs:100-119` 已把断言改成新槽形态（含「从未命名插件页槽」）。

### 7.2 我的独立探针（probe-7..probe-17）
| probe | exit | 汇总 |
| --- | --- | --- |
| probe-7-r4-roster | 0 | 43/43 |
| probe-8-r4-playback | 0 | 61/61 |
| probe-9-r4-concurrency | 0 | 38/38 |
| probe-10-r4-volume | 0 | 66/66 |
| probe-11-r4-css-rows | 0 | 31/31 |
| probe-12-r4-injection | 0 | 47/47 |
| **probe-13-r4-browser** | **1（预期）** | 11/14 |
| probe-14-r5-http-413 | 0 | 36/36 |
| probe-15-r5-names-files | 0 | 105/105 |
| probe-16-r5-cap-race | 0 | 47/47 |
| **probe-17-r7-section（新）** | **0** | **94/94** |

### 7.3 审查者探针（`.scratch/reviewer-r5/`）
| probe | exit | 汇总 |
| --- | --- | --- |
| reqcheck-rev5.mjs | 0 | 69 passed / 0 failed |
| reqcheck-host-413.mjs | 0 | 9 passed / 0 failed |
| reqcheck.mjs | 1 | 34 passed / 5 failed |

### 7.4 reqcheck.mjs 的 5 条失败属于**既有差异**，与 rev-7 无关
逐行对比 `_raw/r6-reviewer-reqcheck.txt` 与 `_raw/r7-reviewer-reqcheck.txt`：**5 条 FAIL 行完全逐字相同**
（`the select max-height rule lives only inside @supports`、`the option geometry was parsed from the real stylesheet`、
`the author rule never pins box-sizing`、`the 51st import IS uploaded…`、`the card shows it as the synthetic 「（文件缺失）」 row`）。
前 3 条正是 rev-5 为修 R5-1 而**有意**加 `box-sizing:content-box` 造成的判据过期；后 2 条是 rev-6 N3 之后仍未实现的 roster 上限场景。
`reqcheck.mjs` 里没有 `settings.plugin.item` / `settings.section` / `slots.inject` 任何一处，它按组件取卡片而不是按槽，所以 **rev-7 的槽位迁移不可能影响它**（`_raw/r7-reviewer-reqcheck.txt` 仍打印 `apply() mounted the settings card without throwing`、`card children = ["div.dacHead","p.dacIntro","div.dacCard"]`）。
此项**未退化为新回归**；但它使「除 probe-13 外全部 exit 0」在字面上不成立，故如实列出。

## 8. 未证实项（沙箱内无法证实，**不得读作通过**）

| 项 | 状态 | 阻塞原因与已有替代证据 |
| --- | --- | --- |
| 真实浏览器渲染（DOM 真的长成什么样、`<select>` 弹出层是否真的 3 行 84px） | **未证实** | 本沙箱无可用浏览器引擎：`_raw/ind-probe-13-browser-launch.log` 里 Edge 已 `DevTools listening on ws://127.0.0.1:55059/...`，但下一行即 `FATAL:mojo\public\cpp\platform\platform_channel.cc:183] Check failed: . : 拒绝访问。(0x5)`，CDP 端口无应答（`_raw/r7-ind-probe-13-r4-browser.txt`：`port 55059 was published, but nothing answers … aborted due to timeout`）。替代证据只到「注入 CSS 的字节 + 桩渲染的树」，**不是**引擎计算后的盒模型。 |
| 设置导航行的外观与像素（插入位置、行高、是否显示齿轮图标） | **未证实** | 同上（无引擎）。合同侧可证的是：`order=16` 落在 15 与 20 之间、id 是自用 id（§4）；外观上可预期的是未知 id 回退齿轮图标（`dsh-client-ui-settings-general/lib/client.js:75-93`），**这是预期，不是实测**。 |
| 真实 `dsh web` 端到端（点击「设置」→ 看到新分区 → 点到控件 → 设置落盘） | **未证实** | 本会话是委派的子代理，不允许起/替换 Web 服务器、也不允许驱动浏览器；沙箱无引擎（同上）。可证的是**接线**：`~/.dsh/profiles/web/package.json` 把 `dsh-approval-chime` 列为 `link:D:/…/dsh-approval-chime`，`deploy/expected-package.json:7,26` 与之一致，故运行面加载的就是本次锚定的 `lib/client.js` 字节；但「Host 启动时把 bundle 读进内存、刷新页面生效」这一步**未实测**。 |
| 真实文件对话框（点击「导入音频」弹出系统选择器） | **未证实** | 需要真实浏览器 + 操作系统文件选择器；`probe-9-client-playback` 一类桩只能证明按钮点了 `fileRef.current.click()`（`lib/client.js:1530-1533`），弹不弹窗**未证实**。 |
| 真实音频输出（耳机里是否真响一声、音量是否真的是 70%） | **未证实** | 沙箱无音频设备；替代证据是 WebAudio 桩记录的节点图与增益（rev-4/rev-5 的探针覆盖），**不是**听感。 |

## 9. 冻结路径未被改动（开工前 vs 收工后 sha256）

`_raw/r7-baseline-before.txt`（开工第 2 步就写的基线）与 `_raw/r7-baseline-after.txt`（本次验证跑完后重算）：

```
=== diff before vs after (frozen paths) ===
IDENTICAL — no frozen file changed during this verification run
```

| 路径 | bytes | sha256 |
| --- | --- | --- |
| `lib/client.js` | 80889 | `6b9c38ce738859c4d0007ee027b994353242d4c8c974b1e39a420cf48d54f5d1` |
| `lib/index.js` | 27592 | `75188b4c0f37fafa3241bf2712c3c3e62ecad48e3e74939e090cfae5cf1ae35e` |
| `verify/_harness.mjs` | 22001 | `6a141ddcae4f6bd8a62c0aaa279e3365ed6532ad5baadbe1c3beb5eab2c44617` |
| `verify/client-half.test.mjs` | 27846 | `5e8d553ef59510b8eb917fe00b044b824f37e19ce3794809285e4f5e75f5b068` |
| `verify/custom-audio.test.mjs` | 19397 | `3617c85affc77860753d66d9bc194fe6b673a4adccb92d3c2115ba734049e7eb` |
| `verify/host-half.test.mjs` | 13569 | `5fef04e9d5dc2e85770216d4416cfad45dbab6adcd13280d7b4df8ace317ec2` |
| `verify/waterfall.test.mjs` | 8341 | `06b50e403a02484cf9b2e05057d9b91a9299736db3197cdc00cfeb8b9b5b6df3` |
| `README.md` | 21304 | `0514fc2e158069749c44de1c36c1e40b8c0dee9bd034a9c5d664beee30615593` |
| `CHANGELOG.md` | 14770 | `875d750eae5e6115da6ed22a49c77e44a609173ec1710c537cb070ecf3a6d8a1` |

> 说明：本次验证只写 `verify-independent/**`（探针、`run-r7.ps1`、`_raw/r7-*`）与 `docs/rev7-独立验证.md`；
> 5 个变异体全部是**内存字符串改写**，磁盘上的 `lib/client.js` 永不落盘修改。

## 10. 文档/声明与实测的交叉核对

| 声明 | 位置 | 实测 |
| --- | --- | --- |
| `lib/client.js` 80889 B / `6B9C38CE…` | `CHANGELOG.md:40` | ✓ 一致 |
| `lib/index.js` 未改，27592 B / `75188B4C…` | `CHANGELOG.md:41` | ✓ 一致 |
| 四套 = 56+143+20+74 = 293 全绿 | `CHANGELOG.md:36-39` | ✓ 一致（§7.1） |
| 注册形态 `id/order/label/locale` | `CHANGELOG.md:15-17` | ✓ 一致（§3、§4） |
| 「插件页不再出现本插件」 | `README.md:71,172`、`docs/挂载与验收.md:248` | ✓ 结构侧成立（不注册 `key` → 交集恒空）；**界面侧未证实（§8）** |
| `id` 自用不顶替、order 16 紧跟「插件」15 | `CHANGELOG.md:31-32` | ✓ 一致（§4） |
| `settings.section` 未被官方写明为第三方扩展点 | `CHANGELOG.md:46-48`、`README.md:252`（H13） | ✓ 我独立复核：该槽由设置外壳自己声明（`dsh-client-ui-settings-general/lib/client.js:621-624`），DSH 包的 `exports` 只暴露 `apply`/`inject`；**「官方文档背书」确实不存在**，此项的自述是诚实的 |

## 11. 与原 acceptance 的逐条对应

| # | 要求 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 自用加载器 + 断言 `slots.inject('settings.section')` 上恰好一次、选项 id/order/label;`settings.plugin.item` 双证不存在 | **通过** | §0、§3；`_raw/r7-ind-probe-17-r7-section.txt` 第 0-2 组 |
| 2 | React 桩渲染全部控件（h2/intro/勾选/滑杆/下拉 3 行+`::picker` CSS/导入/file input/删除/试听/计数行/rev 徽标） | **通过** | §5；同文件第 4-5 组 |
| 3 | locale 反应性 + id 不冲突 + order 落在 15 与 20 之间（引用 DSH 行号取证） | **通过** | §4；同文件第 3 组 |
| 4 | `run-r7.ps1` 全量回归，除 probe-13 外全部 exit 0，逐 probe 汇总+退出码入报告 | **基本通过，1 处如实偏差** | §7；`_raw/r7-run-console.txt`。偏差=审查者 `reqcheck.mjs` 也 exit 1，但为 **rev-6 就存在的既有差异**（§7.4），非 rev-7 引入 |
| 5 | 报告逐条指向文件+行号或 `_raw/r7-*.txt` 行号；未证实项单列一节 | **通过** | 本文件 §1-§11、§8 |
| 6 | 验证者未改 `lib/**`、`verify/**`、`README/CHANGELOG`，前后 sha256 一致 | **通过** | §9 |
| 7 | 探针具备反证能力，变异体命令与输出入报告 | **通过** | §6；`_raw/r7-ind-probe-17-mutations.txt` |

## 12. 缺陷与残余风险（我的判定）

- **未发现 rev-7 引入的真实缺陷**：新槽注册、locale thunk、订单位置、控件零丢失、旧槽彻底移除，五个方向都有独立证据。
- **残余风险 R7-1（低）**：真实浏览器里导航行的插入位置与图标**未实测**（§8）；注册整段包在 `try/catch` 里（`lib/client.js:1759-1783`），失败只丢导航行、不影响提示音，所以风险面是「入口看不见」而不是「功能坏掉」。
- **残余风险 R7-2（低，非 rev-7 引入）**：审查者 `reqcheck.mjs` 的 5 条判据自 rev-5/rev-6 起就与实现有意偏离；本报告不把它算作 rev-7 的回归，但建议在下一轮由审查者自行更新或明确作废，否则「全量回归除 probe-13 外全绿」这句话每次都要附注。
- **观察项**：`verify-independent/kit/platform.mjs:38` 仍写着 `export const SLOT = 'settings.plugin.item'`，`probe-3` 等旧探针因此**不再适用于 rev-7**（它们没有进 `run-r7.ps1` 的列表）。这是历史归档探针的已知状态，不是缺陷；新探针 `probe-17` 不依赖它。
