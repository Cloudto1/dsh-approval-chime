# rev-12 · 两处音色列表统一成同一套样式

> 本文是这一轮的**工作记录**（谁改了什么、凭什么相信、什么还没证实）。
> 变更正文与锚定字节见 `CHANGELOG.md` 的 rev-12 条目；手工验收步骤见 `挂载与验收.md` §7.2。

## 1. 需求与现象

用户给两张真机截图，原话：**「把屏幕上面的选项卡改成在设置里的一样」**。

- 图 1（会话头部铃铛 caret 里的**音色**下拉）：`跟随全局 / 风铃 chime / 铃铛 bell / 蜂鸣 beep`，
  高亮是**方角灰底**、**没有 ✓** —— 这是浏览器对原生 `<select>` 的默认渲染。
- 图 2（设置 → 通知提醒 卡片里的同一个下拉）：**圆角外框、圆角高亮行、选中行带 ✓、带滚动条** —— 这是
  rev-3/rev-5 给那张列表写的自定义渲染（`appearance:base-select` + `::picker(select)`）。

两处本来就是**同一个 `<select>` 元素**（同一个 `toneOptions` 数据源），差的只是 CSS 选择器覆盖范围：
自定义渲染块只写在 `.dacCard select` 上，弹层的 `.dacPop select` 只拿到了 `option` 的颜色。

## 2. 改法（只动样式组装）

| 片段 | 内容 | 谁用 |
| --- | --- | --- |
| `pickerBox` | `appearance:base-select; margin-top:4px; padding:4px; border:1px; border-radius:10px; background/color 令牌; box-shadow; box-sizing:content-box; overflow:auto; font-size:13px` | 两张列表共用 |
| `pickerOption` | `border-radius:7px; padding:4px 9px; line-height:20px` | 两张列表共用 |
| `pickerHighlight` | `background:color-mix(in srgb,currentColor 14%,transparent)` | 两张列表共用 |

规则本身**只写一次、点名两个选择器**：

```css
.dacCard select,.dacPop select{appearance:base-select;}
.dacCard select::picker(select),.dacPop select::picker(select){/* pickerBox */}
.dacCard select::picker(select){max-height:84px;}   /* 3 行，rev-5 R5-1 的验收点 */
.dacPop  select::picker(select){max-height:120px;}  /* 4 行 + 8px 余量 */
.dacCard select option,.dacPop select option{/* pickerOption */}
.dacCard select option:hover,.dacCard select option:checked,
.dacPop  select option:hover,.dacPop  select option:checked{/* pickerHighlight */}
```

唯一允许的差异是**行数上限**：卡片 3 行（`3×28=84`，rev-5 的验收点原样保留），弹层 4 行
（`跟随全局` + 三种音色）→ `4×28+8=120`。那 8px（`TONE_PICKER_SLACK_PX`）的依据是：
`max-height` 只**夹紧**、不会把短列表撑高，而卡片那张列表在"恰好 3 行"时就是可滚动的
（用户图 2 里 3 行 + 滚动条 —— 说明浏览器自己的 picker chrome 会吃掉几个像素，行数算术看不见它）。
8px 仍远小于第 5 行（140px），所以语义依旧是"4 行后滚动"。

**明确没改**：弹层里"合上的" `<select>` 控件仍是 12px（沿用弹层面板的字号）。
它本来就是与卡片同类的圆角细边胶囊，用户截图指出的差异全部在**展开的列表**上。

## 3. 凭什么相信（本轮实测，可在工作区复现）

```powershell
cd '<workspace>\dsh-approval-chime'
node verify/host-half.test.mjs      # 124/124  exit 0
node verify/client-half.test.mjs    # 319/319  exit 0   （rev-11 为 302，净增 17）
node verify/waterfall.test.mjs      #  22/22   exit 0
node verify/custom-audio.test.mjs   #  75/75   exit 0   （rev-11 为 74：版本戳一行 + R5-1 断言拆成两条）
```

新增断言读的是**注入后的整段样式表**（浏览器真正拿到的东西），不是源码意图，其中最强的一条是
**两张 picker 的属性表除 `max-height` 外逐字段相等**（`sortedProps(card,'max-height') === sortedProps(pop,'max-height')`），
即"两处只有行数不同"这件事由**同一条声明**保证，而不是靠两处手抄。所有数字从
`__DSH_APPROVAL_CHIME__.pickerMetrics` 取，不写死。

