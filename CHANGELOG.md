# dsh-approval-chime 变更记录

版本戳在「通知提醒」分区页右上角显示，也可在控制台读 `window.__DSH_APPROVAL_CHIME__.revision`。

包版本（`package.json` 的 `version`）现为 **`0.3.0`** —— rev-10/rev-11 那次升到 `0.2.0` 之后一直没动，
rev-12…rev-24 累积到这里（其中 rev-15 是一次数据丢失缺陷修复）。它与上面的 `rev-N` 是**两套编号**：
`rev-N` 记每一次改动，`version` 是发布里程碑。

> ⚠️ **哈希提醒**：`docs/验证报告.md` 与 t4 评审记录里锁定的实现哈希对应 **rev-1**。
> rev-2/rev-3 是纯外观改动，**rev-4 是功能新增**，**rev-5 是两轮独立验证与需求审查后的修正**，
> **rev-6 是 N3 收尾**，**rev-7 把设置入口从「插件」迁到独立的「通知提醒」分区**，
> **rev-8 把「启用提示音」换成苹果式拨动开关**，**rev-9 按真机反馈把它改瘦、开启色统一成音量条的蓝**，
> **rev-10 加「按会话独立」（会话头部小铃铛 + 每会话音色/音量覆盖 + 各响各的）**，
> **rev-11 修 rev-10 的应答乱序窗口（会话写入落定后重读一次表）**，
> **rev-12 把会话弹层里的音色下拉列表改成与设置页那张同一套样式**，
> **rev-13 按真机反馈把会话头部的小铃铛/caret 放大**，
> **rev-14 把「会响」状态的铃铛改成设置页开关同款的蓝色实心**，
> **rev-15 修 rev-11 遗留的「收敛重读失败会把本地覆盖表清空、从而丢掉用户静音」缺陷（OBS-A）**，
> **rev-16 按真机反馈把会话头部的铃铛与它右边的箭头分开（原先贴在一起，被读成同一个控件）**，
> **rev-17 按真机反馈让那个箭头在弹层打开时以过渡动画下转 90°、关闭时转回（旋转作用于 svg 字形而非按钮盒，
> 常量驱动并暴露在控制台面；rev-17 当时那条 prefers-reduced-motion 降级已由 rev-20 删除）**，
> **rev-18 按真机反馈把那个转动放慢（160ms → 300ms），并新增顶层诊断 `reduceMotion()`，
> 让「时长太短」与「环境要求减少动效」这两种看起来一样的原因可被区分**，
> **rev-19 再放到 400ms**，
> **rev-20 把转动定回 160ms，并删掉那两条 reduced-motion 覆盖（此后所有动画在所有环境下都播放，没有例外）**，
> **rev-21 把分区页右上角的构建戳从描述整串改成只印版本 id**，
> **rev-22 给会话头部的铃铛加一次「响」（点击切换本会话提示音时摇一下）**，
> **rev-23 把摇动换成「倾一次就落定」（换掉四次摆动，并点名拒绝 ease-in-out）**，
> **rev-24 把铃铛的动作整段删除 —— 静音改成「把斜杠从左上画到右下」、蓝底同一时钟变暗（240ms）**。
> 每次改动后都复跑了全部 harness：现为 4 个文件 / **663 项断言全绿（124 + 442 + 22 + 75）**，各 exit 0；
> 另有**独立验证层**（`verify-independent/`，另一套探针与变异表，与上面四套不共享代码）——
> 早先的读数是 6 个探针 / **402 项**，加**重基线后全绿的 10 个遗留探针 / 820 项**；
> **逐轮的当值读数与残留红项见 `docs/变异覆盖与残留红.md`**，本节每个 rev 小节也各自记下当轮的结论。

## rev-24 · 铃铛不动了，改画那一道斜杠（静音 = 把斜杠从左上拉到右下）

来源：rev-23 交付后用户看真机 ——「**不要晃动，静音时把斜杠重左上拉到右下的动画**」，随后四轮补充：
「关闭静音的时候斜杠从左上到右下动画，**两个动画时长一样**」/「斜杠的图层是在铃铛上面」/
「**蓝色的部分也弄个逐渐变暗到消失的动画**」/ 以及一串只调时长的反馈（见下）。

- **铃铛本体彻底不动**：rev-23 的倾斜规则**整段删除**，不是调小 —— 字形与 28px 按钮在**任何状态**下都
  没有 `transform`、没有 `animation`、没有 `transform-origin`。「铃铛不晃」这类性质正是后来者"顺手加个
  keyframes"会破坏的东西，所以测试把它写成**四处缺席断言**（声明、样式表、渲染树、**源码里的死标识符**——
  注释里留一个已删除的常量名，就是下一个读代码的人以为它还在的原因）。
- **动作改成"画"**：静音时把斜杠的**笔画**从对角线左上端画到右下端 —— 动画 `stroke-dashoffset`
  从对角线自身长度（**15.27**，由两端点 2.6/13.4 推导，不手抄）到 0；取消静音时反向扫走。
  蓝底变暗/回蓝走**同一时钟**（用户明确要求等长）。
- **一个常量、两条曲线**：`BELL_MUTE_MS = 240`（四条规则全部由它拼出，不存在只改了一半的可能）；
  `dacSlashDraw`/`dacBellGlow` 用 `cubic-bezier(0.22,1,0.36,1)`（长尾 ease-out），
  `dacSlashSweep`/`dacBellDim` 用 `cubic-bezier(0.42,0,0.58,1)`（`ease-in-out`，**它自己的时间反演**）。
  两个方向的曲线是**交叉**的：一个在缓出时另一个在缓入缓出。
- **时长是被你调出来的，不是量出来的**（历史原样记在常量旁边）：240（第一版，只有笔画，读作"有点快"）
  → 420（仍是笔画，"出来那下有点慢"）→ 420 + 蓝底（"太慢了"——**同一个时长一旦覆盖更多视觉变化就更慢**，
  这是整条反馈里唯一有信息量的一点）→ 300（仍偏慢）→ 360（**只活了一轮**：那是我把你的错字
  「在慢点」当成了「再慢点」，你随后说明是「再快点」——360 因此**从未被你真正评判过**，注释里明确写了
  "不得被后人引用为被否决的值"）→ **240**。回到 240 不是重试：当年那个 240 只管一道笔画，
  现在 240 要同时驱动笔画与一大片蓝底，覆盖的视觉变化更多，**读起来比当年慢** —— 这才是理由。
- **"不画墨"用的是 `opacity`，不是 dash 偏移**：这一步走过两条死路，而且**两条你都看见了**——
  `stroke-dasharray` 单值每 `2·LEN` 重复一次，所以 `dashoffset = LEN` 会把一个圆头端点停在路径末端
  （右下角那个**点**，你问「为什么右下角有个点」），再往前推一个长度又会把下一段重复拉进另一端
  （左上角那条**短线**，「现在是左上角有个线」）。**任何 dash 几何都清不掉一条长度恰等于 dash 的路径的两端**，
  所以静止态改用 `opacity:0` 隐藏，两个关键帧也各自带动 `opacity` 轨道 —— 这也让每次动画**结束在一个真正看不见的
  状态**上，而不是"恰好没有墨"的状态上。
- **图层：SVG 没有 z-index，绘制顺序就是这个 paths 数组**。斜杠改为**先** push，铃铛与铃舌在后，
  于是笔画落在铃铛轮廓**后面**（用户报告「斜杠的图层是在铃铛上面的」）。副作用是动作变好看了：
  墨从左下侧出现、隐入铃铛、再从另一侧出来。
- **首次绘制仍静默**：`data-draw` 在点击前是 `false`；首次点击后计数器 `drawCount > 0` 会让这个节点
  **在会响状态下也保留**（否则取消静音时没有元素可动画）——但**点击之前**会响状态仍然只渲染两个 path，
  rev-10 的图标契约与 probe-18 记录的 `{pathCount:2,hasSlash:false}` 依旧成立。
- **几何、配色 token、音频路径、host 半一律未动**；**仍不加 `prefers-reduced-motion` 降级** ——
  样式表里该字符串仍是 **0 次**（probe-20 量它，不假设它）。
- **锚定字节（rev-24）**：`lib/client.js` **179451 B / sha256 0BDAC98C5F9AB06F687A9856238EA7C7302A5E7F6CDEDD9CBBA6CDEBCEA49958**；
  `verify/client-half.test.mjs` **121975 B / sha256 1BCC6FAF5C40E64D9023E7EF19B97A548EA422CB9ADD4C943068400706916895**
  （**442** 项：rev-23 的 20 条换成 22 条，且这一节的主体是**缺席断言**与**静止态的零墨**）；
  `verify/custom-audio.test.mjs` **20263 B / sha256 D2DE24C11CA2699738E975476C9659976FC44C201C9F0174567BCE1551F4CD8C**（仍是 `:267` 那 1 个字节）。
- **harness**：四套作者 harness 合计 **663 = 124 + 442 + 22 + 75**，各 exit 0；独立层 probe-20 **58/58**，
  第 7 组**重写为"四态级联模拟"**（会响/静音 × 点过/没点过，问浏览器在这种情况下会算出哪条规则赢：
  谁赢、用哪条曲线、留多少墨），它的 **26 个突变仍然一个没加、一个没改名**，`--mutate=all` 逐条命中。
- **本轮最值得记的一课：一条检查"因为新理由而变绿"，不算通过。** 变异表（45 行）在本轮抓到一处**我自己造成的
  可证伪性流失**：probe-18 的 `B4.icon-two-states` 原本靠"静音才画斜杠"来区分两个状态，而 rev-24 让斜杠
  在**会响时**也可能存在（为了能播放取消静音的动画），于是 `mute-ignored` 突变下它**仍然是绿的**——
  图标确实不同了，但**不再是因为静音标志不同**，而那才是它声称在测的东西。修法是让这条检查同时断言
  **状态与画面这一对**（`data-muted` + path 数），于是该突变重新精确命中它声明的 14 条。
  若无变异表，这条会安静地退化成装饰。
- **本轮我自己写错的验证代码（4 处，全部由运行结果暴露）**：① 新探针的选择器用 `indexOf` 命中**更长的**
  `.dacSlash` 规则（前缀同名，静默取错块，报出 6 条假红）；② 曲线时间反演用浮点比较，`1 − 0.58` 得到
  `0.42000000000000004`；③ 抓关键帧的正则 `\}\}` 把 `to{}` 的收尾括号一起吃掉，看起来像产品坏了；
  ④ 把关键帧步骤的名字当成 `conditions`，而解析器放在 `prelude` 里。**四分之四都在验证侧**，
  与之前几轮同一条教训一致：**先怀疑验证器。**
- 另一处同源误报：把 JS 字符串长度（中文按 1 计）当成**字节数**印出来，一度让文件"看起来小了 1.7 KB"；
  真字节数与 sha 由磁盘与探针各自独立读取并一致。

## rev-23 · 铃铛改成「倾一次就落定」（换掉 rev-22 的抖动）

来源：rev-22 交付后用户看真机 ——「再换一个要有高级感」。rev-22 的动作是**四次递减摆动**
（0 → +14° → −11.06° → +7° → −4.06° → 0，420 ms，`ease-in-out`），读起来像**抖**；用户要的是收得住的那版。

- **改的是「形状」，不是幅度**：帧表从 6 帧、**四次过零**，变成 4 帧、**只过零一次** ——
  `BELL_TILT_FRAMES = [[0,0,1],[30,1,1.055],[66,-0.22,1.012],[100,0,1]]`（角度 0 → +9° → −1.98° → 0），
  并新增 **scale 轨**（1 → 1.055 → 1.012 → 1）。一句话：**晃四下的铃铛是玩具，倾一下就落定的铃铛是机构。**
- **缓动是另一半**：`cubic-bezier(0.22,1,0.36,1)`（长尾 ease-out），不再是 rev-22 对称的 `ease-in-out` ——
  快速离开、把大部分预算花在「到达」上，这是这种尺寸的动作里「高级感」的主要来源；测试里有一条**点名拒绝
  `ease-in-out`**，防止以后被「简化」回去。
- **峰值 14° → 9°，时长 420 ms → 560 ms**；支点仍是**字形顶边** `transform-origin:50% 0`（铃铛挂在冠上），
  「动的是字形、28px 按钮不动」的分工与 rev-22 一致；`data-ring` → **`data-tilt`**，
  `@keyframes dacBellRing` → **`dacBellTilt`**，控制台面 `bellRingMs/Deg` → **`bellTiltMs/Deg`**（560 / 9）。
  字形 key 仍是 `glyph<N>`，首次绘制仍**静默**（点击后才上膛）。
- **几何、配色、音频路径、host 半一律未动**；**仍不加 `prefers-reduced-motion` 降级** ——
  样式表里该字符串仍是 **0 次**（probe-20 量它，不假设它）。
- **锚定字节（rev-23）**：`lib/client.js` **168920 B / sha256 DA25EB01F21156A294DDAA5DD098BE97129101434A6E03EE106AC442F6B8263E**；
  `verify/client-half.test.mjs` **112635 B / sha256 9BA8B5776B968D0C3346A97F12AB2796C36DD0C00BA61FA8DE84C01FD2C1C78C**
  （**424** 项：rev-22 的 17 条换成 20 条，其中两条量的正是用户要的「形状」—— **过零次数** 与 **膨胀上界**）；
  `verify/custom-audio.test.mjs` **20263 B / sha256 2D712A6DE50DAA755D5C70A656BD42CAEB35CA48E36D4FBA744B63F6FA8268CF**（仍是 `:267` 那 1 个字节）。
- **harness**：四套作者 harness 合计 **645 = 124 + 424 + 22 + 75**，各 exit 0；独立层 probe-20 **49/49**
  （第 7 组重写为 12 条），它的 **26 个突变仍然一个没加、一个没改名**。
- **本轮补的课（登记，这是我上一轮的漏项）**：r22/t1 的重锚**只搬了 `rev-` 修订前缀、漏了 `r-` 轮次前缀**，
  于是 `r15t6` 仍在往 `_raw/r21-evidence/` 里写，一次运行把 **r21 canonical 的变异表与约 40 份逐条日志覆盖**了。
  已做两件事：① 新增 `r22-t2-evidence-paths.mjs`，把它的输出路径搬出 r21 目录（6 行、逐行声明命中数、改前副本归档）；
  ② 本轮重锚把**轮次前缀与修订前缀一起搬**，并实测它现在确实写进 `_raw/r23-evidence/`
  （45 份 `r23-mut-*.txt` + `r23-t1-mutation-table.json/.md`）。**r21 那批文件不可恢复**，仅存的一手记录是
  `_raw/r21-evidence/r21-t1-mutation-table-console.txt`。教训写在这里：**只数行数的检查，读着错轮次的字节
  也会绿 —— 计数不是溯源测试。**

## rev-22 · 铃铛会响（切换本会话提示音时摇一下）

来源：用户看着会话头部那个蓝铃铛说 ——「这个铃铛也要有动画」（旁边的箭头从 rev-17 起就会转）。

- **改法**：被摇的是 `<svg>` 字形，**不是**那个 28px 按钮（按钮本身就是 hover 底板，摇它等于摇指针脚下的背景）；
  支点是字形的**顶边** `transform-origin:50% 0` —— 铃铛挂在它的冠上，绕中心转看起来是「打转」而不是「响」。
  动画在**点击切换**时播放一次（不是载入时、也不是 hover 时）：`data-ring` 只在第一次点击后置为 `"true"`，
  字形带一个随点击递增的 React `key`，key 变了节点就被替换，替换就重放动画。
- **数值**：`BELL_RING_MS = 420`、`BELL_RING_DEG = 14`，都挂在控制台面
  （`sessionIcon.bellRingMs` / `sessionIcon.bellRingDeg`）。420ms 比箭头那 160ms **故意长**，而且是**另一个旋钮**：
  箭头报告的是一个离散状态（一次 90° 转），铃铛模仿的是衰减振荡，两者互不推导、也不许互相抄。
- **关键帧是生成的**：`BELL_RING_FRAMES = [[0,0],[15,1],[35,-0.79],[55,0.5],[75,-0.29],[100,0]]`，
  `bellRingKeyframes()` 由这张表和 `BELL_RING_DEG` 生成 `@keyframes dacBellRing`（角度为 `0,14,-11.06,7,-4.06,0`），
  所以样式表与控制台面**不可能**对峰值角度各说各话。
- **没有加 `prefers-reduced-motion` 降级**（与 rev-20 对箭头的处置一致）：一条规则、所有环境，代价写在常量旁边
  而不是包装成无障碍最佳实践。样式表里 `prefers-reduced-motion` 仍是 **0 次**（probe-20 量它，不假设它）。
