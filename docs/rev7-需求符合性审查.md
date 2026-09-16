# rev-7 需求符合性审查（任务 t3 · reviewer · 质量门）

> **verdict = needs_revision**（代码侧四条全部成立，第 4 条「文档与字节一致」有残留，见 §7 的 **DOC-R7-1 / DOC-R7-2 / DOC-R7-3**）。
>
> 一句话：**「移过去、单独开一块」在字节、宿主语义、桩槽账本、页面控件四个层面都成立，而且是零丢失、零回归**；唯一不成立的是「docs 里旧路径无残留矛盾描述」——`docs/契约调研.md` 的**一页摘要（§J 第 4 条）和挂载步骤（§E.3 第 5 步）至今仍把「注册 `settings.plugin.item` 卡片 / 在插件页看到它」当作现行做法**，`docs/验证报告.md` 的 rev-1 人工验收清单同样如此。这是**纯文档修复**（2 处改写 + 1 处加横幅），不涉及 `lib/**`。
>
> 我**只判断不修改**：本文件之外的写入只有 `.scratch/reviewer-r7/probe-r7-reqcheck.mjs`（我自己的独立探针，见 §9）。`lib/**`、`verify/**`、`verify-independent/**`、`README.md`、`CHANGELOG.md` 一个字节未动（§11 哈希表）。

---

## 0. 判据与被测对象

| 项 | 值 |
| --- | --- |
| 用户原话（唯一判据） | 「把 **设置 → 插件** 改成 **设置 → 通知提醒** 单独开一块，**是移过去**。提示音插件」——即：迁移，不是复制；新开独立分区；插件页里不再有它 |
| 被测对象 | `dsh-approval-chime` rev-7；`lib/client.js` = **80889 B / sha256 `6B9C38CE738859C4D0007EE027B994353242D4C8C974B1E39A420CF48D54F5D1`**；`lib/index.js` = 27592 B / `75188B4C…`（未改） |
| 被审任务 | t1（rev-7 实施）；依赖材料：t1 交付说明、t2 `docs/rev7-独立验证.md` |
| 宿主契约依据（只读第一手） | `<dsh-install>\node_modules\@deepseek-ai\*` |

## 1. 我的独立性与取证方式

- **没有**依赖实施者的 harness 结论：四套 harness 我自己重跑（§9.1），并**另写**一支探针 `.scratch/reviewer-r7/probe-r7-reqcheck.mjs`（自研 vm 经典脚本加载器 + 自研 React/DOM/ctx 桩 + 自己读宿主文件），**89 条断言 0 失败 exit 0**，并做了 1 个内存变异证明它会咬人（§9.3）。它与 `verify/_harness.mjs`、`verify-independent/**` 零共享代码。
- **没有**只读 t2 报告：宿主槽声明/投影/交集语义/订单数字都是我打开宿主文件逐行读的（§4-§6 每条都给了 `文件:行号`）；t2 的 `_raw/r7-*.txt` 只用来做「同一条结论的第二来源」。
- **主动找反例**：§3 是全仓 `settings.plugin.item` 残留的**全量分类**，不是抽样。

## 2. 五条 acceptance 的判定（总览）

| # | acceptance | 判定 | 关键证据 |
| --- | --- | --- | --- |
| 1 | 成员关系：再也不注册 `settings.plugin.item`；插件配置页不出现卡片、不留空壳 | **PASS** | 源码零字面出现（`lib/**` 全仓 grep = 0）+ 桩槽账本只记 `settings.section` + `entry.key === undefined` + 宿主交集语义 `dsh-client-ui-settings-plugins/lib/client.js:1145`（§4） |
| 2 | 新分区可达且位置正确：`order 16` 紧随「插件」(15)、先于「Agent 预设」(20)；label 是 thunk、zh 为「通知提醒」 | **PASS（结构侧）** | 宿主四条 registration 第一手读出 + 宿主 `sort((a,b)=>a.order-b.order)` 复算 = `[general, models, plugins, approval-chime, agent-presets]`；thunk 同实例内 zh→en→zh（§5）。**导航行的真实外观/像素未证实（§10）** |
| 3 | 零丢失逐项点名 + 既有修复零回退 | **PASS** | 我的探针分组全绿（C 组 30 条控件 + C2 组 5 条写入/抑制 + D 组 10 条修复常量）；四套 harness 56/143/20/74 exit 0；rev-6 的 103 条断言里只有 10 条槽身份断言被替换，控件断言全部有对应（§6） |
| 4 | 文档与字节一致：README 入口路径 / CHANGELOG sha256+字节数 / docs 旧路径无残留矛盾 / 未证实项标注 | **FAIL** | README、CHANGELOG 与磁盘**逐字节一致**（✅）；但 `docs/契约调研.md:1136`、`:729`、`docs/验证报告.md:356` 仍把旧入口写成现行（❌ → **DOC-R7-1/2/3**）；CHANGELOG:44-45 的「本机验收」措辞与「真实 dsh web 端到端未证实」冲突（§7） |
| 5 | 页面文案自洽：不同时出现两个页级大标题；中英 nav 文案齐备 | **PASS** | 渲染树里 `h1/h2/h3` 合计恰好 1 个（就是标题「通知提醒」），旧页级标题「审批提示音」在 `lib/**` 里 0 次出现；`nav`/`title` 同文且 zh/en 双字典齐备（§8） |

**结论**：1、2、3、5 成立，第 4 条不成立 → `verdict = needs_revision`（findings 见 §7/§12）。

## 3. 反例搜索：全仓 `settings.plugin.item` 残留的全量分类

搜索方式（`grep` 工具，pattern `settings\.plugin\.item`，范围 = 工作区根，含隐藏目录）：

