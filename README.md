# dsh-approval-chime

DSH 审批提示音插件：**DSH 向你申请权限的那一刻响一声**，音量、音色、开关都在**「设置 → 通知提醒」**里调。
内置风铃 / 铃铛 / 蜂鸣三种现场合成音色，可导入本地音频当音色，还能**按会话独立**设置。

它**完全不参与审批瀑布**：不注册任何 `approval/request` 监听，内置审批面板的决策路径一个字节都没变。
它只做两件事——在审批请求出现时发声，以及（**默认关闭**、且要先在本机装一次）在窗口不在前台时弹一条 Windows 系统通知。

---

## 安装

```sh
# 默认 profile（不需要 PATH 里有 git）
dsh plugin add https://codeload.github.com/Cloudto1/dsh-approval-chime/tar.gz/refs/heads/main

# 或者用 git spec（需要 PATH 里有 git）
dsh plugin add github:Cloudto1/dsh-approval-chime

# 指定 profile
dsh plugin --profile web add <上面任一条 spec>
```

装完**重启 DSH**。随后：

- 「设置 → **通知提醒**」出现本插件的分区页 —— 这说明装载成功；
- 触发一次审批请求，应当听到一声。

> `dsh plugin add` 会把参数原样转发给该 profile 目录里的 pnpm；成功后 DSH 按「已安装依赖」
> 重算 `dsh.profile.bundles`。本包在 `package.json` 里声明了 `dsh.bundle.patch`，这正是它能被
> `dsh plugin add` 安装的原因。

---

## 功能

- **审批响一声** —— 只在审批请求出现时发声，不改变审批行为。
- **三种内置音色** —— 风铃 `chime` / 铃铛 `bell` / 蜂鸣 `beep`，全部为 WebAudio 现场合成，不加载任何音频文件。
- **导入本地音频当音色** —— 分区页「音色」右侧的「导入音频」；上限 5 MB、最多 50 个。
  音频字节落在插件目录，名册（顺序、显示名）随设置文档走。
- **按会话独立**（rev-10）—— 每个会话标题行有一个小铃铛：点一下只静音**这个会话**（静音时那道斜杠
  从左到右画出来，取消时反向扫走，240 ms）；铃铛旁的箭头可给该会话单独指定音色与音量（默认跟随全局）。
  多个会话同时待审批时**各响各的**（同一批按快照顺序逐个响、相邻 180 ms），不再合并成一声。
- **试听与恢复默认** —— 恢复默认只重置 `enabled / volume / tone`，**不动** `custom`
  （导入的文件是素材库，不是一项偏好）。
- **无声环境自证** —— 分区页显示已触发次数与上次触发时间，静音时也能确知"它到底有没有在工作"。
- **Windows 系统通知（rev-25）** —— 待审批出现而 **DSH 窗口不在前台**时，页面请宿主半弹一条**真**的 Windows
  通知：标题是「DSH 需要你的授权」，正文带工具名与理由，两个按钮是「接受 / 拒绝」。按按钮 = 在页面里按同一个
  按钮（**一次点击 = 一个决定**，走的是同一条已冻结的请求 `POST /api/approval-chime/native-toast`），插件仍然
  不注册任何 `approval/request` 监听。要**先在本机装一次**：`deploy/native-toast/install.ps1` 注册协议与 AUMID
  `Dsh.ApprovalChime.NativeToast`。**默认关闭**；没装、宿主半没起来、系统拒了这次通知，都由那一组的状态行
  照实写出来（未安装 / 未就绪 / 被系统拒绝），不会静默。
- **「测试通知」按钮（rev-30）** —— 那个开关行**靠右**一个按钮：点一次就走**同一条**冻结链路弹一条**真**通知
  （key 是合成的 `test:<ms>:<n>`、`sessionId` 固定为 `test`），不必等一次真审批就能把「弹 → 点按钮 → 回填 →
  撤销」这条链走一遍。它**永远结算不了任何审批**：两条会把决定交给审批的路径对测试记录先返回，测试 key 也不可能
  出现在待审批快照里；按它的按钮只把结果写回旁边那行（`已发送` / `没发出去` / `按钮回传：接受｜拒绝`）。

---

## 设置项

命名空间 `approval-chime`，落盘在 `$DSH_HOME/settings.yaml` 的 `approval-chime:` 段，改完立即生效。