另有 **2 条行为断言**，保护的是这次改动**新引入**的风险而不是样式：opt-in 之后，浏览器的选项列表是
`<select>` 的**真实 DOM 子树**（`::picker(select)` 只是绘制在 top layer），所以"在列表上按下"对
"点外面就关闭"的判定来说属于**内部按下** —— 若这条判定失效，用户点一下音色会先把弹层关掉，
`change` 还没到达 select 就丢了选择。改动前这两条不存在（那时只覆盖 Escape 与外部按下），
现在它们也会在"任何按下都当外部按下"的短路下报红（见下表第 3 行）。

**卡片那张（已被用户接受的那张）的计算值没有变** —— 这是逐条比对 rev-11 与 rev-12 发出的 CSS 得到的，
不是"看起来一样"：

| 声明 | rev-11（只在 `.dacCard select`） | rev-12（共享 + 卡片自己的上限规则） | 卡片上的计算值 |
| --- | --- | --- | --- |
| 外框 | `radius:10px` / `padding:4px` / `margin-top:4px` / 1px 边 / 层色 / 阴影 | 同一串字符（搬进 `pickerBox`） | **相同** |
| 盒模型 | `box-sizing:content-box` | 同一串字符 | **相同** |
| 溢出 | `overflow-x:hidden;overflow-y:auto` | 同一串字符 | **相同** |
| 上限 | 同一条规则里的 `max-height:84px` | 拆成 `.dacCard select::picker(select){max-height:84px;}` | **相同** |
| 行 | `border-radius:7px;padding:4px 9px;line-height:20px` | 同一串字符 | **相同** |
| 高亮 | `color-mix(in srgb,currentColor 14%,transparent)` | 同一串字符 | **相同** |
| 字号 | 未声明 → 从 `.dacCard` 继承 13px | 显式 `font-size:13px`（同一个值，由 `pickerBox` 给出） | **相同** |
| 选项配色（无 `base-select` 时的退路） | `.dacCard select option{…}` | `.dacCard select option,.dacPop select option{…}`（选择器变宽，声明不变） | **相同** |

因此本轮对"设置页那张列表"的唯一影响是：它现在与弹层那张共用声明。它自己的每个值都没变，
`verify/client-half.test.mjs` 也对其中每一条单独断言（`box-sizing`/`border-radius`/`max-height`/`font-size`/行规则/高亮规则）。

**反证（在最终冻结字节 `777E8796…` 上重跑；短路后已从备份复原，并与修复版逐字节比对 sha256 一致）**：

| 变异 | 结果 | 变红的断言 |
| --- | --- | --- |
| 把弹层从共享 picker / appearance / 高亮规则里摘掉（= rev-12 之前的样子） | client-half **313/319** | 6 条：两个 select 都 opt-in、同一条规则、弹层 picker 与卡片同样 content-box+圆角+auto、除行数外完全相等、列表自己钉字号、高亮规则点名两个列表 |
| 把弹层列表单独改回 12px（未来真会发生的回归：有人又把两处拆开） | client-half **317/319** | 2 条：除行数外完全相等、列表自己钉字号 |
| 删掉"内部按下就返回"那一行（任何按下都当外部按下） | client-half **318/319** | 1 条：a press on the tone list counts as INSIDE and leaves the popover open |
| 删掉 `pickerBox` 里的 `font-size` 行 | 语法错误（前一行以 `+` 结尾）→ harness 不出结果 | 即"悄悄去掉字号"这条路径不存在 |

## 4. 未证实（只能在真机上确认）

沙箱从 rev-4 起就没有可用浏览器引擎（Edge 起不来、CDP 通道不通），所以下面这些**没有**被证实，
只能由用户在 `http://127.0.0.1:3080` 上看（步骤见 `挂载与验收.md` §7.2）：

- 展开列表的实际像素：默认 4 行是否完整、是否出现一条几像素的滚动条；
- 深色主题下高亮与底色的观感、✓ 的具体位置；
- "合上的"控件在新加的 `appearance:base-select` 下的最终外观（预期与卡片那张同类，未实测）。

`TONE_PICKER_SLACK_PX = 8` 是本轮唯一靠**估算**的数字；它最多换来一条几像素的滚动条，不会藏掉一行
（README §9 H19 已如实登记）。

**两条把风险压小的事实**：

