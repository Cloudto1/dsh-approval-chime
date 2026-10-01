# native-toast 人工验收册

> ⚠️ **本文件是重建件，不是事故前的原始字节。**
>
> 2026-10-01 的 `robocopy /MIR` 写穿事故删除了 `docs\`；本文件（事故前 **29541 B**，无任何副本）只能按幸存证据重建：
>
> * `verify-independent/probe-21-native-toast.mjs` §12 —— 事故前的**判定代码原件**，逐条钉住了本页必须携带的事实（23 条）；
> * `docs/native-toast-接口冻结.md` §15 —— 本页交叉引用「§15 第 N 条」时按**盘上当前编号**取值（该页本身也是重建件）；
> * `deploy/native-toast/*.ps1` —— 命令名与自检六项名的唯一权威来源；
> * `.scratch/r29-release/` 的留存日志与 `r29-reanchor.json` 的 before/after 记录。
>
> 因此：**判据与命令是硬约束（由上述代码在每次探针运行时逐条复核）**，而叙述文字、章节编号的排版细节是本次重建的选择，原始措辞不可知。字节数与原件的差异属重建代价，不做掩饰。

---

## §0 本页是什么

这是**本机、同一用户会话内**对 Windows 通知链路的验收页。它只回答一个问题：*这台机器上，待审批时的系统通知、点通知按钮、以及回填到 Host 的审批，是否真的按契约工作。*

### 本页不声称的事

1. **不声称能防同一用户进程**：任何以当前用户身份运行的进程都能写同一个 `HKCU` 键、伪造同一条 URI（详见契约页 §15 第 9 条）。
2. **不声称覆盖硬链接边界**：以硬链接方式替换 `lib/native-toast.js`（r3/t14 的字节镜像 `7F66E172…`）不在检测范围内（契约页 §15 第 8 条）。这是**已知边界**，不是缺陷。
3. **不声称横幅（banner）可机检**：通知横幅是否真的**弹出来、看得见**，只能**人工亲眼**确认，任何脚本都测不到"用户看见了"。
4. **不声称覆盖多用户 / 远程会话 / 多显示器**。
5. **不声称本页的步骤都在沙箱里跑过**：真机通知那一段在本沙箱**必然红**（`CreateToastNotifier` 报"该进程没有程序包标识符 / no package identity，0x80073D54"），这正是需要人工执行的原因。

---

## §1 前置检查

### 1.1 环境

* Windows 11（本页按 25H2 校准）；PowerShell 5.1 在 `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`。
* 插件目录：`dsh-approval-chime`；契约页：`docs/native-toast-接口冻结.md`。

### 1.1b 首要前置检查：`shell\open\command`（H2 返修新增）

**为什么要它**：r4/t18 之前，安装脚本用 `reg.exe` 写注册表，而 PowerShell 会给传给原生程序的每个参数重新加引号，于是**唯一含双引号的那个值**（`shell\open\command` 的默认值）在真机上写好却读回不对——这就是 **H2 缺陷**：脚本打印 `[ok]`，值却不在。`install.ps1` 因此改为**原生 provider 写入 + 双读者读回比对**。下面这条检查能在任何人点通知之前把 H2 打回原形：

```powershell
$k = 'HKCU:\Software\Classes\dsh-approval-chime\shell\open\command'
$expected = '"' + (Join-Path $env:SystemRoot 'System32\wscript.exe') + '" "' + (Join-Path $PWD 'deploy\native-toast\activate.vbs') + '" "%1"'
$actual = (Get-Item -LiteralPath $k).GetValue('')
'matches  : ' + ($actual -ceq $expected)
'actual   : ' + $actual
'expected : ' + $expected
```

判定：必须打印 `matches  : True`。若为 `False`，**不要继续后面的步骤**——先看 `install.ps1` 的 `[FAIL]` 行，它会同时给出读回值和尝试过的机制。

### 1.2 安装（写注册表，**必须由用户在本机执行**）

注册表的写入侧**只能由用户执行**普通 PowerShell（本沙箱写不了 `HKCU`，也不该写）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\native-toast\install.ps1 -DryRun   # 先看计划
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\native-toast\install.ps1            # 真写
```

安装做的事：写协议键 + `URL Protocol`（**空字符串**）+ `shell\open\command`（指向 `wscript.exe`，GUI 子系统、无控制台窗口）、写 AUMID 的 `DisplayName`、写标记文件 `%USERPROFILE%\.dsh\approval-chime\native-toast\installed.json`（无 BOM）。**不建开始菜单快捷方式、不写 IconUri、不碰任何 HKLM 键**。

### 1.3 自检（六项）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\native-toast\selftest.ps1 -SkipToast
```

自检判定**六项**，缺一不可：

1. `schemeKeyPresent` —— 协议键在
2. `urlProtocolPresent` —— `URL Protocol` 值在（空串也算在）
3. `commandValue` —— `shell\open\command` 默认值**逐字节**等于冻结命令行
4. `scheme key (default) is the frozen label` —— 协议键默认值等于冻结标签（H3 新增的第六项）
5. `displayName` —— AUMID `DisplayName` 逐字节等于冻结应用名
6. `markerParses` —— 标记文件可解析

任何一项红，**不要手工**用 `reg add` 去"修好"它：手工补的值不会被 `selftest.ps1` 的逐字节比对接受，而且会掩盖真正的写入缺陷。红就是红，按 §6 登记。

### 1.4 卸载

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\native-toast\uninstall.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\native-toast\uninstall.ps1
```

卸载只删自己的两个键、标记文件与目录，并只清我们自己的 Action Center 历史；删不存在的键不算错。

---

## §2 **只能由用户执行**的步骤

以下步骤在 DSH 沙箱里**做不到**，必须由用户在本机亲手跑：

| # | 步骤 | 为什么只能人工 |
| --- | --- | --- |
| 2.1 | 打开「通知提醒」设置页，打开 **nativeToast** 开关 | 需要真实桌面会话 |
| 2.2 | 让 DSH 窗口**退到后台**，触发一次待审批 | 前台时按设计**不弹**通知 |
| 2.3 | **亲眼**确认通知横幅出现、标题为应用名、按钮为「接受 / 拒绝」 | 横幅是否可见**没有机器判据** |
| 2.4 | 点「接受」或「拒绝」 | 真实鼠标/触摸输入 |
| 2.5 | 观察 DSH 页面里的审批是否随之结算 | —— |

---

## §3 可证伪判据（先看这一节，再看命令）

三条判据都写成**可证伪**的形式：每条都给出"**不成立的样子**"。

### 判据 1 —— 通知身份正确

* 期望：横幅标题是冻结应用名，AUMID 为 `Dsh.ApprovalChime.NativeToast`，历史里能读到这一条。
* 读回：
  ```powershell
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory('Dsh.ApprovalChime.NativeToast')
  ```
* **不成立的样子**：`GetHistory` 返回 0 条；或标题显示成 `powershell.exe` / 路径；或历史里出现**别的** AUMID。
* 状态：**已确认（用户实读，2026-09-24）** —— 证据 `r25-h2-user-install-failure.png`（H2 返修时的用户实读截图）。

### 判据 2 —— 点击 → 回填 → 审批链闭合

* 期望：点「接受」后，Host 侧收到 `{"token":"…","answer":"allowed-once"}`，页面审批**结算为已接受**；点「拒绝」同理得到 `rejected`。链路是 **点击 → 回填 → 审批**。
* 触发：`dsh-approval-chime://answer/?t=<32位hex>&a=allow&p=<端口>`（`answer.ps1` 只接受 `allow`/`reject`，token 必须 32 位小写 hex，否则退出码 2 且**不发请求**）。
* **不成立的样子**：页面 5 秒内没有任何变化；或 Host 日志里没有 `/native-toast/answer` 请求；或结算方向相反。
* 状态：**仍待确认**（沙箱内 `CreateToastNotifier` 无包身份，真机点击无法在此复现）。

### 判据 3 —— 关掉开关后点旧通知（fail-closed）

* 期望：先在 1.6b 打开开关弹出一条通知，然后**关掉开关**，再回头点那条旧通知 —— **没有任何反应**：不发请求、不结算、不弹错。* **不成立的样子**：旧通知的点击仍然到达 Host（说明开关只在"发"的一侧生效，没在"收"的一侧生效）。
* 状态：**仍待确认**（同上，需真机）。

---

## §4 链路与端口

`install.ps1` 把 `%1`（整条激活 URI）交给 `wscript.exe` → `activate.vbs`：**先**做 URI 白名单（形状不对直接 `WScript.Quit 2`，**命令行都还没拼**），再以 `Run cmd, 0`（SW_HIDE）拉起 `answer.ps1`，由它 POST 到回环路由 `/api/approval-chime/native-toast/answer`（JSON、`content-type: application/json`），退出码 0/2/3/4 表达不同结局。

---

## §5 自检实读（本机现行）

`selftest.ps1 -SkipToast` 在本机**通过六项**（`-SkipToast` = 只检查、不弹通知）。若要连通知一起测，去掉 `-SkipToast`（沙箱内那一段必然红，见 §0）。

安置后的四个活注册表值已于 r25-t23 重新读回并逐字节比对通过；原始输出见 `r25-t23-live-registry.txt`。

---

## §6 残留红与各轮影响登记

本页不隐藏历史影响；每一轮对人工步骤的影响都在这里登记，**人工清单不受影响**的也照样写出来：

* **r2（t11，客户端 poll 语义）** —— 失败语义改动只影响客户端轮询，不改变任何人工步骤：**人工清单不受影响**。当时的字节镜像 `9D53743B…`。判据 3 的"关掉开关"读法在该轮被明确为 fail-closed。
* **r3（t14，写路径与硬链接边界）** —— 契约页新增硬链接边界条目（现为 §15 第 8 条），本页 §0 第 2 条与之一致；`lib/native-toast.js` 字节镜像 `7F66E172…`。
* **r5（t21+t22，安装器返修 + 分组）** —— 自检从五项变六项（新增协议键默认值）、安装改为原生 provider 写入 + 双读者读回、设置页里通知开关**移到该页最末**成独立分组；`lib/client.js` 字节镜像 `5D94FF5B…`。

---

## §7 证据台账

| 证据 | 位置 |
| --- | --- |
| 自检只读模式输出 | `selftest.ps1 -SkipToast` 的 stdout |
| 四个活注册表值的读回 | `r25-t23-live-registry.txt` |
| H2 用户实读截图 | `r25-h2-user-install-failure.png` |
| 契约与边界清单 | `docs/native-toast-接口冻结.md` §15（本页引用其第 8、9 条） |
| 探针逐条复核 | `verify-independent/probe-21-native-toast.mjs` §12 |

---

## §8 机检怎么复现

人工步骤之外，机器能证的部分用 canonical 跑：

```powershell
$env:TEMP=$env:TMP='<workspace>\.scratch\tmp'
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; & '.\verify-independent\run-r13.ps1'"
```

期望末行 `RUNNER EXIT=0`：六个套件 + probes 1–20 + 十三行冻结清单。真机通知那一段（探针 21 的实弹半）在本沙箱**必然红**，与产品无关。

## §9 不声称项（续）

* 不声称本页覆盖**焦点边界**：窗口"算不算在前台"由桌面环境决定，**可选的**焦点边界行只做人工观察，不做判据。
* 不声称覆盖通知被**系统静音 / 专注助手**拦掉的情况。
* 不声称多语言横幅文案（标题取自注册表 `DisplayName`，改了注册表就改了标题）。

## §10 桌面端（DSH 0.2.0-rc.2 / Electron）对本页的影响

rev-29 把插件适配到桌面端客户端后，**本页步骤一步不变**，只有两处补充：

1. 插件在桌面端 profile 里是 **junction 挂载**（`~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` + `node_modules/dsh-approval-chime`），改动即时生效（HMR），**不要重启桌面端**。
2. 新增两条**人眼判据**（工具测不到，必须人看）：
   * 「**窗口不在前台才响**」—— DSH 在前台时不弹通知，退到后台才弹；
   * 「**点通知按钮 / 关掉开关后点旧通知无反应**」—— 与判据 2、判据 3 同源，但在桌面端要各看一遍。
3. **可选的焦点边界行**：把窗口切到前台再切回来，观察通知是否按预期弹/不弹（只记录，不作判据）。