| 出现位置 | 性质 | 是否违判据 |
| --- | --- | --- |
| `dsh-approval-chime/lib/client.js`、`lib/index.js` | **0 次出现** | ✅ 这正是「移走」的硬证据 |
| `verify/client-half.test.mjs:115-118` | 反向断言（断言「从未命名/注册/等待那个槽」） | ✅ 预期 |
| `verify-independent/**`（probe-17 变异体、probe-3/5 历史探针、`kit/platform.mjs:38`、`_raw/**`） | 探针代码与**历史归档日志**；`kit/platform.mjs:38` 是归档 kit 的过期常量（该 kit 已不在 `run-r7.ps1` 列表里，t2 §观察项已述） | ✅ 非产品字节；不构成「插件还在注册」 |
| `docs/契约调研.md:1136`（**§J「给下游的一页摘要」第 4 条**）、`:729`（§E.3 第 5 步）、`:1030-1032`（§G.3 骨架）、§C（`:404-500`） | 1136/729 是**现行措辞的旧做法**；§C 被 §K 显式声明为历史（`:1145-1146`）；§G.3 标注「真实实现见 t3」 | ❌ **1136 / 729 → DOC-R7-1** |
| `docs/验证报告.md:68,232,356` | rev-1 独立验证报告（其锁定哈希对应 rev-1，见 `CHANGELOG.md:5-6`），§8 人工验收清单仍写「设置 → 可配置插件 / 卡片」 | ⚠️ **DOC-R7-3**（历史报告缺 rev-7 横幅） |
| `review-t4-scratch/probeB-browser-half.mjs:173-174`、`review-t4-scratch/RESULTS.md:30` | rev-1 轮次的评审 scratch（记录的是 rev-1 的行为） | ✅ 历史 scratch，非交付文档 |

补一条容易被漏掉的**反例**（我查了，但不构成问题）：`设置 → 插件` 下还有**「插件清单」标签页**（`dsh-client-ui-settings-plugin-inventory/lib/client.js:668` id `'all'`，其渲染基于装载行 `row.moduleName` / `row.entryId` / `row.fiberPhase`，`:218-285`），本插件仍会作为**已装载插件**出现在那里。那是「插件清单」，不是设置入口；用户要移走的是「插件**配置**」里那张设置卡片（`dsh-client-ui-settings-plugins/lib/client.js:1773-1784`，`id:'configurable'` 标签页声明 `settings.plugin.item` 子槽；四张 shipped 卡片在 `:1785-1810`）。这不是回退，也不是漏改。

## 4. acceptance 1：真的「移走了」（成员关系）

**(a) 源码级（无条件）**：`dsh-approval-chime/lib/client.js` 与 `lib/index.js` 里 `settings.plugin.item`（连 `plugin.item` / `plugins.tab` / `ConfigurablePlugins` 这些词汇）**一个字面出现都没有**（§3 表格第 1 行；t2 的同一判定见 `_raw/r7-ind-probe-17-r7-section.txt:31`）。`lib/client.js` 里唯一一次槽调用就是：

```
1769:          ctx.slots.inject('settings.section', function () {
1770:            return ctx.slots.register(
1772:                name: 'settings.section',
1773:                id: 'approval-chime',
1774:                order: 16,
1775:                label: navLabel,
1776:                locale: NS,
```

**(b) 行为级（我自己的桩槽账本）**：我的探针记录 `slots.inject` 调用 1 次（`settings.section`）、`slots.register` 1 次（`{name:'settings.section', id:'approval-chime', order:16, label:function, locale:'approval-chime'}`），且 `entry.key === undefined`：

```
[PASS] exactly one slots.inject happened — ["settings.section"]
[PASS] the injected slot is settings.section — settings.section
[PASS] the registration leaves key undefined (no keyed-card identity) — undefined
[PASS] the console self-check surface reports the new slot — settings.section
```

**(c) 宿主语义（为什么「插件 → 插件配置」必然不再出现，也不会留空壳）**：

- 插件配置页渲染的是**两道账本的交集**：`dsh-client-ui-settings-plugins/lib/client.js:1144`（`served` = 宿主 served 的命名空间集合）、`:1145`（`namespaces = entries().flatMap(entry => entry.options.key !== void 0 && served.has(entry.options.key) ? […] : [])`）——**只有「注册了 `key` 且该 key 被服务」的卡片才会被派发**。
- 本插件的注册带 `id`、不带 `key`（§4b）。宿主只按 `key` 派发，`:1145` 的 `key !== void 0` 对它恒不成立 ⇒ 结构上不可能出现。
- 「不留空壳」：该标签页只在 `namespaces.length > 0` 时才渲染卡片 `<ul>`（`:414-417`），否则渲染的是标签页**自己的**空状态文案 `<p class="…empty">{t('empty')}</p>`（`:418-421`）——那是「插件配置里一张卡片都没有」时的通用文案，不是我们那张卡片的空壳；而且宿主自己就注册了 4 张卡片（`:1785-1810`：shell / agent-loop / subagent-model-selection / web-search），`namespaces` 在真实组合里不会为空。宿主自己的注释 `:1093-1097` 也明写「A served namespace no card claims renders nothing」。本插件的命名空间仍被服务（宿主 `lib/index.js` 注册设置命名空间），但没有任何卡片认领它 ⇒ 既不出卡片，也不出我们那一格。
- 与自证面一致：`lib/client.js:1615` `slot: 'settings.section'`。

> 我复现了 t2 的变异判据：把槽名改回 `settings.plugin.item` 的变异体上，探针的 `exactly one slots.inject` / `the injected slot name` / `the bundle no longer claims a keyed-card key` 等断言全部报红（`_raw/r7-ind-probe-17-mutations.txt:250-254`，我重跑 `--mutate=slot` 得到同样的 `91/98` + `all 3 expected failures observed`，且磁盘哈希未变）。

## 5. acceptance 2：新分区存在，且落在「插件」与「Agent 预设」之间

**(a) 宿主订单一手读出**（我自己 grep 每一个包的 `name: "settings.section"` 后面的 `id`/`order`）：

| 分区 | id | order | 文件:行 |
| --- | --- | --- | --- |
| General | `general` | 0 | `dsh-client-ui-settings-general/lib/client.js:652-654` |
| Models | `models` | 10 | `dsh-client-ui-settings-models/lib/client.js:2937-2939` |
| 插件 | `plugins` | 15 | `dsh-client-ui-settings-plugins/lib/client.js:1762-1764` |
| **本插件（rev-7）** | `approval-chime` | **16** | `dsh-approval-chime/lib/client.js:1773-1774` |
| Agent 预设 | `agent-presets` | 20 | `dsh-client-ui-agent-preset/lib/client.js:1520-1522` |