- **锚定字节（rev-22）**：`lib/client.js` **166986 B / sha256 04376143BDD0EBC5AAB9F67910DFFC10997C8CC3D55D08A7FE6383152CB8207E**；
  `verify/client-half.test.mjs` **111255 B / sha256 75218CE8462FFDABC5590E735FC9BAAB5D096DDFF5CF74105F32B25CBCD026E5**
  （+17 条：常量、生成的关键帧及其衰减、支点、按钮未被摇、首帧静默、点击后上膛并换 key）；
  `verify/custom-audio.test.mjs` **20263 B / sha256 11DAF28B703C43DCC2F3845A05ECCF278772AD48F6E06F2764705058ED8D6F05**（仍是 `:267` 那 1 个字节）。
- **harness**：四套作者 harness 合计 **642** 项（client-half **421** / host-half **124** / waterfall **22** /
  custom-audio **75**），各 exit 0；独立层 probe-20 **47/47**（新增第 7 组共 10 条，含「点击后才上膛」），
  它的 **26 个突变一个没加、一个没改名**，`--mutate=all` 复测全部按各自声明的红集命中。
- **本轮补档（登记，本可不发生）**：本轮先用编辑工具改了 `lib/client.js`、**之后**才建重锚工具，而重锚工具只归档
  **它自己碰过**的文件，于是 rev-21 那份产品字节（159172 B / `AE391909…`）一度**在盘上没有任何副本**，连 r21 的
  证据里也没有一处写着这一对。已用**逆向重建**补回：把本轮的 10 处改动逐条求逆作用回 rev-22 文件，重建结果
  **159172 B 且 sha256 命中 `AE391909…`（256 位摘要相等）**，即 rev-21 原件本身，已归档为
  `_raw/r22-evidence/archive/lib__client.js.ae3919098ccc11c9.txt`；重建脚本
  `_raw/r22-evidence/reconstruct-rev21.mjs` 为每一条逆操作声明命中数，任一条不符即拒绝写盘。
  （第一次重建正好差 **2 字节** —— 多留了一个空行 —— 是摘要把它拦住的；第二次报「NOT RECOVERED」则是**我脚本里的
  大小写比较**写错了，64 位十六进制其实完全相同，已修并在脚本注释里登记这次误报。）

## rev-21 · 构建戳只显示版本号（badge 从整串改成版本 id）

来源：用户看设置页截图指出 ——「这里只显示版本号就行了」。原先「通知提醒」分区页右上角显示的是整串
`rev-20 · the caret turn takes 160 ms`。

- **改法**：`.dacRev` 改渲染 `snapshot.bundleRevisionId`，它**由 `REVISION` 推导**
  （`REVISION.split(' · ')[0]`），所以「版本 id」与「描述半句」不可能各说各话；描述半句留在控制台面
  （`diagnostics.revision` 仍是整串），并新增 `diagnostics.revisionId`（= badge 的文本，也可读
  `window.__DSH_APPROVAL_CHIME__.revisionId`）。**行为、样式、几何、音频路径与 host 半一律未动** ——
  这是一次纯渲染改动，也是本轮的**全部**改动。
- **锚定字节（rev-21）**：`lib/client.js` **159172 B / sha256 AE3919098CCC11C9E5016AC0B72A12C8A97C0D13DA6009318D4801FCBA37A2D4**；
  `verify/client-half.test.mjs` **104904 B / sha256 5FAA8FEF5C6259875F981F23376BBE282F8E82B9A3F3D2839B0B453165CE50DA**
  （+4 条断言：badge 必须**恰好**是 `rev-<n>`、不带 `·` 分隔符、整串**不再出现在页面上**、控制台半句仍在）；
  `verify/custom-audio.test.mjs` **20263 B / sha256 49B0493EB031D576BC4AD02D0559B31357A8ADD5D74DD4BC08FBDBEF119DA0CE**
  （仍是 `:267` 那 1 个字节）。
- **harness**：四套作者 harness 合计 **625** 项（client-half **404** / host-half **124** / waterfall **22** /
  custom-audio **75**），各 exit 0；独立层 probe-17 **95/95**（+1 条 = badge 无散文半句）。
- **本轮开始时发现的事实（登记，不当没看见）**：r20 的 canonical 跑在 2026-09-19 23:06，之后
  2026-09-20 00:38 的提交 `b0ad1eb`（术语统一 556 处 + 新版 README）把产品字节从
  **158549 B / `4B6C8B91…`（r20 全部指纹钉的那一对）** 改成 **158546 B / `5DE1F30C…`**，
  同时改了 `verify/client-half.test.mjs`、`README.md`、`docs/**`、`package.json`。
  后果：**在本次重锚之前，runner 第 0 节（冻结清单）在已提交的树上已经是红的**，
  文档机检也有 **9 条声明值**因此失配（`artifact:lib/client.js`、`artifact:verify/client-half.test.mjs`、
  `artifact:verify-independent/probe-17-r7-section.mjs`、`artifact:README.md`、`artifact:docs/挂载与验收.md`、
  `changelog-anchor:lib/client.js(rev-20)`、`visibility-scan-files`、`policy:old-semantics-scan-files`、
  `fingerprint-restatements:lib/client.js(all mentions)`）。本轮把这些声明值一并重锚（逐条见
  `docs/变异覆盖与残留红.md` §20），并**没有**改写 §15–§18 的冻结历史。
- **独立验证**：canonical runner 本轮重跑（exit 0 / `FAILURES` 0 / 冻结 9/9 / legacy 10/10 /
  变异表 45/45），当值 console 为 `verify-independent/_raw/r21-run-console.txt`
  **75978 B / sha256 5C61EDB5B0160296F66C91BCD956CDE39E7A03889EF508CD71F50400485496FE**。
  这一轮跑了三次，前两次都红，**两份红色 console 都作为证据留着、没有被覆盖**；两次的 `FAILURES` 行都只点名
  rev-7 评审探针 `probe-r7-reqcheck.mjs` 的**登记**（探针本身没改）：
  - **首跑**（`verify-independent/_raw/r21-evidence/r21-run1-red-console.txt` **75007 B / `92145633…`**）：
    当时 CHANGELOG 还没有锚定本版 `lib/client.js` 的 sha256，那条探针实测 **10 条**红 ——
    比平时多两条：术语提交 `b0ad1eb` 改了 intro 文案 1 条、本轮 badge 改成只印版本 id 1 条。
    而 runner 登记的 marker 还是 `9 failed`、登记的名单里也没有「the intro line is present」，
    于是同时判红两条：**登记 marker 漂移** + **登记红集漂移**。
  - **第二跑**（`.../r21-run2-red-console.txt` **75216 B / `0CE2DF28…`**）：CHANGELOG 锚定之后探针实测
    **8 条**红、**恰好等于**登记的名单，但 marker 还写着 `9 failed` —— 只判红一条：**登记 marker 漂移**。
  - **第三跑（当值，全绿）**：登记改成现场实测的数值。登记红集：锚定状态 **8 条**、未锚定状态 **10 条**
    （= 8 + 2：CHANGELOG 未锚定 live 哈希时多红 `lib/client.js` 的字节数与 sha256 两条）。
    名单逐字写进 runner 的 `$reviewerRedSet` / `$reviewerRedSetExtra`，marker 期望值在未锚定状态由
    `8 failed` 改成 `10 failed`；**两份红色 console 的 `FAILURES` 行本身就是这两次失败的记录**。
- **未证**：badge 只显示版本号是否就是你要的观感、真机像素与刷新后是否真的加载了新 bundle ——
  只有你看页面才能判定。

## rev-20 · the caret turn takes 160 ms in every environment（减少动效不再有例外）

来源：用户真机反馈 —— rev-19 把 caret 转动由 300ms 加到 **400ms** 后**依然看不到转动**。定位结果：
用户的系统处于 `prefers-reduced-motion: reduce`，而 rev-17 起的那条媒体块在 reduce 环境下把 caret 的
过渡整条去掉（`transition:none`）、只留 90° 终态 —— **时长怎么加都不会有动画**。所以本轮不调时长，改策略。

- **改法**：顶部常量 `CARET_ROTATE_MS` 由 400 改成 **160**、构建戳 `REVISION` 改成
  `'rev-20 · the caret turn takes 160 ms'`；**删掉两条 `@media (prefers-reduced-motion: reduce)` 块** ——
  caret 的那条，以及**设置页开关**（`.dacSwitch` 的 `transition:background-color .18s ease,border-color .18s ease`）
  的同款覆盖。两条都删 ⇒ 现在产品里 `@media (prefers-reduced-motion` 出现 **0** 次、`transition:none` **0** 次，
  **开关的过渡也不再分环境**。caret 的过渡规则仍**恰好一条**、时长仍由常量拼出
  （`.dacCaret svg{transition:transform <CARET_ROTATE_MS>ms ease}`），没有手抄副本。
- **新行为（当值）**：**任何环境下都是同一段 160ms 转动，没有例外**。顶层诊断 `reduceMotion()` 保留，但
  **降级为纯环境报告** —— 它只回答"本页是否命中 `(prefers-reduced-motion: reduce)`"，**不改变任何行为**、
  也不在 `sessionIcon` 里。角度仍 90、曲线仍 `ease`、`.dacCaret` 在任何状态下仍无 `transform`。
- **这是有意的取舍，照实写**：在要求减少动效的环境里，本插件**不再尊重**系统偏好（caret 与开关都一样）。
  用户原话是"开不开都要有动画"，本轮的验收也把"产品里 `@media (prefers-reduced-motion` × 0"写成了硬断言，
  所以不是疏忽、也不是漏删。**"这段 160ms 是否真的能被察觉"只有用户能在真机上判定**（见 `README.md` §9 H20）。
- **沿革（照实）**：160ms（rev-17 初值）→ 300（rev-18）→ 400（rev-19）→ **160（rev-20）**。
  前两次是"时长太短"的诊断；本轮是**归因纠正**：用户在 reduce 环境下看到的瞬跳来自那段被删掉的过渡，与时长无关。
- **锚定字节（rev-20）**：`lib/client.js` **158549 B / sha256 4B6C8B91F0C294A0E2C561934C8ED627C7D3F937CFF33904A8FACA651A5949F3**
  —— 改前 rev-19 是 **157296 B / sha256 1C75C8B59634F2B44988056A2A343B4E46241D86C122C35B13EF1FAE2F3B6B35**，
  改前字节归档在 `_raw/r20-t1-archive/lib__client.js.1c75c8b59634f2b4.txt`（写在第一次编辑**之前**）。
  **DSH 侧 `lib/index.js` 零改动** —— 46638 B /
  sha256 03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938（仍是 rev-11 字节）。
- **自测（rev-20 实测）**：四套作者 harness 合计 **621** 项（client-half **400** / host-half **124** /
  waterfall **22** / custom-audio **75**），各 exit 0。`verify/client-half.test.mjs` **103459 B /
  sha256 C156BBB2BC7C12EA30237CF13AAF0308B0A152C26B7F72D9A2411787C2948622**（比 rev-19 多 1 条断言 =
  新守卫"**任何环境下都不给 caret 加 reduced-motion 覆盖**"）、`verify/custom-audio.test.mjs` **20263 B /
  sha256 D4B610DF4ACFDB5156EC14EA4DF8BB95D19D7099E097FB998EACDB92311E8686**（仍是全文件恰好 1 个字节不同）。
- **重锚（工具 `verify-independent/r20-reanchor.mjs`）**：**111 行 / 115 处替换**、覆盖 **11 个活文件**
  （三个数取自工具自己写的 `_raw/r20-evidence/r20-t1-reanchor.json`，**不手数**）；改前字节逐个归档在
  `_raw/r20-evidence/archive/`。变异表在 rev-20 字节上重跑 **45/45**，逐条日志
  `_raw/r20-evidence/r20-mut-*.txt`。canonical runner 的前缀（`r19-` → `r20-`）与冻结清单同批重锚，
  但**本轮没有重跑 canonical**：上一轮的权威运行仍是 `_raw/r19-run-console.txt`。
- **文档面（r20/t3）**：`README.md` §3.2/§7.1 与 `docs/挂载与验收.md` 的 B2/B5/B6 按**新语义**重写
  （任何环境都是同一段 160ms；`reduceMotion()` 只报告环境、不改变行为），rev-18/rev-19 的历史记录逐字节保留；
  本轮每个被改文件的**改前字节**归档在 `_raw/r20-t3-archive/`（5 个副本，命名带改前 sha16）。

## rev-19 · the caret turn takes 400 ms（把 caret 转动由 300ms 再放到 400ms）

来源：本轮的指派是在 rev-18 的 300ms 之上再放慢 —— **`CARET_ROTATE_MS` 由 300 改成 400**（rev-19）。
**这一轮只是把 300 ms 加到 400 ms，行为其余部分零改动**：角度仍 **90**、曲线仍 **`ease`**、
reduced-motion 仍**只关过渡并保留 90° 终态**、`reduceMotion()` 仍**每次调用实时读**且仍在 `sessionIcon` 之外、
CSS 的过渡时长**仍由常量拼出**（`.dacCaret svg{transition:transform <CARET_ROTATE_MS>ms ease}`），
没有一处手抄数字。**快慢是否合适、转动是否真的能被察觉，只有你能在真机上判定**（见本节末）。

- **改法（共 6 行，全是等长的行内替换）**：顶部常量 `var CARET_ROTATE_MS = 400;`（唯一一处声明，
  `CARET_ROTATE_MS = 300` 出现 **0** 次）；构建戳 `REVISION` 由 `'rev-18 · the caret turn takes 300 ms'`
  改成 `'rev-19 · the caret turn takes 400 ms'`（可测事实：自测断言它含 `rev-19` 与 `400 ms`，
  且不含 see/visible 一类词）；常量注释里的帧数算术随之由工具重算 —— **400 ms ≈ 60Hz 下 24 帧**
  （rev-18 的 300 ms ≈ 18 帧、rev-17 的 160 ms ≈ 10 帧）。
- **锚定字节（rev-19）**：`lib/client.js` **157296 B / sha256 1C75C8B59634F2B44988056A2A343B4E46241D86C122C35B13EF1FAE2F3B6B35**
  —— **字节数与 rev-18 相同**（六处改动全部等长，实测而非假定）；改前字节
  **157296 B / sha256 7FE150A0C1A89D6797ED3491F8CC74251CD7FD64DD8FA708621BA33FB9F49C45**
  归档在 `_raw/r19-t1-archive/lib__client.js.7FE150A0C1A89D67.txt`（写在第一次编辑**之前**）；
  逐行对照只有 **6 行**不同（:151 的戳、:241/:252/:257 的 300→400、:253 的帧数、:268 的常量声明），
  行数 3186 / CRLF 3185 / 无 BOM 全部不变。**DSH 侧 `lib/index.js` 零改动** —— 46638 B /
  03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938（仍是 rev-11 字节）。
- **自测计数（rev-19，本轮实测）**：**620 项全绿（124 + 399 + 22 + 75）**，四套 exit 0。
  自测文件：`verify/client-half.test.mjs` **101901 B / sha256 6DBDF454151EC92CDC476B520516BE29F2EA8196C015F8AAC9595A4C1E3C6389**、
  `verify/custom-audio.test.mjs` **20263 B / sha256 B2C825016A2ED7965488FDFA8CE10EDEF65DEB01A74235228D4FBBFCB451D913**
  （仍是**全文件恰好 1 个字节**不同：版本戳那一行）。
- **重锚（工具 `verify-independent/r19-reanchor.mjs`）**：**95 行 / 100 处替换**、覆盖 **11 个活文件**，
  三个数取自工具自己写的 `_raw/r19-t2-reanchor.json`（**不手数**）；每一行都要求精确出现次数，
  任一行不匹配就整轮拒绝写入；冻结清单里 `lib/client.js` / `verify/client-half.test.mjs` /
  `verify/custom-audio.test.mjs` 的新字节数与 sha256 由脚本**当场从磁盘量出**再写入 `run-r13.ps1`。
  改前字节按文件逐个归档在 `_raw/r19-evidence/archive/`（**11 个副本**，副本名带自己的 sha256 前缀，
  机检逐个重哈希核对）。canonical 日志前缀同批改成 **`r19-`**：`r18-*`、`r18b-*`、`r18c-*`（以及更早各轮）
  的证据一个字节都没被覆盖。
