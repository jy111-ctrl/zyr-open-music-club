# 音乐指纹库（Music Fingerprint）

在音频分析板块内新增的「听歌识曲」：**指纹库在服务端 SQLite**，前端只提交查询片段，匹配与投票全部由后端完成。

## 目录

| 路径 | 内容 |
| --- | --- |
| `源码/frontend/src/features/fingerprint/` | 前端：FFT、指纹计算、识别面板（3 个文件） |
| `源码/src/db/fingerprint.js` | 后端：建表 + 首次启动导入种子 |
| `源码/src/services/fingerprint.service.js` | 后端：内存索引与投票匹配 |
| `源码/src/routes/fingerprint.routes.js` | 后端：`/api/fingerprint/library`、`/api/fingerprint/match` |
| `源码/src/db/seeds/fingerprint-seed.json` | 预生成的《起风了》指纹（28,745 条） |
| `测试音频/` | 原曲片段、加噪版、切断版 |
| `音源/起风了.mp3` | 建库源文件 |
| `文档/设计说明.md` | 原理、参数、调试记录 |

## 架构

```
前端                          后端
────────────────────────────────────────────────────
选择/录制音频
  → 解码为 PCM
  → 提取峰值 + 哈希
  → POST /api/fingerprint/match { hashes }
                               → 内存索引查表
                               → (歌曲, 时间偏移) 投票
                               → 阈值判定 ≥ 20 票
  ← { best, candidates, distribution }
  → 渲染结果 + 匹配详情
```

**为什么这样分工**：浏览器能直接解码 MP3/WAV（WebAudio），而 Node 需要 ffmpeg 才能解码；把"解码 + 取指纹"放在前端，后端只做纯计算与存储，部署无额外依赖。

## 数据表

| 表 | 说明 |
| --- | --- |
| `fingerprint_songs` | 歌曲元信息（标题、时长、指纹数） |
| `fingerprint_hashes` | 指纹 `(song_id, h, t)`，按 `h` 建索引，主键天然去重 |

首次启动若表为空，会自动从 `seeds/fingerprint-seed.json` 导入。

## 使用

1. 播放任意歌 → 频谱 → 生成整曲档案 → 页脚「指纹识别」
2. 面板显示「已入库 1 首 · 24899 个指纹」
3. 选 `测试音频/` 里任意片段 → 后端返回结果

## 已验证

| 测试片段 | 命中票数 | 命中率 | 判定 | 定位 |
| --- | --- | --- | --- | --- |
| 原曲片段（0:50 起 20s） | 123 | ~61% | ✅ | 0:50 |
| 加噪版（SNR 12dB） | 125 | ~61% | ✅ | 0:50 |
| 切断版（1:42 起 12s） | 93 | 61.2% | ✅ | 1:42 |
| 反例（库外音频） | 8 | 7.1% | ❌ 正确拒绝 | — |

单次识别耗时 1~3 秒（含前端解码、指纹计算与后端匹配）。
