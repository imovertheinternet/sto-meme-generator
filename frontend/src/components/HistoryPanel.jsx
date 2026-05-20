import { useState, useEffect, useCallback } from "react"
import { API, fmt, scoreColor, sourceIcon } from "@/lib/helpers"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

function MemeGrid({ items, loading, selectedMeme, setSelectedMeme }) {
  return (
    <div
      className="flex-1 overflow-y-auto p-4"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: "12px",
        alignContent: "start",
      }}
    >
      {loading && (
        <div style={{ gridColumn: "1 / -1" }} className="text-muted-foreground text-center py-10">
          Loading...
        </div>
      )}
      {!loading && items.length === 0 && (
        <div style={{ gridColumn: "1 / -1" }} className="text-muted-foreground text-center py-10">
          Nothing here yet
        </div>
      )}
      {items.map((m) => (
        <Card
          key={m.id}
          size="sm"
          onClick={() => setSelectedMeme(m)}
          className={cn(
            "cursor-pointer overflow-hidden transition-all p-0 gap-0",
            selectedMeme?.id === m.id
              ? "ring-2 ring-primary"
              : "hover:ring-1 hover:ring-primary/50"
          )}
        >
          <div className="h-[110px] bg-muted flex items-center justify-center">
            {m.image_url ? (
              <img
                src={m.image_url}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => (e.target.style.display = "none")}
              />
            ) : (
              <span className="text-3xl">🎬</span>
            )}
          </div>
          <CardContent className="px-2.5 py-2 flex justify-between items-center">
            <span className={cn("font-mono text-[11px]", scoreColor(m.ai_score))}>
              {fmt(m.ai_score)}
            </span>
            <span className="text-[10px]">{sourceIcon[m.source]}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function HistoryPanel({ onStatsChange }) {
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState("approved")
  const [loading, setLoading] = useState(false)
  const [selectedMeme, setSelectedMeme] = useState(null)
  const [changing, setChanging] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/history?status=${filter}&limit=200`)
      setItems(await r.json())
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  const handleChangeStatus = async (meme, newStatus) => {
    setChanging(true)
    try {
      await fetch(`${API}/meme/${meme.id}/decide`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, user_notes: meme.user_notes }),
      })
      setItems((prev) => prev.filter((m) => m.id !== meme.id))
      setSelectedMeme(null)
      if (onStatsChange) onStatsChange()
    } finally {
      setChanging(false)
    }
  }

  const otherStatuses = ["approved", "saved", "rejected"].filter((s) => s !== filter)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left side: tabs + grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Tabs value={filter} onValueChange={(v) => { setFilter(v); setSelectedMeme(null) }} className="flex-1 flex flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border px-4 pt-2">
            <TabsList className="w-full">
              <TabsTrigger value="approved" className="flex-1">Approved</TabsTrigger>
              <TabsTrigger value="saved" className="flex-1">Saved</TabsTrigger>
              <TabsTrigger value="rejected" className="flex-1">Rejected</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value={filter} className="flex-1 overflow-hidden m-0">
            <MemeGrid
              items={items}
              loading={loading}
              selectedMeme={selectedMeme}
              setSelectedMeme={setSelectedMeme}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Selected meme detail sidebar */}
      {selectedMeme && (
        <div className="w-[340px] shrink-0 border-l border-border flex flex-col overflow-y-auto">
          {/* Image */}
          <div className="bg-muted flex items-center justify-center min-h-[220px] max-h-[350px]">
            {selectedMeme.image_url ? (
              <img
                src={selectedMeme.image_url}
                alt=""
                className="max-w-full max-h-[350px] object-contain"
              />
            ) : (
              <span className="text-5xl">🎬</span>
            )}
          </div>

          {/* Caption & meta */}
          <div className="px-4 py-3 border-t border-border flex flex-col gap-2">
            <p className="text-xs text-foreground leading-relaxed break-words">
              {selectedMeme.caption || "(no caption)"}
            </p>
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground font-mono">
              <span>♥ {selectedMeme.likes?.toLocaleString()}</span>
              <span>{sourceIcon[selectedMeme.source]} {selectedMeme.source}</span>
              <a
                href={selectedMeme.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary/60 no-underline hover:text-primary"
              >
                source
              </a>
            </div>
            {selectedMeme.ai_reasoning && (
              <Card size="sm" className="p-0 gap-0">
                <CardContent className="px-3 py-2 text-[11px] text-muted-foreground leading-relaxed italic border-l-2 border-l-primary/40 break-words">
                  {selectedMeme.ai_reasoning}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Move to buttons */}
          <div className="px-4 py-3 border-t border-border mt-auto">
            <div className="font-display text-[11px] tracking-wider text-muted-foreground uppercase mb-2">
              Move to:
            </div>
            <div className="flex gap-2">
              {otherStatuses.map((s) => (
                <Button
                  key={s}
                  variant={s === "approved" ? "approve" : s === "rejected" ? "reject" : "save"}
                  size="sm"
                  disabled={changing}
                  onClick={() => handleChangeStatus(selectedMeme, s)}
                  className="flex-1 font-heading tracking-wide uppercase"
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
