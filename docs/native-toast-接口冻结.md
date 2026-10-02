# dsh-approval-chime · Windows 原生通知「接口冻结」

**状态**：冻结（rev-25 起点）。本页是唯一契约来源：实现者只读本页就能把**主机半**与**客户端半**写出来，不需要读任何设计讨论。
**归属**：本功能属于 `dsh-approval-chime`（用户在设置导航里看到「通知提醒」分区页的那个插件）。见 §14。
**本页不写任何产品代码**：只冻结字符串、协议、路径、状态码、判据、证据。

**实测环境**（本页所有"实测"结论都出自这台机器）：Windows 11 25H2（build `10.0.26100`）；
`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` = **5.1.26100.9444**（存在）；
`C:\Windows\System32\wscript.exe`（存在）；DSH `0.1.5-rc.3`，包在
`C:\Users\28779\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\`。

> **⚠️ rev-27 勘误（触发源搬家；本页其余冻结项一律不受影响）**：本页写作时 DSH 是 `0.1.5-rc.3`，
> 客户端把待审批投在 `ctx.uiSession.pendingInteractions` 上 —— §12 第 4 条与后文按当时的事实保留。
> **DSH 0.1.7-rc.2 移除了那个成员**，改由 root slot hook **`ctx.uiSession.sessionStatus`** 承载
> （快照 = `Map<sessionId, {running, pendingInteraction, completionUnread}>`；内置审批面板经
> `ctx.uiSession.registerPendingInteraction(precedence)` 发布）。本插件现经**一个适配器**读它
> （新版优先、旧成员回退），见 `lib/client.js` 的 `pendingSource()`。
> **通知本身的冻结项一个字节都没动** —— AUMID、显示名、scheme、路由、spool、tag、按钮、XML、
> 四态请求数全部照旧；搬的只是"从哪个成员上看见待审批"。取证：
> `verify-independent/probe-5-contract.mjs` 的 A.5…A.5h（对着**已安装的 DSH 源码**，
> 含 A.5e「被移除的成员真的不在了」），以及 `verify/client-half.test.mjs` 与
> `verify-independent/probe-1-approval.mjs` 的 rev-27 段（对着 0.1.7 的形状实测）。

---

## §0 常量总表（实现时只从这里抄字符串）

| 名称 | 确切值 |
| --- | --- |
| 产品 AUMID | `Dsh.ApprovalChime.NativeToast` |
| 通知上显示的应用名 | `DSH 通知提醒` |
| 协议 scheme | `dsh-approval-chime` |
| 回填协议 URI 形状 | `dsh-approval-chime://answer/?t=<32位小写hex>&a=<allow\|reject>&p=<1..65535>` |
| HTTP 前缀路由 | `/api/approval-chime/native-toast` |
| 设置命名空间 | `approval-chime`（既有，`dsh-approval-chime/lib/index.js:44`） |
| 新设置字段 | `nativeToast`，布尔，**默认 `false`** |
| 主机侧文件根 | `%USERPROFILE%\.dsh\approval-chime\native-toast\`（= `$DSH_HOME\approval-chime\native-toast\`） |
| 安装标记文件 | 上述目录下的 `installed.json` |
| 回填文件名 | `<token>.json`（token = 恰好 32 位小写 hex） |
| toast `group` | `dsh-approval-chime` |
| toast `tag` | `appr-` + token 的前 11 位（合计 16 字符） |
| 统一 TTL | `600000` ms（10 分钟） |
| 客户端轮询间隔 | `1000` ms |
| 解释器绝对路径 | `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` |
| 脚本目录 | `<插件目录>\deploy\native-toast\`（本机 `<插件目录>` = `D:\DeepSeek Harness Work area\DeepSeek Harness\dsh-approval-chime`） |
| toast 标题第 1 行 | `DSH 需要你的授权` |
| toast 标题第 2 行 | `reason` 有值就用 `reason`，否则 `` `工具 {toolName} 请求越权执行` ``（与页面面板的 escalation 文案同字） |
| toast 两个按钮 | `接受` / `拒绝`（`useButtonStyle="true"` + `hint-buttonStyle="Success"` / `"Critical"`） |
| 按钮语义映射 | `接受` → `allowed-once`；`拒绝` → `rejected` |
| toast 自带声音 | **静音**：`<audio silent="true"/>`（队长 F3 裁决 2026-09-24）——本功能不新增任何声音，插件的提示音是唯一可听信号 |

**Coding 硬约束（实测踩过）**：`deploy/native-toast/` 下的 `*.ps1` 与 `*.vbs` 必须**只含 ASCII**
（或带 UTF-8 BOM）。Windows PowerShell 5.1 读**无 BOM 的 UTF-8** 脚本时按系统 ANSI 解码：实测脚本里的 `通知提醒` 变成
`閫氱煡鎻愰啋…`，随后 `XmlDocument.LoadXml` 直接抛 `0xC00CE56D`。所有中文一律走**数据**（XML 文件、JSON 请求体），不进脚本源码。

### §0.2 证据与实测记录（供复核；下面每条契约都指向这里的编号）

| 编号 | 动作 | 结果 |
| --- | --- | --- |
| A1 | PS 5.1 加载 WinRT 投影（`ToastNotificationManager`/`ToastNotification`/`XmlDocument`，`ContentType=WindowsRuntime`） | 成功 |
| A2 | 未注册、无快捷方式的随机 AUMID 上 `CreateToastNotifier(aumid).Show(toast)` | **不抛**；`History.GetHistory(aumid)` 读到 1 条 |
| A3 | 完整冻结 XML（中文标题 + 两个 `activationType="protocol"` 按钮 + `useButtonStyle` + `hint-buttonStyle`） | `LoadXml` 通过；`Show()` 通过；读回 1 条，`Tag=appr-a1b2c3d4`、`Group=dsh-approval-chime`，内容 XML 含 `a=allow`、`a=reject`、`接受`、标题文字 |
| A4 | `History.Remove(tag, group, aumid)` / `History.Clear(aumid)` | 均成功（针对已存在的那条通知） |
| A5 | 沙箱内写 `HKCU:\Software\…`（`New-Item` 与 `reg.exe add`） | 双双 `Access is denied`（键 ACL 上本用户是 FullControl）→ §1.5 的残余未知 |
| A6 | 无 BOM 的 UTF-8 `.ps1` 里写中文 | PS 5.1 按 ANSI 解码 → 中文变 `閫氱煡…` → `LoadXml` 抛 `0xC00CE56D` → §0 的 ASCII-only 硬约束 |
| A7 | 本机 `HKCU:\Software\Classes\AppUserModelId\` 现成项 | `Bytedance.JianyingPro`→`剪映专业版`；`{1367B6E7-…}`→`抖音`；`E:/Steam++/Steam++.exe`→`Watt Toolkit`（AUMID 即 exe 路径、无快捷方式路线） |
| A8 | 环境 | Windows 11 25H2 build 26100；`powershell.exe` 5.1.26100.9444；`wscript.exe` 存在 |
| A9 | `<audio silent="true"/>` 的摆放（rev-25 返修，t9/t14 实测） | `LoadXml` + `New-Object Windows.UI.Notifications.ToastNotification($doc)` + `Show()` 对**三种顺序**（紧跟 `<toast>` / `<visual>` 之后 / `<actions>` 之后）**都不抛**；`History.GetHistory()` 读回的内容 XML 原样含 `<audio silent="true"/>`。本页 §10 取"紧跟 `<toast useButtonStyle="true">`"这一种，实现逐字节照此生成。**正读落盘件**：`.scratch/native-toast-probe/r25-t14-evidence.out` 的 E2 行（`history count = 1`、`first tag = a9audio`、`has_audio_silent = True`）；早期件 `audio-static.out` 里的 `has_audio_silent=False` 是 PS 5.1 单元素向量展开陷阱的产物，不是读数——见 §16 第 2 条 |

外部资料：[Application User Model IDs](https://learn.microsoft.com/en-us/windows/win32/shell/appids) ·
[action (Toast XML Schema)](https://learn.microsoft.com/en-us/uwp/schemas/tiles/toastschema/element-action) ·
[toast (Toast XML Schema)](https://learn.microsoft.com/en-us/uwp/schemas/tiles/toastschema/element-toast) ·
[ToastNotification.Tag](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotification.tag?view=winrt-26100) ·
[ToastNotificationHistory.Remove](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotificationhistory.remove?view=winrt-26100) ·
[toasty DEVELOPMENT.md（未打包应用 AUMID/协议注册的参考实现）](https://raw.githubusercontent.com/shanselman/toasty/refs/heads/main/DEVELOPMENT.md)

---

## §1 AUMID 与应用名（task item 1 / 15）

### 1.1 AUMID 的确切值

```
Dsh.ApprovalChime.NativeToast
```

必须满足 `产品.子产品.组件` 的形状、≤128 字符、不含空格（[Application User Model IDs](https://learn.microsoft.com/en-us/windows/win32/shell/appids) 的成文要求）。
**不许**复用 `WindowsPowerShell\v1.0\powershell.exe` 之类的系统 AUMID：那会让通知头部显示「Windows PowerShell」，直接违反 §15 的可见名字要求。

### 1.2 通知上显示的应用名（"Cursor" 那个位置）

```
DSH 通知提醒
```

理由：① 与用户在设置导航/页面标题里看到的名字「通知提醒」语义一致（`dsh-approval-chime/lib/client.js:1813-1814` 的 `nav`/`title` 都是 `通知提醒`）；② 前面加产品名 `DSH`，
在操作中心的"发送方"列表里可辨识（单写「通知提醒」会和系统其它提醒混淆）；③ 固定字符串、不随 UI 语言变、不含任何路径或 AUMID 串。
`DisplayName` 是这个**唯一**决定通知头显示文字的来源（见 1.3 的证据）。

### 1.3 是否需要在开始菜单建快捷方式：**不需要**（裁决）

裁决：**不建任何快捷方式、不碰开始菜单**；应用名由下面的 `AppUserModelId` 注册表键供给。两层证据：

1. **送达不需要注册**（实测，本机 25H2）：用一个从未注册过、也没有任何快捷方式的随机 AUMID 调
   `ToastNotificationManager.CreateToastNotifier($aumid).Show($toast)` → **不抛异常**，随后
   `ToastNotificationManager.History.GetHistory($aumid)` 读到 **1 条**（内容 XML 完整，含两个 action 的 `arguments`）。
   即"未注册 ⇒ 通知不显示"不是本机的行为。
2. **名字来自 AUMID 注册键**：本机 `HKCU:\Software\Classes\AppUserModelId\` 下真实存在、且正是这些应用在用的键：
   `Bytedance.JianyingPro` → `DisplayName = 剪映专业版`；`{1367B6E7-9221-4915-821B-790B50E0BE03}` → `DisplayName = 抖音`；
   `E:/Steam++/Steam++.exe` → `DisplayName = Watt Toolkit`。
   最后一条的 AUMID 就是 **exe 路径** —— 那是 Windows App SDK「未打包应用」的注册形态，它**不建开始菜单快捷方式**
   （只写 `HKCU\Software\Classes\CLSID\{guid}\LocalServer32` 与 `AppUserModelId\<aumid>` 键），通知头部照样显示可读名字。
3. 反向代价：MS 文档里"给未打包应用做 toast"的快捷方式路线要求把 `System.AppUserModel.ID` 写进 `.lnk` 的
   **IPropertyStore**（[appids 文档](https://learn.microsoft.com/en-us/windows/win32/shell/appids)「Where to Assign an AppUserModelID」），
   `WScript.Shell` 做不到，只能用 `Add-Type` 运行时编译 C# 去 P/Invoke `SHGetPropertyStoreFromParsingName`——
   本轮明文禁止编译、且要给用户塞一个可见的开始菜单项、卸载还得顺着 `.lnk` 清理。**本页明确排除该路线。**

### 1.4 `install.ps1` 要写的精确键（AUMID 部分）

```
HKCU\Software\Classes\AppUserModelId\Dsh.ApprovalChime.NativeToast
    DisplayName      REG_SZ   DSH 通知提醒
