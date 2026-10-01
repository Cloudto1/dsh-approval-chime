# rev25 · 客户端半实测记录

> ⚠️ **重建件，不是事故前的原始字节。**
>
> 2026-10-01 的 `robocopy /MIR` 写穿事故删除了 `docs\`；本文件事故前 **13211 B**，无任何副本（已按文件名在工作区与 `~/.dsh` 搜索确认）。
> 重建来源：幸存的 `verify/client-half.test.mjs`（当时 168023 B / `0DE4ED37…`）、`CHANGELOG.md` 的 rev-25 段、以及 `verify/native-toast.test.mjs` 的 §3/§4/§7/§11。
> **这些来源钉住的读数、命令、哈希是硬的；原始措辞与排版不可知**，缺口在文末如实列出。

## 1. 四态实测（前台规则）

| 窗口状态 | native 请求数 |
| --- | --- |
| 前台且聚焦 | **0** |
| 隐藏 | 1 |
| 失焦 | 1 |
| 回前台 | 1（**只撤除**，不回答） |

合计 **0 / 1 / 1 / 1**。回前台的 `revoke` 与答题是两条不同动词，套件里各有断言。

## 2. 令牌与轮询

* 令牌：`crypto.getRandomValues` 取 16 字节 → 32 位小写 hex（**无 crypto 源时报 `unsupported`**，不静默降级）。
* 轮询：每 `NATIVE_TOAST_POLL_MS` 一次 `GET /native-toast/answer?token=…`；记录带 `timer` 标记、`createdAt/expiresAt`。
* 超时与清扫：token 过期即 404；答案文件过期**被清扫且永不投递**（token 仍 `pending`）。
* 撤销：批量上限 32/次，超出部分递归分批；`revokeAll(reason)` 用于回前台与诊断。

## 3. 计数器与诊断面

`diagnostics.nativeToast.state()` 给出：`enabled`、宿主上次判定（`status`/`error`）、`lastRevokeReason`、活 token 表，以及计数器 `attempts / raised / answered / dropped / revoked / skipped / failed / unsupported / blurs`。

## 4. 与套件的对应

`verify/client-half.test.mjs` 当时 **606** 条、`verify/native-toast.test.mjs` **376** 条（t26 修完仍是 376）；本轮客户端半新增 21 条钉住设置页分组（见 `rev25-通知开关分组.md`）。

## 5. 缺口

* 原文 13211 B；逐条实测的原始输出属 `_raw`，已丢失。
* 本页不含任何未在留存证据中出现过的数字。