- 槽由设置外壳声明为 `list`/`root`：`dsh-client-ui-settings-general/lib/client.js:621-624`（`children` 里）。
- 投影规则：`:560-582`，逐条取 `id`/`order`/`label` 然后 `.sort((a,b) => a.order - b.order)`；`subscribe` 同时挂在槽账本与 **locale revision** 上。
- 按宿主规则复算：**`["general","models","plugins","approval-chime","agent-presets"]`**（我的探针 [PASS] 行原文），即 15 < 16 < 20 紧随「插件」。
- **id 是自用 id**：宿主契约明文 `dsh-cordis-client-runner/lib/client.js:3882`——「Use an id of your own: a fresh id is added beside the shipped entries, while reusing a shipped id puts you in THAT cell and replaces it」；四个 shipped id 的 occupants 清单在同文件 `:3911-3916`，`approval-chime` 不在其中。

**(b) label 是 thunk 且随语言活**：

- 注册 `label: navLabel`（`lib/client.js:1775`），`navLabel` 实现 `:1104-1115`，读 `runtime.translate`，来源 `ctx.locale.bind(NS)`（`:1751-1757`）。
- 宿主契约 `dsh-cordis-client-runner/lib/client.js:3893-3894`：「A thunk is re-read on every projection, so localized text follows the active locale without re-registering.」
- 我的探针实测（**同一个实例内**翻转，不重新注册）：zh → `通知提醒`；翻 en → `Notifications`；翻回 zh → `通知提醒`。
- 字典：`lib/client.js:980`（zh `nav: '通知提醒'`）、`:1023`（en `nav: 'Notifications'`）。

**(c) 未证实**：导航行的真实插入位置/图标/像素（§10）。合同侧只能证到「order 落在 15 与 20 之间 + 投影复算」。

## 6. acceptance 3：零丢失 + 既有修复零回退

### 6.1 逐项点名核对（我自己的桩渲染，一次都没少）

| 要求的控件 | 源码位置 | 我的探针断言（原文） |
| --- | --- | --- |
| 启用勾选 | `lib/client.js:1454-1466` | `the enable switch is a checkbox` / `…is checked by default` / `…is wrapped in its label` |
| 音量滑杆 0-100 | `:1474-1492`（`min0 max100 step1 aria-label`） | `the slider is 0..100 step 1 at the bound value — min=0 max=100 step=1 value=70` |
| 音色下拉（3 内置） | `:1500-1515` | `the picker lists the three built-in tones — ["chime","bell","beep"]` |
| 下拉 3 行可视 / 第 4 项滚动 | `:1169-1188`：`@supports (appearance:base-select){…}`（`:1169` 开、`:1188` 闭）→ `::picker(select)`（`:1171-1172` 圆角 10px）→ `box-sizing:content-box;max-height:84px`（`:1183`）+ `overflow-y:auto`（`:1184`）；`TONE_ROWS=3`/`TONE_ROW_PX=28`（`:161-162`），选项 `line-height:20px`（`:1185`） | `::picker(select) keeps content-box + max-height:84px` / `3 rows x 28px still equals the 84px cap`；**引擎里的真实行数未证实（§10）** |
| 导入按钮 | `:1524-1536` | `the import / preview / reset buttons are all there — ["导入音频","试听","恢复默认"]` |
| 隐藏 file input `accept=audio/*` | `:1517-1523` | `the file input still accepts audio/* — audio/*` / `the file input is hidden by the injected CSS — .dacFile{display:none;}`（CSS 在 `:1192`） |
| 删除自定义音色 | `:1537-1549` | `an imported tone renders first and offers 移除` |
| 试听 | `:1550-1560` | 同上（按钮存在；开关关闭时 `disabled`） |
| 抑制计数 | `:1440-1445` 聚合、`:1585` 渲染 | `a muted approval is counted as suppressed — suppressedDisabled=1` / `the suppression row explains why nothing rang — ["因“启用”关闭而静音 ×1"]` |
| 写入受限 / 已覆盖徽标 | `:1467` / `:1468` | `a read-only namespace shows the badge and disables the controls` / `the overridden badge shows for a user-layer value` |
| 错误行 | `:1587`（`resetToDefaults`/`commit` 失败路径 `:1295-1304`） | `a refused write surfaces the error row`（文本含「设置写入失败」） |
| bundleRevision 徽标 | `:108`（`REVISION`）、`:1596` | `the bundle revision stamp is on the page — rev-7 · notifications section` |
| 统计行 5 项 | `:1571-1583` | `the counter line carries all five readouts — 5` |
| 「可用才渲染」闸门 | `:1264` | `a loading namespace renders nothing (no dead controls)` |
| 写入路径 | `:1280-1305`、`:1333-1340` | `the switch writes enabled=false through the bound scope`、`one slider drag writes volume once on release — [{"op":"set","field":"volume","value":35}]` |
| 页面骨架 | `:1591-1600`（`section.dacSection` → `div.dacHead` + `p.dacIntro` + `div.dacCard`） | `the page renders inside one <section> container` / `the section container follows the Host layout rule` |

### 6.2 既有修复在场（rev-5 / rev-6，逐条）

| 修复 | 现状（我读到的字节） | 我的探针断言 |
| --- | --- | --- |
| `::picker(select)` 圆角 | `lib/client.js:1172` `border-radius:10px` | PASS |
| `box-sizing:content-box` + `max-height:84px` | `:1183`（84 = `TONE_ROWS × TONE_ROW_PX`） | PASS |
| 导入上限 50 | `:135` `CUSTOM_LIMIT = 50`；两处守卫 `:1388`、`:1408` | PASS |
| 空白名回退 id | `:757-760` `clampName` + `:780` `clampName(entry.name, entry.id)` | PASS |
| 超限 413 先读干再应答 | `lib/index.js:366-416`（`req.resume()` + `respond(res, 413, …)`）、`:71` 5 MB | PASS |
| uuid 大小写收紧 | 客户端 `:126` `CUSTOM_ID`（无 `/i`）、`:284`/`:778` 使用；宿主 `lib/index.js:93` `ID_PATTERN`（无 `/i`）、schema `:284`/`:294` 带小写 pattern | PASS（4 条） |

### 6.3 基线说明：没有旧客户端半的副本，我用了什么替代基线

任务书建议「用 git 历史 / `deploy/backup-20260915-191825` 里的旧客户端半做差分」——**两者都不存在**：

- 本机**没有 git**（`git` 不是可识别命令；工作区也不是 git 仓库）。
- `deploy/backup-20260915-191825`、`deploy/backup-20260915-193222` 各只含 `package.json` / `cordis.patch.yml` / `pnpm-lock.yaml` / `manifest.json`；`manifest.json` 的 `files[]` 只有 profile 的这 3 个文件，**没有任何 `lib/client.js`**。
- 我另外按「rev-6 字节数 72730」与「旧页级标题『审批提示音』」在工作区、`%TEMP%`、`$DSH_HOME` 全量搜过，**没有旧客户端半的副本**（`lib/client.js` 只有当前这一份 80889 B）。