```

- 只写这一个值。**不写** `IconUri`、**不写** `IconBackgroundColor`、**不写** `CustomActivator`
  （前两者需要额外图片资源；`CustomActivator` 是 App SDK 的激活器机制，是依赖，见 §11）。
- 不写 `DefaultIcon`。
- 全部在 **HKCU**（当前用户），不需要管理员。
- 不建 `.lnk`，不动 `%APPDATA%\Microsoft\Windows\Start Menu\`。

### 1.5 安装后必做的"名字"验收（本页唯一的残余未知）

本会话运行在 DSH 沙箱里，**HKCU 写入被拒**（实测：`New-Item HKCU:\Software\…` →
`UnauthorizedAccessException`，`reg.exe add` 亦 `Access is denied`，而该键 ACL 上本用户是 FullControl），
所以 §1.4 的"名字渲染"没能在这台机器上亲眼验证。安装后必须做这一步：

```powershell
& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "<插件目录>\deploy\native-toast\install.ps1"
& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "<插件目录>\deploy\native-toast\selftest.ps1"
```

`selftest.ps1` 弹一条测试通知并用 `History.GetHistory('Dsh.ApprovalChime.NativeToast')` 读回。
**通过条件**：通知头部显示的确切文字是 `DSH 通知提醒`，且读回条数 ≥ 1。
若不通过（显示成 AUMID 串或空白）：把它当缺陷交给队长裁决——**不要**自行改走 1.3 已排除的快捷方式路线。

---

## §2 协议注册：HKCU 下每一个键与值（task item 2）

`install.ps1` 写下面**全部**键值；`<系统盘>`、`<插件目录>` 由脚本用 `$env:SystemRoot`、`$PSScriptRoot` 拼出，**不许写死**（本机实际值放括号里仅作对照）：

```
HKCU\Software\Classes\dsh-approval-chime
    (默认)          REG_SZ      URL:DSH 通知提醒 回填协议
    URL Protocol    REG_SZ      ""
HKCU\Software\Classes\dsh-approval-chime\shell\open\command
    (默认)          REG_SZ      "<系统盘>\System32\wscript.exe" "<插件目录>\deploy\native-toast\activate.vbs" "%1"
```

本机对照（**不是**要写死的字面量）：

```
"C:\Windows\System32\wscript.exe" "D:\DeepSeek Harness Work area\DeepSeek Harness\dsh-approval-chime\deploy\native-toast\activate.vbs" "%1"
```

- `shell`、`shell\open` 两个键存在即可，**不给它们写值**。
- **不写** `DefaultIcon`：协议激活不用图标，写了只会把图标指到一个与本产品无关的文件。
- 只写 HKCU（与参考实现 toasty 的 `HKCU\Software\Classes\toasty` 一致，见其 DEVELOPMENT.md「Protocol Handler Registration」），不写 HKLM，不需要管理员。
- `%1` 必须带引号：插件目录里有空格。

### 2.1 "无黑框"的具体做法

1. 入口是 **`wscript.exe`**（GUI 子系统宿主，**永不创建控制台窗口**），不是 `powershell.exe`。
2. `activate.vbs` 用 `WScript.Shell.Run(cmd, 0, False)` 启动 PowerShell：参数 `0` = `SW_HIDE`，子进程不显示窗口。
3. PowerShell 一律 `-NoProfile -NonInteractive -ExecutionPolicy Bypass -File <脚本>`；不写 `Write-Host`、不弹对话框。
4. **禁止**把 `shell\open\command` 直接注册成 `powershell.exe -WindowStyle Hidden …`：Explorer 启动一个控制台子系统程序时会先为它创建控制台窗口，`-WindowStyle` 来不及阻止闪一下黑框。这是本页选 wscript 壳的唯一理由，不是偏好。

---

## §3 激活器：路径、参数形状、URL 解析、非法参数（task item 3）

### 3.1 两个文件

| 文件 | 角色 | 编码约束 |
| --- | --- | --- |
| `<插件目录>\deploy\native-toast\activate.vbs` | 协议入口（拿到完整 URI），隐藏启动 worker 后立刻退出 | 必须 ASCII-only |
| `<插件目录>\deploy\native-toast\answer.ps1` | 解析 URI、校验、把答案 POST 回主机 | 必须 ASCII-only |

`activate.vbs` 冻结内容（逐字节照写；`<PS1>` 在实现里由脚本**相对自身**解析成 `answer.ps1` 的绝对路径，
与 `install.ps1` 写进注册表的那条命令指向同一个文件，目录搬迁后两者仍一致）：

```vbs
' dsh-approval-chime native toast activation shim. ASCII only.
Dim uri, ps1, cmd, re
uri = ""
If WScript.Arguments.Count > 0 Then uri = WScript.Arguments(0)
Set re = New RegExp
re.Pattern = "^dsh-approval-chime://answer/\?[A-Za-z0-9%&=.?/_-]*$"
If Not re.Test(uri) Then WScript.Quit 2
ps1 = "<PS1>"
cmd = """<系统盘>\System32\WindowsPowerShell\v1.0\powershell.exe"" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & ps1 & """ -Uri """ & uri & """"
CreateObject("WScript.Shell").Run cmd, 0, False
```

白名单三行（`Set re … / re.Pattern … / If Not re.Test(uri) Then WScript.Quit 2`）是队长 F5 裁决加入的冻结内容：
它**必须排在 `cmd` 赋值之前**（离线断言就钉住这个先后），见 §3.2 末段的理由与实测。

### 3.2 参数形状与解析

`answer.ps1 -Uri "<完整 URI>"`，URI 由本插件自己写进通知按钮，形状固定：

```
dsh-approval-chime://answer/?t=<32位小写hex>&a=<allow|reject>&p=<1..65535>
```

解析与校验（全部命中才发请求）：

1. `$u = [System.Uri]$Uri`；解析失败 → 非法。
2. `$u.Scheme -ceq 'dsh-approval-chime'` 且 `$u.Host -ceq 'answer'`，否则非法。
3. 查询串按 `&` 拆成键值对（`[System.Web.HttpUtility]` 不可用；手写拆分 + `[Uri]::UnescapeDataString`）。
4. `t` 必须匹配 `^[0-9a-f]{32}$`（大小写敏感；大写视为非法）。
5. `a` 必须是 `allow` 或 `reject` 之一。
6. `p` 必须是 1..65535 的十进制整数。

**非法参数的确切行为**：不打印、不弹框、不写任何文件、不发任何请求，`exit 2`。

**shim 的白名单闸（队长 F5 裁决，2026-09-24；实现见 §3.1 的冻结内容）**：`activate.vbs` 在**拼命令之前**先校验 URI，
必须匹配 `^dsh-approval-chime://answer/\?[A-Za-z0-9%&=.?/_-]*$`（该式不含 `"`、`\`、空白与控制字符），不匹配直接 `WScript.Quit 2`、
**不启动任何子进程**。理由：URI 是 Action Center 里用户可见的数据，随后被拼进一条命令行；一个双引号就能提前结束引号参数、
让后面的字符串变成别的东西。实测正常 URI `dsh-approval-chime://answer/?t=<32hex>&a=allow&p=45124` **能过闸**
（`:45124` 是每次激活实际用的随机端口之一），含 `" & calc.exe & "` 的 URI 被 shim 自己以 exit 2 拒绝且不产生请求。