1. **用户的 UA 确实实现了 `appearance:base-select` / `::picker()`** —— 用户给的第二张截图就是设置页那张列表的
   自定义渲染（圆角外框 + 圆角高亮 + ✓ + 滚动条）。卡片侧的 CSS 本轮逐条未变（见上表），弹层用的是**同一条规则**，
   所以"UA 不支持、退回 UA 默认渲染"这条退路在真机上已被排除。
2. **5 行场景不会藏行**：会话存了一个名册里已不存在的自定义音色时，列表会多插一行「（文件缺失）」
   （`lib/client.js` 的 `options.unshift`），于是弹层是 5 行（140px）撞 120px 上限 → **必然可滚动**；
   卡片那张同样如此（4 行 = 112px 撞 84px）。两处语义一致，且 `max-height` 只夹紧、不会裁掉内容到不可达。

## 5. 谁做了什么（分工声明）

- **captain（本轮唯一实现者）**：`lib/client.js` 的样式组装、`verify/client-half.test.mjs` 的 rev-12 断言段、
  `verify/custom-audio.test.mjs` 的两条断言改写与版本戳、上面那张反证表、本文件、`CHANGELOG.md` / `README.md` /
  `挂载与验收.md` 的对应条目；并**核对了 rev-11 条目里两个过时哈希**（`verify/_harness.mjs`、
  `verify/host-half.test.mjs` 是 t6 之后的实测值，见 CHANGELOG rev-12 的 OBS-2）。
- **独立验证者（另一个 agent，独立于实现）**：`verify-independent/probe-19-r12-select-parity.mjs` +
  `run-r12.ps1` + `_raw/r12-*`、`_raw/r12b-*` 日志；它自己从真字节重新推导"两处同一套样式"这件事、自带变异体，
  并把 `probe-17`/`probe-18` 里因版本戳而过期的**指纹字面量**改成 rev-12（只改字面量，附反向哈希证明）。
  它还负责修掉 rev-12 弄坏/弄死的两个自家探针（`probe-11` 的启发式、`probe-17` 的 3 条形状断言与 `--mutate=picker`），
  顺带修好 `--mutate=slot` 的两个旧缺陷，最后复跑到 `NESTED_EXIT=0`、无 `FAILURES:` 行、无新增豁免。
  **它没有改动** `lib/**`、`verify/**`、`package.json`、`README`、`CHANGELOG`、`docs/**` 中的任何一个字节。

## 6. 独立验证结论（verifier，原文摘要）

**判定：本轮的断言未被证伪** —— 它从自己重新推导的证据上确认了每一条。

- **`probe-19-r12-select-parity.mjs`：66/66 全绿、exit 0**，输入是"真跑一遍 bundle 拿到的注入 CSS"
  + "真实渲染树上取出的两个 `<select>`"，并且**按 (specificity, 书写顺序) 自己做了层叠**再逐属性比对：
  共享 picker 规则只此一条且正好点名两个选择器；两个 select 都解析出 `appearance:base-select`；
  两张属性表**属性名相同、除 `max-height` 外逐字段相等**（84px / 120px）；两份列表都自报 `font-size:13px`；
  一条共享 option 行规则点名两个列表；一条共享高亮规则点名四个 hover/checked；`@supports` 内可达 picker 的规则**恰好 3 条**；
  卡片上限 = 精确 3 行；弹层上限 = 4 默认行 × 28px + 8px，且仍小于第 5 行。
- **可证伪性（三条变异各红一个不同子集）**：摘掉弹层 → 红 9；弹层列表改回 12px → 红 7；弹层上限少一行 → 红 3；
  `--mutate=all` 判定 PASS，声明与实际一致（无漏报、无越界）。
- **canonical run（run 2）**：探针 18 **131/0**、其变异体 **9/9**、两路 1500 轮竞态 **0/1500** 分歧、
  作者 harness 124/319/22/75 全 exit 0；`lib/index.js` 逐字节等于 rev-11 ⇒ **确实是 client-only**。
