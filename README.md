# 剪辑台 (videocut) 1.0

macOS 桌面剪辑软件（Tauri 2）。面向已经录制好的影片：人在界面里剪，AI 通过 **终端 CLI** 或 **MCP** 接管同一套工具。字幕走独立字幕轨。界面靠近 iMovie / After Effects 的简洁面板，而不是 Premiere 面板墙。

仓库：https://github.com/Kr1nous/videocut  
安装包：见 [Releases](https://github.com/Kr1nous/videocut/releases) 里的 `剪辑台_1.0.0_aarch64.dmg`（Apple Silicon）。

## 运行

本机需要 **Node**、**Rust**（`rustup`）和 Xcode Command Line Tools。Homebrew 装在 `~/homebrew`（无需管理员权限）。

```bash
export PATH="$HOME/homebrew/bin:$HOME/.cargo/bin:$PATH"
cd ~/cut-studio   # 或克隆后的 videocut 目录
npm install --cache ./.npm-cache
npm run dev       # Tauri 桌面窗口
```

打包 `.app` / `.dmg`：

```bash
npm run build
# 产物在 src-tauri/target/release/bundle/macos/
```

首次启动会引导授权「完全磁盘访问」以及影片 / 文稿 / 桌面 / 下载，避免系统隐私设置拦住终端里的 AI。开发时请在系统设置里勾选 **剪辑台**。

## 界面

- **最上方**：效果分类选项卡（剪辑 / 转场 / 文字 / 音频 / 画面 / 滤镜 / 蒙版 / 导出）+ 导入 / 导出 / 终端 / MCP
- **左**：项目媒体库（卡片按真实比例显示；卡片上可删除，右键也可删）
- **中**：预览
- **右**：审查（只显示 AI / MCP / CLI 的改动）
- **预览下**：检查器（音量、速度、滤镜、透明/缩放关键帧、冻结、倒放、蒙版、旋转、删除片段）
- **底部时间线**：
  - 视频轨 + 其下方的图层轨（滤镜/变速/转场写在效果条上；叠加图层、B-roll、纯色层、调整层也在这一层）
  - 较窄的音频轨、字幕轨
  - 可拖轨道高度；播完自动回到开头等待再播

没有顶部 AI 对话框。AI 只走终端或 MCP。

## 人怎么剪

1. 新建或打开 `.cutproj` 项目，导入成片（会分析静音和镜头）。
2. 双击素材上故事线。顶部选项卡点工具直接执行。
3. 选中片段后可用检查器，或点片段上的 × / 右键删除。
4. 空格播放，`S` 分割，焦点不在终端时 Delete / Backspace 删除，`⌘Z` 撤销。

## AI 怎么接入

| 入口 | 用法 |
|---|---|
| 终端 | 工具栏「终端」，运行 `cutstudio help` |
| MCP | `http://127.0.0.1:4877/mcp`，配置在「MCP」按钮里 |

```bash
cutstudio prompt
cutstudio remove-silence
cutstudio captions-from-transcript
cutstudio apply --summary "说明" --ops '[...]'
cutstudio help
```

## 工具（人点选项卡 = AI 调同名函数）

- 剪辑：`remove_silence` `jump_cut` `split_on_scenes` `duplicate_clip` `detach_audio` `replace_clip` `slow_motion` `set_speed` `reset_fx` `keep_speech` `fit_duration` `remove_filler` `set_keyframe` `freeze_frame` `reverse_clip`
- 转场：`set_transition` `fade_to_black` `fade_from_black`（溶解 / 淡黑 / 淡白 / 推）
- 文字：`captions_from_transcript` `set_subtitle_style` `shift_subtitles` `export_srt` `add_title` `lower_third` `add_text_layer` `animate_text` `add_shape` `set_text`
- 音频：`normalize_loudness` `fade_audio` `mute_clip` `duck_music` `audio_preset` `set_music` `link_to_audio` `denoise_audio`（波形、音量关键帧、跟鼓点、轻量降噪）
- 画面：`set_aspect` `reframe` `rotate` `flip` `zoom_in` `auto_enhance` `overlay_broll` `add_layer` `set_blend` `add_adjustment_layer` `add_solid` `crop` `color_adjust` `set_opacity` `set_transform` `stabilize` `key_color`
- 特效：`add_effect` `list_effects` `apply_lut`（高斯/径向模糊、发光、颗粒、马赛克、LUT）
- 蒙版：`add_mask` `set_mask` `remove_mask`（矩形/椭圆，加/减，羽化；预览里可拖）
- 工程：`apply_ops` `undo` `export` `render_queue_add` `make_proxy` `delete_asset` `remove_clip`

预览和导出走同一套 ClipFx 合成（变换、滤镜、特效、LUT、抠像、透明、裁切、翻转、淡化、溶解/淡黑/淡白/推、变速、音量关键帧、跟鼓点）。稳像走 ffmpeg deshake；降噪走 afftdn。导出：H.264、透明 MOV/ProRes、队列、半分辨率代理（预览用代理，成片用原片）。路线图见 `docs/ae-complete-roadmap.md`。

## 模块地图

```
src-tauri/            Tauri 2 窗口、菜单、系统对话框、拉起后端
src/main/sidecar.ts   Node 后端 HTTP + SSE（状态 / 终端 / 媒体）
src/main/core.ts      项目存取、底层 op、删除素材、撤销
src/main/actions.ts   高层工具（UI / MCP / CLI 共用）
src/main/ai/          多模型工具循环（MCP 侧）
src/main/mcp/         MCP HTTP + stdio 代理
src/main/terminal.ts  内置终端，PATH 含 cutstudio
src/main/media.ts     缩略图
src/main/render/      合成图、ffmpeg 导出、单帧采样
src/cli/              cutstudio 命令行
src/renderer/         界面
  lib/cut.ts          前端 API（Tauri + sidecar）
  components/ToolTabs.tsx   顶栏效果分类
  components/Library.tsx    媒体库
  components/Timeline.tsx   视频+效果合成轨
  components/Inspector.tsx  检查器
  components/ReviewPanel.tsx 仅 AI 改动
```

剪辑逻辑在 Node sidecar（`http://127.0.0.1:4878`），窗口是 Tauri。MCP 仍是 `http://127.0.0.1:4877/mcp`。

新增工具：`actions.ts` 的 `ACTION_TOOLS` + `runAction` → 自动进 MCP → `src/cli/cutstudio.mjs` 加子命令 → 需要人点的放进 `ToolTabs.tsx`。

## 工程文件夹

`名字.cutproj/`

- `project.json` 时间线、字幕样式、转写、审查
- `media/` 导入拷贝
- `thumbs/` 缩略图
- `export/` 导出

## 限制

- 无 ffmpeg 时仍可预览，导出不可用（`sudo port install ffmpeg`）。
- 转写目前多用说话段占位；去静音依赖导入后的音频分析。
- macOS「完全磁盘访问」必须在系统设置里手动勾选。

## MCP 配置

```json
{
  "mcpServers": {
    "cut-studio": {
      "url": "http://127.0.0.1:4877/mcp"
    }
  }
}
```
