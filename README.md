# dsh-voice-greeting

DSH 启动问候 / 关闭告别插件。启动/关闭各支持一组预生成音频并随机播放，不依赖 TTS 模型；WAV 全位深零依赖；MP3/M4A/FLAC/OGG/AAC/WMA/MP4 等格式自动调用 ffmpeg 提取或转码。

## 功能

- DSH 加载插件时从启动音列表随机播放一条
- 插件卸载 / DSH 正常关闭时从关闭音列表随机播放一条
- 可选：关闭时 POST 一个地址（例如本地语音服务的 `/shutdown`）
- Windows 默认设备走系统自带 `SoundPlayer`，指定设备走内置 WASAPI 播放器，均零额外依赖
- macOS 使用 `afplay`；Linux 默认 `paplay`，可用 `DSH_VOICE_PLAYER` 覆盖
- 插件本身不包含任何人的声音素材；音频路径由使用者配置
- 启动音默认异步播放，不阻塞 DSH 启动；可切回“等播完”
- 关闭音看守在 WMI 被拦截时自动改用直接进程兜底
- 可选本地 TTS 预热，设置页可开关；未安装时自动跳过

## 0.3.9 完全体

- 新增 `ffmpegPath` 自定义路径；设置页可覆盖自动探测，方便非标准安装环境
- TTS 预热改为可配置 `ttsPython` / `ttsServer` / `ttsHealth`，不再只绑定 GPT-SoVITS 默认路径
- 非 Web 宿主、无 TTS、无 ffmpeg 环境都会返回明确状态与警告
- 增加 `scripts/package.ps1` 构建脚本和 GitHub Actions 标签发布工作流（使用 `GITHUB_TOKEN`，不写死任何凭据）
- 真机用隔离 DSH 6.9.3 实例验证：0.3.9 host API 与设置页同时加载，10+10 条列表、状态和中文字段正常


## 0.3.8 全面升级

- 启动音默认异步播放，避免长音频拖慢 DSH；新增「启动阻塞」开关
- 设置页新增「TTS 预热」「关闭看守」开关、运行状态、版本、数据目录、列表数量和警告提示
- `webServer` 改为可选注入：非 Web 宿主也能加载插件并播放启动/关闭音，只是没有设置 API
- 关闭音看守增加 WMI 失败后的直接进程兜底，并在保存配置时自动重建
- 上传限制 64MB；按 SHA-1 去重，列表上限 100 条；配置采用原子写入并保留 `.bak`
- 播放缓存自动清理：最多 128 个、最长 30 天；设置页新增「清理播放缓存」
- 补上 `install.cmd` 的安装目录复制；新增 `uninstall.ps1` / `uninstall.cmd`，默认保留用户音频
- 完善 ffmpeg、TTS、缓存和 profile 路径诊断，避免“看起来没反应”的静默失败



## 0.3.7 修复

- 修正 profile 根目录识别：只接受带 `dsh.profile` 的 package.json，不再把插件自身目录误认成 profile
- 修复设置页启动/关闭音频列表显示为空、已有音频“消失”的问题；真实 config 与 10+10 条列表可正常读取

## 0.3.6 兼容性修复

- WAV 内置支持 8/16/24/32bit PCM 与 32/64bit float，包含 WAVE_FORMAT_EXTENSIBLE；这些 WAV 不再强制依赖 ffmpeg
- 安装脚本会探测自定义/隔离 DSH_HOME，失败时列出尝试过的路径
- package.json 改为文本级插入 bundle，并在修改前备份 package.json 与 cordis.patch.yml
- 增加 `install.cmd`，同学解压后可直接双击安装
- 数据/缓存路径改为向上查找真实 profile 根，兼容 pnpm isolated 布局
- ffmpeg 增加 WinGet / Program Files / Chocolatey / Scoop 等常见路径，设置页显示是否找到
- 设备列表输出强制 UTF-8；删除未使用的旧 shutdown-watch.ps1
- 修复关闭音看守只检查 `shutdownAudio` 单数字段的问题；播放列表模式下现在会正常启动 VBS 看守

## 0.3.5 新增

- 启动音和关闭音各支持一组播放列表，每次随机选一条
- 多条时尽量不连续重复同一个文件
- 设置页可添加、删除、逐条试听
- 继续支持多格式、播放设备、音量和淡入淡出

## 0.3.4 新增