- **过程记录（如实登记，不许省）**：第一次 `--write` 用的工具版本有两个缺陷 —— `r18c-`→`r19-` 被误写成
  **`r19c-`**，以及预测 post-edit 状态对**插入行**不幂等。执行者**没有**用补丁批次掩盖：先用
  `_raw/r19-evidence/restore-pre-edit-bytes.mjs` 把 11 个文件**逐字节还原**到 pre-edit sha（**11/11 相符**），
  修好工具后**从真 pre-state 重跑**（dry → write → post-state 全绿）；复核：全仓 `r19c-` 出现 **0** 次。
  另一件：`_raw/r15-t2-mutant-copy-lib-client.js.txt` 被重写过 —— 那是 r15t2 `--mutant` 的既有 byproduct
  （r18c 轮同样如此），**不是证据丢失**，但写在这里而不是藏起来。
- **记账缺口（如实登记）**：`_raw/r19-t2-reanchor.json`、`_raw/r19-t1-mutation-table.json`/`.md`、
  `_raw/r19-mut-*.txt` 落在任务声明的 `_raw/r19-evidence/` **之外**，scope 校验器因此不许它们进
  `changedPaths`（t1 的归档副本同例）。这是**记账**缺陷，不是行为缺陷。
- **独立层与 canonical**：变异表已在 rev-19 的产品字节上重跑 —— **45 行 / 45 ok**
  （`_raw/r19-t1-mutation-table.json`，`lib/client.js` 157296 B / `1C75C8B5…`，逐条日志 `_raw/r19-mut-*.txt` 45 条）；
  6 个计数探针、10 个遗留探针与四套 harness 的**整轮汇总**由 canonical 重跑一次产出，权威数字在
  `_raw/r19-run-console.txt`（`r19-*` runner 日志）—— **本节不替那次运行写数字**。
- **未证（不许当已证）**：**本轮改的是一个时长常量与随之而来的戳/注释/指纹，不是"让你看得见"**。
  400ms 在你屏幕上快慢是否合适、转动是否真的能被察觉、像素与主题观感、`transform-origin` 是否视觉居中、
  过渡插值与合成层、真机上 `prefers-reduced-motion` 是否真的命中 —— 全部**只有你能判定**（沙箱没有浏览器引擎）。
  能证的只到上面那些：时长常量、样式表由它拼出、戳是可测事实、字节/哈希/归档一致。完整清单见
  `docs/变异覆盖与残留红.md` §18.6。
- **只改客户端** → **刷新页面即可**；DSH 侧与 rev-18 逐字节相同。

## rev-18 · the caret turn is slow enough to see（把转动放慢，并给两种"看不到转"一个区分手段）

来源：真机反馈「**要有过渡动画能看到在转动的箭头**」—— rev-17 的 **160ms** 转动在你机器上**看不出来**。
rev-18 只做两件事，并且**不替用户下「现在看得见」的结论**（只有你能判定，见本节末）。

- **时长 160ms → 300ms**：常量 `CARET_ROTATE_MS` 换值，CSS 的过渡时长**仍由常量拼出**
  （`.dacCaret svg{transition:transform <CARET_ROTATE_MS>ms ease}`），没有一处手抄数字；
  自测里因此多了一条"样式表必须由常量拼出"的断言。旧注释的依据（"本文件既有过渡是 `.18s`"）是**判断不是度量**，
  已被真机反馈直接推翻，注释已重写为诚实版本（引用你的原话 + 写明该依据被推翻）。300ms ≈ 60Hz 下 18 帧，
  中间角度确实会被绘制；弹层没有入场动画且已在屏上，箭头转完时视线刚到第一行，所以**判断**它不至于显得拖沓
  —— 但这是判断，不是本机实测的观感。
- **新增顶层诊断 `__DSH_APPROVAL_CHIME__.reduceMotion()`**（**不在 `sessionIcon` 里** —— 那是几何快照）：
  **每次调用实时**读 `window.matchMedia('(prefers-reduced-motion: reduce)')` 并返回布尔；平台没有
  `matchMedia` 时返回 `false` 而不是抛错；`matchMedia` 自身抛错也返回 `false`。
  **它为什么存在**：箭头"瞬跳"有**两个**在真机上长得一模一样的原因 —— **时长太短**（本轮改的就是它）与
  **环境要求减少动效**（此时 `prefers-reduced-motion:reduce` 媒体块**有意**关掉过渡，瞬跳是**设计行为**，
  90° 终态规则照常生效）。控制台里 `reduceMotion() === true` 就说明"看不到转动"是设计行为而不是缺陷；
  这条诊断的存在就是为了让这两种情况**不必再猜**。
- **可证伪性**：`verify/client-half.test.mjs` **388 → 399 条**：**11 条新增**（时长常量 == 300、样式表由常量拼出、
  恰好只存在一条 caret transition 规则且**没有残留的 160ms 副本**、`reduceMotion` 是函数而非布尔快照、
  它不在 `sessionIcon` 里、无 `matchMedia` 时不抛且答 `false`、`matches:false` → `false`、`matches:true` → `true`、
  所问的查询串恰为 `(prefers-reduced-motion: reduce)`、同一实例上把桩翻转后**实时**重读）
  —— 并把已被真机推翻的那条（"时长落在 120–200ms 带内，读起来是转动而不是跳变"）**替换**掉；
  **净删除 0 条**，是「1 条被更强的替换 + 11 条新增」。
  独立探针 `probe-20` 由 30 → **37/37** 条、声明变异由 20 → **26**（新增 6 个 reduceMotion 变异：
  `reduce-motion-boolean-snapshot`（红 1,2,3,4,5）/ `reduce-motion-always-false`（2,5,6）/
  `reduce-motion-always-true`（3,4,5,6）/ `reduce-motion-cached-after-first-call`（仅 5）/
  `reduce-motion-asks-the-wrong-query`（仅 6）/ `reduce-motion-snapshotted-into-sessionIcon`（仅 7）），
  `--mutate=all` **26/26** 恰好命中、两两红集不同、每个锚串实测恰好命中 1 次。
  另有一个既有变异 `caret-turn-ms-250` 的锚串与声明名随之更新（250 现在只是**错的时长**，
  而不再是"越出带宽"；它的红集仍是 1 条）。
- **锚定字节（rev-18）**：`lib/client.js` **156937 B / sha256 1C8DB24CA492CE2A27B6BEC10A3366612F2F5AD7294D39E8B9D4D78C2FC8B54D**
  （rev-17 为 154457 B / `B4A0A1B3…`，其归档副本见 `_raw/r18-t1-archive/lib__client.js.B4A0A1B3.txt`）；
  **DSH 侧 `lib/index.js` 零改动** —— 46638 B /
  03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938（仍是 rev-11 字节）。
  自测文件：`verify/client-half.test.mjs` **100983 B / sha256 AB6F7E4833EBD15488BB3214007462540186A2893DE7553922ABCD232FBD8731**（388 → 399 条）；
  `verify/custom-audio.test.mjs` **20263 B / sha256 6EF2F162F0E92CC5904297219DF98D7FF6113ED97138C6A9AF47480C3F89D87F**（仍是**全文件恰好 1 个字节**不同：`:267` 的版本字面量）。
- **自测计数（rev-18）**：**620 项全绿（124 + 399 + 22 + 75）**，四套 exit 0。
- **独立层**：probe-20 30 → **37/37**、声明变异 20 → **26**；6 个计数探针 32 / 94 / 131 / 66 / **37** / 42 = **402**；
  变异表 39 → **45 行全 ok**；10 个遗留探针重锚后**仍 10/10 全绿**。
- **重锚（`r18-t1-reanchor.mjs`）**：**76 行 / 84 处替换**，**每一行都要求精确出现次数**，任一行不匹配就整轮拒绝写入；
  冻结清单里 `lib/client.js` / `verify/client-half.test.mjs` / `verify/custom-audio.test.mjs` 的新字节数与 sha256
  由脚本**当场从磁盘量出**再写入 `run-r13.ps1`，不手抄。拒绝逻辑**先被证伪过**：控制组 exit 0，
  而"次数写高 / 次数写低 / 前后两个字面量都指向工作区里不存在的文本"三个坏副本**都 exit 1、点名该行、
  8 个目标文件 0 字节改动**。旧字节归档在 `_raw/r18-t1-archive/`（**17 个副本** + `PROVENANCE.md`，
  每个副本名带自己的 sha256 前 8 位、逐个重哈希核对，并分成「当场快照 / 手工编辑快照 / 哈希可证的旧基线副本」三组）。
- **canonical runner 的日志前缀同批改成 `r18-`**：前缀行与其它行**在同一次原子写入里**改掉
  （rev-16 覆盖 rev-15 日志那次事故的补课），所以本轮的 `r18-*` 日志与 `r17-*`（68 条）、`r16-*`（61 条）、
  `r15-*` 证据并存，一个字节都没被覆盖。
- **未证（不许当已证）**：**本轮改的是时长常量与一条诊断，不是"让你看得见"** —— 转动在你的屏幕上是否真的
  "看得见"、快慢是否合适、像素与主题观感、`transform-origin` 是否视觉居中、过渡插值与合成层、
  真机上 `prefers-reduced-motion` 是否真的命中，全部**只有真机能定**（沙箱没有浏览器引擎）。
  完整清单见 `docs/变异覆盖与残留红.md` §15.8。
- **只改客户端** → **刷新页面即可**；DSH 侧与 rev-17 逐字节相同。

## rev-17 · the caret turns to point down（箭头打开时下转）

来源：真机反馈「打开的时候箭头向下转一下」。**纯外观改动**：动效不改变任何行为、DOM 形状、请求或音频路径，
但它动了 `lib/client.js`，因此所有锁定产品字节的断言都按纪律重锚了一遍（见本节末）。

- **改法**：新增两个常量 —— `CARET_OPEN_ROTATE_DEG = 90`（一个直角，是"指向下"的唯一自洽角度）与
  `CARET_ROTATE_MS = 160`（120ms 以下眼睛看到的是跳变而不是转动，200ms 以上箭头明显滞后于面板；
  本文件既有的过渡是 `.18s` 的开关轨道与滑钮，面板本身没有入场动画、唯一在动的就是字形，160ms 落在
  区间中段略低于 `.18s`）。两者都在 `lib/client.js` 顶部，CSS 由它们拼出，**没有一处手抄数字**。
- **旋转作用于字形而不是按钮盒**：`.dacCaret svg` 拿 `transition:transform <CARET_ROTATE_MS>ms ease` 与
  `transform-origin:center`，终态是 `.dacCaret[data-open="true"] svg{transform:rotate(<deg>deg);}`。
  按钮自己（`.dacCaret`）在任何状态下都**没有** transform，仍是 `16px × 28px`；11×16 的字形转过 90° 后
  足迹 16×11，仍装得下。**打开态复用的是现成的 `[data-open="true"]` 钩子** —— 没有新增 state，
  渲染树里也没有任何 JavaScript 在算角度。
- **`prefers-reduced-motion:reduce` 降级**：块内**只有** `transition:none`，90° 终态规则在媒体块**外面**
  ——"少动效"不该等于"少一个状态提示"（降级掉的是动画，不是终态）。
- **可证伪性**：`verify/client-half.test.mjs` 新增 15 条断言（open 态 transform == `rotate(常量deg)`、
  closed 态无 transform、transition 字符串由常量拼出、角度字面 90、时长落在 120–200ms 带内、
  `transform-origin` 居中、按钮两态都没有 transform、转过后的字形足迹装得下、reduced-motion 规则逐字、
  该块只关 transition 不要 transform、终态规则在媒体块之外、Escape 后回到未变换的 `[data-open="false"]`）。
  独立探针 `probe-20` 由 23 → **30/30** 条，并**为每条新检查各声明一个变异**（7 个）：
  `caret-turn-transition-dropped` / `caret-turn-rule-dropped` / `caret-turn-angle-45-deg` /
  `caret-turn-ms-250` / `caret-turn-reduced-motion-dropped` / `caret-turn-moved-to-button`（红 2 条）/
  `caret-turn-also-when-closed`；`--mutate=all` **20/20** 恰好命中且两两红集不同。
  其中一个既有变异（`caret-css-hardcoded-12`）的**声明红集由 1 名加宽到 2 名**，这是新检查真的钉住了
  caret 盒 16×28 的**实测结果**，不是放宽。
- **锚定字节（rev-17）**：`lib/client.js` **154457 B / sha256 B4A0A1B323A9BC9A99803EDBE28E770DE1097162165B16000995DD8E84A4A2F4**
  （rev-16 为 150663 B / 76B4D4E7…，其归档副本见 `_raw/r17-t1-archive/lib__client.js.76B4D4E7.txt`）；
  **DSH 侧 `lib/index.js` 零改动** —— 46638 B /
  03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938（仍是 rev-11 字节）。
  自测文件：`verify/client-half.test.mjs` **95803 B /
  97EEB2D05C5277C6AF6DB1B015E9A0C6AEF3CB717945E58D25823E77BF7588F1**（373 → 388 条）；
  `verify/custom-audio.test.mjs` **20263 B /
  523572EA2ADC896FD1BD38B450600D7E2F021FD8C55DB1CF523DF0C03B9FF8EE**（仍是**全文件恰好 1 个字节**不同：版本戳那一行）。
- **自测计数（rev-17）**：**609 项全绿（124 + 388 + 22 + 75）**，四套 exit 0。
- **独立层**：probe-20 由 23 → **30/30**、声明变异由 13 → **20**；6 个计数探针 32 / 94 / 131 / 66 / **30** / 42
  = **395**；变异表由 32 → **39 行全 ok**；10 个遗留探针重锚后**仍 10/10 全绿**。
- **重锚（`r17-t1-reanchor.mjs`）**：**76 行 / 84 处替换**，**每一行都要求精确出现次数**，任一行不匹配就整轮拒绝写入；
  冻结清单里 `lib/client.js` / `verify/client-half.test.mjs` / `verify/custom-audio.test.mjs` 的新字节数与 sha256
  由脚本**当场从磁盘量出**再写入 `run-r13.ps1`，不手抄。拒绝逻辑本身**先被证伪过**：把某行的声明次数从 9 改成 10、
  改成 8，以及把一个 `to` 字面量指向工作区里根本不存在的 `rev-99`，**三次都由脚本自己拒绝**（exit 1、点名该行、
  **未写入任何字节**）。
  旧字节归档在 `_raw/r17-t1-archive/`（**15 个副本** + `PROVENANCE.md`，每个副本的文件名都带它自己的 sha256 前 8 位，
  且 `PROVENANCE.md` 逐个重哈希核对过）。
- **canonical runner 的日志前缀同批改成 `r17-`**：这是 rev-16 踩过的坑（见 `docs/变异覆盖与残留红.md` §13.8）——
  前缀行与其它行**在同一次原子写入里**改掉，所以本轮的 `r17-*` 日志与上一轮的 `r16-*`（61 条）、`r15-*` 证据并存，
  一个字节都没被覆盖。
- **只改客户端** → **刷新页面即可**；DSH 侧与 rev-16 逐字节相同。

## rev-16 · the bell and the caret stand apart（铃铛与箭头分开）

来源：真机截图 + 一句话「这个铃铛和箭头分开点」。**纯外观改动**，但它是 rev-14 以来第一次动
`lib/client.js`，因此所有锁定产品字节的断言都按纪律重锚了一遍（见本节末）。

- **问题**：铃铛与 caret 同在一个 `inline-flex` 包裹器（`.dacBellWrap`）里且**没有 gap**；
  caret 盒子 16px 宽而其中的箭头只画 11px，于是蓝方块右缘到箭头左缘只剩 **2.5px**（`(16-11)/2`），
  两个**本来就是独立按钮**的控件被读成一个。
- **改法**：新增常量 `BELL_GAP_PX = 6`，`.dacBellWrap` 的 `gap` 由它拼出。6px 的依据是 DSH 自己的节奏
  （`dsh-client-ui-conversation` 的 `.headerActions{gap:8px}`）：加上箭头自带的 2.5px 内缩，墨迹间距 ≈8.5px。
  同一个常量上了控制台面（`sessionIcon.bellGapPx`），CSS 与诊断面因此**不可能各说一套**。
- **可证伪性**：`verify/client-half.test.mjs` 新增 2 条几何断言（包裹器规则带上了报告的 gap；该 gap 就是 6px）。
  独立探针 `probe-20` 的几何检查升级为**合取**（CSS 必须带报告值 **且** 报告值必须是 6），并为**每一半各声明一个变异**：
  `bell-caret-gap-removed`（CSS 退回贴死、诊断面仍报 6）→ 红 1 条；
  `bell-caret-gap-constant-zeroed`（常量归零、CSS 与诊断面**一致地**退回贴死）→ 红 2 条。
  两个红集**不同**（探针自身强制两两不同），锚串各命中 1 次，均 exit 0。
