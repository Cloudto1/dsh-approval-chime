# `verify-independent\run-r13.ps1` 是**恢复件**（不是 rev-29 的原始字节）

> 采用日期：**2026-10-01** · 落盘者：仓库修复任务 **t5**（团队 `chime-repo-repair` 成员 `repairer`）
> · 决定：队长（已获用户批准）· 本文件与 `run-r13.ps1` 顶部的来源标签注释块是**同一件事的两处标注**

---

## 一句话

**这不是丢失的 rev-29 字节；它是 rev-28 时代的更早修订（取自 r29 release 归档的 .before-r29）。**

**本文件的精确 rev-29 版本已永久丢失。**

---

## 来源与读数（全部实测）

| 项 | 值 |
| --- | --- |
| 来源路径（只读归档） | `dsh-diag\preserved-r29-release-archives\verify-independent__run-r13.ps1.before-r29` |
| 原始尺寸 | **75082 B** |
| 原始 sha256 | **`3278BFD863A2851F0F3A05754EB559E15535B943A8B7593B2E7700155E8B7961`** |
| 采用日期 | **2026-10-01** |
| 落盘后尺寸 / sha256 | 76840 B / `21B373CB3AB6B1466D2C00DE9ECD00ED0072D9A5E0CCCA376D424293737A4C03`<br>（= 归档字节 + **1758 B** 的来源标签注释块） |
| 被它替换的旧版 | 工作区里由 `git checkout HEAD --` 还原出来的 **rev-24 版**：69517 B / `01B5DFE828610352D372331B6F12C0E2596B9849FA5BCCBE344E3CB8C65C9310` |
| 归档交叉核对 | `.scratch\r29-release\archive\verify-independent__run-r13.ps1.before-r29` 与上面那份**逐字节相同**（同一尺寸、同一 sha256）；`preserved-r29-release-archives\MANIFEST.txt` 记录的也是同一值 |

## 为什么用这一版、又为什么必须带标签

* **rev-29 版永久丢失**：2026-10-01 00:2x，一次 `robocopy /MIR`（**未加 `/XJ`**）沿 `.scratch\r29-verify` 里的 junction
  写穿了真实仓库，按 `/MIR` 的 purge 规则删除了 `lib\`、`verify\`、`verify-independent\`、`docs\`、`tools\`；
  `run-r13.ps1` 属已跟踪文件，被 `git checkout HEAD --` 还原成了 **rev-24** 版，**rev-25..rev-29 的未提交改动随之丢失**。
* **rev-28 版是最后一个已知全绿的 canonical runner**，比 rev-24 版显著更接近可用，所以采用它。
* 但它**不是**丢失的那一版字节。**若不带标签，后来者会误以为拿到了 rev-29 的原始 runner** ——
  这正是本文件与文件内标签块存在的原因。

## 可验证性（怎么证明「只加了一个标签」）

去掉文件开头那段来源标签注释块（前 **1758** 字节）后，其余 **75082** 字节的 sha256
**仍然等于** `3278BFD863A2851F0F3A05754EB559E15535B943A8B7593B2E7700155E8B7961`
⇒ 本次对脚本正文**一字未改**，只做了「复制 + 前置标签」。

## 保真度说明（如实登记，不是"缺陷修复"）

* 归档里的这份是 **LF 行尾、UTF-8 无 BOM**（正文 974 个 LF、0 个 CRLF；文件内有 300 个 >127 的字节）。
  本次**按原样保留**，未做行尾/BOM 转换 —— 目的是让"正文与归档逐字节相同"这条可验证性成立。
  若将来要与仓库其它文件的行尾习惯（CRLF）统一，请**单独**做，并在提交信息里写明这是**规格化**而非"恢复原始字节"。
* 本文件**不运行** canonical，也**不**声称当前仓库能跑绿：`verify\` 里 5 套为 rev-24 版、2 套（`native-toast`、`settings-model`）已永久缺失，
  报红是**预期结果**，不得为了让测试变绿去改判据或改文件。

## 边界（本文件不声称什么）

1. **不声称** rev-29 的 runner 已恢复 —— 它**永久丢失**。
2. **不采用** `preserved-r29-release-archives\` 里的 `probe-21` 任何修订去覆盖仓库文件；那些**仍只作参照**。
3. 相关的损失全貌见 `dsh-diag\loss-inventory-2026-10-01.md`；
   事故与恢复的正式记录见 `CHANGELOG.md` 的「**事故补记 · 2026-10-01**」一节；
   事故存证见 `dsh-diag\incident-2026-10-01-robocopy-mir-destroyed-chime-repo.md`。