### 3.3 回填请求（激活器 → 主机）

```
POST http://127.0.0.1:<p>/api/approval-chime/native-toast/answer
Content-Type: application/json
Body: {"token":"<32位小写hex>","answer":"allowed-once"|"rejected"}
```

- 主机地址**硬编码** `127.0.0.1`（只走 loopback），端口来自 `p`。
- `answer` 的取值由 `a` 映射：`allow` → `allowed-once`，`reject` → `rejected`。
- 超时 3 秒；用 `[System.Net.HttpWebRequest]`（PS 5.1 里 `Invoke-RestMethod` 亦可，二者都无需新增依赖）。
- 退出码（唯一记录，不写日志、不落文件）：`0` = 主机回 200 已记录；`2` = 参数非法；`3` = 主机拒绝（404/409/其它非 200）；`4` = 传输失败。
- 全程无窗口、无输出、无日志文件。

---

## §4 回填通道（task item 4）

**目录**：`%USERPROFILE%\.dsh\approval-chime\native-toast\`（同 `$DSH_HOME`）。目录不存在时由**主机半**首次使用时 `mkdir -p` 创建。
与既有 `approval-chime/sessions.json` 同根（`dsh-approval-chime/lib/index.js:740-747`），解析 home 的规则同 `@deepseek-ai/dsh-home-paths/lib/index.js:73-76`。

**目录里只允许两类文件**：

| 文件 | 谁写 | 内容 | TTL |
| --- | --- | --- | --- |
| `installed.json` | `deploy/native-toast/install.ps1` | 安装标记（见 §5.4） | 不参与清扫 |
| `<token>.json`（32 位小写 hex） | **只有主机半** | 回填答案 | 10 分钟 |

其余任何名字的文件：主机**忽略**，只有 `*.tmp` 与过期 `<token>.json` 会被清扫。

**文件名规则**：`^[0-9a-f]{32}\.json$`。token 与 §3 的 URI 里那个 `t` 是同一个串。

**JSON schema**（写入方 = 主机半，逐字段必须完全一致，多一个键都算非法）：

```json
{"version":1,"token":"<32位小写hex>","answer":"allowed-once","answeredAt":"2026-09-24T02:39:19.947Z"}
```

- `version`：整数，只接受 `1`。
- `answer`：只接受 `allowed-once` 或 `rejected` 两个字面量。
- `answeredAt`：ISO-8601 UTC 字符串（`toISOString()`）。TTL 以它为准。
- 写入方式（rev-25 返修 G1，队长 2026-09-24 裁决）：**每个写入者一个唯一临时名** `<token>.json.<pid>-<计数器>.tmp`，
  写完用 **`link(tmp, <token>.json)` 发布** —— 硬链接在目标已存在时抛 `EEXIST`，所以"先到的答案不变、文件不覆盖"是**内核保证**的，
  而不是靠先读后写的窗口；`EEXIST` ⇒ 删掉自己的临时文件并回 `{ok:false,reason:"exists"}`（bridge 映射成 `409 already-answered`）。
  卷不支持硬链接（`EPERM`/`ENOSYS`/`EXDEV`）时才退回 `rename`，那是**最后手段**、并发下不安全（只保证这种卷上功能可用）。
  **不许**用 `rename` 做发布：本机实测 `rename` 会**静默替换**目标，两个同 tick 的写入者会双双"成功"而后者覆盖前者
  （读数见 `.scratch/native-toast-probe/r25-t14-evidence.out` 的 E1a 行；同一读数的 E1b 行是 `link` 的 `EEXIST`）。
  发布成功或失败都会清掉自己的临时文件，不留 `.tmp` 残留。

**一次性语义**：`GET`/`revoke` 首次读到合法答案 → **先**把该 token 记进内存 `consumed` 集合、**再** `unlink` 文件、**最后**回 `200 {state:"answered"}`。
`unlink` 失败也回 `answered`（内存集合已挡住重复投递）。第二次读回 `{state:"consumed"}`，永不重放答案。

**TTL**：`600000` ms。三种时机清扫：主机启动时、任何一条 native-toast 路由被调用时、写入前。
过期判定：`now - answeredAt > TTL` → 视为不存在（删掉文件，**答案永不投递**）；若该 token 仍在内存表里，本次读作
`200 {"ok":true,"state":"pending"}`，否则 `404 {"ok":false,"error":"unknown token"}`（队长 F7 裁决）。清扫只针对 `^[0-9a-f]{32}\.json$`、
`^[0-9a-f]{32}\.json\.[0-9]+-[0-9]+\.tmp$`（写入者的唯一临时名）与 `*.claim`。

**token 来源**：**客户端生成**（`crypto.getRandomValues(new Uint8Array(16))` → 32 位小写 hex；不用 `crypto.randomUUID`，它要求安全上下文），随 `POST /api/approval-chime/native-toast` 发给主机。主机**从不自己造** token。

**token 校验 = 写入门校验**（主机侧，缺一不可；**只适用于 `POST /answer` 与 `POST /`**，不参与 `GET /answer` 的投递判定——投递只认文件，见 §5.2）：
正则 `^[0-9a-f]{32}$`；必须是本进程**签发过且仍存活**的 token（内存表里有）；未过期；未答复过。
任一不满足 → 404，**不写任何文件、不改任何状态**。

**权限限制**：
- 目录继承用户配置文件的默认 ACL，**不写任何 ACL 代码、不建共享、不放宽权限**。
- 目录与文件都在用户 profile 内；token 只是**一次性**凭据，只授权"为一个主机已签发的、活着的审批写一条答案"，不授权任何其它动作。
- 主机路由**不**读 `Origin`/cookie（与既有两条路由一致，`dsh-host-webserver/lib/index.js` 里没有任何 origin/token 校验代码）→ 所以 token 必须不可猜（128 bit）且必须校验；
  答案内容只接受两个枚举值，绝不把文件内容当命令/路径使用。
- 回填文件是**数据**，永不执行；主机不读它来决定"这条 token 合不合法"——**回填文件是交付层，也是唯一权威**（队长 F1 裁决，2026-09-24）：
  答案一旦落盘就会被交付，哪怕它是在**主机重启之前**写的；内存表只用于 `POST /answer` 的**写入门**（判断"这条 token 是不是本进程签发过的、还活着的"），
  随进程重启丢失。反过来也成立：内存表**不**授权任何交付——`POST /answer` 的写入门与"读出来投递"是两件事。

---

## §5 HTTP 契约（task item 5）

**挂载方式**：**一条** `kind: 'prefix'` 路由 `'/api/approval-chime/native-toast'`，挂在既有 `webServer` 服务上，
沿用插件现有两条路由的**完全相同的可选注入姿势**（`ctx.get('webServer')` → `ctx.inject(['webServer'], …)` → `ctx.webServer`，
见 `dsh-approval-chime/lib/index.js:682-723`、`:1080-1122`）。`(kind, path)` 重复会抛
（`dsh-host-webserver/lib/index.js:176-183`），所以**只能注册一条**前缀路由，方法在 handler 内分发。
**不新增任何依赖**：主机侧只用 `node:child_process`、`node:fs/promises`、`node:crypto`、`node:path`、`node:os`；
客户端只用相对 `fetch(route, { credentials: 'same-origin' })`（与 `lib/client.js:1392`、`:1422` 同一写法）。

| 方法 + 路径 | 请求体 | 响应 | 状态码 |
| --- | --- | --- | --- |
| `POST /api/approval-chime/native-toast` | `{"token":"<32hex>","key":"<客户端审批 key>","sessionId":"<string>","toolName":"<string>","reason":"<string,可省>"}` | 见 §5.1 | 200 / 400 / 405 / 413 / 500 |
| `GET /api/approval-chime/native-toast` | 无 | `{"ok":true,"state":"ready"\|"not-installed"\|"no-powershell"\|"disabled"}` | 200 / 405 / 500 |
| `GET /api/approval-chime/native-toast/answer?token=<32hex>` | 无 | 见 §5.2；**关态一律 `{"ok":true,"state":"skipped","reason":"disabled"}`** | 200 / 400 / 404 / 405 / 500 |
| `POST /api/approval-chime/native-toast/answer` | `{"token":"<32hex>","answer":"allowed-once"\|"rejected"}` | 见 §5.3；**关态一律 `{"ok":true,"state":"skipped","reason":"disabled"}`** | 200 / 400 / 404 / 409 / 413 / 500 |
| `POST /api/approval-chime/native-toast/revoke` | `{"tokens":["<32hex>", …]}`（≤ 32 个） | `{"ok":true,"results":[{"token":"…","state":"pending"\|"answered"\|"consumed"\|"unknown"},"answer"仅在 answered 时出现]}`；**关态一律 `{"ok":true,"state":"skipped","reason":"disabled"}`** | 200 / 400 / 405 / 413 / 500 |
| 前缀下其它子路径 | — | `{"ok":false,"error":"unknown path <pathname>"}`（与 `lib/index.js:1019` 同一写法） | 404 |
| 前缀下其它方法 | — | `{"ok":false,"error":"method <X> is not supported on this route"}` | 405 |

- 请求体上限 `16384` 字节（超过 → 413，与 `lib/index.js:592-604` 的既有风格一致）；非法 JSON → 400。
- 所有响应 `Content-Type: application/json`；任何异常都被捕获 → 500 `{ok:false,error:<文本>}`（绝不把异常抛进服务器）。
- 路由在**开关关闭时也注册**（否则设置页无法打开开关），但关闭时任何调用只回 `skipped/disabled` 且零副作用（见 §6）。

### 5.1 `POST /` （弹通知）的确切行为

按顺序判定，命中即返回，**不再往下走**：

1. `nativeToast !== true` → `200 {"ok":true,"state":"skipped","reason":"disabled"}`
2. `installed.json` 不存在 / `version !== 1` / `aumid !== "Dsh.ApprovalChime.NativeToast"` → `200 {"ok":true,"state":"skipped","reason":"not-installed"}`
3. `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` 不存在 → `200 {"ok":true,"state":"skipped","reason":"no-powershell"}`
4. body 不合法 / token 不合法 → `400 {"ok":false,"error":"…"}`
5. 该 token 已有存活记录（重复 raise）→ **不再 spawn**，直接回同一条 `200 {"ok":true,"state":"raised","tag":"appr-<11hex>","duplicate":true}`
   （`duplicate:true` 是实现的超集：字段只在重复 raise 时出现，首次 raise 的响应仍是 §5.1 原文那条；队长 2026-09-24 裁决把它写进契约）
6. 否则：把 toast XML 写到 `<目录>\raise-<token>.xml`（UTF-8，无 BOM）→ spawn `raise.ps1`
   （`{"windowsHide":true,"stdio":"ignore"}`，参数 `-Aumid … -XmlPath … -Tag … -Group …`）→ **等子进程退出（上限 5000 ms）**：
   - 退出码 0 → 登记 token → `200 {"ok":true,"state":"raised","tag":"appr-<11hex>"}`
   - 其它/超时 → `200 {"ok":true,"state":"skipped","reason":"raise-failed","detail":"<exit code 或 timeout>"}`
   - 无论哪条分支，`raise-<token>.xml` 随后删除（成败都删）。

XML 里的 `p=PORT` 取自 `webServer.port`（`dsh-host-webserver/lib/index.js:163-165` 的 `get port()`），
**不许**用配置里的端口字面量（配置允许 `0` = 由系统分配，那样通知回填会打到错的端口）。

**客户端对任何 `state:"skipped"` 的处理**：立刻放弃该 token（不再轮询、不再撤销），只加一个诊断计数。

### 5.2 `GET /answer?token=…`（客户端取答案）

| 情况 | 响应 |
| --- | --- |
| 关态（`nativeToast !== true`） | `200 {"ok":true,"state":"skipped","reason":"disabled"}`（**不读文件、不写任何状态**；与 `POST /` 同形的关闸，队长 2026-09-24 裁决） |
| token 形状非法 | `400 {"ok":false,"error":"bad token"}` |
| 文件存在且合法且未过期 | 消费它 → `200 {"ok":true,"state":"answered","answer":"allowed-once"\|"rejected"}` |
| 已在内存 `consumed` 且本次无文件 | `200 {"ok":true,"state":"consumed"}` |
| token 在内存表里、还活着、无文件 | `200 {"ok":true,"state":"pending"}` |
| 未知 token / token 已过期 / 已被清扫 | `404 {"ok":false,"error":"unknown token"}` |
| 答案文件过期或损坏（被删掉、答案永不投递，但 **token 自己还活着**） | `200 {"ok":true,"state":"pending"}`（t8 探针 + t7 同读数的实测结论；两条路径都 fail-closed） |

先看文件、再看内存表 —— **回填文件是交付层，也是唯一权威**（队长 F1 裁决）：所以**主机重启**后，一个已写好但还没被取走的答案仍然能交付
（文件是持久层，内存表只用于 `POST /answer` 的写入门，随重启丢失）。反过来，内存表**不**参与投递判定——这正是"过期/损坏文件被删、token 仍活"时读作 `pending` 而不是 404 的原因。

### 5.3 `POST /answer`（激活器写答案）

| 情况 | 响应 |
| --- | --- |
| token 形状非法 / `answer` 不是两个枚举之一 | `400 {"ok":false,"error":"…"}` |
| token 未知或已过期 | `404 {"ok":false,"error":"unknown token"}` |
| 该 token 已有文件或已在 `consumed` | `409 {"ok":false,"state":"already-answered"}`（**先到的答案保持不动**） |
| 正常 | 写 `<token>.json` → `200 {"ok":true,"state":"recorded"}` |

### 5.4 `installed.json`（安装标记）

```json
{"version":1,
 "aumid":"Dsh.ApprovalChime.NativeToast",
 "displayName":"DSH 通知提醒",
 "scheme":"dsh-approval-chime",
 "wscript":"C:\\Windows\\System32\\wscript.exe",
 "powershell":"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
 "pluginDir":"<插件目录绝对路径>",
 "installedAt":"<ISO-8601 UTC>"}
