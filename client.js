window.__ModuleLoader__.load({
  id: 'dsh-voice-greeting',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement
    const API = '/api/dsh-voice-greeting'
    const baseName = (value) => String(value).split(/[\\/]/).pop() || String(value)
    const DEFAULT = {
      enabled: true,
      startupAudio: '',
      startupAudios: [],
      shutdownAudio: '',
      shutdownAudios: [],
      shutdownServiceUrl: '',
      outputDevice: '',
      volume: 100,
      fadeInMs: 30,
      fadeOutMs: 80,
      startupBlocking: false,
      warmTts: true,
      watchdogEnabled: true,
      ffmpegPath: '',
      ttsPython: '',
      ttsServer: '',
      ttsHealth: '',
    }
    const CSS = [
      '.dvg-row{display:flex;flex-direction:column;gap:10px;padding:16px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}',
      '.dvg-head{display:flex;align-items:center;justify-content:space-between;gap:10px}',
      '.dvg-title{font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}',
      '.dvg-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.dvg-field{display:flex;align-items:center;gap:8px}',
      '.dvg-playlist{display:flex;flex-direction:column;gap:6px;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}',
      '.dvg-playlist-head{display:flex;align-items:center;gap:8px}',
      '.dvg-playlist-head .dvg-label{width:auto}',
      '.dvg-count{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-right:auto}',
      '.dvg-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}',
      '.dvg-item-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-primary)}',
      '.dvg-empty{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.dvg-label{flex:none;width:74px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dvg-input{flex:1;min-width:0;height:32px;box-sizing:border-box;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}',
      '.dvg-btn{flex:none;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:12px}',
      '.dvg-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dvg-btn.primary{border:none;background:var(--dsw-alias-state-business-primary);color:#fff}',
      '.dvg-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dvg-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-state-success-primary);min-height:18px}',
      '.dvg-range{flex:1;min-width:80px;accent-color:var(--dsw-alias-state-business-primary)}',
      '.dvg-val{flex:none;min-width:48px;text-align:right;font-size:12px;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}',
      '.dvg-hint.error{color:var(--dsw-alias-state-error-primary)}',
      '.dvg-options{display:flex;flex-direction:column;gap:8px;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}',
      '.dvg-option{display:flex;align-items:center;gap:10px;min-height:28px}',
      '.dvg-option .dvg-label{width:108px}',
      '.dvg-option-text{flex:1;min-width:160px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.dvg-switch{position:relative;display:inline-flex;width:42px;height:24px;flex:none;cursor:pointer}',
      '.dvg-switch input{position:absolute;opacity:0;width:0;height:0}',
      '.dvg-switch-track{position:relative;width:42px;height:24px;border-radius:999px;background:var(--dsw-alias-interactive-bg-active);transition:background .18s ease}',
      '.dvg-switch-track:after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .18s ease}',
      '.dvg-switch input:checked + .dvg-switch-track{background:#34c759}',
      '.dvg-switch input:checked + .dvg-switch-track:after{transform:translateX(18px)}',
      '.dvg-switch input:focus-visible + .dvg-switch-track{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}',
      '.dvg-status{display:flex;flex-direction:column;gap:2px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary);word-break:break-all}',
      '.dvg-status b{color:var(--dsw-alias-label-primary);font-weight:500}',
      '.dvg-warning{padding:8px 10px;border:1px solid color-mix(in srgb, #f5a623 45%, transparent);border-radius:8px;background:color-mix(in srgb, #f5a623 10%, transparent);font-size:12px;line-height:18px;color:var(--dsw-alias-state-warning-primary, #b26b00)}',
      '.dvg-maintenance{display:flex;gap:8px;flex-wrap:wrap;padding:10px 0}',
    ].join('')

    if (typeof document !== 'undefined' &&
        document.querySelector('style[data-dvg-style="1"]') === null) {
      const tag = document.createElement('style')
      tag.dataset.dvgStyle = '1'
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    async function request(url, options = {}) {
      const res = await fetch(url, {
        cache: 'no-store',
        ...options,
        headers: { 'content-type': 'application/json; charset=utf-8', ...(options.headers || {}) },
      })
      let data = null
      try { data = await res.json() } catch {}
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      return data
    }

    function SettingsRow() {
      const [config, setConfig] = React.useState(DEFAULT)
      const [hint, setHint] = React.useState('')
      const [error, setError] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [devices, setDevices] = React.useState([])
      const [meta, setMeta] = React.useState(null)
      const [ffmpegInfo, setFfmpegInfo] = React.useState(null)
      const fileRef = React.useRef(null)
      const pendingKind = React.useRef('startup')
      const applyData = (data) => {
        if (!data?.ok) return
        setConfig({ ...DEFAULT, ...(data.config || {}) })
        setMeta(data)
        if (data.ffmpeg !== undefined) setFfmpegInfo(data.ffmpeg || null)
      }

      React.useEffect(() => {
        let alive = true
        request(API).then((data) => {
          if (alive && data?.ok) {
            applyData(data)
            setFfmpegInfo(data.ffmpeg || null)
          }
        }).catch((e) => {
          if (alive) { setHint(String(e?.message || e)); setError(true) }
        })
        return () => { alive = false }
      }, [])
      React.useEffect(() => {
        let alive = true
        request(API + '/devices').then((data) => {
          if (alive && data?.ok) setDevices(Array.isArray(data.devices) ? data.devices : [])
        }).catch(() => {})
        return () => { alive = false }
      }, [])

      const update = (key, value) => setConfig((prev) => ({ ...prev, [key]: value }))
      const flash = (text, isError = false) => { setHint(text); setError(isError) }

      async function refreshDevices() {
        try {
          const data = await request(API + '/devices')
          if (data?.ok) {
            setDevices(Array.isArray(data.devices) ? data.devices : [])
            flash('播放设备列表已刷新')
          }
        } catch (e) {
          flash('刷新设备失败：' + String(e?.message || e), true)
        }
      }

      async function openDataDir() {
        try {
          const data = await request(API + '/open-dir', { method: 'POST', body: '{}' })
          if (data?.ok) flash('已打开数据目录')
        } catch (e) { flash('打开失败：' + String(e?.message || e), true) }
      }

      async function clearCache() {
        setBusy(true)
        try {
          const data = await request(API + '/clear-cache', { method: 'POST', body: '{}' })
          applyData(data)
          flash(`缓存已清理${Number.isFinite(Number(data?.removed)) ? `（${data.removed} 个文件）` : ''}`)
        } catch (e) { flash('清理失败：' + String(e?.message || e), true) }
        finally { setBusy(false) }
      }

      async function save() {
        setBusy(true)
        try {
          const data = await request(API, { method: 'POST', body: JSON.stringify(config) })
          if (data?.ok) applyData(data)
          flash('已保存')
        } catch (e) { flash('保存失败：' + String(e?.message || e), true) }
        finally { setBusy(false) }
      }

      async function preview(kind, path) {

        if (!path) { flash('先选择音频文件', true); return }
        setBusy(true)
        try {
          flash(kind === 'shutdown' ? '正在试听告别音…' : '正在试听启动音…')

          await request(API + '/preview', {
            method: 'POST',
            body: JSON.stringify({
              kind, path,
              volume: config.volume, fadeInMs: config.fadeInMs, fadeOutMs: config.fadeOutMs,
            }),
          })
          flash('试听完成')
        } catch (e) { flash('试听失败：' + String(e?.message || e), true) }
        finally { setBusy(false) }
      }

      function choose(kind) {
        pendingKind.current = kind
        if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click() }
      }

      async function upload(kind, file) {
        if (!file) return
        setBusy(true)
        try {
          const body = await file.arrayBuffer()
          const extMatch = String(file.name || '').match(/\.[a-z0-9]+$/i)
          const ext = extMatch ? extMatch[0].toLowerCase() : '.wav'
          const res = await fetch(API + '/upload', {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream', 'x-dvg-kind': kind, 'x-dvg-ext': ext },
            body,
          })
          let data = null
          try { data = await res.json() } catch {}
          if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
          applyData(data)
          if (data?.ffmpeg) setFfmpegInfo(data.ffmpeg)
          flash(`已选择 ${kind === 'shutdown' ? '关闭音' : '启动音'}：${file.name}`)
        } catch (e) {
          flash('选择失败：' + String(e?.message || e), true)
        } finally { setBusy(false) }
      }

      const removeAudio = (kind, path) => {
        const listKey = kind === 'shutdown' ? 'shutdownAudios' : 'startupAudios'
        setConfig((prev) => ({ ...prev, [listKey]: (Array.isArray(prev[listKey]) ? prev[listKey] : []).filter((item) => item !== path) }))
      }

      const playlistField = (label, kind) => {
        const listKey = kind === 'shutdown' ? 'shutdownAudios' : 'startupAudios'
        const list = Array.isArray(config[listKey]) ? config[listKey] : []
        return h('div', { key: kind, className: 'dvg-playlist' }, [
          h('div', { key: 'head', className: 'dvg-playlist-head' }, [
            h('span', { key: 'l', className: 'dvg-label' }, label),
            h('span', { key: 'c', className: 'dvg-count' }, `${list.length} 个，每次随机播放`),
            h('button', { key: 'a', type: 'button', className: 'dvg-btn', disabled: busy, onClick: () => choose(kind) }, '添加音频'),
          ]),
          list.length === 0
            ? h('div', { key: 'empty', className: 'dvg-empty' }, '未添加，保持静音')
            : list.map((path, index) => h('div', { key: path + index, className: 'dvg-item' }, [
                h('span', { key: 'n', className: 'dvg-item-name', title: path }, baseName(path)),
                h('button', { key: 'p', type: 'button', className: 'dvg-btn', disabled: busy, onClick: () => preview(kind, path) }, '试听'),
                h('button', { key: 'd', type: 'button', className: 'dvg-btn', disabled: busy, onClick: () => removeAudio(kind, path) }, '删除'),
              ])),
        ])
      }

      const slider = (label, key, min, max, step, suffix) => h('div', { className: 'dvg-field', key }, [
        h('span', { className: 'dvg-label', key: 'l' }, label),
        h('input', {
          key: 'r', className: 'dvg-range', type: 'range', min, max, step,
          value: config[key] ?? min,
          onChange: (e) => update(key, Number(e.target.value)),
        }),
        h('span', { className: 'dvg-val', key: 'v' }, String(config[key] ?? min) + suffix),
      ])


      const switchControl = (key, ariaLabel) => h('label', { className: 'dvg-switch', title: ariaLabel }, [
        h('input', {
          type: 'checkbox', checked: config[key] !== false, 'aria-label': ariaLabel,
          onChange: (e) => update(key, e.target.checked),
        }),
        h('span', { className: 'dvg-switch-track' }),
      ])

      const option = (key, label, text) => h('div', { className: 'dvg-option', key }, [
        h('span', { className: 'dvg-label' }, label),
        switchControl(key, label),
        h('span', { className: 'dvg-option-text' }, text),
      ])

      const pathField = (key, label, placeholder) => h('div', { className: 'dvg-field', key }, [
        h('span', { className: 'dvg-label' }, label),
        h('input', {
          className: 'dvg-input', value: config[key] || '', placeholder,
          onChange: (e) => update(key, e.target.value),
        }),
      ])

      const statusPanel = () => {
        const paths = meta?.paths || {}
        const watchdog = meta?.watchdog || {}
        const tts = meta?.tts || {}
        const counts = meta?.counts || { startup: 0, shutdown: 0 }
        return h('div', { className: 'dvg-status' }, [
          h('div', { key: 'v' }, [h('b', { key: 'b' }, '版本 '), meta?.version || '0.3.9', ' · webServer：', meta?.webServer ? '已挂载' : '未挂载（非 Web 宿主）']),
          h('div', { key: 'f' }, [h('b', { key: 'b' }, 'ffmpeg：'), ffmpegInfo?.ok ? (ffmpegInfo.path || '已找到') : (ffmpegInfo ? '未找到' : '检测中')]),
          h('div', { key: 'c' }, [h('b', { key: 'b' }, '列表：'), `启动 ${counts.startup} 条 / 关闭 ${counts.shutdown} 条 · `, h('b', { key: 'b' }, '看守：'), watchdog.enabled === false ? '已关闭' : (watchdog.running ? `运行中 (${watchdog.pid})` : '待命')]),
          h('div', { key: 't' }, [h('b', { key: 'b' }, 'TTS：'), tts.configured ? (tts.filesPresent ? '已配置，启动时预拉起' : '已开启，但文件不存在') : '已关闭']),
          h('div', { key: 'p' }, [h('b', { key: 'b' }, '数据目录：'), paths.profile || '读取中…']),
        ])
      }
      return h('div', { className: 'dvg-row' }, [
        h('div', { key: 'head', className: 'dvg-head' }, [
          h('div', { key: 't', className: 'dvg-title' }, '启动 / 关闭语音'),
          h('label', { key: 's', style: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer' } }, [
            h('input', {
              key: 'c', type: 'checkbox', checked: config.enabled !== false,
              onChange: (e) => update('enabled', e.target.checked),
            }),
            '启用',
          ]),
        ]),
        h('div', { key: 'desc', className: 'dvg-desc' }, `启动和关闭各支持一组音频，每次随机播放一条；多条时尽量不连续重复。支持 WAV/MP3/M4A/FLAC/OGG/AAC/WMA/MP4 等；ffmpeg：${ffmpegInfo?.ok ? '已找到' : (ffmpegInfo ? '未找到' : '检测中')}。`),
        h('input', {
          key: 'file', ref: fileRef, type: 'file', accept: '.wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,.wma,.aiff,.aif,.mp4,.m4v,.mov,.mkv,.webm,audio/*,video/*',
          style: { display: 'none' },
          onChange: (e) => { const f = e.target.files && e.target.files[0]; if (f) upload(pendingKind.current, f) },
        }),
        playlistField('启动音频', 'startup'),
        playlistField('关闭音频', 'shutdown'),
        h('div', { key: 'out', className: 'dvg-field' }, [
          h('span', { key: 'l', className: 'dvg-label' }, '播放设备'),
          h('select', {
            key: 's', className: 'dvg-input',
            value: config.outputDevice || '',
            onChange: (e) => update('outputDevice', e.target.value),
          }, [
            h('option', { key: 'default', value: '' }, '系统默认输出'),
            config.outputDevice && !devices.some((d) => d.name === config.outputDevice)
              ? h('option', { key: 'current', value: config.outputDevice }, config.outputDevice)
              : null,
            ...devices.map((d) => h('option', { key: d.id, value: d.name }, d.name)),
          ]),
          h('button', { key: 'r', type: 'button', className: 'dvg-btn', disabled: busy, onClick: refreshDevices }, '刷新'),
        ]),

        slider('音量', 'volume', 0, 100, 1, '%'),
        slider('淡入', 'fadeInMs', 0, 1000, 10, 'ms'),
        slider('淡出', 'fadeOutMs', 0, 1000, 10, 'ms'),
        h('div', { key: 'options', className: 'dvg-options' }, [
          option('startupBlocking', '启动阻塞', '开启后 DSH 会等待问候音播完；长音频建议关闭。'),
          option('warmTts', 'TTS 预热', '启动时探测并拉起本地 TTS 服务；文件不存在会自动跳过。'),
          option('watchdogEnabled', '关闭看守', 'DSH 被强杀时由后台看守补播关闭音。'),
        ]),
        h('div', { key: 'advanced', className: 'dvg-options' }, [
          pathField('ffmpegPath', 'ffmpeg', '留空自动查找，或填 ffmpeg.exe 路径'),
          pathField('ttsPython', 'TTS Python', '留空用默认，例如 python.exe'),
          pathField('ttsServer', 'TTS 服务', '留空用默认 voice_server.py'),
          pathField('ttsHealth', '健康检查', '留空用 http://127.0.0.1:9880/health'),
        ]),
        h('div', { key: 'svc', className: 'dvg-field' }, [
          h('span', { key: 'l', className: 'dvg-label' }, '关闭时调用'),
          h('input', {
            key: 'i', className: 'dvg-input', value: config.shutdownServiceUrl || '',
            placeholder: '可空，例如 http://127.0.0.1:9880/shutdown',
            onChange: (e) => update('shutdownServiceUrl', e.target.value),
          }),
        ]),
        statusPanel(),
        meta?.warnings?.length > 0
          ? h('div', { key: 'warnings', className: 'dvg-warning' }, meta.warnings.join('；'))
          : null,
        h('div', { key: 'maintenance', className: 'dvg-maintenance' }, [
          h('button', { key: 'open', type: 'button', className: 'dvg-btn', disabled: busy, onClick: openDataDir }, '打开数据目录'),
          h('button', { key: 'cache', type: 'button', className: 'dvg-btn', disabled: busy, onClick: clearCache }, '清理播放缓存'),
        ]),
        h('div', { key: 'actions', className: 'dvg-actions' }, [
          h('button', { key: 'save', type: 'button', className: 'dvg-btn primary', disabled: busy, onClick: save }, busy ? '处理中…' : '保存'),
          h('span', { key: 'hint', className: 'dvg-hint' + (error ? ' error' : '') }, hint),
        ]),
      ])
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined || slots === null) return
      slots.inject('settings.general.item', () => slots.register({
        name: 'settings.general.item',
        id: 'dsh-voice-greeting-settings',
        order: 39,
        label: '启动/关闭语音',
      }, SettingsRow))
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