- **锚定字节（rev-16）**：`lib/client.js` **150663 B / sha256 76B4D4E73FFAE5CA47838B2798EE74AE39AB60ADEF2699CF4562D4A89AAAD6FE**
  （rev-15 为 149196 B / 32F0E31F…）；**DSH 侧 `lib/index.js` 零改动** —— 46638 B /
  03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938（仍是 rev-11 字节）。
  自测文件：`verify/client-half.test.mjs` **88441 B /
  B5FC3935EA5CB81814C2501C811B15C5C2EF5EB88624808AA3B03A618BCC0D9D**（371 → 373 条）；
  `verify/custom-audio.test.mjs` **20263 B /
  5AD07459C62401FB8DFC16079AD59A9FA2D5BBAD04591DF48FF12623ECBC387C**（仍是**全文件恰好 1 个字节**不同：版本戳那一行）。
- **自测计数（rev-16）**：**594 项全绿（124 + 373 + 22 + 75）**，四套 exit 0。
- **独立层**：probe-20 由 22 → **23/23**、声明变异由 11 → **13**（`--mutate=all`：13/13 恰好命中、两两红集不同）；
  变异表由 30 → **32 行全 ok**；6 个计数探针 32 / 94 / 131 / 66 / **23** / 42 = **388**；
  10 个遗留探针**重锚后重新 10/10 全绿**（其中 probe-8 的版本戳字面量是真的过期，已重锚）。
- **重锚（`r16-t1-reanchor.mjs`）**：66 行 / 69 处替换，**每一行都要求精确出现次数**，任一行不匹配就整轮拒绝写入
  —— 实测第一次 dry-run 因 1 行的引号写错而拒绝、**未写入任何字节**；旧字节归档在 `_raw/r16-t1-archive/`（**13 个文件** + `PROVENANCE.md`，
  其中 9 个是编辑前当场抓的，4 个是取自 t8 影子副本、**先哈希等于 rev-15 记录值才允许复制**）。
  冻结清单里 `lib/client.js` / `verify/client-half.test.mjs` / `verify/custom-audio.test.mjs` 的新字节数与 sha256
  由脚本**当场从磁盘量出**再写入 `run-r13.ps1`，不手抄。
- **本轮的一次自身失误（已登记，见 `docs/变异覆盖与残留红.md` §13.8）**：第一版重锚清单漏了 runner 的日志前缀，
  于是**第一次 canonical 运行把 rev-15 的 59 个逐命令日志覆盖成了 rev-16 内容**。rev-15 的汇总证据
  （`_raw/r15-run-console.txt`）、变异表与 30 个变异日志、以及该轮全部任务证据都未受影响；被覆盖的那 61 个文件
  整组隔离在 `_raw/r16-t1-mislabelled-r15-logs/`（目录名说明它们是什么），并补做
  `_raw/r16-t1-rename-runner-logs.mjs` 让这类碰撞不再可能；**第二次 canonical 运行（`r16-*` 前缀）才是权威集**。
- **只改客户端** → **刷新页面即可**；DSH 侧与 rev-15 逐字节相同。

## rev-15 · a failed re-read keeps the mutes（修 OBS-A）

来源：用户批准的三件事之一 ——「① 修 OBS-A」。**这是该轮唯一的产品改动。**

- **缺陷（rev-11 引入的残留）**：会话写入落定后（整表在飞计数归零）会重读一次 DSH 表以求收敛；
  这次重读**若失败**，旧实现会 `ready=false` 并把本地覆盖表清空成 `Object.create(null)`（旧码 `lib/client.js:1145`）。
  后果是**用户设过的静音被一次瞬时网络失败换掉** —— 该会话重新跟随全局，全局开着就会响。
  方向是错的：失败应当更安静，而不是更吵。
- **修法**：新增 `sessionsReadFailed(message)`，四条失败路径（无 `fetch` / 同步抛出 / 应答非 ok / promise reject）
  一律只写 `sessions.error` + `publish()`，**不再动表、不再降 `ready`**；只有真正落地的读才允许移动表。
  顺带把三处会因此变成假话的注释（模块头 "degrades to no overrides"、`sessions()` 与 `sessionWrites()` 的收敛点说明）
  改成诚实表述。
- **实测危害（在逐字节 rev-14 字节上跑当前自测）**：**359/371、恰好 12 条红**（版本戳 + 5j 失败路径 11 条），
  现场量到 `triggers 1→2`（被静音的会话真的响了）、`oscillators 2→4`、表→`{}`、`ready→false`、
  `suppressedSession 1→0`、`data-muted` `true→false`。
- **独立验证（另一个 agent，不是写这行代码的人）**：`verify-independent/r15t2-independent-probe.mjs`
  —— 自建 `node:vm` 跑真 bundle + 自建 DOM / 录音 WebAudio / HTTP 桩 + DSH 文件模型，
  **未 import 作者 harness**、断言文本在 `verify/` 里 0 命中。shipped **42/42**、exit 0；
  **同一探针跑在真实 rev-14 字节上 → exit 1、31/42、8 条语义红**（证明它抓的是产品行为，而不只是自造变异）；
  自造回退变异 → **红集恰好 10 条 = 运行前预先声明**、锚串在出厂字节恰好 1 次、
  变异体 `C742FBE6…`/149540 B 与出厂 `32F0E31F…`/149196 B **只在锚串区间不同**（A5：前后缀逐字节相同）。
- **质量门（第三个人）verdict = pass**：5 条产品验收 + 5 条收口验收逐条自跑判定；反向替换独立复现；
  遗留探针重基线经机检 `removed=15 / added=28 / unpaired=0`（15 对 1:1，`rev-N` 归一化后 0 孤儿）、
  `.only/.skip/todo/if(false)` 0 命中、45 行删除逐行核过。
- **锚定字节（rev-15）**：`lib/client.js` **149196 B / sha256 32F0E31FB5ABE1BE7B5C14746213C29EA75896CD54A88401FD70925D6D67BD55**
  （rev-14 为 147062 B / 730D1C2F…）；**DSH 侧 `lib/index.js` 零改动** —— 46638 B /
  03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938（与 rev-14 逐字节相同）。
  自测文件：`verify/client-half.test.mjs` 88005 B / BB2C1A34049C9F24FAF2D147043C465083A39B403A183D997041FFC3DC54943C
  （rev-14 为 77626 B，净增 35 条 5j 断言）；`verify/custom-audio.test.mjs` 20263 B /
  D13A8D63F073FA1748070996839F09DBD9E760F2448F555ABD865AC45218E822（**全文件恰好 1 个字节不同**：
  offset 11636 `0x34('4')→0x35('5')`，即版本戳那一行）。
- **自测计数（rev-15）**：**592 项全绿（124 + 371 + 22 + 75）**，四套 exit 0；client-half 由 336 → 371（净增 35 条）。
- **只改客户端** → **刷新页面即可**；DSH 侧与 rev-14 逐字节相同。
- **未证实（如实列出）**：re-read 失败后的**真机表现**（本探针是 headless vm + 桩服务，不覆盖真浏览器 /
  真音频输出 / 真 Host 路由）；**"永不回答的超时读"这条路抓不住「失败即清空」型变异**（没有失败落地），
  探针只断言其表不动；**恢复块在修复前后都绿** —— 危害窗口只在"失败读 → 下一次成功读"之间。
- **配套（非产品）**：10 个 rev-1…rev-3 遗留探针重基线到 rev-15（37 条过期期望，真缺陷 0），
  其豁免表退役为 `$legacyHistory`（非零即 FAILURE）；`verify-independent` 全部冻结指纹重锚到 rev-15。

## 变异覆盖与残留红（验证侧收口 · **不是 rev**：`lib/**` 零改动）

来源：用户「把这变异报红全修了」。先把范围讲清 —— 上一轮报告里那 **6 个"报红"是设计使然的假阳性**
（变异 = 故意植入缺陷，报红恰好证明自测抓得住），**不是缺陷**。真正修的是三类**真红**：

- **(1) 过期指纹**：rev-13/rev-14 改过 `lib/client.js` 后，三个独立探针的冻结哈希还停在旧字节
  （实测 `probe-17` 91/94、`probe-18` 130/1、`probe-19` 63/66），canonical 运行器 `run-r12` 的冻结清单同样过期。
  修法是**只改字面量**重新锚定到 rev-14，并用"反向替换后逐字节回到改动前的哈希"证明改的只有这些字面量。
- **(2) 变异自身的健全性**：存在死变异（锚串不存在 → 空转）、红集与声明不符、以及"抓住了却 exit 1"的驱动缺陷。
  修法是每个变异加「真改写」sha256 自检 + 锚串唯一性度量（必须恰好 1 次），并自测证明死变异/声明漂移必然非零退出。
- **(3) `.scratch/` 里 reviewer 的遗留探针**长期非零：能修的修绿，不能修的**逐条**给出与当前事实对照的理由。

