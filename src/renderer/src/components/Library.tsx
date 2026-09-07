import { useEffect, useState } from 'react'
import type { MediaAsset } from '@shared/types'
import { formatTimecode, mediaUrl } from '../lib/format'

export function Library({
  assets,
  selectedId,
  onSelect,
  onImport,
  onAddToTimeline,
  onDelete
}: {
  assets: MediaAsset[]
  selectedId: string | null
  onSelect: (id: string) => void
  onImport: () => void
  onAddToTimeline: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: Event) => {
      if ((e.target as HTMLElement).closest?.('.ctx-menu')) return
      setMenu(null)
    }
    const timer = window.setTimeout(() => {
      window.addEventListener('mousedown', close)
      window.addEventListener('contextmenu', close)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('mousedown', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [menu])

  return (
    <section className="panel">
      <div className="panel-h">
        <span>项目</span>
        <span className="row" style={{ gap: 6 }}>
          <button className="btn ghost" onClick={onImport}>
            导入
          </button>
          <button
            className="btn ghost"
            disabled={!selectedId}
            onClick={() => {
              if (selectedId) onDelete(selectedId)
            }}
          >
            删除
          </button>
        </span>
      </div>
      {assets.length === 0 ? (
        <div className="drop-hint">把已经录制好的影片拖到这里或点击导入。右键也可删除。</div>
      ) : (
        <div className="library-grid">
          {assets.map((a) => (
            <div
              key={a.id}
              className={'asset' + (selectedId === a.id ? ' selected' : '')}
              onClick={() => onSelect(a.id)}
              onDoubleClick={() => onAddToTimeline(a.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSelect(a.id)
                setMenu({ x: e.clientX, y: e.clientY, id: a.id })
              }}
            >
              <div
                className="thumb"
                style={{
                  aspectRatio: a.width > 0 && a.height > 0 ? `${a.width} / ${a.height}` : '16 / 9'
                }}
              >
                {a.thumbPath ? (
                  <img src={mediaUrl(a.thumbPath)} alt="" />
                ) : a.kind === 'video' ? (
                  <video src={mediaUrl(a.path)} muted />
                ) : a.kind === 'image' ? (
                  <img src={mediaUrl(a.path)} alt="" />
                ) : (
                  a.kind
                )}
              </div>
              <div className="meta">
                <b title={a.name}>{a.name}</b>
                <small>
                  {a.durationMs ? formatTimecode(a.durationMs) : '读取中…'}
                  {a.proxyPath ? ' · 代理' : ''}
                </small>
                <button
                  type="button"
                  className="asset-del"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onDelete(a.id)
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {menu ? (
        <div
          className="ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              onAddToTimeline(menu.id)
              setMenu(null)
            }}
          >
            加到故事线
          </button>
          <button
            type="button"
            className="danger"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              onDelete(menu.id)
              setMenu(null)
            }}
          >
            删除素材
          </button>
        </div>
      ) : null}
    </section>
  )
}
