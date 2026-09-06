import type { Project } from '@shared/types'

export function ReviewPanel({
  project,
  onUndo,
  onRestore
}: {
  project: Project
  onUndo: () => void
  onRestore: (id: string) => void
}) {
  const aiReview = project.review.filter((a) => a.source === 'ai' || a.source === 'mcp')
  return (
    <section className="panel">
      <div className="panel-h">
        <span>审查</span>
        <button className="btn ghost" onClick={onUndo} disabled={aiReview.length === 0}>
          撤销
        </button>
      </div>
      <div className="review">
        {aiReview.length === 0 ? (
          <div className="drop-hint" style={{ margin: 4 }}>
            这里只显示 AI 的改动。命令条、MCP 或终端里的剪辑会出现在此，便于你检查和撤销。
          </div>
        ) : (
          aiReview.map((a) => (
            <div key={a.id} className={'action ' + a.risk}>
              <div className="who">
                <span>{a.source === 'mcp' ? 'MCP / CLI' : 'AI'}</span>
                <span>{new Date(a.at).toLocaleTimeString()}</span>
              </div>
              <p>{a.summary}</p>
            </div>
          ))
        )}
        {project.snapshots.length > 0 ? (
          <>
            <div className="panel-h" style={{ padding: '12px 4px 0' }}>
              版本
            </div>
            {project.snapshots
              .slice()
              .reverse()
              .slice(0, 8)
              .map((s) => (
                <button key={s.id} className="btn" onClick={() => onRestore(s.id)}>
                  恢复：{s.label}
                </button>
              ))}
          </>
        ) : null}
      </div>
    </section>
  )
}