替代基线（四条，互相独立）：

1. **rev-6 归档日志的断言清单**（`_raw/r6-dev-client-half.txt`，UTF-16LE，103 条）：我的探针逐条比对，**只有 10 条被替换**，且这 10 条恰好是槽身份断言（`exactly one card is registered`、`card slot name`、`card key is the settings namespace`、`card locale namespace…`、`card component is a function component`、以及 5 条 `the card renders/shows …`）；后 7 条在新日志里都有 `card → section` 的对应断言（`the section renders when the namespace is ready` / `the section shows the trigger counter` / … / `the section renders nothing before the first describe answer`），前 3 条由「断言新槽 + 断言无 `key` + 断言恰好一条注册」取代。
2. **custom-audio 70 → 74**：只有 `the card registers on the plugin-item slot`（→ `the section registers on the settings.section slot (rev-7 move)`）与一条卫生断言改名，其余 68 条逐字保留。
3. **rev-5 轮次写下的评审探针** `.scratch/reviewer-r5/reqcheck-rev5.mjs`（**写于 rev-7 之前**，按组件取卡片、完全不碰槽）：对 rev-7 的字节仍然 **69 passed / 0 failed**；它打印的控件事实（`<select>`、`input[type=file]{accept:"audio/*",className:"dacFile"}`、`导入音频`/`试听`/`恢复默认` 的 DOM 顺序）全部 PASS ⇒ 迁移没有拆掉页面骨架。
4. `reqcheck.mjs`（同为 rev-7 之前的探针）打印 `card children (top level) = ["div.dacHead","p.dacIntro","div.dacCard"]`，与 rev-7 现字节一致（§9.4 同时记录了它 5 条 FAIL 的处置）。

### 6.4 回归

四套 harness 我自己重跑：`host-half 56/56`、`client-half 143/143`、`waterfall 20/20`、`custom-audio 74/74`，**合计 293 项，4 个 exit 0**（§9.1）。`host-half` / `waterfall` 的日志与 rev-6 归档逐行相同（只差临时目录名与 run 脚本名），说明宿主半与瀑布零注册确实没动。

## 7. acceptance 4：文档与字节（**不成立 → findings**）

### 7.1 成立的部分

| 声明 | 位置 | 实测（我的命令） |
| --- | --- | --- |
| README 入口路径 = 设置 → **通知提醒**，插件页不再出现 | `README.md:3`、`:71`、`:172` | 与 `lib/client.js:1769-1780` 一致 ✅ |
| README 的 harness 计数 56/143/20/74 | `README.md:95-98` | 我重跑逐项吻合 ✅ |
| CHANGELOG rev-7 锚定字节 | `CHANGELOG.md:40-41` | 磁盘 `lib/client.js` = 80889 B / `6B9C38CE…`、`lib/index.js` = 27592 B / `75188B4C…` ✅（我的探针 E 组 5 条 PASS） |
| CHANGELOG rev-7 的注册形态/订单/自用 id | `CHANGELOG.md:15-32` | 与字节及宿主订单一手读出吻合 ✅ |
| `docs/挂载与验收.md:247-248`、`:287` | 导航路径与新槽语义 | 已按 rev-7 更新 ✅ |
| 未证实项标注 | `CHANGELOG.md:46-49`（`settings.section` 未被官方列为第三方扩展点、真实浏览器里导航行插入位置与图标未实测）、`README.md:251-252`（H12/H13）、`docs/契约调研.md:1196-1202`（K-U1/U2/U3）、`docs/rev7-独立验证.md:187-195`（5 项单列） | 存在且与我的判定一致 ✅（唯一含糊处见 DOC-R7-2） |

### 7.2 findings（造成 verdict=needs_revision 的全部原因）

#### DOC-R7-1（medium）— `docs/契约调研.md` 仍把旧入口写成现行做法

- **problem**：README 把这份文件称为「本插件所有宿主契约的**唯一依据**」（`README.md:32`），而它有两处**现行措辞**的旧入口：
  - `docs/契约调研.md:1136`（**§J「给下游的一页摘要」第 4 条**）：`卡片：slots.register({name:'settings.plugin.item', key:'approval-chime', locale:NS, inject:…}, Card)` —— 直接教下游注册旧槽；
  - `docs/契约调研.md:729`（**§E.3 确切步骤第 5 步**）：验收信号仍写「设置 → 插件 页**出现我们的卡片**」；
  - 同源问题：`docs/契约调研.md:1030-1032`（§G.3 骨架，标注「真实实现见 t3」，风险较低）。
  - §K 的取代横幅（`docs/契约调研.md:1145-1146`）**只点名 §C**：「§C 保留为『旧入口（卡片）』的历史记录；本节是入口路径唯一生效的口径」——§E.3、§G.3、§J 不在其覆盖范围内，读者按 §J 的一页摘要执行就会得到与 rev-7 相反的做法。
- **requiredFix**：把 `docs/契约调研.md:1136` 改写为 `settings.section` 的注册形态（`{name:'settings.section', id:'approval-chime', order:16, label:<thunk>, locale:NS}`，见 §K.2），把 `:729` 的验收信号改为「设置 → **通知提醒** 出现独立一行；插件 → 插件配置里**不再**出现本插件」；并把 §K 的取代横幅扩写为覆盖 §E.3/§G.3/§J（或在这三节各加一行指针）。§G.3 骨架建议一并加一行「历史骨架：入口形态以 §K 为准」。
- **file / line**：`docs/契约调研.md` :1136（主）、:729、:1030-1032
- **复现命令**：`Select-String -Path dsh-approval-chime\docs\契约调研.md -Pattern '设置 → 插件 页出现我们的卡片'`、`Select-String -Path dsh-approval-chime\docs\契约调研.md -Pattern 'settings.plugin.item'`（或全仓 grep，见 §3）

#### DOC-R7-2（low）— `CHANGELOG.md:44-45` 的「本机验收」读起来像已完成的真机验收

