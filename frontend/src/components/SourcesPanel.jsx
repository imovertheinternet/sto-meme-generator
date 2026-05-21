import { useState, useEffect } from "react"
import { API } from "@/lib/helpers"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export function SourcesPanel() {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch(`${API}/sources`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  if (!data) return null

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="font-heading tracking-wide uppercase">
          {data.sources.length} Active Sources
        </span>
        <span className="text-[10px]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-5 pb-3 flex flex-col gap-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {data.sources.map((s) => (
              <Card key={s.name} size="sm" className="p-0 gap-0">
                <CardContent className="px-3 py-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-heading text-xs text-foreground">
                      {s.icon} {s.name}
                    </span>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                      {s.type === "apify" ? "Apify" : "API"}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate" title={s.actor}>
                    {s.actor}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {s.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5"
                      >
                        {s.name === "Reddit" ? `r/${tag}` : `#${tag}`}
                      </span>
                    ))}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {s.posts_per_tag} posts per {s.name === "Reddit" ? "sub" : "tag"}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex gap-4 text-[10px] text-muted-foreground font-mono">
            <span>AI: {data.ai_model}</span>
            <span>Threshold: {data.score_threshold}+</span>
          </div>
        </div>
      )}
    </div>
  )
}