- 支持 WAV/MP3/M4A/AAC/FLAC/OGG/OPUS/WMA/AIFF 以及 MP4/MOV/MKV/WEBM 等音视频容器
- 非 WAV 自动用 ffmpeg 解码成 PCM 16-bit WAV，再套用音量/淡入淡出
- ffmpeg 自动查找：`DSH_VOICE_FFMPEG`、插件目录 `bin\ffmpeg.exe`、`D:\GPT-SoVITS\ffmpeg.exe`、PATH
- 设置页「选择」按钮接受更多音频格式
- 启动音改为同步播放：插件初始化会等启动音播完再继续，等待时间等于音频播放时长；播放设备最多等待 8 秒
- 关闭音采用双保险：插件清理时同步播完再继续退出并写标记，WMI 启动的 VBS 看守只在标记不存在时兜底；全程隐藏窗口
- 播放器 PowerShell 也使用 `-WindowStyle Hidden`，不再弹黑窗
- 播放日志写入 profile 旁的 `dsh-voice-greeting-play.log`



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

- 开关启动/关闭提示音、启动阻塞、TTS 预热、关闭看守
- 添加/删除启动与关闭音频列表，逐条试听；也可直接粘贴路径
- 查看运行状态、ffmpeg 检测、数据目录、列表数量与警告
- 「清理播放缓存」「打开数据目录」两个维护按钮
- 可填写 ffmpeg、TTS Python、TTS 服务脚本和健康检查路径
- 「输出设备」留空=系统默认；可填活动输出设备名（输入框会给出候选）
- 填关闭时要调用的地址（例如本地语音服务的 `http://127.0.0.1:9880/shutdown`）
- 保存后写入 DSH settings，下次启动/关闭按新配置执行

## 安装

1. 解压 zip，双击 `install.cmd`
2. 也可以在 PowerShell 中运行：
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1`
3. 自定义 / dpx 隔离环境可显式指定：
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -DshHome "X:\path\dsh-home" -Profile web-desktop`
   或先设置 `DSH_HOME` 环境变量
4. 安装器会先备份 `package.json` / `cordis.patch.yml`，再写入 bundles + 顶层配置
5. 完全退出并重新打开 DSH
6. 进入「设置 → 通用 → 启动 / 关闭语音」添加音频

## 卸载

双击 `uninstall.cmd`，会移除插件目录、`dsh.profile.bundles` 条目和 `cordis.patch.yml` 顶层配置，默认保留你的音频、配置与日志。想连用户数据一起删，运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1 -RemoveUserData
```

> 默认保留用户数据；`-RemoveUserData` 才会删除配置、音频、缓存、日志和看守标记。


## 发布

本地构建：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package.ps1
```

推送 `v*` 标签后，GitHub Actions `.github/workflows/release.yml` 会自动构建 zip 并创建 Release；令牌由 GitHub 的 `GITHUB_TOKEN` 注入，仓库中不保存任何 token 或私钥。



## 生成问候音

用你自己的 TTS / 录音生成两段短 WAV，建议：

- 3~6 秒
- WAV 全位深，或 MP3/M4A/FLAC/OGG 等；非 WAV 需要 ffmpeg
- 不要包含音乐、混响和敏感内容
- 不要在仓库里提交别人的声音素材

## 环境变量

- `DSH_VOICE_STARTUP_AUDIO`
- `DSH_VOICE_SHUTDOWN_AUDIO`
- `DSH_VOICE_SHUTDOWN_URL`
- `DSH_VOICE_PLAYER`（Linux 播放器，默认 `paplay`）
- `DSH_VOICE_FFMPEG`（ffmpeg.exe 路径；设置页 `ffmpegPath` 优先）
- `DSH_VOICE_GREETING_DRY=1`（只打印路径，不播放，用于测试）
- `DSH_VOICE_DATA_FILE`（覆盖配置/缓存所在目录，测试用）
- `DSH_VOICE_TTS_PYTHON` / `DSH_VOICE_TTS_SERVER` / `DSH_VOICE_TTS_HEALTH`（本地 TTS 路径与健康检查）
- `DSH_VOICE_TTS_WARM=0`（等价于设置页关闭 TTS 预热）

## 说明

- 正常关闭走 dispose 同步播放；强制结束进程时由 VBS 看守补播，WMI 被拦截会回退到直接进程启动。
- 启动音默认异步播放，不阻塞 DSH；需要“等播完”可在设置页打开「启动阻塞」。
- 插件不读取 token、不联网、不上传任何内容；上传音频只写入本机 profile。
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