```

主机**只用它**判断"装没装"（读文件，不读注册表、不 spawn、不新增依赖）。`uninstall.ps1` 删除它。

**形状以实现为准**（队长 2026-09-24 裁决，别动已实测的写盘路径）：`install.ps1` 用 `ConvertTo-Json -Compress` 写出**单行** JSON，
键序固定为 `version, aumid, displayName, scheme, wscript, powershell, pluginDir, installedAt`（`[ordered]@{}`），
值里的反斜杠按 JSON 规则转义成 `\\`（上面那块就是这么读的），且**无 BOM**（`UTF8Encoding($false)`）——主机用 `JSON.parse` 读它，BOM 会让解析抛错。

---

## §6 设置项（task item 6）

- **字段名**：`nativeToast`（加入既有命名空间 `approval-chime` 的 schema：`z.boolean().default(false)`，
  与 `dsh-approval-chime/lib/index.js:311-330` 的既有字段并列，`DEFAULTS` 加 `nativeToast: false`）。
  **关态语义（队长 F2 裁决）**：开关关闭时，`/answer` 与 `/revoke` 也各有一道与 `POST /` 同形的关闸 ——
  一律回 `200 {"ok":true,"state":"skipped","reason":"disabled"}` 且**零副作用**（不读答案文件、不写文件、不撤通知、不扫目录）；
  关态下 **不是** 404，客户端的"收到任何 `skipped` 就放弃该 token"规则因此对三条子路由同样成立（见 §5、§8）。
- **默认值**：`false`（**必须默认关闭**）。客户端 `FALLBACK`（`lib/client.js:168`）同样加 `nativeToast: false`，
  这样 describe 之前的那一帧也是关闭状态。
- **UI**：在**同一个** `ChimeSection` 里，紧跟在既有 `enabled` 开关行（`lib/client.js:2477-2514`）之后新增一行开关，
  复用完全相同的 `dacRow`/`dacToggle`/`dacSwitch` 结构与 `role="switch"` 语义；写入走既有 `commit({nativeToast: next})`（`lib/client.js:2310-2334`）。
  开关行下面追加一行只读状态文案（数据来自 `GET /api/approval-chime/native-toast`，失败时显示"未安装"）。
- **新增字典键**（`DICT.zh` / `DICT.en`，两边 key 集合必须一致）：
  `nativeToast` = `待审批时弹 Windows 系统通知（带「接受 / 拒绝」按钮）` / `Show a Windows notification while an approval waits (with Accept / Reject buttons)`；
  `nativeToastHint` = `只在 DSH 窗口不在前台时弹；点通知按钮与在页面里点等价。需先安装 deploy/native-toast/install.ps1。` /
  `Only when the DSH window is not in the foreground; the buttons are equivalent to the in-page ones. Install deploy/native-toast/install.ps1 first.`；
  `nativeToastOff` = `未启用` / `off`；`nativeToastNotInstalled` = `未安装（通知注册缺失）` / `not installed`；
  `nativeToastReady` = `已就绪` / `ready`；`nativeToastUnsupported` = `本机不支持（找不到 powershell.exe）` / `unsupported on this machine`。

**关闭时行为必须与今天逐字节一致** —— 逐条可检：

1. 设置文档**不出现**新键：默认值只在内存里解析，`settings.yaml` 字节不变（与 `enabled/volume/tone/custom` 的默认值同一条路径）。
2. 客户端**一次请求都不发**：只有 `nativeToast === true` 时才构造对 `/api/approval-chime/native-toast` 的 `fetch`（源码级可检：字符串只出现在该分支里）。
3. 主机半**不 spawn 任何子进程、不读回填目录、不读注册表、不读标记文件**（只注册路由；路由被调用才回 `skipped/disabled`）。
4. 既有能力零改动：提示音、音频路由、会话覆盖路由、待审批观察（**⚠️ rev-27：现观察 `sessionStatus`；0.1.7 之前那个 `pendingInteractions` 成员由适配器回退**）、审批面板与审批瀑布全部保持当前行为与当前字节。
5. 安装是**用户显式动作**（§1.5 的两条命令），默认关闭时注册表、协议、开始菜单、回填目录都不会被创建。
6. 卸载：删协议键、删 AUMID 键、删 `installed.json`、删回填目录、`History.Clear('Dsh.ApprovalChime.NativeToast')`（清掉自己留在操作中心的通知）。

---

## §7 生命周期：tag/group、解决后移除、重启残留（task item 7）

- **token 1:1 对应一次审批实例**：客户端在"快照里出现一个新的 `kind === 'approval'` 的 key"时铸一个 token，
  内存里记 `token → key`。**tag/group 由这个 token 生成**：
  - `group = "dsh-approval-chime"`（固定；同一 group 的通知在操作中心里归在一起）；
  - `tag = "appr-" + token[0..10]`（**恰好 16 字符**）。截断是为了跨版本安全：`ToastNotification.Tag` 在 15063 之前上限 16 字符、之后 64（[文档](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotification.tag?view=winrt-26100)），16 字符在任何 build 上都合法。
  - **不用** DSH 的 `approval:<n>` 原串做 tag：那个计数是**每个标签页各自从 1 开始**的（`dsh-client-ui-approval/lib/client.js:112,141-142`），
    两个标签页会撞同一个 tag 而互相覆盖通知；token 由客户端每次铸新，天然唯一。
- **`ExpirationTime = 弹出时刻 + TTL`**，Windows 超过这个时间自己会把通知从操作中心撤掉。
- **解决后移除**：主机在**消费回填答案**时（§5.2 的 `answered` 分支）执行
  `History.Remove(tag, group, "Dsh.ApprovalChime.NativeToast")`，并删除该 token 的全部主机侧记录。
  客户端在交互从快照里消失（页面里已被点、或 aborted）或窗口回到前台时，对每个仍活着的 token 调 `revoke`（§5 的 revoke 路由），主机同样撤通知。
- **重启后残留**：主机**不做清屏**，只扫目录（过期文件删除）。理由：启动时清屏需要一次 PowerShell 调用，会污染"关闭时零动作"的承诺，
  而且会连带删掉"已写好但还没被取走"的新鲜答案。残留物由 `ExpirationTime` 自愈（≤10 分钟）。
  重启后点一条**旧**通知：token 未知 → 激活器拿到 404 → `exit 3` → 什么都不发生（fail-closed，见 §8）。
- **页面刷新**：token 只存在页面内存里，刷新即丢。此时主机侧记录仍在、通知仍在；用户点它 → 主机**会**写下答案文件（token 仍活着），
  但没有客户端认领 → 文件在 TTL 后被动扫掉。**不会**误答任何审批（`key` 已经不在任何快照里）。

**客户端 token 状态机**（每个 token 恰好一条记录，`token → key`；结束即删除记录）：

```
new ──(窗口不在前台)──> raised ──┬─ GET /answer 每 1000 ms
 │                              ├─ answered  → 用 key 查当前快照 → 有就 answer(answer)；结束
 │                              ├─ consumed   → 结束
 │                              ├─ 404        → 结束
 │                              ├─ 交互从快照消失 / 窗口回到前台 → revoke；结束
 │                              └─ 10 分钟 TTL → revoke；结束
 └──(窗口在前台)────────> 不创建记录（一次请求都不发，见 §12(d)）
