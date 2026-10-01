# rev25 · 安装器返修（H2 / H3）

> ⚠️ **重建件，不是事故前的原始字节。**
>
> 2026-10-01 的 `robocopy /MIR` 写穿事故删除了 `docs\`；本文件事故前 **27935 B**，无任何副本（已按文件名在工作区与 `~/.dsh` 搜索确认）。
> 重建来源：`CHANGELOG.md` 的 rev-25 段（H2/H3 的完整始末）、`deploy/native-toast/` 的现存脚本（它们是修复后的产物）、幸存的 `verify/native-toast.test.mjs` §12 的 22 条脚本内容断言。
> **这些来源钉住的读数、命令、哈希是硬的；原始措辞与排版不可知**，缺口在文末如实列出。

## 1. H2 —— 用户先踩到的那一个

* **现象**：用户在自己机器上安装时报 `[FAIL] … Invalid syntax`。
* **根因**：旧实现用 `reg.exe add` 把值拼进**一条命令行**；带空格与中文的键路径在引号拼接处被拆坏（PowerShell 会给传给原生程序的每个参数**重新加引号**）。后果是 `shell\open\command` **没建**。
* **为什么自检没抓到**：当时 `selftest.ps1` 只有四项，且只查"它自己那份读数" ⇒ 在**半安装**状态下**仍然 PASS**。
* **修法**：
  1. 改成**纯 PowerShell provider 写值**（`New-ItemProperty`，不再拼 `reg.exe` 命令行）；
  2. **每写一行就读回**（provider 读者 + 原始 .NET 读者**两个**都问），不一致就 `[FAIL]` 并打印实际读到的值；
  3. `selftest.ps1` 从**四项加到六项**：scheme 键在 / 默认值 / `URL Protocol` / `command` / AUMID 显示名 / marker —— 六个方向各自都能单独变红（9 例夹具，含 H3 与 H2 两种形状）。

## 2. H3 —— H2 的修复自己引入的回归

* **根因**：`New-Item -Force` 会**清空已存在键的全部值与子键** ⇒ 第二行写值摸掉第一行刚写下的 `(default)`；因为顺序是"先建键、再写默认值、再写 URL Protocol…"，**逐行读回也抓不到**（读回发生在 wipe 之后）。
* **修法**：`Ensure-RegKey` **先 `Test-Path`、只在缺失时创建**（永不碰已存在的键）+ 默认值写的**候选链**（`(default)` 的写入路径按候选顺序尝试）+ **写后全量终检**（覆盖全部四个值，任一不对即整轮失败、退出非零）。
* **真机回读四值全对**：scheme `(default)`、`URL Protocol`、`shell\open\command`、AUMID `DisplayName`。

## 3. 现状（修复后的产物仍在盘上）

`deploy/native-toast/{install,uninstall,selftest,raise,answer}.ps1` + `activate.vbs`，加上 `tools/native-activate.mjs`（**该文件已随 `tools\` 丢失**，仅在本记录里被点名）。安装脚本今日仍带这些修复的全部痕迹：`Ensure-RegKey`、`Read-RegValue`（双读者）、`Set-RegValue`（候选链 + 读回比对）、`UTF8Encoding($false)`（标记文件无 BOM）、`final full check`。

## 4. 缺口

* 原文 27935 B；用户真机报错时的**原始截图**（`r25-h2-user-install-failure.png`）属 `_raw` 证据，**已丢失**。
* H2/H3 逐轮的完整时间线（谁在何时判定什么）只在摘要层面留下（见 `CHANGELOG.md`）。