**结果**：canonical `run-r13.ps1` → `exit 0`、**0 条 `FAILURES`**、唯一非零 = `probe-13`（沙箱无浏览器引擎，11/14）；
**29 个声明变异**（18 + 11）逐条满足"真改写 + 红集恰好等于声明 + 抓住时 exit 0"；独立探针 32/94/131/66/**22**。
**零产品改动**：`lib/client.js` **147062 B / `730D1C2F…`**、`lib/index.js` **46638 B / `03778391…`** —— 与 rev-14 冻结值逐字节相同。

- **新增独立探针 `probe-20-r14-bell-appearance.mjs`**（22 断言 / 11 声明变异）：把 rev-13/rev-14 的**铃铛外观**
  纳入独立覆盖。它自建 `vm` 沙箱跑真 bundle、读真注入的 `<style>` 与 `sessionIcon`、自写层叠模型（specificity → 书写顺序）解析规则，
  **不复用**自测断言文本（22 条断言文本在 `verify/client-half.test.mjs` 中出现 0/22）。补它的原因是一条对抗性发现：
  审查者自造 4 个外观变异（静音也填蓝 / 删掉会响态 `:hover` / 蓝底写死十六进制 / 静音图标染色）交给当时的独立层，
  **红集是 0** —— 自测层抓得住，独立层当时根本没覆盖。现四个变异与 `probe-20` 对应变异的**变异体 sha256 逐条相同**
  （`6E748820…` / `8D467907…` / `F4C45D30…` / `44D4F9F5…`），红集 **0 → 3/4/2/1**，闭环。
- **两处哈希漂移如实记录**（本轮教训：台账数字必须跟着写盘走，不能停在写盘之前）：
  `run-r13.ps1` 由 `AAE3FDDA…`(36065 B) → **`BA4910D9…`(40294 B)**；`probe-20` 由 `3A989397…`(34818 B) → **`7986539F…`(35738 B)**。
  两份旧字节均已归档（`_raw/r13w-archive-run-r13-AAE3FDDA….ps1`、`_raw/r13x-archive-probe-20-3A989397….mjs`）。
- **文档**：`docs/变异覆盖与残留红.md`（29 个变异逐行三列证据 + 残留非零登记 + 已证/未证分栏）。它**不写自己的哈希**
  （会自指失效）；配套一致性检查 `verify-independent/_raw/r13y-doc-counts.mjs` 机检"文档声明值 == 磁盘实测值"共 **19 项**，
  并已用"把计数改回旧值"的副本**证伪过**（非零退出 + 指名行号 + 打印该行原文）—— 修完文档后第一次跑就抓住了当时的错数（49 vs 磁盘 48）。
- **仍未证（如实列出，不当作已证）**：真机像素与 `color-mix()` 观感、暗/亮主题下的对比度、"这个蓝是否就是截图里的蓝"
  （只能证**令牌等值**）、UA 是否真支持 `appearance:base-select`、DSH 真实主题令牌取值、SVG `path` 形状、
  `:focus-visible` / `:disabled`、popover 外观、aria/文案域，以及 `probe-18` 竞态断言的统计性质。

## rev-14 · blue session bell（铃铛改成开关同款蓝）

来源：用户截了设置页那张卡片（蓝色的「启用提示音」开关 + 蓝色音量条），原话「把铃铛按钮改成图片中的蓝色」。
追问后确认：**A 实心蓝底 + 白色铃铛**，且**静音时回到灰色**。

- **改法（只动 `lib/client.js` 的 3 个常量 + 2 条 CSS 规则）**：新增
  `BELL_ON_BG = 'var(--dsw-alias-state-business-primary,#2563eb)'`、`BELL_ON_FG = '#fff'`、
  `BELL_ON_BG_HOVER = color-mix(in srgb,<BELL_ON_BG> 86%,#000)`（由前者拼出），CSS 里
  `.dacBell[data-muted="false"]{background:…;color:…;}` + 它自己的 `:hover`。
  **蓝色不是新挑的**：它就是开关 `[data-on="true"]` 的 `background` 与音量条 `accent-color` 用的**同一个令牌字符串**
  （rev-9 起开关与音量条已经共用它）——三处一个值，`BELL_ON_BG` 是唯一来源。
- **为什么必须给「会响」状态单独写 `:hover`**：`.dacBell:hover` 与 `.dacBell[data-muted="false"]` **特异性相同**（都是 0-2-0），
  没有这条的话指针一悬停蓝色就会被通用 hover 灰底顶掉。这条由自测断言钉住（删掉它 → 1 条红）。
- **语义边界（用户选择）**：只有**会响**的会话是蓝底白铃铛；**被静音**的会话保持"透明底 + caption 灰 + 带斜杠"，
  即沿用开关教会的「开=蓝、关=灰」，并且**颜色从来不是唯一信号**（实心/斜杠图形同时在变）。
- **诊断新增**：`sessionIcon.onBackground / onForeground / onBackgroundHover`，与 CSS 同源；自测拿它去和
  开关规则、音量条规则**互相比较**，而不是信任一个字面量。
- **自测（新增 9 条）**：一个"把选择器表里所有同名规则合并成层叠结果"的 `mergedDecls()` 助手（**必须**是合并版，
  见下"反证"里的 m2），断言：铃铛的填充 = 控制台报告的那组值；**该值 === 开关 `[data-on="true"]` 的 background**；
  **也 === 音量条的 accent-color**；前景是 `#fff`；`:hover` 有自己的色；**静音态在整张样式表里没有任何 background**；
  静音态仍是 caption 灰；基类 `.dacBell` 仍是 `transparent`（蓝色只挂在会响状态上）。
- **反证（在 rev-14 冻结字节 `730D1C2F…` 上跑；每次短路后从备份复原并逐字节比对）**：
  | 变异 | 结果 |
  | --- | --- |
  | m1 铃铛换成**另一个**蓝（`#1d4ed8`，铃铛与控制台一起变） | 334/336，2 条红：与开关、与音量条的令牌不一致 |
  | m2 **静音态也被填充** | 335/336，1 条红（"静音态在整表里没有任何 background"） |
  | m3 填充挂到基类 `.dacBell`（丢掉会响/静音之分） | 333/336，3 条红 |
  | m4 填充里**手抄十六进制** `#2563eb` 而不用令牌 | 334/336，2 条红 |
  | m5 删掉会响态自己的 `:hover` 规则 | 335/336，1 条红 |
  | m6 静音态的图标也染成蓝 | 335/336，1 条红 |
  **m2 是一次真实的自测缺陷**：第一版助手只取**第一条**匹配规则，于是"在样式表后面再追加一条同选择器规则"能溜过去；
  改成合并全部同名规则后才抓住（这条也写进了自测注释）。m5 第一版变异**因 CRLF 锚串不匹配而空转**，
  已改为按行删除并**先断言变异体哈希确实变了**再判结果 —— 否则"没抓住"和"没变异"看起来一模一样。
- **锚定字节（rev-14）**：`lib/client.js` **147062 B / sha256 730D1C2F7F58E19471D4B77EE43A221B4FD255BC06AD2AE3752A2C4443466BD5**
  （rev-13 为 144687 B / 7CCE3D62…）；**DSH 侧 `lib/index.js` 零改动** —— 46638 B /
  03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938（与 rev-13 逐字节相同，已实测复核）。
  自测文件：`verify/client-half.test.mjs` 77626 B / D24FA9911315F4544F0F53179215CB8667FE0014212C171BA8F78DC0AF361B9F
  （rev-13 为 74013 B）、`verify/custom-audio.test.mjs` 20263 B / A0071E2E86AF02FF9D78FCFD0A51C2121D13E0322989AD067E753621408E885F
  （仅版本戳一行）。
- **自测计数（rev-14）**：**557 项全绿（124 + 336 + 22 + 75）**，四套 exit 0；client-half 由 327 → 336（净增 9 条）。
- **只改客户端** → **刷新页面即可**；DSH 侧与 rev-13 逐字节相同。
- **未证实（真机判断）**：蓝色在深浅两个主题下的实际观感、白铃铛在蓝底上的对比度（`#fff` on `#2563eb` 约 4.8:1，
  按图形元素标准够用，但最终要不要更亮/更深的蓝只有你能定）、以及"实心蓝块在会话头部会不会太抢眼"。
  改一处即可试：`BELL_ON_BG`（`lib/client.js` 顶部常量）—— 自测会跟着比对三处规则，不会让它们漂移。
- **没有独立验证轮（如实记录，同 rev-8/9/13）**：颜色观感无法在沙箱里独立测量。本轮的独立证据是
  两条**跨规则的一致性**比较（铃铛 vs 开关 vs 音量条）、静音态"整表无 background"的断言、以及上表 6 个变异。
- **文档**：CHANGELOG（本条）、README（§3.2 配色、§5 验收表、§7 `sessionIcon` 三个新字段、§9 H21）、
  `docs/挂载与验收.md`（§7.3 新增 B5/B6）。

## rev-13 · bigger session bell（会话头部图标放大）

来源：用户截了会话头部一小块（44×33 的片段），原话「能不能把图标改大点，这个太小了」。

**成因（不是渲染问题，是当时刻意做小）**：rev-10 的铃铛是 **20px 按钮 + 14px `<svg>`**，而铃铛那条 path 只占
viewBox 的 y 1.7→12.5（16 格里的 ~68%），所以 14px 的 svg 画出来的钟形**只有 ≈9.5px 高**。同一行的参照物：
出厂 header chip 的高度是 **28px**（`dsh-client-ui-jobs` 的 `.trigger{min-height:28px;border-radius:6px;padding:3px 2px}`，
本轮实测引用），聊天动作行的图标是 **15px**（`dsh-client-ui-chat` 的 `.action svg{width:calc(15px + …)}`）。
两者都比我这个大 —— 用户说"太小"是对的。

- **改法（只动 `lib/client.js` 的 5 个常量 + CSS 两行 + 两个 SVG 属性）**：
  `BELL_BOX_PX=28`、`CARET_BOX_PX=16`、`BELL_GLYPH_PX=22`、`CARET_GLYPH_W=11`、`CARET_GLYPH_H=16`；
  按钮尺寸与 `<svg>` 的 `width/height` **都由这些常量拼出来**（一处值，三处引用，不是三处手抄）；
  悬停胶囊圆角随盒子从 6px 调到 8px。**行为、DOM 结构、请求、音频路径、弹层逻辑零改动。**
  净效果：盒子 20 → **28px**（= 出厂 chip 高度）、钟形绘制高度 ≈9.5 → **≈15px（1.57×）**、caret 7×10 → **11×16**。
- **诊断新增**：`__DSH_APPROVAL_CHIME__.sessionIcon === {bellBoxPx:28,caretBoxPx:16,bellGlyphPx:22,caretGlyph:'11x16'}`，
  自测直接读这组值，不再 grep 魔法数字。
- **自测（新增 8 条，`verify/client-half.test.mjs`）**：诊断的**绝对**几何（28/16/22/`11x16`）、
  CSS 里的 `.dacBell{width:28px;height:28px;}` 与 `.dacCaret{width:16px;height:28px;}`、
  渲染树上那个 `<svg>` 的 `width/height` 等于报告的 glyph 尺寸（旧的 14px 已不存在）、
  **`bellGlyphPx >= 20` 且 `> 14 × 1.4`**（"确实放大了一半以上"，打印 1.57x）、caret 的 `11x16` 在树上唯一、以及 8px 圆角。
  其中三条是**绝对值**（28 / 20 / 1.4×），所以"把常量改小、同时让自测跟着变小"这条路走不通。
- **反证（在 rev-13 冻结字节上跑；短路后从备份复原并逐字节比对）**：
  - 把 5 个常量改回 rev-12 的 20/12/14/7/10 → `client-half` **324/327**，3 条红：诊断绝对几何、
    "盒子 = 出厂 chip 的 28px"、"比 14px 大一半以上"。
  - 只把 glyph 改回 15px（"悄悄缩回去"）→ **325/327**，2 条红：诊断几何、放大倍数。
- **锚定字节（rev-13）**：`lib/client.js` **144687 B / sha256 7CCE3D6223825756A216361EBEB9969E86A6D173B8424F363A430825A4794AB3**
  （rev-12 为 142330 B / 777E8796…）；**DSH 侧 `lib/index.js` 零改动** —— 46638 B / sha256
  03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938（与 rev-12 逐字节相同，已实测复核）。
  自测文件：`verify/client-half.test.mjs` 74013 B / 310755C1AE3C24A98291B589019998940CEB9AEF7B6EF0E767EF527B59048E1B
  （rev-12 为 71587 B）、`verify/custom-audio.test.mjs` 20263 B / 94570C3F849D4449CAC65BB24BDBA61EFC1E1AF61742AA02075D4DB9A997FDE3
  （rev-12 为 F8F15505…，**仅版本戳一行**）。
- **自测计数（rev-13）**：**548 项全绿（124 + 327 + 22 + 75）**，四套 exit 0；client-half 由 319 → 327（净增 8 条）。
- **只改客户端** → **刷新页面即可**；DSH 侧与 rev-12 逐字节相同。
- **未证实（真机判断）**：放大后的观感、"够不够大"只有用户的眼睛能判，沙箱渲染不了（README §9 H20）。
  若还要更大/更小：改 `BELL_BOX_PX` 与 `BELL_GLYPH_PX` 两个数字即可，自测的数字从诊断读、会自动跟随
  （但"≥20px / >1.4×"这两条绝对下限是故意的，缩回旧尺寸会报红）。
- **没有独立验证轮（如实记录）**：rev-8/rev-9 的开关外观改动同样没有 —— 这类"看着够不够大"的判据无法在沙箱里独立测量，
  只能由用户在真机上判定。本轮的独立证据是：`lib/index.js` 与 rev-12 逐字节相同（改动确实 client-only）、
  四套 harness 548 条全绿、以及上面两条反证；另外那条"对照出厂 chip 28px"的引用是本轮实测的 DSH CSS 常量。
- **文档**：CHANGELOG（本条）、README（§3.2 尺寸、§5 验收表、§7 新增 `sessionIcon`、§9 新增 H20）、
  `docs/挂载与验收.md`（§7.3 + L1 尺寸）。

## rev-12 · one tone list（两处音色下拉列表统一成同一套样式）

来源：用户两张真机截图 —— 会话头部小铃铛 caret 里的**音色**下拉（`跟随全局 / 风铃 chime / 铃铛 bell / 蜂鸣 beep`）
是浏览器默认的**方角、灰底高亮、无 ✓** 列表；同一个下拉在「设置 → 通知提醒」卡片里早已是圆角、token 配色、
选中行圆角高亮并带 ✓ 的列表。原话：「把屏幕上面的选项卡改成在设置里的一样」。

**成因（不是两个控件，是两套 CSS）**：`::picker(select)` 的自定义渲染块（`appearance:base-select` + 圆角 + 行高 + 高亮）
从 rev-3/rev-5 起只写在 `.dacCard select` 上；会话弹层的 `.dacPop select` 只拿到 `option` 的颜色，
于是它落回 UA 默认渲染。两处本来就是同一个 `<select>` 元素，差的是选择器覆盖范围 —— 这也解释了为什么
"照着设置那张改"只需要改 CSS 的组装方式。

- **改法（只动 `lib/client.js` 的样式组装；行为、DOM、请求、音频路径零改动）**：
  - 抽出三段共享片段 `pickerBox` / `pickerOption` / `pickerHighlight`（都在 `injectStyles()` 里），
    **两处选择器写进同一条规则**：`.dacCard select,.dacPop select{appearance:base-select;}`、
    `.dacCard select::picker(select),.dacPop select::picker(select){…}`、`… option{…}`、`… option:hover,:checked{…}`。
    因此"两个列表长得一样"是**构造上**成立（同一份声明），而不是两处手抄一致 —— 下一次只改一处会立刻被自测抓住（见下"反证"）。
  - **唯一允许的差异是行数上限**：卡片仍是 3 行（84px，rev-5 R5-1 的验收点原样保留）；
    会话弹层是它的默认 4 行（`跟随全局` + 三种音色），`SESSION_TONE_ROWS = TONE_ROWS + 1`，
    上限 `4×28 + 8 = 120px`。多出的 8px 是 `TONE_PICKER_SLACK_PX`：`max-height` 只**夹紧**、不会把短列表撑高，
    而卡片那张列表在"恰好 3 行"时就是可滚动的（浏览器自己的 picker chrome 吃掉几个像素），
    所以给弹层留几个像素，保证默认那 4 行不被裁；8px 仍远小于第 5 行（140px），语义仍是"4 行后滚动"。
  - **列表字号自己声明**：`font-size:13px`（即 `.dacCard` 自己的字号）。会话弹层面板是 12px，
    列表若继承就会比卡片那张小一号 —— 与"改成一样"直接冲突，所以由 `pickerBox` 显式钉住，两张列表共用这一个数字。
  - **明确没改的**：弹层里那个"合上的" `<select>` 控件仍是 12px（沿用面板自己的字号），只有**展开的列表**统一到 13px；
    控件外观本来就是与卡片同类的圆角细边胶囊，用户截图指出的差异全部在展开的列表上。这是取舍，不是遗漏。
- **自测（新增 17 条，`verify/client-half.test.mjs` 的 rev-12 段）**：断言读的是**注入后的整段样式表**（浏览器真正拿到的东西），
  不是源码意图。包括：两个选择器是否在同一条 picker 规则里、两张 picker 的属性表**除 `max-height` 外逐字段相等**
  （`sortedProps(card,'max-height') === sortedProps(pop,'max-height')`）、上限分别是 84px / 120px、
  两处 `font-size` 都是 13px、弹层的 picker 与卡片一样是 `content-box`+圆角+`overflow-y:auto`、
  option 行规则与高亮规则是否同时点名两个列表。所有数字从 `diagnostics.pickerMetrics` 取，不写死。
  其中 2 条是**行为**断言（不是样式）：opt-in 之后浏览器的选项列表是 select 的**真实 DOM 子树**，
  所以在列表上按下对"点外面就关闭"的判定来说属于**内部按下** —— 断言这种按下**不会**关掉弹层
  （否则选音色会在 `change` 到达 select 之前把面板关掉，选择丢失）。这两条在改动前根本不存在，
  因为那时只有 Escape 与"外部按下"被覆盖。
- **两条旧断言的改写（不是删除）**：rev-5 的「`box-sizing:content-box;max-height:84px` 连写」被拆成两条
  （`box-sizing` 进了共享规则，`max-height` 留在卡片自己的上限规则里）—— `verify/client-half.test.mjs` 与
  `verify/custom-audio.test.mjs` 各一条；两条都仍同时要求 content-box **和** 84px，验收点没有被放宽。
- **反证（在最终冻结字节 `777E8796…` 上重跑三次；每次短路后都从备份复原，并与修复版逐字节比对，sha256 一致）**：
  - 把会话弹层从共享规则里摘掉（= rev-12 之前的样子）→ `client-half` **313/319**，6 条红：
    "两个 select 都 opt-in"、"同一条规则"、"弹层的 picker 与卡片一样 content-box+圆角+auto"、
    "除行数外完全相等"、"列表自己钉字号"、"高亮规则点名两个列表"。
  - 把弹层列表单独改回 12px（未来真会发生的回归：有人又把两处拆开）→ **317/319**，
    红的正是"除行数外完全相等"与"列表自己钉字号"两条。
  - 删掉"内部按下就返回"那一行（= 任何按下都当外部按下）→ **318/319**，红的正是新加的那条
    "a press on the tone list counts as INSIDE and leaves the popover open"（这条断言保护的是本轮引入的风险：
    选项列表成了真实 DOM，点它不能被当成点外面）。
  - 另：删掉 `pickerBox` 里那行 `font-size` 会得到**语法错误**（前一行以 `+` 结尾），harness 直接不出结果 ——
    即"悄悄去掉字号"这条路径不存在。
- **锚定字节（rev-12）**：`lib/client.js` **142330 B / sha256 777E87968DE82FE250D69D032785675803097AD7B3EBACBCD7FCB1274F3418ED**
  （rev-11 为 137971 B / 36BDD86B…）；**DSH 侧 `lib/index.js` 零改动** —— 46638 B / sha256
  03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938（与 rev-11 逐字节相同，已实测复核）。
  自测文件：`verify/client-half.test.mjs` 71587 B / 27307E4A63FBB4B12E8D4F1F40DC93FC6827C5C986CF7421A629A2F4712CE258
  （rev-11 为 65661 B）、`verify/custom-audio.test.mjs` 20263 B / F8F15505B8AD8A21D15495CA1700C10D9BFEA789457EB89ADAF22F96B810B61B
  （rev-11 为 19872 B，仅版本戳一行加两行断言改写）；`verify/_harness.mjs`、`verify/host-half.test.mjs`、
  `verify/waterfall.test.mjs` 本轮**逐字节未动**。
- **自测计数（rev-12）**：**540 项全绿（124 + 319 + 22 + 75）**，四套 exit 0；client-half 由 302 → 319（净增 17 条）。
- **本轮只改客户端** → **刷新页面即可**（DSH 侧与 rev-11 逐字节相同；若 DSH 仍停在 rev-9 或更早，才需要按 §7 重启）。
- **未证实（只能真机看）**：弹层展开列表的实际像素（4 行是否真的不出滚动条、第 4 行是否被裁）、
  高亮色在深色主题下的观感、✓ 的具体位置、以及"合上的"控件在 `appearance:base-select` 下的最终外观。
  沙箱从 rev-4 起就没有浏览器引擎。`TONE_PICKER_SLACK_PX = 8` 是本轮唯一靠**估算**的数字，
  但它最多只会换来一条几像素的滚动条，不会藏掉一行（`max-height` 是夹紧而非定高）。
- **独立验证（另一个 agent，独立于实现；canonical run = run 2）**：`verify-independent/probe-19-r12-select-parity.mjs`
  **66/66 全绿** —— 它自己从"真跑一遍 bundle 得到的注入 CSS" + "真实渲染树上取出的两个 `<select>`"出发，
  按 (specificity, 书写顺序) 自己做层叠，再逐属性比对（属性名相同、除 `max-height` 外逐字段相等）；
  三条变异各红一个不同子集（摘掉弹层 9 / 弹层改回 12px 7 / 上限少一行 3），`--mutate=all` 判定 PASS。
  同一 run 里 probe-18 **131/0**、其变异体 **9/9**、两路 1500 轮竞态 **0/1500** 分歧、作者 harness 124/319/22/75 全 exit 0；
  `lib/index.js` 逐字节等于 rev-11 ⇒ **client-only 成立**。**它没有证伪本轮的断言**，但报出三件后续（已交回它修 ——
  那些文件的所有者是它，不是 builder）：
  ① `probe-11-r4-css-rows.mjs` 从 31/31 全绿变成**崩溃**：它的 `pickerRule` 是"`@supports` 内**最后一条**含 `::picker(select)`
  的规则"，rev-12 里那正好是弹层的上限规则 → appearance/box-sizing/overflow/padding/border 全读成 null、
  `max-height` 读成 120px，随后 `probe-11:144` 抛未捕获 `TypeError`。单规则假设正是 rev-12 改掉的东西（设计上过期），
  **但它原本是绿的，所以不能默认容忍**；
  ② `probe-17` 另有 3 条断言硬编码 rev-12 之前的 CSS 形状（同块连写的 `box-sizing:content-box;max-height:84px` ×2、
  以 `.dacCard select option{` 开头的配色规则）→ 91/94；
  ③ `probe-17 --mutate=picker` 的锚串在 rev-12 已不存在 → `String.replace` 空操作、变异变成"死"的
  （探针靠自身那条"变异真的改写了被求值的源"才发现）。
  它**故意没把 ① 放进 run-r12 的豁免表**，那次 run 因此以 `FAILURES: probe-11-r4-css-rows.mjs` 收尾 ——
  是否容忍由物主决定，**本轮的决定是修掉启发式、而不是宣布可容忍**（已交回 verifier 执行，结果见下一条）。
- **探针修复 + 复跑（verifier，第二轮；captain 已亲自复跑核对）**：① `probe-11` 的查找换成"对 `@supports` 内**所有**
  选择器表里点名 `.dacCard select::picker(select)` 的规则做层叠"（共享 box 规则 + 卡片自己的上限规则；参与者选择器精确匹配，
  因而同特异性、书写顺序即全部层叠），算术全程 null-safe（未来再拆分只会打印 FAIL，不再抛异常）；
  顺带修好了**原本被崩溃挡住、够不到的那条** claim 7e 退路配色断言（它也过期了）。
  ② `probe-17` 的 3 条形状断言改为解析"卡片列表"的声明，**主题与期望值一个没变**，其中一条还更严
  （把解析出的卡片 `max-height` 真的与 `3 × 28` 比较，而不是复述常量）；`--mutate=picker` 重锚到 rev-12 里存在的
  卡片上限规则，**变异复活**（142330 → 142241 B，探针自身的"变异真的改写了被求值的源"通过，且只红它声明的那 2 条）。
  ③ 它在修的过程中发现并修好了 **`--mutate=slot` 的两个旧缺陷**（与 rev-12 无关）：锚串含裸 `\n` 而本工作区是 CRLF
  → 变异直接抛"anchor not found"；`once` 每次都在**原始** source 上切片，三次替换只活最后一次（变异体只 +1 B、
  两条声明红的断言不红）。现在 5 个变异都真的改写源码且各自只红声明的检查。
- **复跑结果（run `r12b`，captain 已核对）**：`NESTED_EXIT=0`，**输出里根本没有 `FAILURES:` 行**（summary 走成功分支）；
  `$expectedNonZero` 只剩 `probe-13-r4-browser.mjs`（沙箱无浏览器引擎），`$expectedFailingAssertions` **为空**
  —— 即**没有新增任何豁免**；冻结路径前后逐字节一致，captain 给的 9 条哈希清单**逐条相符**。
  captain 亲自复跑：`probe-11` **32/32**、`probe-17` **94/94**、`probe-18` **131/0**、`probe-19` **66/66**，全部 exit 0。
  计数：`probe-11` 31 → 32 条（2 条改名、期望值不变；1 条新增交叉检查），`probe-17` 仍 94 条（5 条改名），
  harness 仍 540 条（124+319+22+75）。
- **账本问答（verifier 明确回答，供后来者引用）**：rev-12 之前的**每一条事实**现在都仍被断言，且各在**≥2 个独立探针**里
  （`appearance:base-select`、`box-sizing:content-box`、卡片 84px 上限、`overflow-x:hidden`/`overflow-y:auto`、
  行 `line-height:20px` + `padding:4px 9px`、1px 细边 + 4px padding、无显式 height、`84 = 3 × 28` 的行数算术、`TONE_ROWS=3`、
  覆盖卡片的退路配色规则）；而 rev-12 **之前的"形状"**（"box 声明与 max-height 同规则""picker 选择器只点名 `.dacCard`"）
  现在**故意不再被断言** —— 那正是 rev-12 移除的设计，断言它等于断言旧设计；旧形状只留在注释与 git diff 里。
  **没有任何断言被删除或放宽**（probe-11：删除 2 个"同规则"措辞的**名字**、新增 4 个调用，净 31 → 34 个调用；
  probe-17：两个版本的调用数都是 97、单引号断言名都是 95）。
- **流程教训（本轮真实发生过）**：verifier 的 run 1 抓到 `lib/client.js` **142286 B / `375BEA07…`**（应为 142330 B / `777E8796…`），
  归档在 `_raw/r12-run1-CONCURRENT-WRITE-*.txt`。原因就是实现者**在验证进行中仍在写工作区**：那几个瞬时字节是本轮
  反证实验（短路→跑自测→还原）留下的，同一时段 `verify/client-half.test.mjs`、`docs/`、`README`、`CHANGELOG` 也在被重写。
  文件随后回到冻结字节，**run 1 因此不算干净的冻结输入运行**，结论只建立在 run 2 上（前后冻结 diff = identical）。
  教训：**"已冻结"必须先声明、再验证**；开验证前要给 verifier 一份哈希清单并真正停写。本轮的 OBS-3。
- **OBS-2（记账更正，与本次改动无关）**：rev-11 条目里 `verify/_harness.mjs` 24822 B / 18C2055A… 与
  `verify/host-half.test.mjs` 29652 B / E33F9889… 是**从 rev-10 抄下来的旧数字**：t6 那一轮已经改过这两个文件，
  实测现在是 24855 B / DD1D6E81… 与 29685 B / 8AF6315D…（`LastWriteTime` 2026-09-17 01:32，即 t6 的落盘时间）。
  本轮没有动它们。rev-11 条目保持原样作为当时的记录，以本条为准。
- **文档**：CHANGELOG（本条）、README（顶部能力清单加 rev-12、§3.3、§7 诊断新增 `sessionToneRows()`/`pickerMetrics()`、
  §9 新增 H19）、`docs/挂载与验收.md`（版本戳 rev-12 + §7.2 手工看什么）、`docs/rev12-音色列表统一.md`（本轮说明）。

## rev-11 · per-session chime, race fix（修 rev-10 的应答乱序窗口 / F-01）

来源：rev-10 的需求符合性审查 **F-01（medium）** ——「同一会话连点两次、两次应答被反序投递时，本地表会与 DSH 文件相反，
且**直到刷新页面都没有收敛路径**」。审查者实测：`verify-independent/_raw/r10-ind-probe-18-race-evidence.txt:7`（1200 轮 1 例：
本地无记录而文件是 `{enabled:false}` → 铃铛显示"会响"而实际静音），构造式反证 `r10-ind-probe-18-r10-sessions.txt:150`
（I2：迟到应答把已恢复的状态又打回去）。

**机理（为什么"最后一个应答"不够）**：两次点击 = 两个 POST = 两条 socket，应答体被消费的顺序**不保证**等于 DSH `rename`
的落地顺序；而每次应答都**无条件**覆盖本地表（rev-10 的 `writeSessionPatch`），所以本地表的终值取决于"哪个应答先被读完"。
它还会驱动铃铛与该会话的响铃判断，而 `refreshSessions()` 只在挂载时调过一次 → 不一致会持续到刷新页面。
**触发条件**：第二次点击落在"第一次 POST 未落地"的窗口内（审查者量到：本机每会话 POST 往返 median 3.33 ms、p99 6.81 ms；
两次人手点击 ≥40 ms 打不中，能打中的是"主线程长任务阻塞后两个 click 同突发派发"）。
**为什么不用 `revision >` 栅栏**：应答反序时，**新**表反而是骑在**后到**应答里、revision 更大，栅栏会接受旧表、跳过新表
（probe-18 I2 已把这条写进注解）。

- **修法（审查者 requiredFix 的选项②，只动 `lib/client.js` 的写入路径）**：新增 `sessionWrites.outstanding` 计数 ——
  每次写入 +1；每个应答落定后在 `settleSessionWrites()` 里 −1；**当计数归零（整张表再没有在飞的写入）时，
  重新 `refreshSessions()` 读一次 DSH 文件**，让本地表最终等于 DSH 文件。计数器属于整张表而不是单个 sessionId：
  「最后一个应答不是最后一个写入」这件事跨会话同样会破坏同一张表。
  写入返回的 promise 在"它是最后一个在飞写入"时会等到这次重读完成，所以 `await` 写完即已收敛。
- **拒绝路径不丢信息（选项②与"失败回滚+错误行"必须同时成立）**：写入被 DSH 拒绝时仍然回滚到点击前的副本、
  仍然把原因放进 `sessions.error`（popover 的错误行），而这次重读**只重读表、不覆盖该次写入的结论** ——
  重读成功后把 `sessions.error` 恢复成那次写入的原因（`settleSessionWrites(preservedError)`）。
- **一次点击只多一次 GET**：计数归零才重读，所以连点两次只重读一次（自测断言 `reads === 挂载 1 + 重读 1`）。
- **自测（新增 20 条，`verify/client-half.test.mjs` §5i）**：一个"应答可被扣住、由测试决定投递顺序"的存储桩 ——
  同一会话连点两次（`{enabled:false}` → `{enabled:null}`），**先放第二个应答、再放第一个**，然后断言：
  迟到的旧应答**不能**在本地表里留下记录、铃铛仍跟随全局、本地表与桩里的存储**逐字段相等**、
  只重读一次、无在飞写入、无错误行；另测"单次点击仍收敛"；另测"被拒写入仍解析为 `false` 且错误行不被重读抹掉"。
  **这条自测在修复前的字节上会报红**（实测：临时短路重读逻辑后 5 条断言失败，其中
  `the stale answer cannot leave a record behind` 正是 F-01 的现象；短路已还原，sha256 与修复版逐字节一致）。
- **复核（真实 HTTP，1500 轮/路，本轮实跑）**：
  - `node verify-independent/probe-18-r10-sessions.mjs --race-rounds=1500 --race-raw`
    → `I1 measurement (raw passthrough fetch, 1500 rounds): client-vs-store disagreements = 0/1500`；
    `I1b.one-POST-per-click` 绿（每轮仍是 `[mute, clear]`）。
  - `node verify-independent/probe-18-r10-sessions.mjs --race-rounds=1500 --race-sidechannel`
    → `I1 measurement (clone side channel, 1500 rounds): client-vs-store disagreements = 0/1500`。
  - 修前的同一测量：raw 1200 轮 1 例（`_raw/r10-ind-probe-18-race-evidence.txt:7`）、sidechannel 1500 轮 1 例。
  - 两路各有 **2 条 FAIL，都是"期望值过期"而非产品回归**，且都落在 t2 的探针里（builder 不改）：
    ① `I2.the-late-answer-wins-locally`（`probe-18-r10-sessions.mjs:1510`）—— 旧期望
    `midway === true && final === false` 编码的正是修复前的缺陷；修复后实测是 `midway=true, final=true`
    （迟到应答不再回退，且与桩里的空存储一致），即验收要求的「I2 改成"迟到应答不再回退"」。
    注意 `MUTATIONS` 里 `mute-ignored` 的 `expect` 列了这条 check id（`:649`），改名时需同步。
    ② `H6.stats-and-revision`（`probe-18-r10-sessions.mjs:1557`）—— 硬编码 `labels.includes('rev-10')` → 需改 `'rev-11'`。
    两路其余 **128 条断言全绿**（`assertions passed=128 failed=2`，总条数与修前 130 一致）。
- **锚定字节（rev-11）**：`lib/client.js` **137971 B / sha256 36BDD86B4D09A96492FCD6819913A50117E17EB6017F07914E98955A02D6E9CB**
  （rev-10 为 133812 B / 2078125F…）；**DSH 侧 `lib/index.js` 零改动** —— 46638 B / sha256
  03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938（与 rev-10 逐字节相同，已实测复核）。
  自测文件：`verify/client-half.test.mjs` 65661 B / 4FDA92CD5AF9A3F1526F8F02FF7AC435D23216429701D279E7E893C70D30068E
  （rev-10 为 58941 B / 818C9216…）、`verify/custom-audio.test.mjs` 19872 B / 8BE5C5EE…（仅版本戳一行）、
  `verify/_harness.mjs` 24822 B / 18C2055A…、`verify/host-half.test.mjs` 29652 B / E33F9889…、
  `verify/waterfall.test.mjs` 8888 B / 010811A5…（三者本轮未动）。
- **自测计数（rev-11）**：**522 项全绿（124 + 302 + 22 + 74）**，四套 exit 0；client-half 由 282 → 302（新增 20 条，见上）。
- **不做的事（边界）**：`verify-independent/**` 是 t2 的产物、不在 builder 的冻结范围（captain 明确划出），
  所以 **I2 的期望值与 H6 的版本戳都由 verifier 更新**，本轮只在文档登记（见上「复核」段）。
  审查者 F-02（`kit/rev4.mjs:254` 把挂载期那次 sessions 读取摘出 `calls` 后，`probe-10` 五处与 `probe-16:170`
  的「没有任何请求」字面失真）同样是 verifier 领地，**本轮未改那些文件**，登记在此备办。
- **未证实**：真机上"长任务阻塞后两个 click 同突发派发"的可达性仍无浏览器可测（审查者的上界：间隔 ≥5 ms 全部 0/400）。
  本轮修的是**不一致的收敛性**：无论应答以什么顺序到达、DSH 的两次 `rename` 以什么顺序落地，本地表都会重读成文件的样子。
  README §9 H17 已按新行为改写。
- **文档**：CHANGELOG（本条 + rev-10 条目加"已知缺陷 → rev-11 修复"）、README（版本戳 rev-11、§3.2、§7 诊断新增
  `sessionWrites()`、§9 H17）、`docs/挂载与验收.md`（版本戳 rev-11、§10 的历史哈希标注为 rev-4 时点）。
- **OBS-1 更正（审查者指出）**：rev-10 条目里"仅 5 处期望值更新"**不准确**：按 `git diff -U0 -- verify/` 逐行核对，
  被改写的**断言行是 7 条**（2 条 rev 戳 + 1 条"等待的槽列表" + 4 条"数全部注册"改成按 `settings.section` 过滤，
  其中 4 条收得更紧），另有 4 行非断言改动（`fire(type, extra)` 形参、2 个常量、import 增补）。该行已按实测数字改写。

## rev-10 · per-session chime（按会话独立：小铃铛 + 覆盖 + 各响各的）

> ⚠️ **已知缺陷 → rev-11 修复**：同一会话连点两次、两次应答被反序投递时，本地表会与 DSH 文件相反且**没有收敛路径**
> （审查者 F-01，medium；实测证据见 rev-11 条目）。本条目保留为当时的记录 —— 下面的"写入=乐观更新、失败回滚"
> 描述的就是 rev-10 的写入路径，rev-11 在其后补了"最后一个在飞写入落定 → 重读一次 DSH 文件"。

需求（用户）：「② 每个会话可以单独设置提示音开关/音色/音量；③ 同时多个会话待审批时，每个会话各自响，
不要合并成一声」。选定的语义是 **①A**：会话覆盖只可能比全局**更安静**，不做「全局关时给单个会话强制打开」；
覆盖存**插件自己的文件**（不进设置文档、不进浏览器存储）。

- **会话头部小铃铛**（`lib/client.js`）：`ctx.slots.inject('conversation.session.header.actions')` +
  `register({name, id:'approval-chime', order:30, locale:NS})`。该槽是 `list`/`scope:'session'`
  （`dsh-cordis-client-runner/lib/client.js:3102-3157`），官方占用者实测 order = `agent-preset` -10
  （`dsh-client-ui-agent-preset/lib/client.js:264-270`）、`schedule-catalog` 10（`dsh-client-ui-schedule/lib/client.js:293-298`）、
  `job-list` 20（`dsh-client-ui-jobs/lib/client.js:266-271`），因此 **30** 既有空位、又不顶替任何人（id 自用）。
  组件只读 `props.sessionId`（官方占用者同样如此：`dsh-client-ui-jobs/lib/client.js:117`）。
- **两态图标 + 双语提示**：内联 SVG —— 开=实心铃铛（2 条 path），关=同一铃铛 + 一条斜杠（`.dacSlash`）；
  `title` 与 `aria-label` 取同一串**同时含中英**的文案（`本会话审批提示音：开 · Approval chime for this session: on`），
  刻意不走 `props.t`（那只给一种语言）。点击=切换：会响 → 写 `enabled:false`；被静音 → 写 `enabled:null`（清除覆盖、回跟随全局）。
- **caret popover（自绘，只有 react）**：音色（跟随全局 / 导入的音色 / 风铃 / 铃铛 / 蜂鸣）、
  音量（「跟随全局音量」勾选=清除覆盖，取消后 0..100 滑杆即该会话音量）、**恢复跟随全局**；
  `position:fixed` + `getBoundingClientRect` 自定位（视口底部向上翻、水平收进视口）、外部 `pointerdown` 与 `Escape` 关闭；
  写入**乐观更新**，DSH 拒绝则回滚并把错误行显示在 popover 里。（平台自带的 `useDismissOnOutsidePointer` 在
  `dsh-client-ui-primitives`，不在可 require 的种子里，故自行实现。）
- **有效值**：`enabled/volume/tone = 会话覆盖 ?? 全局`（逐字段）。全局关 → 所有**未覆盖**会话静默；
  会话覆盖的 `custom:<uuid>` 若已不在名册里 → **回退全局音色**（并在 popover 说明），不报错、不静音。
- **各响各的**：同一批快照里 N 个可响会话各响一次，按快照顺序、相邻 **180 ms**（`BATCH_GAP_MS`；
  旧实现是「一批只响一声」）。被本会话静音的**不响**并计入新计数 `suppressedSession`
  （全局关导致的静默仍计 `suppressedDisabled`），设置页抑制行新增「因本会话提示音关闭而静音 ×N」。
- **存储（DSH 侧）**：`$DSH_HOME|~/.dsh` 下 `approval-chime/sessions.json`，形状
  `{version:1, sessions:{<sessionId>:{enabled?,volume?,tone?,updatedAt}}}`；目录递归创建；
  **原子写**=同目录临时文件（`.sessions.<pid>.<uuid>.tmp`）+ `rename()`（失败清理临时文件并回 500）；
  上限 **200** 条、按 `updatedAt` 淘汰最旧；空覆盖不落盘；缺失/损坏/非对象 → **空表 + 告警**，绝不抛错。
  home 规则按 DSH `@deepseek-ai/dsh-home-paths/lib/index.js:73-76` 重写（`$DSH_HOME` **去空白后非空**优先，否则 `homedir()/.dsh`；
  纯空白视为未设置）——**不 import 该包**（`link:` 插件解析不到裸模块，§B.6 的历史教训）。
- **两个 HTTP 端点（同一条 prefix 路由，两个方法）**：`GET /api/approval-chime/sessions` →
  `{ok:true, revision:<n>, sessions:{…}}`；`POST`（体 `{sessionId, patch}`）→ 应用后回**同样结构**。
  非法 `sessionId`（空/非字符串/超长 >200）、非法 `volume`（非 0..100 **整数**）、非法 `tone`（非 `chime|bell|beep|custom:<小写 uuid>`）、
  未知 patch 字段 → **400 且不落盘**（先校验后写）；`/sessions/...` 下未知路径 **404**、其它方法 **405**、超大请求体 **413**。
  沿用 `registerAudioRoutes` 的姿势：`webServer` 只可选注入，没有它就只是不注册路由（
  **为什么不能注册成两条同路径路由**：`dsh-host-webserver/lib/index.js:176-183` 用 `(kind, path)` 做键，重复即抛）。
- **零浏览器存储**：`localStorage`/`sessionStorage`/`indexedDB`/`caches.` 在 bundle 里一个都不出现（新增断言）。
- **零回退**：设置页（开关/音量/音色/导入/试听/恢复默认/413/上限 50/空白名回退/`::picker(select)` 三行可视）
  与音频路由、审批面板行为**逐项未动**（四套 harness 的既有断言一条未删；按新事实改写的**断言行 7 条**：
  2 条 rev 戳、1 条「等待的槽列表」、4 条「数全部注册」改成按 `settings.section` 过滤——其中 4 条收得更紧，
  另有 4 行非断言改动：`fire(type, extra)` 形参、2 个常量、import 增补。数字已按 `git diff -U0 -- verify/` 逐行核对，
  rev-11 条目里的 OBS-1 记录了这次更正）。
- **诊断面**：`window.__DSH_APPROVAL_CHIME__` 新增 `sessionSlot`/`sessionAction`/`batchGapMs`/`sessions()`/`sessionSettings(id)`/
  `toggleSession(id)`/`refreshSessions()`，**既有键一个未删**（新增断言逐键核对）；`REVISION` = `rev-10 · per-session chime`。
- **自测**：**56 → 124**（DSH 侧：路径规则/空表/合并与 null 清除/12 种非法补丁 400 且文件字节不变/413/404/405/HEAD/
  上限淘汰 205→200/5 种损坏形状退化/损坏后写入修复/原子写与失败清理）、**155 → 282**（浏览器侧：槽注册形态与 id/order、
  铃铛两态 SVG 与中英提示、点击 POST 请求体、popover 内容与自定位翻转、Escape/外部点击关闭、拒绝写入回滚+错误行、
  有效值真值表 × 全局开与关、缺失 custom 回退、4 条 pending(1 静音)→3 响且 ≥180 ms 间隔、逐会话音量与顺序、
  `suppressedSession` 与设置页抑制行、诊断键核对、零浏览器存储）、**20 → 22**（瀑布零注册 + 两项槽计数）、**74**（不变，
  仅版本戳与槽查找跟进）。**合计 502 项全绿，4 套 exit 0。**
- 锚定字节：`lib/index.js` **46638 B / sha256 03778391E15163487BC0F26082A73CBA15FAAF44CDC2CF93B0C185D75FB0B938**
  （rev-9 为 27592 B / 75188B4C…）、`lib/client.js` **133812 B / sha256 2078125FCADDDC3AF9CEADE6585A321BF65B79B91E64DB4D244133832FD7CBB4**
  （rev-9 为 84171 B / 5051558C…）；自测文件：`verify/_harness.mjs` 24822 B / 18C2055A…、
  `verify/host-half.test.mjs` 29652 B / E33F9889…、`verify/client-half.test.mjs` 58941 B / 818C9216…、
  `verify/waterfall.test.mjs` 8888 B / 010811A5…、`verify/custom-audio.test.mjs` 19872 B / D4FF3077…。
- **文档**：README（§3.2 新行为/存储路径/上限/有效值/端点/语义、§4 计数与覆盖面、§5 新验收信号、§6 触发改为逐会话、
  §7 诊断接口、§8 自绘 popover、§9 新增 H14-H18）；`docs/契约调研.md` 新增 **§L**（会话头部槽 + 待审批表以 sessionId 为键 +
  home 规则 + 覆盖文件自身的约束，全部带 DSH `文件:行号`）；`docs/挂载与验收.md` 新增 **§7.1**（9 步手工验收：
  铃铛两态、静音一个会话、两个会话各响各的、每会话音色覆盖、存储位置、恢复跟随全局、零回退）。
- ⚠️ **rev-10 改了两半**：新路由与新文件都在 `lib/index.js`，**必须重启 `dsh web`** 再刷新页面；
  只刷新会出现「铃铛在、写入报错」（客户端半对上了旧 DSH 侧，404）。
- **未证实（照旧不写成通过）**：真机上的点击/悬浮观感与 popover 实际定位、`order:30` 的视觉落点
  （本机 profile 未装 `agent-team`，其 order 无法实测）、真实浏览器里 `position:fixed` 是否被带 `transform` 的祖先裁剪、
  同会话连续两次点击的应答乱序窗口（记录为 H17，未加请求序号）。这些都在沙箱里无法实测。

## rev-9 · slim switch（真机反馈：开关太胖 + 开启色改用音量条的蓝）

需求（用户，看过 rev-8 的真机画面）：「开关打开颜色改成跟音量进度调的颜色一样。开关太胖了你直接
照着苹果系统的开关弄就行了」。

- **改瘦**：轨道 51×31 → **38×22**，滑块 27px → **16px**（`top/left:2px`，行程
  `translateX(16px)`）。这就是苹果 macOS 开关的几何，也正好是 dsh-market 自己那排开关用的
  （`38×22` / 16px 钮 / 2px 内缩，`dshmarket/src/client/Market.module.css:622-626`）。
  rev-8 照的是 iOS 的 51×31 —— 放在 13px 的行里又高又壮，**只有真机才看得出来**，故本版按反馈收窄。
- **开启色统一**：`--dsw-alias-state-success-primary`（绿）→
  **`--dsw-alias-state-business-primary,#2563eb`**，与音量滑杆的 `accent-color` 是**同一个令牌**，
  所以「开」和进度条**构造上**同色，而不是两处各写一个值碰巧一样；测试直接断言两条规则里出现同一令牌。
- **关闭态更有形**：加 1px `--dsw-alias-border-l2` 描边 + `--dsw-alias-bg-layer-2` 底（沿用 dsh-market
  的做法），深色主题下关闭态也有清晰轮廓（原先只是一块半透明灰）。
- 动效由 `cubic-bezier(.4,0,.2,1) .22s` 换成 `.18s ease`（与 dsh-market 的 `.15s ease` 同量级）；
  `prefers-reduced-motion` 仍关闭过渡；焦点环改用同一蓝令牌的 35% 混色。
- **语义仍未动**：原生 `<input type=checkbox>` + `role="switch"` + `aria-checked` + clip（非 display:none），
  Tab 可聚焦、空格可切换、不可写时 50% 不透明。
- **自测**：`client-half` 154 → **155** 条（几何断言改为 38×22 / 16px 钮 / 16px 行程，并新增一条
  「开关与滑杆同令牌」的断言）；`custom-audio` 的版本戳跟进。现为 **56 + 155 + 20 + 74 = 305 项全绿**。
- 锚定字节：`lib/client.js` **84171 B / sha256 5051558C49168133DA24FB479742BE074DB6F5640F0F56344FD7F5FAC6596597**；
  DSH 侧未动（27592 B / 75188B4C…）；`verify/client-half.test.mjs` 30447 B / EE668935…、
  `verify/custom-audio.test.mjs` 19397 B / A8EEB61F…。
- **未证实（照旧不写成通过）**：真机观感仍待用户重启 `dsh web` + 硬刷新后确认（沙箱无浏览器引擎）。
  38×22 与 16px 钮取自苹果 macOS 开关，且与 dsh-market 的既有开关同尺寸 —— 两个独立来源一致。

## rev-8 · ios switch（「启用提示音」换成苹果式拨动开关）

> ⚠️ **已被 rev-9 取代**：几何（51×31/iOS → 38×22/苹果 macOS）与开启色（绿 → 音量条同款蓝）都改了。
> 本节保留为当时的记录 —— rev-8 的 51×31 只在真机上才暴露出「太胖」。

需求（用户，附参考图）：「把启动提示音开关弄成图片一样，图片是苹果的开关按钮」。

- **画法**：新增 `.dacToggle` / `.dacSwitch` / `.dacKnob` 三条规则 —— 轨道 51×31、圆角 999px，
  关闭态 `rgba(120,120,128,.32)`（iOS 的灰），开启态
  `var(--dsw-alias-state-success-primary,#34c759)`（DSH 成功色，回退 iOS 绿）；滑块 27px 白色圆、
  `top/left:2px` + 双层投影，开启时 `translateX(20px)`（51 − 27 − 2×2 = 20，几何自洽），
  过渡 `0.22s cubic-bezier(.4,0,.2,1)`。
- **语义一个都没丢**：真正的控件仍是原生 `<input type="checkbox">`，另加 `role="switch"` 与
  `aria-checked`；它被 `clip:rect(0 0 0 0)` **裁掉而不是 `display:none`** —— 所以 Tab 仍能聚焦、
  空格仍能切换、`:focus-visible` 仍给出 3px 焦点环，禁用态经 `data-disabled` 降到 50% 不透明。
  状态由 `data-on` / `data-disabled` 投到被绘制的 span 上（CSS 读不到 React 的 `checked` prop）。
- `prefers-reduced-motion: reduce` 下关闭过渡（DSH 自己的样式也是这么做的）。
- **自测**：`client-half` 由 143 → **154** 条（新增：input 报 `role=switch`、`aria-checked`、
  恰好一条轨道与恰好一个滑块、`data-on` 开/关两态、轨道 `aria-hidden`、可写时 `data-disabled=false`、
  CSS 几何四条、clip 而非 display:none、reduced-motion）；`custom-audio` 的版本戳断言跟进。
  现为 **56 + 154 + 20 + 74 = 304 项全绿**（4 套 exit 0）。
- 锚定字节：`lib/client.js` **83567 B / sha256 1D78FDEC0D201C2B404801C2A580DEC1366ADB79E1A49AA13C70217797D9A4D7**；
  DSH 侧未动（27592 B / 75188B4C…）；`verify/client-half.test.mjs` 30233 B / 5C2E442D…、
  `verify/custom-audio.test.mjs` 19397 B / B037DFCF…。
- **未证实（照旧不写成通过）**：真实浏览器里的观感 —— 开关的像素、过渡是否顺滑、深色主题下的对比
  与焦点环 —— 本沙箱内无法证实（无浏览器引擎，Edge 启动即 `FATAL:mojo platform_channel 0x5`）。
  尺寸与配色取自 iOS 规范值、几何由算术保证；真机仍需用户重启 `dsh web` + 硬刷新后确认。

## rev-7 · notifications section（设置入口从「插件」迁到「通知提醒」）

需求：把提示音插件的设置从「设置 → 插件 → 插件配置」迁出，改成独立的「设置 → 通知提醒」分区；
功能一项不丢，四套回归全绿。

- **注册槽换掉**：客户端半不再注册插件页那张卡片，改为
  `ctx.slots.inject('settings.section', …)` +
  `register({name:'settings.section', id:'approval-chime', order:16, label:<thunk>, locale:'approval-chime'})`。
  那张卡片原先由 `dsh-client-ui-settings-plugins` 的「插件配置」标签页按「DSH 命名空间 × 卡片 key」派发
  （`lib/client.js:1140-1152`），不再注册即干净消失——**DSH 侧 `lib/index.js` 一个字节都没改**，
  它只负责注册设置命名空间，与入口位置无关。
- **新分区页**：`<section>` 容器（`max-width:720px` + `flex-direction:column` + `gap:12px`，照抄 DSH
  `.section` 规则）→ 唯一一个 `<h2>`「通知提醒」+ 右上角 bundleRevision 徽标 → 一行 intro
  （旧的页级标题「审批提示音」不再出现，避免两个互相竞争的大标题）→ 原封不动的控件面板：
  启用勾选、音量滑杆 0..100、音色下拉（导入项在前）、导入按钮 + 隐藏 file input + 选中自定义音色时的「移除」、
  试听、恢复默认、抑制原因行、只读/已覆盖徽标、错误行、统计行。标题 16px/500/24、intro 14px/22 +
  `--dsw-alias-label-tertiary`，对齐 DSH `dsh-client-ui-settings-models` 的 `.title/.intro`
  （`lib/client.js:58` 的 `.zGbnIq_*` 规则）。
- **导航文案**：字典新增 `nav`（zh 通知提醒 / en Notifications）并与 `title` 同文；`label` 是
  **thunk**（每次投影重读，`dsh-cordis-client-runner/lib/client.js:3894`），内部解析
  `ctx.locale.bind(NS)` 返回的翻译器（`dsh-client-locale/lib/client.js:1283-1304`），因此切换语言后
  导航行立即跟随——测试断言 zh→en→zh。id `approval-chime` 为自用 id，不会顶替
  general/models/plugins/agent-presets 任何一行；order 16 紧跟「插件」15、在「Agent 预设」20 之前。
- **此前修好的缺陷原样保留**（未触碰）：`::picker(select)` 的 `box-sizing:content-box;max-height:84px`
  （= 3×28px 行高，第 4 项起滚动）、`border-radius:10px`、导入上限 50、空白名回退 id、
  超限 413 先读干再应答。断言仍覆盖这些常量（client-half 断言 CSS 两条；custom-audio 断言 84px/50/413/空白名）。
- **自测**：`client-half` 由 103 → **143** 条（新增设置注册形态/id/order/label thunk + 语言切换、
  「从未注册或提及插件页槽」、唯一 `<h2>` 与导航文案一致、intro、条件行（只读徽标/错误行/抑制原因行）、
  分区排版 CSS、rev-7 戳），旧的插件页槽断言全部替换；`custom-audio` 由 70 → **74** 条
  （修订戳与槽断言更新，新增唯一 `<h2>` 与「已覆盖」徽标）。现为 **56 + 143 + 20 + 74 = 293 项全绿**（4 套 exit 0）。
- 锚定字节：`lib/client.js` **80889 B / sha256 6B9C38CE738859C4D0007EE027B994353242D4C8C974B1E39A420CF48D54F5D1**
  （DSH 侧未改，仍 27592 B / 75188B4C…）。
- 文档：README §3 入口路径改为 设置 → 通知提醒、§4 计数/描述与 §7 自证接口同步；
  `docs/挂载与验收.md` §7 导航路径更新；`docs/契约调研.md` 新增 §K（`settings.section` 合同，带 DSH `文件:行号`）。
- **本机验收（交给 t5/用户执行；本轮未执行、未证实）**：需重启 `dsh web`（bundle 字节在启动时读入内存）→
  刷新页面 → **应**在设置面板左侧看到独立一行「通知提醒」（在「插件」之后）、进入后是分区页；
  **应**在插件页看不到本插件。**这一步本轮没有做**：真实 `dsh web` 端到端与浏览器渲染在本沙箱内未证实
  （沙箱无浏览器引擎、不允许起/替换 Web 服务器）；未证实清单见 `docs/rev7-独立验证.md` §8（5 项）与
  `docs/rev7-需求符合性审查.md` §10。请勿把本条读作已完成的真机验收（与 rev-1 条目里确实执行过的
  「真机验收」不同）。
- **未证实项（rev-7 新增）**：`settings.section` 未被官方文档写明为「第三方扩展点」（它是 DSH 设置外壳
  自己声明的槽，契约依据见 `docs/契约调研.md` §K）；真实浏览器里导航行的插入位置与图标未实测
  （未知 id 由 DSH 回退到齿轮图标，`dsh-client-ui-settings-general/lib/client.js:76-93`）。
  注册整体包在 try/catch 里：失败只丢导航行，不影响提示音。

### rev-7 · 文档修复（t4 repair-round-2：代码字节未动）

来源：`docs/rev7-需求符合性审查.md`（t3，verdict=needs_revision）的 DOC-R7-1/2/3 与观察项 OBS-R7-1。

- **DOC-R7-1（medium，已修）**：`docs/契约调研.md` 里仍把旧入口写成现行做法的两处已改写——
  §J「给下游的一页摘要」第 4 条改为 `settings.section` 注册形态
  （`{name:'settings.section', id:'approval-chime', order:16, label:<thunk>, locale:NS}`，指向 §K.2）；
  §E.3 挂载步骤第 5 步的验收信号改为「设置导航出现独立一行『通知提醒』；设置 → 插件 → 插件配置里不再出现本插件」。
  §K 的取代横幅**扩写到覆盖 §C / §E.3 / §G.3 / §J**，并声明 `docs/rev4-*`、`docs/rev5-*`、`docs/rev6-*`、`docs/验证报告.md`
  同属历史轮次记录（描述当时形态）；§G.3 的标题与代码块上方标注「**历史骨架：入口形态以 §K 为准**」。
- **DOC-R7-2（low，已修）**：本条目上方的「本机验收」已改写为「**交给 t5/用户执行；本轮未执行、未证实**」口径，
  并指向 `docs/rev7-独立验证.md` §8 的 5 项未证实清单（真实浏览器渲染 / 导航行外观 / 真实 `dsh web` 端到端 /
  真实文件对话框 / 真实音频输出）。
- **DOC-R7-3（low，已修）**：`docs/验证报告.md` 头部加 rev-7 横幅（入口路径已迁移 → `docs/契约调研.md` §K、
  `README.md` §3），其 §8 的人工清单标注为 **rev-1 形态**（第 1 项同时给出 rev-7 的等价步骤）。
- **OBS-R7-1（low，引用修正）**：agent-presets 的 `order: 20` 引用改为
  `dsh-client-ui-agent-preset/lib/client.js:1520-1522`（`docs/契约调研.md` §K.1 已改；occupants 清单
  `dsh-cordis-client-runner/lib/client.js:3911-3916` 保留为 **id 的第二来源**，因为它不含 order）。
  `lib/client.js:58` 与 `:1768` 携带**同一处**过期指针，但该文件是已验证并冻结的字节锚
  （t2 的独立验证 §1 与 t3 的审查都锚在这份 sha256 上），**按 captain 边界本轮有意不改**——
  取舍与正确引用已显式记在 `docs/契约调研.md` §K.1 表下方（「一处『有意不改』的过期指针」）。
- **本轮未动代码**：`lib/**`、`verify/**`、`verify-independent/**`、`README.md` 的 sha256 与 t2 收工基线
  `verify-independent/_raw/r7-baseline-after.txt` 逐行一致（本轮只改文档：本文 + `docs/契约调研.md` + `docs/验证报告.md`），
  因此上面的锚定字节 `lib/client.js 80889 B / 6B9C38CE…` 仍然有效（已与磁盘实测复核）。
- 四套 harness 只作回归复核（不承担验证职责）：56/143/20/74，四条 exit 0。

### rev-7 · 市场简介（package.json / README 文案；运行时代码零改动）

需求（用户）：「插件市场 → 已安装」里 `deepseek-harness-background` 那一行显示了一段作者简介，
而 `dsh-approval-chime` 那一行的灰色文字只有 `link:D:/…` 源路径 —— 给本插件也写一段详细介绍。

- 那段灰色文字是**依赖 spec**（`dshmarket:src/client/MarketSection.tsx:4606-4653`）：`link:` / `file:` /
  `github:` 这类 spec 是这一行**唯一**说明「插件从哪来」的地方，市场明确选择保留；只有 `version` 存在
  且 spec 是纯版本区间时才隐藏（`specRedundant`，`:4611`）。所以那行路径**不是**能替换成介绍文字的位置。
- 介绍文字在 spec 下方**独立一行**，来源只有两个（`:4681-4708`）：精选目录条目的 `description`
  （`:4683`，`entry?.description[lang] || entry.description.en`）或**用户自己的备注**
  （`notes[name]`，≤200 字符，`MAX_NOTE` 见 `dshmarket:src/hot.ts:308`，存 `<profile>/.dsh-market/state.json`）。
  本插件是本地 `link:` 安装、未上架精选目录（收录走 awesome-dsh-plugin 的 PR，见该插件 `README.zh.md:81`），
  目录里查不到它 ⇒ 该位置为空。**这不是我们的 bug，是市场的设计。**
- 本次落地：把详细介绍写进**两处我们自己的权威位置** —— `package.json` 的 `description`（169 字符，
  写在备注 200 字符上限之内，可原样粘贴）与 `README.md` 首段（同一文案）。想在市场卡片上看到它，
  点那颗「添加备注」把同一段贴进去即可 —— 备注位就是那个介绍位。
- 锚定字节：`lib/client.js` 80889 B / 6B9C38CE…（**未动**）、`lib/index.js` 27592 B / 75188B4C…（**未动**）；
  `package.json` 973 B / D483E65F094EC41299DD03894A840146FB9ADB4D42E3B55BB0B955A409097B4D、
  `README.md` 22131 B / A82F40CBA2C31252F6B49EFA3644AB49123FEF8F736D0F3BA2AC8613D508C7DD。
  README 因此在 t2 基线 `r7-baseline-after.txt` 之上有差异 —— **已验代码字节不受影响**（那条基线锚的是 `lib/**`）。
- 四套 harness 复跑 56/143/20/74，四条 exit 0（`package.json` 只改 `description`，`host-half` 的包结构断言不涉及该字段）。
- 说明性取舍：`description` 由英文改为中文（对齐参照插件的做法）；若将来上架 npm 需要英文元数据再补。

## rev-6 · case-closed ids（N3 收尾 + 文档校订）

来源：`docs/rev5-复验.md`（t3 复验）的 N3/R-RESID 与 `docs/rev5-需求复审.md`（t4 复审，verdict=pass）的 DOC-1。

- **N3（low，端到端可达）**：rev-4 的 D2 只修好了 `tone` 一侧 —— `custom[].id` 仍是裸字符串、
  浏览器侧的 `CUSTOM_ID` 仍带 `/i`，而路由是大小写敏感的 ⇒ 手改设置文档塞入大写 id 会得到一个
  **"能选、但试听必然 404"的死选项**。现在两侧一致收紧为小写 uuid（schema `custom[].id` 加 pattern、
  浏览器侧去掉 `/i`），大写 id 既不可存也不可渲染。
- **R-RESID（low）**：纯空白的显示名会被 trim 成空 → 回落到 id，不再渲染成一行"看起来空"的选项。
- **DOC-1（文档）**：`docs/rev4-独立验证.md` 追加 §8 校订，更正该报告 §5 U1 里"`::picker` 保持
  content-box、92px 正好 3 行"的推断（UA 实际给的是 border-box），并记录 rev-5 的修法与 rev-6 的收尾。
- 自测：`host-half` 新增两条正向断言（拒绝非小写 uuid 的 roster id）后为 **56/56**，其余不变
  （103/20/70），合计 **249 项全绿**。
- **残余 low（记录在案、不阻塞）**：
  - N1 未超上限的停滞上传没有插件级时间上界 —— 载体（Node http）默认 300 s 有界，加插件定时器反而会
    引入"慢但合法的上传被拒"的新失败模式；本地单人 GUI 下选择不加，若将来把 GUI 暴露到本机之外需重新评估。
  - N2 流式超过约 2× 上限会被 RST 而非 413 —— `refuseOversized` 注释里声明的宽限取舍；插件自身 UI 走不到
    （客户端先做体积预检）。
  - O4 弹层外框在 content-box 后为 94px，若 UA 以内容盒锚定宽度可能比选择框宽约 10px —— **未证实**，
    需要真实浏览器；真人验收时留意（若明显偏宽，改成 `border-box` + `94px` 即可，不影响判定）。

**验证状态（t5，独立窄复核，attempt 2）**：N3 ①②③④ 与 R-RESID **全部 PASS，未发现新缺陷**；
全量回归 4 套 harness 56/103/20/70 全绿 + 该成员 474 项探针断言 + reviewer 78 项，全部通过。
报告 `docs/rev6-复验.md`，一键复跑 `verify-independent/run-r6.ps1`。
锚定字节：`lib/client.js` 72730 B / sha256 5A925E1E…、`lib/index.js` 27592 B / 75188B4C…。

- **O-1（测试卫生，已修）**：`verify/custom-audio.test.mjs` 原先的"audio/ 目录为空"断言会被**任何**外部
  遗留文件误伤 —— 实跑时曾报出 2 个 13 B、无法归属来源的孤儿 `.mp3`（并发跑探针期间产生），使结果看起来像
  产品回归。现改为**与本次运行开始时的快照比较**；实测在 `audio/` 中故意放入外来文件后仍 70/70，
  且该外来文件原样保留（测试不再删别人的文件）。

## rev-5 · review fixes（修正两轮独立验证与需求审查发现的缺陷）

来源：`docs/rev4-独立验证.md`（DSH 路由，455 断言 / 451 通过）、`docs/rev4-浏览器侧独立验证.md`（262 断言）、`docs/rev4-需求符合性审查.md`（R5-1 等）。

### medium
- **R5-1 弹层第 3 行被裁、默认就有滚动条**：`::picker(select)` 的 `box-sizing` 由 UA 样式表定为
  `border-box`，原 `max-height:92px` 的实际内容区只有 `92-8-2=82px`，而 3 行需要 `3×28=84px`
  ⇒ **一个文件都没导入时打开下拉就已出现滚动条并裁掉第 3 行 2px**，与需求相反。
  修：该规则显式 `box-sizing:content-box` + `max-height:84px`。
- **D1 超限 413 永远到不了客户端**：原实现先 `reject` 再 `req.destroy()`，413 被写进已销毁的
  socket（客户端 0 字节或 `ECONNRESET`）。三次实测后定为：**先把剩余请求体读干（丢弃）再应答
  413**（`Connection: close`）—— 因为 Node 在「响应已结束但请求未读完」时会立刻销毁 socket，
  只有等发送方写完，413 才真的能到达。Content-Length 与 chunked 流式两种写法均已验过。
- **F1 同步抛错穿透 DSH 监听循环**：`fetch` 同步抛错时异常从 `playSample` → `chime()` 一路抛进 DSH
  的 `pendingInteractions` 通知循环；导入路径同根因把按钮永久卡在「导入中…」。
  修：`loadSample`/`uploadAudio` 把同步抛错转成 rejection，`chime()` 与导入路径各加一层兜底
  （计数与 `lastError` 照常记录，不再逃逸）。

### low
- **D2** id 正则去掉 `i`：大写 uuid 曾被 schema 接受却永远 404，渲染成死选项。
- **D3** `findAudioFile` 改为**精确基名 + 已知扩展名**匹配，不再前缀扫描（`<id>.aaa` 不会顶替
  或错删 `<id>.mp3`）。
- **D4/F4** 浏览器侧的显示名按**码点**收敛到 120 并剥离控制字节，与 DSH 同界（原可把 20 万字符
  的名字渲染成一个 20 万字符的 option）。
- **F5** DSH 120 字截断改为**码点**截断，不再切断代理对（emoji 会变成替换字符）。
- **F6** 上传名先 `trim`，扩展名按**最后一个点**取；无扩展名时按 MIME 兜底 —— 原 `'audio'` 兜底
  与尾随空格名都必然被 415 拒绝，而文件其实完全合法。
- **F2（更正文档措辞）**：**审批触发**在 `volume=0` / 关闭时不创建 AudioContext；**「试听」是
  显式用户动作，会有意解锁音频上下文**（首次点击即解锁是刻意设计），但同样不发声。
- **F3** `enabled=false` 时的试听也计入 `suppressedDisabled`（此前只有审批路径计数，卡片上
  "为什么没响"的一行会随入口不同而不同）。
- **R4-CAP** 名册满 50 时**先拒绝导入**（竞态兜底里会删掉刚上传的文件），不再把第 51 个显示成
  「（文件缺失）」——那是对一个真实存在的文件说谎。
- **R4-RACE** 导入成功后在**写入时刻**重读名册再追加（多标签页并发的残留窗口记为已知限制）。

### 残留 FAIL 说明（复跑独立探针时可见）
两份探针的期望表里有多条编码的是 **rev-4 的旧行为**，rev-5 有意改变，故仍显示 FAIL：
`.mp3` 与 `payload.mp3 ` 的 415（现按 F6 接受）、大写 uuid 被接受（现按 D2 拒绝）、
`rev-4` 版本戳（现为 rev-5）、20 万字符名不被截断（现按 D4 截断）、`max-height:92px`（现为
`content-box;84px`）、`enabled=false` 试听不计数（现按 F3 计数）、以及 probe-8 那三条
"同步抛错会逃逸"（现按 F1 不再逃逸 —— 这三条由 FAIL 转为"nothing was thrown"正是修复证据）。

## rev-4 · custom audio（导入自定义音频）
- 新增「导入音频」按钮（在音色选择框右侧）：选择本地音频 → 浏览器 `POST` 到 DSH 侧新增的
  `/api/approval-chime/audio` → DSH 写入插件目录 `audio/<uuid>.<ext>` → 把 `{id, name}` 追加进
  设置文档的 `custom` 名册并立即选中播放。
- 名册**按导入先后**排列，渲染在三个内置音色之前：第一个导入的排第一。
- 弹出列表固定显示 **3 行**，第 4 项起滚动（`::picker(select)` 的 `max-height`）。
- 选中导入音色时出现「移除」：删文件 + 出名册；「恢复默认」不删文件。
- schema：`tone` 从「三个 const 的 union」放宽为「三个 const ∪ `custom:<uuid>` 模式」——
  **仍然拒绝**任意字符串，只是精确开了这一个口子；新增 `custom` 数组字段（默认 `[]`）。
- 安全/边界：id 必须是 uuid（路径形状的 id 到不了文件系统）；扩展名白名单（否则 415）；
  5 MB 上限且**拒绝而非截断**（413）；GET/HEAD/DELETE 齐备，缺失文件删除幂等。
- 降级：`webServer` 走**可选注入**（`ctx.get` + `ctx.inject`），不是硬依赖 —— 没有 web server
  时只打一行警告，内置音色照常工作，绝不把 profile 的启动拖下水。
- 新增 `verify/custom-audio.test.mjs`（70 项）：真实 fs 上跑完整 上传→取回→删除 与全部拒绝路径、
  schema 仍然拒绝垃圾音色、渲染顺序（含丢弃畸形/重复名册项）、3 行滚动 CSS、以及自定义音色
  真正播放（fetch 一次、decode 一次、增益 = `volume/100 × MASTER_GAIN`、二次触发不重取）。
- ⚠️ 改的是 DSH 侧 → **必须重启 `dsh web`** 才生效（路由与 schema 在 DSH 进程内）。

## rev-3 · rounded picker
- 音色下拉的**弹层**改为可定制渲染：`appearance:base-select` + `::picker(select)`。
  弹层四角 10px 圆角、与卡片同源的底色与文字色、选项 7px 圆角并带 hover/选中反馈。
- 动机：原生 `<select>` 弹层由浏览器绘制，`border-radius` 无法作用于它（选项背景能改、
  圆角改不了）。
- 降级：不支持该特性的浏览器（Chrome/Edge < 135）忽略该 `@supports` 块，退回 rev-2 的
  「深色方角」观感，功能不受影响。
- 复跑：`client-half` 103/103、`waterfall` 20/20，`node --check` 通过。

## rev-2 · dark tone menu
- 修正展开后选项列表沿用浏览器浅色默认、在深色主题下文字发灰的问题：选项背景与文字
  改用**卡片自身同源的 DSH 设计变量**（`--dsw-alias-bg-layer-1` / `--dsw-alias-label-primary`），
  而不是写死深色，因此切换主题时下拉会跟着变。
- 动机：用户反馈「选项背景跟周围不一致、文字看不清」。

## rev-1 · pending-interactions
- t2 交付 → t3 独立验证（331 项独立断言）→ t4 评审 **verdict=pass** 的修订。
- 锁定哈希：`lib/index.js` E5E2008A…、`lib/client.js` 1F3E5B60…、`package.json` 7C633060…、
  `cordis.patch.yml` 2DC7C5B1…。
- 真机验收：真实审批请求 → `approvalsSeen: 1` / `triggers: 1`，音量 50 → `lastGain: 0.3`，
  设置落盘 `settings.yaml` 的 `approval-chime` 段。
