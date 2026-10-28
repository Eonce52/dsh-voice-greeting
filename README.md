# dsh-voice-greeting

DSH 启动问候 / 关闭告别插件。只负责播放两段预生成的 WAV，不依赖 TTS 模型；启动时不会因为模型冷启动而没声。

## 功能

- DSH 加载插件时播放 `startupAudio`
- 插件卸载 / DSH 正常关闭时播放 `shutdownAudio`
- 可选：关闭时 POST 一个地址（例如本地语音服务的 `/shutdown`）
- Windows 默认设备走系统自带 `SoundPlayer`，指定设备走内置 WASAPI 播放器，均零额外依赖
- macOS 使用 `afplay`；Linux 默认 `paplay`，可用 `DSH_VOICE_PLAYER` 覆盖
- 插件本身不包含任何人的声音素材；音频路径由使用者配置

## 0.3.3 新增

- 「播放设备」改为下拉选择，列出系统活动输出设备
- 增加「刷新」按钮，插拔设备后可重新扫描
- 保留「系统默认输出」选项；当前设备不在列表时仍会显示


## 0.3.2 新增

- 设置页新增「输出设备」：留空走系统默认；可填设备名（例如 `ROG DELTA S ANIMATE`）或端点 ID
- Windows 指定设备时使用 WASAPI 直接输出，避免声音跑到错误的默认设备
- 输出设备输入框带活动设备候选列表
- 试听改为同步播放，播放失败会把具体错误返回给设置页


## 0.3.1 修正

- 粘贴带引号的 Windows 路径（资源管理器“复制文件地址”格式）时自动去掉首尾引号，不再误拼到 DSH release 目录
- 试听失败会显示实际解析后的路径，并区分“文件不存在”和“不是有效 PCM WAV”
- 安装改为「bundles 注册 + 顶层配置覆盖」；自动清理旧版重复的 `- insert:` 内层条目，避免重复挂载

## 0.3.0 新增

- 设置页可调音量（0–100）、淡入、淡出（0–1000ms）
- 启动/关闭音频旁增加「选择」按钮，弹出系统文件选择框，上传后自动写回路径
- 上传时会校验 PCM 16bit WAV，并保存到 profile 下的 `dsh-voice-greeting-audio/`
- 播放前按当前参数生成缓存 WAV（`dsh-voice-greeting-cache/`），再交给 SoundPlayer
- 试听也会使用当前滑杆参数，不必先保存

## 0.2.3 修正

- 设置页保存不再走 `scope.update()`，改为写入 profile 旁的 `dsh-voice-greeting.json`，绕开 DSH 6.0.0 的 `has no volatile fields`
- 保留 `export const Config`，但不依赖 settings 服务的 schema 写入
- 插件读取顺序：`cordis.patch.yml` 初始配置 → `dsh-voice-greeting.json` 覆盖
- 这样在 dpx 隔离环境和普通安装下都能保存路径

## 0.2.2 修正

- 补上 `export const Config`，设置页保存不再报 `No configurable plugin entry`
- `ctx.settings.register` 失败会写日志，不再静默吞异常
- 播放前检查 RIFF/PCM，非 PCM WAV 会明确报错
- `install.ps1` 支持 `$env:DSH_HOME` 和 `-Profile`
- 安装时曾在 profile patch 写顶层 `- id:` 配置，避免被自动禁用（0.3.1 起迁移为 bundle 注册 + 顶层配置覆盖）
- 兼容 dpx 隔离环境、自定义安装目录和宿主默认目录

## 设置页

安装并重启 DSH 后，打开“设置 → 通用”，会看到「启动 / 关闭语音」一栏。可以：

- 开关启动/关闭提示音
- 直接填启动音频、关闭音频的 WAV 路径
- 点“试听”分别试听两段音频
- 「输出设备」留空=系统默认；可填活动输出设备名（输入框会给出候选）
- 填关闭时要调用的地址（例如本地语音服务的 `http://127.0.0.1:9880/shutdown`）
- 保存后写入 DSH settings，下次启动/关闭按新配置执行

## 安装

把本目录放到 DSH 的 profile `node_modules` 下：

```text
<dsh-home>/profiles/web-desktop/node_modules/dsh-voice-greeting
```

然后在 `<dsh-home>/profiles/web-desktop/cordis.patch.yml` 加入：

```yaml
- insert:
    - id: dsh-voice-greeting
      name: dsh-voice-greeting
      config:
        startupAudio: "D:/path/to/startup.wav"
        shutdownAudio: "D:/path/to/shutdown.wav"
        shutdownServiceUrl: "http://127.0.0.1:9880/shutdown"
```

`shutdownServiceUrl` 可留空。音频路径支持绝对路径、`~` 和相对当前工作目录的路径。

## 生成问候音

用你自己的 TTS / 录音生成两段短 WAV，建议：

- 3~6 秒
- PCM 16-bit WAV
- 不要包含音乐、混响和敏感内容
- 不要在仓库里提交别人的声音素材

## 环境变量

- `DSH_VOICE_STARTUP_AUDIO`
- `DSH_VOICE_SHUTDOWN_AUDIO`
- `DSH_VOICE_SHUTDOWN_URL`
- `DSH_VOICE_PLAYER`（Linux 播放器，默认 `paplay`）
- `DSH_VOICE_GREETING_DRY=1`（只打印路径，不播放，用于测试）

## 说明

- 关闭告别依赖宿主正常 dispose；强制 `TerminateProcess` 时系统不会给进程清理机会。
- 插件不读取 token、不联网、不上传任何内容。
- 目前主要适配 Windows；macOS/Linux 的播放命令是兜底实现。

## License

MIT

## 分享给同学

把整个 `dsh-voice-greeting` 文件夹（或打包后的 zip）发给同学，让他运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

脚本会自动找到 DSH 的 profile，把插件复制到 `node_modules\dsh-voice-greeting`，并往 `cordis.patch.yml` 追加一条空配置。之后完全退出并重开 DSH，在“设置 → 通用 → 启动 / 关闭语音”里填他自己的 WAV 路径。

不要把带个人声音的 WAV 一起发出去；脚本和仓库都不包含音频。
