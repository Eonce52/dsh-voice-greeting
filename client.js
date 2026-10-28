window.__ModuleLoader__.load({
  id: 'dsh-voice-greeting',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement
    const API = '/api/dsh-voice-greeting'
    const DEFAULT = {
      enabled: true,
      startupAudio: '',
      shutdownAudio: '',
      shutdownServiceUrl: '',
      outputDevice: '',
      volume: 100,
      fadeInMs: 30,
      fadeOutMs: 80,
    }
    const CSS = [
      '.dvg-row{display:flex;flex-direction:column;gap:10px;padding:16px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}',
      '.dvg-head{display:flex;align-items:center;justify-content:space-between;gap:10px}',
      '.dvg-title{font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}',
      '.dvg-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.dvg-field{display:flex;align-items:center;gap:8px}',
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
      const fileRef = React.useRef(null)
      const pendingKind = React.useRef('startup')

      React.useEffect(() => {
        let alive = true
        request(API).then((data) => {
          if (alive && data?.ok) setConfig({ ...DEFAULT, ...data.config })
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

      async function save() {
        setBusy(true)
        try {
          const data = await request(API, { method: 'POST', body: JSON.stringify(config) })
          if (data?.ok) setConfig({ ...DEFAULT, ...data.config })
          flash('已保存')
        } catch (e) { flash('保存失败：' + String(e?.message || e), true) }
        finally { setBusy(false) }
      }

      async function preview(kind) {
        const key = kind === 'shutdown' ? 'shutdownAudio' : 'startupAudio'
        if (!config[key]) { flash('先填音频路径或选择音频文件', true); return }
        setBusy(true)
        try {
          flash(kind === 'shutdown' ? '正在试听告别音…' : '正在试听启动音…')

          await request(API + '/preview', {
            method: 'POST',
            body: JSON.stringify({
              kind, path: config[key],
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
          if (data?.config) setConfig({ ...DEFAULT, ...data.config })
          flash(`已选择 ${kind === 'shutdown' ? '关闭音' : '启动音'}：${file.name}`)
        } catch (e) {
          flash('选择失败：' + String(e?.message || e), true)
        } finally { setBusy(false) }
      }

      const field = (label, key, kind) => h('div', { className: 'dvg-field' }, [
        h('span', { className: 'dvg-label', key: 'l' }, label),
        h('input', {
          key: 'i', className: 'dvg-input', value: config[key] || '',
          placeholder: '选择音频文件，或手填完整路径',
          onChange: (e) => update(key, e.target.value),
        }),
        h('button', {
          key: 'c', type: 'button', className: 'dvg-btn', disabled: busy,
          onClick: () => choose(kind),
        }, '选择'),
        h('button', {
          key: 'b', type: 'button', className: 'dvg-btn', disabled: busy,
          onClick: () => preview(kind),
        }, '试听'),
      ])

      const slider = (label, key, min, max, step, suffix) => h('div', { className: 'dvg-field', key }, [
        h('span', { className: 'dvg-label', key: 'l' }, label),
        h('input', {
          key: 'r', className: 'dvg-range', type: 'range', min, max, step,
          value: config[key] ?? min,
          onChange: (e) => update(key, Number(e.target.value)),
        }),
        h('span', { className: 'dvg-val', key: 'v' }, String(config[key] ?? min) + suffix),
      ])

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
        h('div', { key: 'desc', className: 'dvg-desc' }, 'DSH 启动时播启动音，正常关闭时播告别音。支持 WAV/MP3/M4A/FLAC/OGG/AAC/WMA/MP4 等；非 WAV 格式需要 ffmpeg。'),
        h('input', {
          key: 'file', ref: fileRef, type: 'file', accept: '.wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,.wma,.aiff,.aif,.mp4,.m4v,.mov,.mkv,.webm,audio/*,video/*',
          style: { display: 'none' },
          onChange: (e) => { const f = e.target.files && e.target.files[0]; if (f) upload(pendingKind.current, f) },
        }),
        field('启动音频', 'startupAudio', 'startup'),
        field('关闭音频', 'shutdownAudio', 'shutdown'),
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
        h('div', { key: 'svc', className: 'dvg-field' }, [
          h('span', { key: 'l', className: 'dvg-label' }, '关闭时调用'),
          h('input', {
            key: 'i', className: 'dvg-input', value: config.shutdownServiceUrl || '',
            placeholder: '可空，例如 http://127.0.0.1:9880/shutdown',
            onChange: (e) => update('shutdownServiceUrl', e.target.value),
          }),
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
