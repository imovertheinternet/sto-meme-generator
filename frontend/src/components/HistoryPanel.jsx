import { useState, useEffect, useCallback, useRef } from "react"
import { API, fmt, scoreColor, sourceIcon } from "@/lib/helpers"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

function MemeGrid({ items, loading, selectedMeme, setSelectedMeme, selectMode, selectedIds, onToggleSelect }) {
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
      {items.map((m) => {
        const isSelected = selectMode && selectedIds.has(m.id)
        return (
          <Card
            key={m.id}
            size="sm"
            onClick={() => {
              if (selectMode) {
                onToggleSelect(m.id)
              } else {
                setSelectedMeme(m)
              }
            }}
            className={cn(
              "cursor-pointer overflow-hidden transition-all p-0 gap-0 relative",
              selectMode && isSelected
                ? "ring-2 ring-primary"
                : selectMode
                  ? "hover:ring-1 hover:ring-primary/50 opacity-70"
                  : selectedMeme?.id === m.id
                    ? "ring-2 ring-primary"
                    : "hover:ring-1 hover:ring-primary/50"
            )}
          >
            {selectMode && (
              <div className="absolute top-1.5 left-1.5 z-10">
                <div
                  className={cn(
                    "w-5 h-5 border-2 flex items-center justify-center transition-colors",
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-background/80 border-muted-foreground/50 backdrop-blur-sm"
                  )}
                >
                  {isSelected && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
            )}
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
        )
      })}
    </div>
  )
}

/** Get a serveable image URL — prefer local copy, fall back to original */
function getImageUrl(meme) {
  if (meme.local_image_path) {
    const filename = meme.local_image_path.split("/").pop()
    return `${API}/images/${filename}`
  }
  return meme.image_url
}