```

`raise` 回 `skipped`（disabled / not-installed / no-powershell / raise-failed）同样直接结束，不进轮询。

---

## §8 fail-closed 矩阵（task item 8）

| 情况 | 主机 | 客户端 | 用户可见结果 |
| --- | --- | --- | --- |
| **无 PowerShell**（绝对路径不存在 / spawn 失败 / 退出码≠0 / 5 秒超时） | `200 {"state":"skipped","reason":"no-powershell"}` 或 `"raise-failed"`，不抛 500 | 记一个诊断计数，**立刻放弃该 token**（不再轮询/撤销） | 没有通知；**页面审批面板照旧**，照旧响提示音 |
| **通知被关**（用户关了该 AUMID 的通知，或专注助手拦住） | `Show()` 不报错、也不知道被拦；token 照常登记 | 轮询到 TTL（10 分钟）上限 → 发一次 `revoke`（撤不到也算成功：`Remove` 是 best-effort，失败只记 warn，不影响任何答案）→ 放弃该 token | 没看到通知；页面照旧可点；10 分钟后不再占用资源 |
| **token 过期** | `POST /answer` 与 `GET` 一律 404；不写文件、不改状态；目录清扫顺带删除过期文件 | 收到 404 → 停止该 token 的轮询 | 点了旧通知没有任何反应 |
| **答案文件过期/损坏，但 token 仍活** | 文件被删、答案永不投递；`GET /answer` 回 `200 {"state":"pending"}`（**不是** 404） | 继续轮询直到答案、TTL 或 token 过期 | 点了旧通知没有任何反应 |
| **开关关闭** | `/answer` 与 `/revoke` 回 `200 {"state":"skipped","reason":"disabled"}`，零副作用（不读文件、不写文件、不撤通知） | 收到 `skipped` → 放弃该 token | 与今天逐字节一致 |
| **未知 key**（答案到手但快照里已经没有这个 key） | 与主机无关（主机不认识 key） | **丢弃**，不调用 `answer()` | 页面里那次审批早已被页面答掉；不会出现第二个答案 |
| **重复答案**（同一 token 再点一次） | `409 {"state":"already-answered"}`，先到的答案**不变**；文件不覆盖 | 不涉及 | 只有一个答案生效 |
| **未安装**（`installed.json` 缺失/版本不符/AUMID 不符） | `200 {"state":"skipped","reason":"not-installed"}`，零副作用 | 立刻放弃该 token；设置页状态行显示 `未安装（通知注册缺失）` | 没有通知；页面照旧 |
| **开关关闭** | 路由存在但一律 `skipped/disabled`，零副作用 | 根本**不发请求**（§6 第 2 条） | 与今天逐字节一致 |
| **路由整体不可用**（profile 无 webServer） | 沿用既有降级：`report(warn)` 并跳过注册，不影响启动 | `fetch` 失败 → 诊断计数 | 与今天一致（提示音不受影响） |

全局不变量：**任何一条失败路径都不得产生一个"答案"**；答案只能来自"活的 token + 主机已签发的审批实例"，且永不自动接受。

---

## §9 裁决：点击后由谁去"回答"审批（task item 9）

**裁决：采用 (a) —— 客户端公开回答方法。** 通知按钮与页面按钮最终调用**同一个公开方法**。

### (a) 证据（已安装 DSH 包内的 file:line）

- 客户端已经注入 `uiSession`（`dsh-approval-chime/lib/client.js:3293`），并且**已经在读** `ctx.uiSession.pendingInteractions`（`lib/client.js:1610-1611`）。
- `pendingInteractions` 是**公开**成员：`readonly pendingInteractions: HostObservable<SessionPendingInteractionSnapshot>`
  （`dsh-client-ui-session/lib/types/client/index.d.ts:96`；快照类型 `ReadonlyMap<SessionId, SessionPendingInteraction>`，`:29`），
  实现 `getSnapshot()` / `subscribe(listener) => disposer`（`dsh-client-ui-session/lib/client.js:83-91`），
  值是 `PendingApproval`（`lib/client.js:213-227` 组装，`dsh-client-ui-approval/lib/client.js:140,142` 打上 `kind = "approval"` 与唯一 `key`）。
- 公开回答方法：`PendingApproval.answer(outcome: ApprovalDecision): Promise<void>`
  （`dsh-client-ui-approval/lib/types/client/contract/slots.d.ts:69`），`ApprovalDecision = 'allowed-once' | 'rejected'`（同文件 `:43`）。
- **页面按钮就是这么调的**：`dsh-client-ui-approval/lib/client.js:49-54`（`answer()` → `pending.answer(outcome)`）与 `:85-95`（两个按钮分别传 `"rejected"` / `"allowed-once"`）。
  所以"点通知上的 接受/拒绝"＝"在网页里点那个按钮"，是函数级同一路径，不是"等价实现"。
- 一次性保护也是现成的：`finish()` 在已结算时抛 `pending approval <key> is already settled`
  （`dsh-client-ui-approval/lib/client.js:199`）→ 客户端必须先查当前快照，找不到该 key 就丢弃（§8 的"未知 key"行）。
- 该路线**不碰审批瀑布**：插件不注册任何 `approval/request` 监听（`dsh-approval-chime/lib/client.js:61-74` 记录了理由，
  `verify/waterfall.test.mjs` 有静态断言），新代码同样不许引入那个事件名。

### (b) 为什么"主机侧注册 answerer 参与审批瀑布"不行

(b) 在 DSH 里**确有先例**，所以必须给理由而不是给偏好：

- 主机侧 answerer 的样板：`dsh-acp/lib/index.js:1115-1138` —— `ctx.on('approval/request', (request, next) => …)`，返回 `'allowed-once' | 'rejected' | 'cancelled'`。
- 瀑布派发与 fail-closed 默认值：`dsh-user-approval/lib/index.js:179`（`ctx.waterfall(scopeTarget(req.agent, req.agent), 'approval/request', req, () => Promise.resolve('unavailable'))`）。
- 事件契约：`dsh-tool-cordis/lib/index.js:5147-5149`。
- 网页面板靠的就是同一条瀑布的**转发支路**：`dsh-api-remotes/lib/index.js:17-25`（`{event:'approval/request', mode:'waterfall'}`）+ `:108-131`，
  客户端 `ctx.remote.$on("approval/request", …)`（`dsh-client-ui-approval/lib/client.js:282-284`）。

为什么在本功能里不成立：

1. **瀑布只有"应答"或"委派"两个出口**。主机先应答 → 抢在网页面板之前，面板根本不会出现（就是"劫持审批瀑布"，本轮明确禁止）；
   主机先 `next()` 委派 → 面板随即把这次请求结算掉，之后点通知**再也无法回答**（`answer()` 的 promise 已结算，`:199` 会抛），
   通知按钮变成死按钮。二者没有第三种出路。
2. **主机不知道"窗口是否在前台"**。本页的触发判据是浏览器 DOM 的（§12），主机侧没有任何等价信号；让主机参与决定"要不要弹/要不要答"必然错。
3. **主机侧"等用户点通知"= 把一个 Promise 挂在审批瀑布里**，会改变面板显示时机、abort 语义与超时行为 —— 审批时序被插件改写。
4. 本插件主机半目前只 `inject = ['settings']`（`dsh-approval-chime/lib/index.js:41`），刻意不参与审批决策；加 answerer 会把这条边界拆掉。

结论：**按钮 → 客户端公开 `answer()`**；(b) 只在"没有网页那一半"的场景（如 ACP）才合理。

---

## §10 承载者（task item 10）

**承载者必须是 Windows 系统通知**：`Windows.UI.Notifications.ToastNotificationManager` + **本产品自己的 AUMID**
`Dsh.ApprovalChime.NativeToast`。具体 API（`raise.ps1` 内）：

```powershell
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml([IO.File]::ReadAllText($XmlPath, [Text.Encoding]::UTF8))
$toast = New-Object Windows.UI.Notifications.ToastNotification $xml
$toast.Tag = $Tag; $toast.Group = $Group
$toast.ExpirationTime = [DateTimeOffset]::Now.AddMinutes(10)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($Aumid).Show($toast)
```

**toast XML 必须逐字节长这样**（下面 `TOKEN` = 32 位小写 hex、`PORT` = 十进制端口，由主机替换；两行 `<text>` 按 §0 的第 1/2 行规则替换；`reason`/`toolName` 必须做 XML 转义 `& < > " '`）：