- **problem**：`CHANGELOG.md:44-45` 写「**本机验收**：重启 `dsh web`（bundle 字节在启动时读入内存）→ 刷新页面 → 设置面板左侧出现独立一行「通知提醒」（在「插件」之后）、进入后是分区页；插件页不再出现本插件。」——与 rev-1 条目里**确实执行过**的真机验收用了同一句式（`CHANGELOG.md:161-162`「**真机验收**：真实审批请求 → `approvalsSeen: 1` …」），因此可被读成「已在本机看到过导航行」。但真实 `dsh web` 端到端/浏览器渲染在本轮**明确未证实**（`docs/rev7-独立验证.md:193`；`docs/挂载与验收.md` 首段「本任务**没有重启** `dsh web`（会终止当前会话）」；沙箱无浏览器引擎，见 §10）。这正好落在 acceptance 4 的后半句「t2 报告中的未证实项在文档里同样标注为未证实」。
- **requiredFix**：把该条改写为待执行口径，例如「**本机验收（交给 t5/用户执行；本轮未执行、未证实）**：重启 `dsh web` → 刷新页面 → **应**在设置面板左侧看到独立一行「通知提醒」…」，或显式加「**未证实**」标注。
- **file / line**：`CHANGELOG.md` :44（含 :45）
- **复现命令**：`Select-String -Path dsh-approval-chime\CHANGELOG.md -Pattern '本机验收|真机验收'`（得 :44 与 :161）与 `docs/rev7-独立验证.md` §8 第 3 行对照

#### DOC-R7-3（low）— `docs/验证报告.md` 的 rev-1 人工验收清单无 rev-7 横幅

- **problem**：`docs/验证报告.md:356`（§8 第 1 项）仍写「…设置 → **可配置插件**。**通过**：出现「审批提示音」卡片，右上角 revision 戳显示 `rev-1 · pending-interactions`…」，`:68`/`:232` 也按旧卡片槽陈述。该文件是 rev-1 的独立验证报告（哈希见 `:23-24`），本身是历史归档；本仓惯例是给历史结论加「⚠️ rev-N 更新」横幅（如 `docs/rev4-需求符合性审查.md:7`、`docs/rev4-独立验证.md` §8 校订），而这份文件没有——CHANGELOG 只在 `:5-6` 提到「锁定哈希对应 rev-1」。
- **requiredFix**：在 `docs/验证报告.md` 头部加一行 rev-7 横幅（「入口路径已迁移：见 `docs/契约调研.md` §K 与 `README.md` §3；本报告 §8 的人工清单描述的是 rev-1 的卡片形态」），或把 §8 第 1 项标注为历史。
- **file / line**：`docs/验证报告.md` :356（含 :3-6 头部）
- **复现命令**：`Select-String -Path dsh-approval-chime\docs\验证报告.md -Pattern '可配置插件|审批提示音'`

#### OBS-R7-1（low，观察项；同样需要一次引用修正）— agent-presets 的 order 20 引用行不准

- **problem**：`lib/client.js:58`、`docs/契约调研.md:1157` 用 `dsh-cordis-client-runner/lib/client.js:3912` 作为「Agent 预设 = order 20」的证据，但该行只是 occupants 清单里的 id 行（`client-ui-agent-preset AgentPresetSection id 'agent-presets'`），**不含 order**；order 20 实际写在 `dsh-client-ui-agent-preset/lib/client.js:1520-1522`。事实本身正确（我已一手读出 20），只是引用行错。
- **requiredFix**：把这两处引用改为 `dsh-client-ui-agent-preset/lib/client.js:1520-1522`（occupants 清单可继续作为 id 的第二来源）。
- **file / line**：`lib/client.js` :58；`docs/契约调研.md` :1157
- **复现命令**：`Select-String -Path dsh-approval-chime\lib\client.js -Pattern 'dsh-cordis-client-runner/lib/client.js:3912'`、`Select-String -Path '<dsh-install>\node_modules\@deepseek-ai\dsh-client-ui-agent-preset\lib\client.js' -Pattern 'order: 20'`

> **修复成本提示**：四条都是文档改动（DOC-R7-1 两处改写 + 横幅扩写；DOC-R7-2 一句改写；DOC-R7-3 一行横幅；OBS-R7-1 两处引用），**不需要动 `lib/**`，不需要重跑 harness**。但按本任务「第 4 条不成立即不得 pass」的判据，必须先落盘再复审。

## 8. acceptance 5：页面文案自洽

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 不同时出现两个页级大标题 | ✅ 渲染树里 `h1`/`h2`/`h3` 合计 **1** 个，就是 `t('title')` 的 `<h2>`（`lib/client.js:1595`） | 我的探针 `exactly one page-level heading exists`、`no h1/h3 heading was introduced` |
| 旧页级标题「审批提示音」不再出现 | ✅ `lib/**` 里 0 次；CHANGELOG `:23` 说明它被有意去掉 | `grep 审批提示音` + 探针 `no competing page-level title remains` |
| 导航行与页内标题同文 | ✅ 字典里 `nav` 与 `title` 同文案（`:980-981` zh、`:1023-1024` en）；导航读 `nav`、页面读 `title` | 探针 `the heading text equals the nav row text — 通知提醒 / 通知提醒` |
| 文案「不重复打架」 | ✅ 导航行/大标题 =「通知提醒」，intro（`:982`）是说明句「宿主向你申请权限时响一次…」，两者不重复 | 探针 `the intro line is present` |
| 中英文字典都有 nav 文案 | ✅ zh `:980`、en `:1023`；同实例翻转即跟随（§5b） | 探针 3 条 locale 断言 PASS |

## 9. 我复跑的命令与原始输出

### 9.1 四套 harness（我自己跑，非读报告）

```
node --check dsh-approval-chime/lib/index.js          → exit 0
node --check dsh-approval-chime/lib/client.js         → exit 0
node dsh-approval-chime/verify/host-half.test.mjs     → 56/56  exit 0
node dsh-approval-chime/verify/client-half.test.mjs   → 143/143 exit 0
node dsh-approval-chime/verify/waterfall.test.mjs     → 20/20  exit 0
node dsh-approval-chime/verify/custom-audio.test.mjs  → 74/74  exit 0
```
合计 **293 项，4 个 exit 0**（与 `_raw/r7-run-console.txt` 的汇总行逐字一致）。

### 9.2 独立探针与变异

