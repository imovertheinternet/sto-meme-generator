import { useState, useEffect, useCallback } from "react"
import { API } from "@/lib/helpers"
import { Header } from "@/components/Header"
import { QueueCard } from "@/components/QueueCard"
import { DetailPanel } from "@/components/DetailPanel"
import { HistoryPanel } from "@/components/HistoryPanel"

export default function App() {
  const [view, setView] = useState("queue")
  const [queue, setQueue] = useState([])
  const [selected, setSelected] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [triggering, setTriggering] = useState(false)

  const loadQueue = useCallback(async () => {
    setLoading(true)
    try {
      const [q, s] = await Promise.all([
        fetch(`${API}/queue?limit=100`).then((r) => r.json()),
        fetch(`${API}/stats`).then((r) => r.json()),
      ])
      setQueue(q)
      setStats(s)
      if (q.length > 0 && !selected) setSelected(q[0])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadQueue()
  }, [loadQueue])

  const handleDecide = async (id, status, notes) => {
    setDeciding(true)
    try {
      await fetch(`${API}/meme/${id}/decide`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, user_notes: notes }),
      })
      const updated = queue.filter((m) => m.id !== id)
      setQueue(updated)
      setSelected(updated[0] ?? null)
      setStats((s) =>
        s ? { ...s, pending: s.pending - 1, [status]: (s[status] ?? 0) + 1 } : s
      )
    } finally {
      setDeciding(false)
    }
  }

  const handleTrigger = async () => {
    setTriggering(true)
    await fetch(`${API}/run`, { method: "POST" })
    setTimeout(() => {
      setTriggering(false)
      loadQueue()
    }, 3000)
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header
        stats={stats}
        view={view}
        setView={setView}
        onTrigger={handleTrigger}
        triggering={triggering}
      />

      {view === "queue" ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Queue list */}
          <div className="w-80 shrink-0 border-r border-border overflow-y-auto">
            {loading && (
              <div className="p-5 text-muted-foreground text-center">Loading...</div>
            )}
            {!loading && queue.length === 0 && (
              <div className="py-10 text-center text-muted-foreground">
                <div className="font-display text-sm tracking-widest uppercase mb-2">
                  Queue empty
                </div>
                <div className="text-xs">Hit "Run Now" to fetch new memes</div>
              </div>
            )}
            {queue.map((m) => (
              <QueueCard
                key={m.id}
                meme={m}
                selected={selected}
                onClick={() => setSelected(m)}
              />
            ))}
          </div>

          <DetailPanel
            meme={selected}
            onDecide={handleDecide}
            deciding={deciding}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <HistoryPanel onStatsChange={loadQueue} />
        </div>
      )}
    </div>
  )
}