| 字段 | 类型 / 范围 | 默认 | 含义 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 关闭后**任何**声音都不产生（含试听）；审批触发路径连 AudioContext 都不创建 |
| `volume` | number `0..100` | `70` | 主增益 = `volume / 100 × 0.6`；`0` 时不发声 |
| `tone` | `chime` \| `bell` \| `beep` \| `custom:<uuid>` | `chime` | 音色。前三个现场合成，`custom:` 前缀指向一个已导入的文件 |
| `custom` | `[{ id, name }]` | `[]` | 已导入的音色名册。**顺序即含义**：按导入先后排列，渲染时排在三个内置音色**之前** |
| `nativeToast` | boolean | `false` | 「Windows 系统通知」开关：**窗口不在前台**时待审批出现就弹一条真 Windows 通知（带「接受 / 拒绝」按钮，按按钮 = 在页面里按同一个按钮）。要**先在本机装一次** `deploy/native-toast/install.ps1`（注册 AUMID `Dsh.ApprovalChime.NativeToast`）；关着时连一个请求都不发 |

每个会话的静音与音色/音量覆盖**不进设置文档、不进浏览器存储**，而是写在插件自己的文件
`<DSH_HOME>/approval-chime/sessions.json`（原子写、上限 200 个会话、按 `updatedAt` 淘汰）。

「通知提醒」分区页里这一组叫 **「Windows 系统通知」**（rev-25 起、表格里的 `nativeToast`）：那一行**靠右**是
**「测试通知」**按钮，按钮右边跟着它的结果行；再往下两行只读说明 —— 上一行是安装判词（**已就绪** /
**未安装（通知注册缺失）** / **本机不支持（找不到 powershell.exe）** / 通知被系统拒了时是
**已安装，但系统拒绝了这次通知**），下一行写明"只在窗口不在前台时弹、要先装 `install.ps1`"。

**「测试通知」（rev-30）** 一次点击弹**一条真通知**：走的是与真审批**完全相同**的那条冻结请求（请求体五个字段
一个不多），只是 key 是合成的 `test:<ms>:<n>`、`sessionId` 固定为 `test`，所以**它永远批准不了任何东西**——两条
会把决定交给审批的路径对测试记录**先返回**，待审批快照里也不可能有 `test:` 开头的 key。按钮旁那行报
**`已发送 —— 请看屏幕右下角`** / **`没发出去：<原因>`** / **`按钮回传：接受` 或 `按钮回传：拒绝`**。

限流**只有 3 秒冷却**（r30 fix-14 删掉了滚动配额）：冷却期内按钮画成**灰的**、点击**不发任何请求**，那行显示
`刚发过，请等 N 秒再试`；页面每秒自绘一次，**到点按钮自己回来**，不用刷新页面、不用重进设置页。
屏幕上**至多一条**测试通知：每点一次先按**同一条** revoke 路径撤掉上一条**测试**通知，筛的是测试记录，
**真审批的通知永远不会被这个按钮动到**；把开关拨到**关**，还活着的**测试**通知会被立刻撤掉。

---

## 已知边界

- **请用 `http://127.0.0.1:3080` 验收。** 非 loopback 页面（远程浏览器）下，平台只把写入留在内存，
  该模式下分区页渲染为空（导航行仍在）。
- **「试听」会先解锁音频上下文**：这是刻意的——让你第一次点击就解除浏览器的自动播放限制。它同样遵循
  `enabled` / `volume`，静音时不发声。
- **本插件不尊重系统「减少动效」偏好**（rev-20 起的**有意取舍**）：会话铃铛的静音斜杠（240 ms）、
  铃铛旁箭头的转动（160 ms）与设置页开关的过渡，在任何环境下都按各自的常量播放，没有例外。
  顶层诊断 `reduceMotion()` 保留，但它只报告"本页是否命中 `(prefers-reduced-motion: reduce)`"，
  **不改变任何行为**。
- 分区页在非 loopback 时为空、`custom:` 音色在文件缺失时的表现等更细的边界，见下方手册的 §9。
- **通知这条道要先在本机装一次，而且要是一台注册得上的 Windows**：`deploy/native-toast/install.ps1` 得在本机
  跑一次（它写 HKCU 下的协议注册与 AUMID `Dsh.ApprovalChime.NativeToast`）；没装、宿主半没起来、或系统直接
  拒了这次通知，都在那一组的状态行上照实写（未安装 / 未就绪 / 被系统拒绝），**不会静默**。
- **受限环境里弹不出真通知，"点一下看看"只能由你本人在真桌面上做**：验证用的沙箱里 `CreateToastNotifier`
  没有程序包标识，必然报 `0x80073D54` —— 所以「点一次测试通知、看屏幕右下角」这件事是**用户本人的检查**；
  探针只能钉住代码与链路，不能替你证明横幅真的弹出来了。