```
node dsh-approval-chime/verify-independent/probe-17-r7-section.mjs              → 94/94 exit 0
node dsh-approval-chime/verify-independent/probe-17-r7-section.mjs --mutate=slot → 91/98 exit 1（"all 3 expected failures observed"，设计如此）
```
`--mutate=slot` 跑完后 `lib/client.js` sha256 仍是 `6B9C38CE…`（变异只改内存字符串）。

### 9.3 我自己的探针（`.scratch/reviewer-r7/probe-r7-reqcheck.mjs`）

```
# 基线
node .scratch/reviewer-r7/probe-r7-reqcheck.mjs
  → ### reviewer rev-7 conformity probe: 89 passed / 0 failed   exit 0
# 反证能力：把 lib/client.js 的副本里 settings.section 全替换成 settings.plugin.item
$src = Get-Content dsh-approval-chime\lib\client.js -Raw
[System.IO.File]::WriteAllText('...\.scratch\reviewer-r7\tmp\mutant-slot.js', ($src -replace 'settings\.section','settings.plugin.item'))
$env:PROBE_CLIENT_PATH = '...\.scratch\reviewer-r7\tmp\mutant-slot.js'
node .scratch/reviewer-r7/probe-r7-reqcheck.mjs
  → 82 passed / 7 failed  exit 1
    （红的有：the injected slot is settings.section / the registration names settings.section /
      the shipped client.js never names the plugins-tab card slot /
      no plugins-tab vocabulary survives in client.js / diagnostics.slot 等）
```
变异体只存在于 `.scratch/` 的副本里，磁盘 `lib/client.js` 哈希不变。

### 9.4 审查者探针（前几轮遗留）与 **reqcheck.mjs 的处置**

```
node .scratch/reviewer-r5/reqcheck-rev5.mjs      → 69 passed / 0 failed  exit 0
node .scratch/reviewer-r5/reqcheck-host-413.mjs  →  9 passed / 0 failed  exit 0
node .scratch/reviewer-r5/reqcheck.mjs           → 34 passed / 5 failed  exit 1
```

**`reqcheck.mjs` 处置：过期作废（不是 rev-7 的回归）**，理由两条，都可复现：

1. **5 条 FAIL 与 rev-6 归档逐字相同**：我把本次运行的 FAIL 行与 `_raw/r6-reviewer-reqcheck.txt` 的 FAIL 行做字符串比较，结果 `identical=True`（含标题行在内 7 行完全一致）。归档证据：`dsh-approval-chime/verify-independent/_raw/r6-reviewer-reqcheck.txt`。
2. **这 5 条判据本身就是 rev-5 有意改掉的旧行为或 rev-6 未实现的场景**（读探针源码得到）：
   - `reqcheck.mjs:363` 断言 `/max-height:92px/`——rev-5 为修 R5-1 改成了 `84px`；
   - `reqcheck.mjs:380` 断言 `rowHeight === 28 && maxHeight === 92`——同上；
   - `reqcheck.mjs:401` 断言 `!/box-sizing/.test(pickerRule)`（「作者规则不得钉 box-sizing」）——rev-5 的修复恰恰是**显式**写 `box-sizing:content-box`；因此这条 FAIL（`— box-sizing present`）**是修复在场的证据**，不是缺陷；
   - 后两条（第 51 个导入仍应被上传并显示成「（文件缺失）」）是 rev-6 之后仍未实现的 roster 上限场景。
   另外 `reqcheck.mjs` 全文不含 `settings.section` / `settings.plugin.item` / `slots.inject`（我 grep 过），它按组件取卡片，所以 rev-7 的槽位迁移**不可能**影响它。
3. **我没有改它**（任务禁止改他人探针与 `verify-independent/**`）。它继续以 exit 1 存在，本报告如实记录，不作为 rev-7 判据；**rev-7 的判据以我自己的 `probe-r7-reqcheck.mjs`（89/0）与 t2 的 probe-17（94/94）为准**。

### 9.5 浏览器能力的自证（我复跑 probe-13）

```
node dsh-approval-chime/verify-independent/probe-13-r4-browser.mjs → 11/14 exit 1
  · launch log: "DevTools listening on ws://127.0.0.1:56991/…" 紧接着
    "FATAL:mojo\public\cpp\platform\platform_channel.cc:183] Check failed: . : 拒绝访问。 (0x5)"
  · [FAIL] a real browser engine could be driven (CDP reachable) — port 56991 was published, but nothing answers
```
⇒ 「真实浏览器渲染」在本沙箱**确实不可证实**（不是没人试过）。

## 10. 未证实项（我**不**为它们背书）

| 项 | 状态 | 为什么 |
| --- | --- | --- |
| 真实浏览器里的 DOM/盒模型（`<select>` 弹出层是否真的 3 行 84px、圆角观感、深色主题配色） | **未证实** | 沙箱无可用浏览器引擎（§9.5，我复跑确认）；替代证据只到「注入 CSS 的字节 + 桩渲染的树」 |
| 设置导航行的真实外观与像素（插入位置、行高、图标是否为齿轮） | **未证实** | 同上；合同侧只证到 `order` 排序与「未知 id 回退齿轮」（`dsh-client-ui-settings-general/lib/client.js:75-93`），**外观是预期不是实测** |
| 真实 `dsh web` 端到端（重启宿主 → 刷新页面 → 看到新分区 → 改设置落盘） | **未证实** | 未重启宿主、无浏览器。可证的只是**接线**：`$DSH_HOME\profiles\web\package.json` 里 `"dsh-approval-chime": "link:D:/…/dsh-approval-chime"` + `dsh.profile.bundles` 含 `dsh-approval-chime` + `node_modules` 有同名 **Junction → 插件目录**（我只读复核）；「宿主启动时把 bundle 读进内存 / 当前进程是否已加载 rev-7 字节」**未实测** |
| 真实文件选择对话框 | **未证实** | 需要真实浏览器 + 系统选择器；桩只能证到按钮点了 `input.click()`（`lib/client.js:1530-1533`） |
| 真实音频输出/听感 | **未证实** | 无声卡；替代证据是 WebAudio 桩记录的节点图与增益 |
| 「插件 → 插件配置」界面里肉眼看不到卡片 | **结构侧成立、界面侧未证实** | §4c 的宿主交集语义是结构证明；肉眼确认需要真实 GUI（未证实） |

## 11. 冻结路径完整性 / 我改了什么

