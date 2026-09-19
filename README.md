# dsh-approval-chime

DSH 审批提示音插件：**DSH 向你申请权限的那一刻响一声**，音量、音色、开关都在**「设置 → 通知提醒」**里调。
内置风铃 / 铃铛 / 蜂鸣三种现场合成音色，可导入本地音频当音色，还能**按会话独立**设置。

它**完全不参与审批瀑布**：不注册任何 `approval/request` 监听，内置审批面板的决策路径一个字节都没变。
它只做一件事——在审批请求出现时发声。

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
- **按会话独立**（rev-10）—— 每个会话标题行有一个小铃铛：点一下只静音**这个会话**；
  铃铛旁的箭头可给该会话单独指定音色与音量（默认跟随全局）。
  多个会话同时待审批时**各响各的**（同一批按快照顺序逐个响、相邻 180 ms），不再合并成一声。
- **试听与恢复默认** —— 恢复默认只重置 `enabled / volume / tone`，**不动** `custom`
  （导入的文件是素材库，不是一项偏好）。
- **无声环境自证** —— 分区页显示已触发次数与上次触发时间，静音时也能确知"它到底有没有在工作"。

---

## 设置项

命名空间 `approval-chime`，落盘在 `$DSH_HOME/settings.yaml` 的 `approval-chime:` 段，改完立即生效。

| 字段 | 类型 / 范围 | 默认 | 含义 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 关闭后**任何**声音都不产生（含试听）；审批触发路径连 AudioContext 都不创建 |
| `volume` | number `0..100` | `70` | 主增益 = `volume / 100 × 0.6`；`0` 时不发声 |
| `tone` | `chime` \| `bell` \| `beep` \| `custom:<uuid>` | `chime` | 音色。前三个现场合成，`custom:` 前缀指向一个已导入的文件 |
| `custom` | `[{ id, name }]` | `[]` | 已导入的音色名册。**顺序即含义**：按导入先后排列，渲染时排在三个内置音色**之前** |

每个会话的静音与音色/音量覆盖**不进设置文档、不进浏览器存储**，而是写在插件自己的文件
`<DSH_HOME>/approval-chime/sessions.json`（原子写、上限 200 个会话、按 `updatedAt` 淘汰）。

---

## 已知边界

- **请用 `http://127.0.0.1:3080` 验收。** 非 loopback 页面（远程浏览器）下，平台只把写入留在内存，
  该模式下分区页渲染为空（导航行仍在）。
- **「试听」会先解锁音频上下文**：这是刻意的——让你第一次点击就解除浏览器的自动播放限制。它同样遵循
  `enabled` / `volume`，静音时不发声。
- **本插件不尊重系统「减少动效」偏好**（rev-20 起的**有意取舍**）：会话铃铛旁箭头的转动与设置页开关的
  过渡，在任何环境下都是同一段 160 ms，没有例外。顶层诊断 `reduceMotion()` 保留，但它只报告
  "本页是否命中 `(prefers-reduced-motion: reduce)`"，**不改变任何行为**。
- 分区页在非 loopback 时为空、`custom:` 音色在文件缺失时的表现等更细的边界，见下方手册的 §9。

---

## 开发与验证

四套 headless harness，**不需要浏览器、不需要 DSH、不需要装包**：

```sh
node verify/host-half.test.mjs      # 124 项
node verify/client-half.test.mjs    # 400 项
node verify/waterfall.test.mjs      #  22 项
node verify/custom-audio.test.mjs   #  75 项
```

当前为 **621 项断言全绿（124 + 400 + 22 + 75）**，各 exit 0。
`verify/waterfall.test.mjs` 用**静态 + 运行时 + 真 cordis 对照实验**三重证明「审批瀑布零注册」。

`verify-independent/` 是独立验证层（另一套探针与变异表，与上面四套不共享代码），
原始日志归档在同目录的 `_raw/`。

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [`docs/交付说明与验收手册.md`](docs/交付说明与验收手册.md) | **本仓库原来的 README**：包结构、junction 预检、完整的设置项说明、挂载与重启验收步骤、触发设计、无声环境自证接口、浏览器端依赖边界、已知风险与未证实项（§1–§9） |
| [`docs/契约调研.md`](docs/契约调研.md) | 全部 DSH 契约的调研结论，每条都带 `文件:行号` |
| [`docs/挂载与验收.md`](docs/挂载与验收.md) | 挂载 / 验收操作手册 |
| [`docs/验证报告.md`](docs/验证报告.md) | 历次验证报告 |
| [`docs/变异覆盖与残留红.md`](docs/变异覆盖与残留红.md) | 变异测试覆盖表与残留红项 |
| [`CHANGELOG.md`](CHANGELOG.md) | 逐版本的变更记录（rev-1 → rev-20，含锚定字节哈希与每次的验证结论） |

---

## 许可

[MIT](LICENSE) © 2026 Cloudto1