function EmailCompose({ memes, onClose }) {
  const [copied, setCopied] = useState(false)
  const composeRef = useRef(null)

  const handleCopy = async () => {
    const el = composeRef.current
    if (!el) return

    try {
      // Copy rich HTML so images paste into email clients
      const html = el.innerHTML
      const blob = new Blob([html], { type: "text/html" })
      const textBlob = new Blob([el.innerText], { type: "text/plain" })
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": blob,
          "text/plain": textBlob,
        }),
      ])
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback: select + copy
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      document.execCommand("copy")
      sel.removeAllRanges()
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const handleOpenEmail = () => {
    const count = memes.length
    const subject = `Mockup & Quote Request - ${count} Design${count > 1 ? "s" : ""}`
    const body = `Hello,\n\nI'd like to get a mockup and quote for the ${count} design${count > 1 ? "s" : ""} I've pasted below.\n\nPlease let me know pricing, turnaround time, and any questions about the designs.\n\nThank you`
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_self")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="font-heading text-sm tracking-wide uppercase text-foreground">
            Email Inquiry — {memes.length} Design{memes.length > 1 ? "s" : ""}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
        </div>

        {/* Compose preview (this is what gets copied) */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div ref={composeRef} style={{ fontFamily: "Arial, sans-serif", color: "#222", fontSize: "14px", lineHeight: "1.6" }}>
            <p>Hello,</p>
            <p>I'd like to get a mockup and quote for the following {memes.length} design{memes.length > 1 ? "s" : ""}:</p>

            {memes.map((m, i) => (
              <div key={m.id} style={{ marginBottom: "20px" }}>
                <p style={{ fontWeight: "bold", marginBottom: "6px" }}>Design {i + 1}</p>
                <img
                  src={getImageUrl(m)}
                  alt={`Design ${i + 1}`}
                  style={{ maxWidth: "400px", maxHeight: "400px", display: "block", border: "1px solid #ddd" }}
                  crossOrigin="anonymous"
                />
                {m.caption && (
                  <p style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>{m.caption}</p>
                )}
              </div>
            ))}

            <p>Please let me know pricing, turnaround time, and any questions about the designs.</p>
            <p>Thank you</p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between shrink-0">
          <p className="text-[11px] text-muted-foreground max-w-[280px]">
            Copy this content, then paste it into your email body
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleOpenEmail} className="font-heading text-[11px] tracking-wide uppercase">
              Open Email Client
            </Button>
            <Button variant="default" size="sm" onClick={handleCopy} className="font-heading text-[11px] tracking-wide uppercase gap-1.5">
              {copied ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7L6 10L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Copied
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="4.5" y="4.5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" /><path d="M9.5 4.5V2.5C9.5 1.95 9.05 1.5 8.5 1.5H2.5C1.95 1.5 1.5 1.95 1.5 2.5V8.5C1.5 9.05 1.95 9.5 2.5 9.5H4.5" stroke="currentColor" strokeWidth="1.3" /></svg>
                  Copy to Clipboard
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function HistoryPanel({ onStatsChange }) {
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState("approved")
  const [loading, setLoading] = useState(false)
  const [selectedMeme, setSelectedMeme] = useState(null)
  const [changing, setChanging] = useState(false)

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showCompose, setShowCompose] = useState(false)

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

  const toggleSelectMode = () => {
    if (selectMode) {
      setSelectMode(false)
      setSelectedIds(new Set())
    } else {
      setSelectMode(true)
      setSelectedMeme(null)
    }
  }

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map((m) => m.id)))
    }
  }

  const handleEmailInquiry = () => {
    if (selectedIds.size === 0) return
    setShowCompose(true)
  }

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
  const selectedCount = selectedIds.size
  const selectedMemes = items.filter((m) => selectedIds.has(m.id))

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left side: tabs + grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Tabs value={filter} onValueChange={(v) => { setFilter(v); setSelectedMeme(null); setSelectMode(false); setSelectedIds(new Set()) }} className="flex-1 flex flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border px-4 pt-2 flex items-center gap-3">
            <TabsList className="flex-1">
              <TabsTrigger value="approved" className="flex-1">Approved</TabsTrigger>
              <TabsTrigger value="saved" className="flex-1">Saved</TabsTrigger>
              <TabsTrigger value="rejected" className="flex-1">Rejected</TabsTrigger>
            </TabsList>
            <Button
              variant={selectMode ? "default" : "outline"}
              size="sm"
              onClick={toggleSelectMode}
              className="font-heading text-[11px] tracking-wide uppercase shrink-0"
            >
              {selectMode ? "Cancel" : "Select"}
            </Button>
          </div>
          <TabsContent value={filter} className="flex-1 overflow-hidden m-0">
            <MemeGrid
              items={items}
              loading={loading}
              selectedMeme={selectedMeme}
              setSelectedMeme={setSelectedMeme}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
            />
          </TabsContent>
        </Tabs>

        {/* Floating action bar */}
        {selectMode && (
          <div className="shrink-0 border-t border-border bg-card px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="font-heading text-[11px] tracking-wide uppercase"
              >
                {selectedIds.size === items.length ? "Deselect All" : "Select All"}
              </Button>
              <span className="text-[11px] text-muted-foreground font-mono">
                {selectedCount} selected
              </span>
            </div>
            <Button
              variant="default"
              size="default"
              disabled={selectedCount === 0}
              onClick={handleEmailInquiry}
              className="font-heading tracking-wide uppercase gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                <rect x="1" y="3" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <path d="M1 4L8 9L15 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Email Inquiry
            </Button>
          </div>
        )}
      </div>

      {/* Selected meme detail sidebar (hidden in select mode) */}
      {!selectMode && selectedMeme && (
        <div className="w-[340px] shrink-0 border-l border-border flex flex-col overflow-y-auto">
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

      {/* Email compose modal */}
      {showCompose && (
        <EmailCompose
          memes={selectedMemes}
          onClose={() => setShowCompose(false)}
        />
      )}
    </div>
  )
}