- 我只写了两个文件：`.scratch/reviewer-r7/probe-r7-reqcheck.mjs`（我的独立探针）与本文件；另有一个变异副本 `.scratch/reviewer-r7/tmp/mutant-slot.js`。
- `lib/**`、`verify/**`、`verify-independent/**`、`README.md`、`CHANGELOG.md` 未动：当前哈希与 t2 收工基线 `_raw/r7-baseline-after.txt` **逐行相同**：

| 路径 | bytes | sha256（我复核 = t2 基线） |
| --- | --- | --- |
| `lib/client.js` | 80889 | `6b9c38ce738859c4d0007ee027b994353242d4c8c974b1e39a420cf48d54f5d1` |
| `lib/index.js` | 27592 | `75188b4c0f37fafa3241bf2712c3c3e62ecad48e3e74939e090cfae5cf1ae35e` |
| `verify/_harness.mjs` | 22001 | `6a141ddcae4f6bd8a62c0aaa279e3365ed6532ad5baadbe1c3beb5eab2c44617` |
| `verify/client-half.test.mjs` | 27846 | `5e8d553ef59510b8eb917fe00b044b824f37e19ce3794809285e4f5e75f5b068` |
| `verify/custom-audio.test.mjs` | 19397 | `3617c85affc77860753d66d9bc194fe6b673a4adccb92d3c2115ba734049e7eb` |
| `verify/host-half.test.mjs` | 13569 | `5fef04e9d5dc2e85770216d4416cfad45dbab6adcd13280d7b4df8ace317ec2` |
| `verify/waterfall.test.mjs` | 8341 | `06b50e403a02484cf9b2e05057d9b91a9299736db3197cdc00cfeb8b9b5b6df3` |
| `README.md` | 21304 | `0514fc2e158069749c44de1c36c1e40b8c0dee9bd034a9c5d664beee30615593` |
| `CHANGELOG.md` | 14770 | `875d750eae5e6115da6ed22a49c77e80a609173ec1710c537cb070ecf3a6d8a1` |

## 12. findings 汇总（提交用）

| id | severity | file:line | 一句话 | requiredFix |
| --- | --- | --- | --- | --- |
| DOC-R7-1 | **medium** | `docs/契约调研.md:1136`（并 :729、:1030-1032） | 现行措辞仍教下游注册 `settings.plugin.item` 卡片 / 在插件页找卡片；§K 的取代横幅只点名 §C | 改写 §J 第 4 条与 §E.3 第 5 步为 `settings.section` 形态与新路径；把 §K 横幅扩到覆盖 §E.3/§G.3/§J |
| DOC-R7-2 | low | `CHANGELOG.md:44-45` | 「本机验收」句式与 rev-1 的真机验收同款，读起来像已完成，而真实 `dsh web` 端到端本轮未证实 | 改写为「待 t5/用户执行；本轮未执行、未证实」或加显式未证实标注 |
| DOC-R7-3 | low | `docs/验证报告.md:356`（并 :68、:232） | rev-1 报告的人工验收清单仍描述「设置 → 可配置插件 / 卡片」，无 rev-7 横幅 | 头部加一行 rev-7 横幅（指向 `契约调研.md` §K / README §3），或把 §8 标为历史 |
| OBS-R7-1 | low | `lib/client.js:58`；`docs/契约调研.md:1157` | agent-presets 的 `order: 20` 引用了 `dsh-cordis-client-runner/lib/client.js:3912`（该行不含 order） | 改引 `dsh-client-ui-agent-preset/lib/client.js:1520-1522` |

> 重申：**规格侧（迁移成立、不得复制、插件页无残留、零丢失、既有修复零回退、四套回归全绿、文案与字典自洽）全部通过**；本次不通过只因为 acceptance 4 的文档一致性，修复全部落在 `docs/**` 与 `CHANGELOG.md`，不触碰 `lib/**`。
>
> ——以上是 round-1（t3，verdict=needs_revision）。t4 修复后的 **round-2 复审见文末附录**。

---

# 附录：round-2 复审（t5，t4 repair-round-2 之后）

> **verdict = pass**。§12 的四条 finding 全部按 requiredFix 落盘并逐条复核通过；代码字节与 t2 收工基线逐行一致；四套 harness 与独立探针重跑仍全绿；**acceptance 1-5 现在全部成立**。

## A1. 四条 finding 的复核（逐条给 `文件:行`）

