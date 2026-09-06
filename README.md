# 剪辑台 (videocut) v0.10

macOS 桌面剪辑软件。面向已经录制好的影片：人在界面里剪，AI 通过 **终端 CLI** 或 **MCP** 接管同一套工具。字幕走独立字幕轨。界面靠近 iMovie / After Effects 的简洁面板，而不是 Premiere 面板墙。

仓库：https://github.com/Kr1nous/videocut

## 运行

```bash
cd ~/cut-studio   # 或克隆后的 videocut 目录
npm install --cache ./.npm-cache
npm run dev
```

首次启动会引导授权「完全磁盘访问」以及影片 / 文稿 / 桌面 / 下载，避免系统隐私设置拦住终端里的 AI。开发时请在系统设置里勾选 **Electron**。

## 界面

- **最上方**：效果分类选项卡（剪辑 / 转场 / 文字 / 音频 / 画面 / 滤镜）+ 导入 / 导出 / 终端 / MCP
- **左**：项目媒体库（卡片按真实比例显示；卡片上可删除，右键也可删）
- **中**：预览
- **右**：审查（只显示 AI / MCP / CLI 的改动）
- **预览下**：检查器（音量、速度、滤镜、旋转、删除片段）
- **底部时间线**：
  - 视频轨 + 其下方的效果条（滤镜 / 变速 / 转场 / 裁切等会写在效果条上；B-roll 也在这一层）
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

- 剪辑：`remove_silence` `jump_cut` `split_on_scenes` `duplicate_clip` `detach_audio` `replace_clip` `slow_motion` `set_speed` `reset_fx` `keep_speech` `fit_duration` `remove_filler`
- 转场：`set_transition` `fade_to_black` `fade_from_black`
- 文字：`captions_from_transcript` `set_subtitle_style` `shift_subtitles` `export_srt` `add_title` `lower_third`
- 音频：`normalize_loudness` `fade_audio` `mute_clip` `duck_music` `audio_preset` `set_music`
- 画面：`set_aspect` `reframe` `rotate` `flip` `zoom_in` `auto_enhance` `overlay_broll` `crop` `color_adjust`
- 工程：`apply_ops` `undo` `export` `delete_asset` `remove_clip`

## 模块地图

```
src/shared/           数据类型、片段特效、滤镜 CSS
src/main/core.ts      项目存取、底层 op、删除素材、撤销
src/main/actions.ts   高层工具（UI / MCP / CLI 共用）
src/main/ai/          多模型工具循环（MCP 侧）
src/main/mcp/         MCP HTTP + stdio 代理
src/main/terminal.ts  内置终端，PATH 含 cutstudio
src/main/permissions.ts 首次启动磁盘/文件夹授权
src/main/media.ts     缩略图、ffmpeg 导出
src/cli/              cutstudio 命令行
src/renderer/         界面
  components/ToolTabs.tsx   顶栏效果分类
  components/Library.tsx    媒体库
  components/Timeline.tsx   视频+效果合成轨
  components/Inspector.tsx  检查器
  components/ReviewPanel.tsx 仅 AI 改动
```

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
