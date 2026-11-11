# 音频分析模块源码（快照）

对应主站工程路径：`frontend/src/features/analysis/`

## 文件

| 文件 | 作用 |
| --- | --- |
| `bands.ts` | 上游频段注册表（`registerAudioBands` / `readAudioBands`） |
| `capture.ts` | `captureStream` 采集：真实 dBFS、峰值、动态范围、绝对 dB 频谱 |
| `audio-analysis.ts` | 实时整形：32 柱 / 128 行频谱 / BPM / 响度平滑 / 动态范围 |
| `overlay.ts` | 播放器条频谱 + 声纹弹窗（瀑布图、刻度、指标） |
| `profile.ts` | 离线整曲分析：波形、对数频谱、Mel、MFCC、分段 BPM |
| `profile-view.ts` | 声纹档案页：三视图切换、导出 PNG |

## 对上游的两处接线（共 4 行）

    文件：frontend/src/features/player/player-core.ts
      import { registerAudioBands } from '../analysis/bands.ts'
      import { registerAudioElement } from '../analysis/capture.ts'
      ...
      registerAudioBands(analysis)
      registerAudioElement(audio)

    文件：frontend/src/main.ts
      import { mountAnalysisOverlay } from './features/analysis/overlay.ts'
      ...
      mountAnalysisOverlay()

## 关键技术点

- 同一 `<audio>` 只能建一个 MediaElementSource，故用 `captureStream()` 另抓一条流
- MediaStream 源必须接 0 增益汇点（destination），否则数据恒为 0
- 响度/峰值优先取上游 AnalyserNode 的时域数据（跨域音源同样有效）
- 瀑布图用绝对 dB 刻度（−85 ~ −5 dB），不逐帧归一化，才有层次
- 离线分析复用同一遍 FFT 产出对数频谱 / Mel / MFCC