- **它发现的实质问题（都在它自己的领地；已按"修掉而不是容忍"处理并复跑）**：
  1. **`probe-11-r4-css-rows.mjs` 从 31/31 全绿变成崩溃**（`probe-11:144` 抛 `TypeError`）：它的 `pickerRule` 取
     "`@supports` 内**最后一条**含 `::picker(select)` 的规则"，rev-12 里那正好是弹层的上限规则 →
     box 相关属性全读成 null、`max-height` 读成 120px。**设计上过期**（单规则假设正是 rev-12 改掉的东西），
     但它原本是绿的，所以不能默认容忍 —— **已修**：查找改成"对 `@supports` 内所有点名 `.dacCard select::picker(select)`
     的规则做层叠"（共享 box 规则 + 卡片上限规则），算术全程 null-safe（再拆分只会 FAIL、不再抛异常），
     并借此修好了**原本被崩溃挡住、够不到**的 claim 7e 退路配色断言；31 → 32 条（2 条改名、期望值不变；1 条新增交叉检查）。
     可证伪性：新增 `--mutate=card-cap-92px` → 精确红 3 条（84px 上限 / `84 = 3 × 28` / padding+border 是加在 84px 之外）。
  2. **`probe-17` 另有 3 条断言硬编码 rev-12 之前的 CSS 形状** → 91/94。**已修**：改为解析"卡片列表"的声明，
     主题与期望值不变，其中一条**更严**（把解析出的卡片 `max-height` 真的与 `3 × 28` 比较，而不是复述常量）；现在 **94/94**。
  3. **`probe-17 --mutate=picker` 已死**（锚串在 rev-12 不存在 → `String.replace` 空操作）。**已重锚**到 rev-12 里
     存在的卡片上限规则 → **变异复活**：142330 → 142241 B，"变异真的改写了被求值的源"通过，且只红它声明的 2 条。
     它同时发现并修好了 **`--mutate=slot` 的两个旧缺陷**（与 rev-12 无关）：锚串含裸 `\n` 而本工作区是 CRLF（变异直接报
     "anchor not found"）；`once` 每次在**原始** source 上切片，三次替换只活最后一次（变异体只 +1 B、两条应红的断言没红）。
  4. **环境险情（记录）**：run 1 的冻结 diff 抓到 `lib/client.js` 142286 B / `375BEA07…`（应为 142330 / `777E8796…`），
     原因是**实现者在验证进行中仍在改工作区**（本次交付期间的并发编辑：`client-half.test.mjs`、`docs/`、`README`、`CHANGELOG`，
     以及几个瞬时的变异体字节）。文件随后回到冻结字节。**run 1 因此不算干净的冻结输入运行**，结论只建立在 run 2（与
     修复后的 run `r12b`）上。这是流程教训：**冻结声明必须先于验证开始**，本轮没有做到 —— 已记为 CHANGELOG 的 OBS-3。
- **复跑（run `r12b`，captain 已亲自核对）**：`NESTED_EXIT=0`、**输出里没有 `FAILURES:` 行**（走成功分支）；
  豁免表只剩 `probe-13-r4-browser.mjs`（无浏览器引擎），逐断言豁免表**为空** ⇒ **没有新增任何豁免**；
  冻结路径前后逐字节一致，captain 给的 9 条哈希清单逐条相符。captain 自己复跑四个探针：
  `probe-11` **32/32**、`probe-17` **94/94**、`probe-18` **131/0**、`probe-19` **66/66**，全部 exit 0。
- **账本问答（"旧事实还在不在、有没有删断言"）**：rev-12 之前的**每条事实**都仍被断言且各在 ≥2 个独立探针里
  （`appearance:base-select`、`content-box`、卡片 84px、`overflow-x:hidden`/`overflow-y:auto`、行高 20px + `4px 9px`、
  1px 细边 + 4px padding、无显式 height、`84 = 3 × 28`、`TONE_ROWS=3`、覆盖卡片的退路配色）；
  而**旧"形状"**（box 与 max-height 同规则、picker 只点名 `.dacCard`）**故意不再断言** —— 那正是 rev-12 移除的设计。
  **没有断言被删除或放宽**：probe-11 调用数 31 → 34（删 2 个"同规则"措辞的名字、增 4 个调用），probe-17 两版都是 97 个调用 / 95 个断言名。
- **它明确无法验证的**：真实像素高度、4 行是否真不出滚动条、高亮色/✓/合上的控件画出来什么样、
  UA 是否真的实现 `appearance:base-select`（它只证 CSS 被注入且层叠结果如述 —— 但用户自己的截图已经证明这台机器上的 UA 支持），
  以及本轮新增的**两条行为断言**（"点列表内部不关闭弹层"）—— 那两条只有作者 harness 里的桩断言，
  它没有独立复现（改由真机验收步骤 P1 覆盖）。