| finding | 上轮要求 | 我复核到的落盘证据 | 判定 |
| --- | --- | --- | --- |
| DOC-R7-1（medium） | 改写 §J 第 4 条与 §E.3 第 5 步；取代横幅扩写到覆盖 §E.3/§G.3/§J | `docs/契约调研.md:1140`（§J 第 4 条已改写为 `ctx.slots.inject('settings.section', …)` + `register({name:'settings.section', id:'approval-chime', order:16, label:<thunk>, locale:NS})`，指向 §K.2，并写明「**不再注册插件页那张卡片**」）；`:729`（§E.3 第 5 步验收信号改为「**设置导航出现独立一行「通知提醒」**…**设置 → 插件 → 插件配置里不再出现本插件**」，并指向 §K）；`:1152-1157` §K 横幅新增「**取代范围**」，明列 **§C**(`:404-565`)/**§E.3**(`:729`)/**§G.3**(`:911-1053`)/**§J**(`:1140`) 并以 §K.1/§K.2 为现行口径，同段声明 `docs/rev4-*`/`rev5-*`/`rev6-*`/`验证报告.md` 为历史轮次；`:911` 标题与 `:913` 代码块上方双标注「**历史骨架：入口形态以 §K 为准**」 | **PASS** |
| DOC-R7-2（low） | 「本机验收」改为待执行/未证实口径 | `CHANGELOG.md:44-49`：标题改为「**本机验收（交给 t5/用户执行；本轮未执行、未证实）**」，正文改为「**应**…在设置面板左侧看到…」「**这一步本轮没有做**」+ 沙箱原因 + 指向 `docs/rev7-独立验证.md` §8（5 项）与本文 §10，并显式与 rev-1「真机验收」区分；`:55-79` 新增修复记录小节 | **PASS** |
| DOC-R7-3（low） | 头部 rev-7 横幅 / §8 标历史 | `docs/验证报告.md:3-9` 头部 rev-7 横幅（指向 `契约调研.md` §K、`README.md` §3、`挂载与验收.md` §7，声明 §8 是 rev-1 卡片形态、rev-7 浏览器侧端到端仍未证实）；`:362-364` §8 段首历史注；`:368` 第 1 项标注「rev-1 形态；rev-7 起改为：设置 → 通知提醒 出现独立一行 + 分区页」 | **PASS** |
| OBS-R7-1（low） | 引用改到 `dsh-client-ui-agent-preset/lib/client.js:1520-1522`；`lib/**` 冻结则由文档记录取舍 | `docs/契约调研.md:1169` 已改为 `dsh-client-ui-agent-preset/lib/client.js:1520-1522`（我第一手复核：`:1520` `name`、`:1521` `id: "agent-presets"`、`:1522` `order: 20`、`:1523` `label`），occupants 清单降为「**id 的第二来源**」；`:1179-1185` 显式记录 `lib/client.js:58`/`:1768` 同类旧指针**按冻结边界有意不改**（附字节锚 `80889/6b9c38ce…` 与理由） | **PASS（按文档口径 + 显式取舍记录）** |

## A2. 反例再搜：旧路径是否还有「未标注历史的现行措辞」

- `设置 → 插件 页出现我们的卡片`：交付文档 **0 命中**（唯一命中是本文上一轮的复现命令）。
- `settings.plugin.item` 在 `docs/契约调研.md` 的剩余命中，全部落在**已被 §K 横幅声明为历史的 §C**、**已双标注的 §G.3 骨架**、或**§K 横幅的自述行**；`docs/验证报告.md:6/:316/:362/:368` 全部处于 rev-7 头部横幅覆盖之下。
- `插件配置 / 插件页` 的每一处（README `:71/:115/:172`、CHANGELOG `:12/:15/:18/:37/:38/:46/:62`、挂载与验收 `:248`、契约调研 `:729/:911/:913/:1140/:1149/:1152/:1176`）要么是「**不再出现**」的反向判据，要么带历史标注——**无一处把旧入口当成现行做法**。
- ⇒ acceptance 4 的「docs 中旧路径（设置 → 插件）无残留矛盾描述」成立。

## A3. 字节与回归（我自己复测，不看 t4 的转述）

- 冻结路径 vs `verify-independent/_raw/r7-baseline-after.txt`：`lib/client.js` 80889/`6b9c38ce7388` **MATCH**、`lib/index.js` 27592/`75188b4c0f37` **MATCH**、`README.md` 21304/`0514fc2e1580` **MATCH**、`verify/_harness.mjs`、`verify/client-half.test.mjs`、`verify/custom-audio.test.mjs`、`verify/host-half.test.mjs`、`verify/waterfall.test.mjs` 全部 **MATCH**；唯一 DIFF = `CHANGELOG.md`（本轮有意改动）：14770/`875d750eae5e…` → **17998 B / `E434813A28909CF7FCAA04FB5BE26089BDCDE495E56C65C51B26D4233363EF15`**。
- `verify-independent/**` 源码未被动过（最新的 `.mjs`/`.ps1` mtime 仍是 t2 轮的 `23:54:23`）；`_raw/` 里唯一比基线新的 `ind-probe-13-browser-launch.log`（`00:05:45`, 1476 B）是**我上一轮**复跑 `probe-13` 时该探针自己写的 Edge/crashpad 日志，**不是 t4 的产物**（我在 round-1 报告 §9.5 记录过这次复跑）。
- 重跑（本附录写作时）：四套 harness **56/143/20/74，四条 exit 0**（与 `CHANGELOG.md:79` 自述一致）；`probe-17` **94/94 exit 0**；我自写的 `.scratch/reviewer-r7/probe-r7-reqcheck.mjs` **89/0 exit 0**。
- acceptance 1/2/3/5 的证据与上一轮相同（`lib/**` 零改动，逐字节 MATCH），见 §4-§6、§8；CHANGELOG 的 rev-7 锚定字节仍与磁盘一致（`CHANGELOG.md:40-41`，我的探针 E 组 5 条 PASS）。

## A4. 残余观察（不阻塞 pass，供 captain 记账）

1. **OBS-R7-2（low，报告口径）**：t4 的完成证书写 `CHANGELOG.md → 17986 B / 49830d080d5f…`，而磁盘实测是 **17998 B / `E434813A…`**（mtime `00:19:19`）。交付物本身自洽——我 grep 过，没有**任何**文档引用 `17986`/`49830d08`，差别只出现在任务报告里（推测是测量时点早于最后一次落盘）。建议 captain 把记录更正为磁盘值，或注明测量时点。
2. **`lib/client.js:58` / `:1768` 的过期指针**：仍是旧引用（把 `dsh-cordis-client-runner/lib/client.js:3912` 当作「Agent 预设 = order 20」的证据）。按 captain 的「`lib/**` 冻结」边界保留不改，且已在 `docs/契约调研.md:1179-1185` 与 `CHANGELOG.md:70-75` 显式记为「已知的历史注释，正确引用见 §K.1」。它属于代码注释里的**宿主行号引用**，不是入口路径陈述，故不影响 acceptance 4。
3. **仍未证实（与本轮无关，继续不背书）**：真实浏览器 DOM/盒模型、导航行的外观/像素/图标、真实 `dsh web` 端到端、真实文件对话框、真实音频听感（见 §10）。`CHANGELOG.md:44-49` 与 `docs/验证报告.md:3-9` 现在也如实标注了这一口径。

## A5. round-2 判定

| # | acceptance | 判定 | 依据 |
| --- | --- | --- | --- |
| 1 | 不再注册 `settings.plugin.item`；插件配置页无卡片、无空壳 | **PASS** | `lib/**` 逐字节未变，§4 的源码/桩槽/宿主交集三证仍有效 |
| 2 | 新分区 order 16 紧随「插件」(15)、先于「Agent 预设」(20)；label 本地化 thunk | **PASS** | 同上，§5；导航行外观仍未证实（已标注） |
| 3 | 零丢失逐项 + 既有修复零回退 | **PASS** | 293 项 exit 0 + 我的探针 C(30)/C2(5)/D(10) 组全绿 |
| 4 | 文档与字节一致（旧路径无残留矛盾、未证实项标注） | **PASS** | A1-A3 + CHANGELOG rev-7 锚定字节与磁盘一致 |
| 5 | 页面文案自洽、中英 nav 文案齐备 | **PASS** | `lib/**` 未变，§8 证据仍有效 |

**round-2 verdict = pass**：rev-7 确实把提示音设置**移**出了「设置 → 插件」，**单独开**成了「设置 → 通知提醒」一块，功能零丢失、既有修复零回退、文档与字节一致。
