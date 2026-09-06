import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

function xtermTheme(dark: boolean) {
  return dark
    ? {
        background: '#1c1c1e',
        foreground: '#f5f5f7',
        cursor: '#8181ff',
        selectionBackground: '#5b5bd655'
      }
    : {
        background: '#f6f7f9',
        foreground: '#1d1d1f',
        cursor: '#5b5bd6',
        selectionBackground: '#5b5bd633'
      }
}

export function TerminalPanel({ dark, onClose }: { dark: boolean; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
      fontSize: 12,
      cursorBlink: true,
      theme: xtermTheme(dark),
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    const offData = window.cut.onTerminalData((data) => term.write(data))
    const offExit = window.cut.onTerminalExit((code) => {
      term.write(`\r\n[shell 已退出 ${code}] 点「重启」再开一局\r\n`)
    })

    const start = () => {
      const dims = fit.proposeDimensions()
      void window.cut.terminalStart(dims?.cols ?? 80, dims?.rows ?? 24)
    }
    start()

    const onData = term.onData((data) => window.cut.terminalWrite(data))
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        window.cut.terminalResize(term.cols, term.rows)
      } catch {
        /* layout not ready */
      }
    })
    ro.observe(host)

    return () => {
      offData()
      offExit()
      onData.dispose()
      ro.disconnect()
      term.dispose()
      termRef.current = null
    }
  }, [])

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = xtermTheme(dark)
  }, [dark])

  return (
    <div className="term-wrap">
      <div className="term-h">
        <span>终端 · CLI AI 用 cutstudio 接管剪辑</span>
        <span className="term-actions">
          <button
            className="btn ghost"
            onClick={() => {
              const term = termRef.current
              const fit = fitRef.current
              if (!term || !fit) return
              fit.fit()
              void window.cut.terminalRestart(term.cols, term.rows)
            }}
          >
            重启
          </button>
          <button className="btn ghost" onClick={onClose}>
            收起
          </button>
        </span>
      </div>
      <div className="term-host" ref={hostRef} />
    </div>
  )
}