```xml
<toast useButtonStyle="true"><audio silent="true"/>
  <visual><binding template="ToastGeneric">
    <text>DSH 需要你的授权</text><text>工具 bash 请求越权执行</text>
  </binding></visual>
  <actions>
    <action content="接受" arguments="dsh-approval-chime://answer/?t=TOKEN&amp;a=allow&amp;p=PORT" activationType="protocol" hint-buttonStyle="Success"/>
    <action content="拒绝" arguments="dsh-approval-chime://answer/?t=TOKEN&amp;a=reject&amp;p=PORT" activationType="protocol" hint-buttonStyle="Critical"/>
  </actions>
</toast>
```

- `<audio silent="true"/>` 直接跟在 `<toast …>` 之后（队长 F3 裁决，2026-09-24）：**本功能不新增任何声音**，插件的提示音是唯一可听信号，
  会话静音/音量必须真的管住声音。摆放位置**实测**（见 §0.2 A9）：三种顺序 `LoadXml` + `New-Object …ToastNotification` 都不抛，
  且 `<audio silent="true"/>` 会原样留在 Action Center 的读回内容里；本页取"紧跟开头标签"这一种，实现按此逐字节生成。

- `activationType="protocol"` 与 `arguments` 的成文定义见 [action (Toast XML Schema)](https://learn.microsoft.com/en-us/uwp/schemas/tiles/toastschema/element-action)；
  `useButtonStyle` / `hint-buttonStyle` 见 [toast (Toast XML Schema)](https://learn.microsoft.com/en-us/uwp/schemas/tiles/toastschema/element-toast)。
- `<toast>` 上**没有** `activationType` 属性（实测：写上会被 `LoadXml` 直接拒掉，`0xC00CE56D`）；`<toast>` 可以带 `launch`，本页不用（正文点击不激活，见 §15）。
- 不用 `scenario`（见 §13）。
- **机检方式（本页指定，且已实测可行）**：

```powershell
[Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory('Dsh.ApprovalChime.NativeToast')
```

必须能读回 ≥1 条，且 `item.Content.GetXml()` 里同时含 `a=allow`、`a=reject`、`接受`、`拒绝` 与标题文字；
撤销用 `History.Remove($tag, $group, 'Dsh.ApprovalChime.NativeToast')`（[Remove 文档](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotificationhistory.remove?view=winrt-26100)），清空用 `History.Clear(AUMID)`。
（实测：这两个调用存在且生效；对**未注册** AUMID 也照样能读回/清除。）

---

## §11 禁止的替代做法（task item 10 的后半）

| 禁止 | 为什么不行 |
| --- | --- |
| 页面内自绘浮层 / DOM toast | 不是系统通知：不进操作中心、`History.GetHistory(AUMID)` 永远为空（机检直接失败），而且**窗口不在前台时它正是看不见的那个东西**——与本功能的唯一场景完全相反。 |
| HTML5 `Notification` API | 承载者是**浏览器进程**：头部显示浏览器名与图标，AUMID 是浏览器的，不是产品 AUMID；更要命的是 **Windows 上不支持 `actions`**（通知按钮只在 Android 上实现），做不出「接受 / 拒绝」两个按钮；还要先拿浏览器权限。 |
| DSH 自己的提示条 / 页面内 banner | 与第 1 行同理：在页面里，窗口隐藏时不可见，且不受本插件控制。 |
| `MessageBox` / `msg.exe` | 阻塞式模态框：会卡住被调用的脚本、抢焦点、不进操作中心、按钮语义（确定/取消）与审批答案无法一一对应；`msg.exe` 在家庭版上还常常不存在。两者都不是"系统通知"。 |
| 用 Windows App SDK 的 `AppNotificationManager`（未打包应用的现代路线） | 需要 `WindowsAppRuntime` 运行时（= 引入依赖），本轮禁止；本页走的是系统自带的 `ToastNotificationManager` + 自己的 AUMID 注册。 |
| 复用 `powershell.exe` 自己的 AUMID | 头部会显示「Windows PowerShell」，违反 §1.2 的可见名字要求（§15）。 |

---

## §12 触发条件（task item 12）

**通知只在 DSH 窗口不在前台时弹。** 以下五条全部写死：

**(a) 唯一触发源是"客户端那一次 HTTP 请求"**。主机**不得**自己订阅审批事件、不得有第二个触发点：

- 主机半源码里**不得出现** `approval`、`approval/request`、`waterfall` 之类的订阅；主机侧只有一个入口：
  收到 `POST /api/approval-chime/native-toast`（§5）。静态检查：主机半不 import 任何审批相关服务，`inject` 仍只有 `['settings']`。
- 客户端半沿用**已有的**观察源 `ctx.uiSession.pendingInteractions`（`dsh-approval-chime/lib/client.js:1609-1707` 已经在做按 `key` 去重的 diff），
  在这条 diff 上多接一步"窗口不在前台 → 发一次请求"。**不注册** `ctx.remote.$on('approval/request')`（保持 `verify/waterfall.test.mjs` 现有断言为绿）。

**(b) 客户端判据（推荐）**：

```js
const foreground = document.hidden === false && document.hasFocus() === true;
if (!foreground) { /* 发一次 POST，每个 key 只发一次 */ }
```

逐场景的确切结果：

| 场景 | `document.hidden` | `document.hasFocus()` | 结果 |
| --- | --- | --- | --- |
| 别的应用在前台（DSH 窗口还在后面） | `false` | `false` | **弹** |
| DSH 最小化 | `true` | `false` | **弹** |
| 切到浏览器别的标签页 | `true` | `false` | **弹** |
| 并排显示但未聚焦 | `false` | `false` | **弹** |
| DSH 在前台且拥有焦点 | `false` | `true` | **不弹** |

退化方案（只在目标浏览器上 `document.hasFocus()` 不可靠时才用）：判据收缩为 `document.hidden === true`，
即"只要窗口可见就不弹"（更保守：不会给并排用户弹通知）。**默认采用上面的两条件判据**。

**(c) 窗口回到前台要撤通知**：客户端监听 `visibilitychange`（→ 可见）与 `window` 的 `focus`，对每个仍活着的 token 调
`POST /api/approval-chime/native-toast/revoke`（§5）。revoke 会**先**取走已经存在的答案（`state:"answered"` 时把答案交给客户端处理），
**再**撤掉通知 —— 所以"先点了接受、随后窗口回到前台"这个竞态不会丢答案。

**(d) 判据可证伪**：写清验收动作 —— **前台且有焦点时，客户端一次请求都不发**（不是"发了但主机不弹"）。
机检：在 `window.fetch` 上打桩（或数路由命中数），把页面置于前台+焦点，触发一次审批，断言
`/api/approval-chime/native-toast` 的调用次数为 **0**；再把窗口切到后台重测，断言为 **1**。

**(e) 固定行为、不做开关**：不加任何"前台也弹"之类的次级开关；关闭整个功能的唯一开关是 `nativeToast`（§6）。

---

## §13 待用户拍板的小选项：专注助手 / DND 时是否硬穿（task item 11）

**显式二选一**（本页冻结推荐项 = 选项 A；用户若要改，只需按 B 改一个字符串）：

- **A（推荐，本页冻结）**：`<toast>` 上**不写 `scenario`**。DND/专注助手开着时通知会被压掉 → 降级为**既有提示音**（本来就会响，本功能不改变它）。
- **B（备选）**：`<toast scenario="urgent" …>`，可穿透专注助手（[toast 文档](https://learn.microsoft.com/en-us/uwp/schemas/tiles/toastschema/element-toast)：
  "urgent … can break through Focus Assist"，但**用户仍可在通知设置里关掉**）。

推荐 A 的理由：审批不是闹钟/来电，穿透 DND 属于越权打扰；A 下的最坏结果是"没弹通知"，而页面与提示音照旧，功能仍然可用；
B 会把"系统级打扰"变成默认值，且用户仍能关掉 → 收益不确定、代价确定。**A/B 都不影响 §8 的任何 fail-closed 行为。**

**无论 A 还是 B，本功能都不新增任何声音**（队长 F3 裁决，2026-09-24）：toast 自带声音被 `<audio silent="true"/>` 关掉（§10），
可听信号只有插件自己的提示音，因此设置页的静音/音量真的管住声音；DND 挡掉通知时同样只剩提示音，不会出现"响两声"。

---

## §14 归属与落点（task item 14）

**(a) 所有新文件都在 `dsh-approval-chime/` 下**：`lib/index.js`（主机半）、`lib/client.js`（客户端半）、
`deploy/native-toast/{install.ps1,uninstall.ps1,raise.ps1,answer.ps1,activate.vbs,selftest.ps1}`、`verify/`（测试）。
**不新建插件、不改 DSH 自身任何一个包、不碰任何其它插件**（本页引用的 DSH 包只作为证据被引用，不作为改动对象）。

**(b) 新开关渲染在同一个 `settings.section` 注册上**（rev-7 起的那个，`dsh-approval-chime/lib/client.js:3402-3413`）：
`name: 'settings.section'`、`id: 'approval-chime'`、`order: 16`、`label: navLabel`、`locale: NS` —— **五项全部不变**。
不得新开设置分区、不得回到「插件 → 插件配置」那张卡（rev-7 已把它移走，`lib/client.js:85-109` 记录了原因）。

**(c) 可机检判据（一句话）**：该分区页的注册仍然**恰好一条**（`slotRegistrations.filter(e => e.options?.name === 'settings.section').length === 1`，
且 `id@order === 'approval-chime@16'`，既有断言在 `verify/client-half.test.mjs:326-341,376` 与 `verify/waterfall.test.mjs:67`），
新控件出现在**同一页**的渲染树里（`ChimeSection` 的渲染输出里能查到 `nativeToast` 那一行的 label/aria-label），
并且「插件」页里仍然**没有**本插件。

---

## §15 本页不声称的事

1. **不声称"窗口被别的应用盖住"能识别**：`document.hidden` 只看"可见性"，与 Z 序无关。被别的窗口完整盖住但没最小化时，
   `hidden === false`、`hasFocus() === false` → 判据仍会**弹**（这符合 §12 的场景表：未聚焦就弹，属于有意行为，不是漏洞）。
2. **不声称两个标签页同时开着时只有"不可见"的那个会请求**：两个标签页各自跑自己的 `uiSession` 快照与自己的 token，
   都能各弹各的通知；"结果是会弹"是已知边界，不做跨标签页协调、不共享 token。
3. **不声称通知按钮一定画在折叠的横幅上**：按钮画在横幅还是展开后才出现，是 Windows 的渲染选择；契约保证的是
   两个 `action` 元素与它们的 `arguments` 正确（**这一点由 §10 的 `History.GetHistory()` 机检覆盖**），不保证视觉摆放位置。
4. **不声称通知头部名字已在 25H2 上亲眼验证**：本会话无法写 HKCU（§1.5 实测），名字来源是 §1.3 的间接证据；
   安装后必须跑 §1.5 的 `selftest.ps1` 做一次人工确认。
5. **不声称点了通知正文会有反应**：`<toast>` 上不写 `launch`，正文点击不激活任何东西（只有两个按钮走协议激活）。这是有意的 fail-closed。
6. **不声称通知名字会跟随 UI 语言**：`DisplayName` 是系统级固定字符串 `DSH 通知提醒`（安装时写一次），不随设置页的中英文切换而变。
7. **不声称在 DSH 沙箱内的工具进程里能安装**：实测沙箱内的 `pwsh` 写 `HKCU\Software\…` 被拒（`Access is denied`，`reg.exe` 同样被拒），
   所以 `install.ps1`/`uninstall.ps1` 必须由用户在**普通** PowerShell 里跑；这也正是"安装是显式用户动作"的一部分。
8. **不声称并发写与发布在"没有硬链接的卷"上仍然安全**（rev-25 返修 G1，队长 2026-09-24 裁决）：答案文件的发布用 `link` 拿内核保证的
   `EEXIST`（先到的答案不变、文件不覆盖，`409 already-answered`），但**卷不支持硬链接时退回 `rename`**，那条路径下同一 token 的两次
   同 tick 点击**可能互相覆盖**——这是最后手段，只保证这种卷上功能可用。本机（NTFS）实测走的是 `link`，读数与 20 轮并发写日志见
   `.scratch/native-toast-probe/r25-t14-evidence.out`（E1 行）与 `.scratch/native-toast-probe/r25-t14-concurrent-write.out`（0/20 损坏）。
9. **不声称能防同一用户下的其它进程**（队长 F1 裁决，2026-09-24）：通知的 `arguments`（含 token）在 Action Center 里可读、
   回填目录对该用户可读可写，因此**任何同用户进程都能为一条活 token 伪造一次答案**。DSH 自家的 API 另有 Host/Origin + 浏览器鉴权栅栏，
   本路由没有那一层（与既有音频/会话两条路由同一姿势）：它只接受 32 位小写 hex token、只接受两个答案枚举值、只写用户 profile 内的文件，
   但**不**抵御同一用户上下文里的伪造。第 7 条与本条合起来就是这条回填通道的边界。
10. **不声称主机半会主动清理操作中心里的历史通知**：只撤自己那一条（`History.Remove`）与卸载时 `History.Clear`；别人的通知一概不碰。
11. **不声称"新建插件/新开设置分区"也算一种做法**：本功能只在 §14 划定的落点里实现，其余落点一律视为不合格。
12. **不声称把开关从"开"拨到"关"会立刻撤掉屏幕上那条通知**（客户端半实测记录 + 队长裁决，2026-09-24）：客户端 `nativeTeardown()`
    只丢记录、按 §6 第 2 条**不发 revoke**，所以已经弹出的那条最长还会待 10 分钟（`raise.ps1` 的 `ExpirationTime`）；
    这期间它的按钮点了**没有任何反应**（关态关闸 ⇒ `skipped/disabled`，fail-closed）。

---

## §16 契约缺口补记（rev-25 实现时确定）

本节的每一条都是"实现时才发现、`§0–§15` 正文不该被改写的缺口"，按 `docs/rev25-收尾清单.md` 的处置决定登记：

1. **`<audio silent="true"/>` 是设计声明，不是听感实测**：静音设计依据的是微软 toast schema 的成文默认值（省略 `<audio>` 即放系统音）。
   本机**没有做听感测量**（PowerShell 的 WinRT 投影里读不到 `Audio` 属性）。因此 §13 的"本功能不新增任何声音"是**设计声明**，
   与 §15 的其余"不声称"同级；要把它变成实测事实，需要在真机上用耳朵确认（`selftest.ps1` 会弹一条真通知）。
2. **§0.2 A9 的独立复现件与一处读数陷阱**：A9 的四种摆放读数来自 `.scratch/native-toast-probe/audio-static.ps1`（早期版本，见下条陷阱）
   与 `.scratch/native-toast-probe/r25-t14-evidence.mjs` 的 **E2 行**（正读：`@(History.GetHistory(...))` → count=1、first tag=`a9audio`、
   `has_audio_silent=True`）。**陷阱**：PS 5.1 里 `$history[0]` 对"单项集合"会做单元素向量展开，早期件因此打印
   `has_audio_silent=False`、`history_count=1 1 1`——**那一行是陷阱的产物，不是读数**；正确读法是把结果先 `@()` 成数组再索引。
   该早期件与其输出（`audio-static.ps1` / `audio-static.out`）按"不删历史"的规矩保留原样，由本条加注。
3. **独立层归档由后续任务执行**：`.scratch/native-toast-probe/audio-static.*` 与 `.scratch/a9-probe/*` 复制进
   `verify-independent/_raw/r25-evidence/` 的动作属于独立层（`verify-independent/**` 不在实现任务范围内），
   本条只登记**待归档清单**：`audio-static.ps1`、`audio-static.out`、`audio-static.err`、`r25-t14-evidence.mjs`、`r25-t14-evidence.out`、
   `r25-t14-concurrent-write.mjs`、`r25-t14-concurrent-write.out`、`a9-probe/{gen.mjs,run.ps1,run2.ps1,count.ps1,clean.ps1,v1.xml,v2.xml,v3.xml}`。
4. **引用了旧编号的文件**：`docs/native-toast-人工验收.md` §4.8 写的是"冻结页 §15 第 8 条"（同用户进程伪造那条）。§15 重编号后那条是
   **第 9 条**，该文件的引用需要同步——它在 `docs/**`（实现任务范围外），由文档归属任务处理。
5. **`toolName` / `reason` 的文本上限 = 200 字符（rev-25 收尾 t4 补记：原页没有这条规定）**：§3.2 与 §4 给的是字段名与形状，
   **没有**给这两个自由文本字段的长度上限。实现取 **200 字符**，落在 `lib/native-toast.js` 的 `NATIVE_TOAST_TEXT_LIMIT = 200`
   （`toolName` 与 `reason` 共用这一个常量，截断按**字符**不按字节，所以中文理由不会被切在半个码点上）。
   依据是 t7 的真机读数：**500 字符输入被截到恰好 200**，截断后的 XML 仍 `LoadXml` 通过、`ToastNotification` 构造不抛；
   `verify/native-toast.test.mjs` 把这个值钉住。**这是实现时确定的上限，不是原契约的规定** —— 要改它就得先改这条补记。
6. **§0.2 A9 的独立复现件已归档（t4）**：队长 2026-09-24 用**实现真正生成的 XML**（`buildNativeToastXml`）复现四种摆放，
   读数见 §16.2；原件（`gen.mjs`、`run.ps1`、`run2.ps1`、`count.ps1`、`clean.ps1`、`v1.xml`、`v2.xml`、`v3.xml`）已复制进
   `verify-independent/_raw/r25-evidence/a9-order-probe/`（`.scratch/a9-probe/` 原目录保留不删，按"不删历史"的规矩）。
   §16.3 的**待归档清单**同批落地：`_raw/r25-evidence/` 下新增 `audio-static.ps1`、`audio-static.out`、`audio-static.err`、
   `r25-t14-evidence.mjs`、`r25-t14-evidence.out`、`r25-t14-concurrent-write.mjs`、`r25-t14-concurrent-write.out`，
   外加 §H 点名的四个 `*.ps1`（`audio-static`、`probe2-actions`、`probe3-matrix`、`probe4-ascii` —— "AUMID 无需快捷方式"
   与"沙箱写不了 HKCU"两条结论的唯一一手证据）。**原件都留在 `.scratch/native-toast-probe/`。**
7. **§16.4 那条引用已由 t16 同步完毕**：`docs/native-toast-人工验收.md` §4 第 8 条现在指向**冻结页 §15 第 9 条**（同用户进程伪造那条），
   两处悬空自引用（`见 §7`）改为 `见 §4 第 9 条` / `见 §4 第 5 条`；`probe-21` 里新增一条**动态**断言：运行时从本页数出 §15 的条目序号
   再比对页面引用，所以这条不会随着本页重编号而悄悄失效。
8. **H1 裁决 (b)：读侧注释不再加落盘件指针（用户 2026-09-24 裁决，队长关闭）**：`lib/native-toast.js:531-537`（读侧）以及同款模式的
   `:237-240` 里那句 `MEASURED` **没有**落盘件指针。**为什么可以接受**：同一个事实（Windows 上 `rename` 会静默替换目标 ⇒ 单赢家发布改用
   `link`，`EEXIST` ⇒ 409）已经由 `writeAnswer` 的注释（`:459-466`）与 §15 第 8 条（`:664-667`）**两处**引用同一份落盘件
   `.scratch/native-toast-probe/r25-t14-evidence.out`（308 B：E1a `rename` 静默替换 / E1b `link` `EEXIST` / E2 真通知回读 `True`）。
   **产品字节零变化、不开返修轮**；这条是**队长按用户裁决关闭**的，不是复核者静默放过 —— t15 的 needs_revision 与关闭过程记在
   `docs/变异覆盖与残留红.md` §24。

---

## 来源标签（2026-10-02 重建，**非事故前的最终字节**）

本文件由**事故前的上一版**恢复而来，不是丢失的那一版：

- 本页正文 = `.scratch/r29-release/archive/freeze-page-before.md` 的**逐字节副本**
  （63257 B / sha256 `7cea2db20a5eb9d658bfbf4794e83915bf3781a909cfeaa78f014fc260561574`）。
- 丢失的是 rev-29 的最终版：**65195 B / sha256 `2c1e03911c5fa644693f3d12791e703629d09ae590b7c9278f683d576fee63d5`**，
  即本页再加上 rev-29 t36 的那次改动（当时实测 **18 行**：§16.8 的指针改指归档副本 + 新增第 9 条路径映射 +
  修掉 rev-27 banner 里一处悬空引用 `§12 第 4 条` → `§12 (a)`）。
- **那 18 行的改动无法逐字节复原**（原文件已不存在，本会话只保留了它的一部分文本），因此**没有**被重新施加；
  本页在此如实登记「§16.9 的第 9 条路径映射在事故中丢失」，而不是编一份看起来一样的文字。
- 对本页的一切哈希断言（例如 probe-21 的 `REVISION_ANCHORS`）都应按**本文件的当前字节**重锚，并在记录里写明
  「锚指向的是重建件，不是 rev-29 原件」。