- **没人点、也没人划掉的测试通知会一直挂到 TTL**：它没有审批可以跟着走，所以会挂满冻结的 10 分钟
  （只有你按了它的按钮、或把开关拨到关，它才提前消失）。
- **把通知开关拨到关，撤掉的只是"测试"那条**：真审批那条通知**不会**被立刻撤掉（它走宿主半的 10 分钟 TTL）；
  而且开关再打开之后，下一次快照同步**可能把还挂着的真审批重新弹一次**。

---

## 开发与验证

六套 headless harness，**不需要浏览器、不需要 DSH、不需要装包**：

```sh
node verify/host-half.test.mjs        # 126 项
node verify/client-half.test.mjs      # 639 项
node verify/waterfall.test.mjs        #  22 项
node verify/custom-audio.test.mjs     #  76 项
node verify/native-toast.test.mjs     # 377 项
node verify/settings-model.test.mjs   #  29 项
```

当前为 **1269 项断言全绿（126 + 639 + 22 + 76 + 377 + 29）**，各 exit 0。
`verify/waterfall.test.mjs` 用**静态 + 运行时 + 真 cordis 对照实验**三重证明「审批瀑布零注册」。

`verify-independent/` 是独立验证层（另一套探针与变异表，与上面六套不共享代码），
原始日志归档在同目录的 `_raw/`。与本轮通知功能直接相关的两支：

- `verify-independent/probe-25-toast-test-button.mjs` —— **32 项源码级检查 + 31 个声明变异体**，钉住「测试按钮
  与真审批共用同一个 raise 路径、三道测试闸（`nativeDeliver` / `nativeSettleRevoked` / `nativeSweep`）、冻结路由
  与请求体一个字节没多」。
- `verify-independent/probe-26-flood-exec.mjs` —— **43 项真跑的行为检查**：把真的 `lib/client.js` 放进 vm 沙箱、
  配假时钟驱动，量的是 3 秒冷却、连点不叠通知、冷却期内不发请求、开关 OFF 撤掉测试通知。

`verify-independent/run-r13.ps1` 是 canonical 入口：六套与这一层探针都由它跑一遍，每支的 exit code 与红项归档到 `_raw/`
（`probe-21-native-toast.mjs` 例外 —— 它要本机的 `_raw` 记录加活的桌面通知平台，改由 `probe-24-anchor-drift.mjs` 每轮重推它的字节锚）。

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [`docs/交付说明与验收手册.md`](docs/交付说明与验收手册.md) | **本仓库原来的 README**：包结构、junction 预检、完整的设置项说明、挂载与重启验收步骤、触发设计、无声环境自证接口、浏览器端依赖边界、已知风险与未证实项（§1–§9） |
| [`docs/契约调研.md`](docs/契约调研.md) | 全部 DSH 契约的调研结论，每条都带 `文件:行号` |
| [`docs/挂载与验收.md`](docs/挂载与验收.md) | 挂载 / 验收操作手册 |
| [`docs/验证报告.md`](docs/验证报告.md) | 历次验证报告 |
| [`docs/变异覆盖与残留红.md`](docs/变异覆盖与残留红.md) | 变异测试覆盖表与残留红项 |
| [`docs/native-toast-接口冻结.md`](docs/native-toast-接口冻结.md) | **Windows 原生通知的唯一契约来源**：AUMID、协议注册、回填通道、HTTP 契约、fail-closed 矩阵、触发条件与"不声称的事"（§0–§16）；**§17** 登记「测试通知」按钮（同一条冻结路由、合成 key、批准不了任何东西、3 秒冷却、屏幕至多一条），**契约本身一个字节未改** |
| [`docs/native-toast-人工验收.md`](docs/native-toast-人工验收.md) | 只能由**你本人**在真机上做的验收册：**步骤 2.0（30 秒自测）**就是先点一次「测试通知」把链路走一遍，随后按 §3 的三条可证伪判据走一次**真**审批 |
| [`verify-independent/probe-25-toast-test-button.mjs`](verify-independent/probe-25-toast-test-button.mjs) | 「测试通知」按钮的源码级探针（32 项检查 + 31 个声明变异体，见上文「开发与验证」） |
| [`verify-independent/probe-26-flood-exec.mjs`](verify-independent/probe-26-flood-exec.mjs) | 「测试通知」按钮的行为探针（43 项真跑检查：vm 沙箱 + 假时钟，见上文「开发与验证」） |
| [`CHANGELOG.md`](CHANGELOG.md) | 逐版本的变更记录（rev-1 → rev-30，含锚定字节哈希与每次的验证结论） |

---

## 许可

[MIT](LICENSE) © 2026 Cloudto1
