import { useState, useEffect } from "react"
import { sourceIcon } from "@/lib/helpers"
import { ScorePill } from "@/components/ScorePill"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

export function DetailPanel({ meme, onDecide, deciding }) {
  const [notes, setNotes] = useState("")

  useEffect(() => {
    setNotes(meme?.user_notes ?? "")
  }, [meme?.id])

  if (!meme) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
        <span className="font-display text-base tracking-widest uppercase">
          Select a meme to review
        </span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Image */}
      <div className="flex-1 overflow-hidden bg-muted flex items-center justify-center min-h-[200px]">
        {meme.is_video ? (
          <div className="text-center text-muted-foreground">
            <div className="text-5xl mb-2">🎬</div>
            <a
              href={meme.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-primary text-xs hover:underline"
            >
              Open video in browser
            </a>
          </div>
        ) : (
          <img
            src={meme.image_url}
            alt={meme.caption}
            className="max-w-full max-h-full object-contain"
            onError={(e) => (e.target.style.display = "none")}
          />
        )}
      </div>

      {/* Scores bar */}
      <div className="flex justify-around px-5 py-3.5 bg-card border-y border-border">
        <ScorePill label="Overall" value={meme.ai_score} />
        <ScorePill label="Humor" value={meme.ai_humor_score} />
        <ScorePill label="Patch Fit" value={meme.ai_patch_score} />
        <ScorePill label="Original" value={meme.ai_originality_score} />
        {meme.ai_legal_flag && (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-lg">⚠️</span>
            <span className="font-display text-[11px] tracking-wider text-destructive uppercase">
              IP Risk
            </span>
          </div>
        )}
      </div>

      {/* Meta + reasoning */}
      <div className="px-4 py-3.5 border-b border-border flex flex-col gap-2">
        <p className="text-[13px] text-foreground leading-relaxed">
          {meme.caption || "(no caption)"}
        </p>
        {meme.ai_reasoning && (
          <Card size="sm" className="p-0 gap-0">
            <CardContent className="px-3 py-2 text-[11px] text-muted-foreground leading-relaxed italic border-l-2 border-l-primary/40 break-words">
              {meme.ai_reasoning}
            </CardContent>
          </Card>
        )}
        <div className="flex gap-3 text-[11px] text-muted-foreground font-mono">
          <span>♥ {meme.likes?.toLocaleString()}</span>
          <span>{sourceIcon[meme.source]} {meme.source}</span>
          <a
            href={meme.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-primary/60 no-underline hover:text-primary"
          >
            source
          </a>
        </div>
      </div>

      {/* Notes */}
      <div className="px-4 py-2.5 border-b border-border">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="h-14 text-xs"
        />
      </div>

      {/* Decision buttons */}
      <div className="flex shrink-0 border-t border-border">
        <Button
          variant="approve"
          disabled={deciding}
          onClick={() => onDecide(meme.id, "approved", notes)}
          className="flex-1 h-11 rounded-none font-heading text-xs tracking-wide uppercase"
        >
          Approve
        </Button>
        <Button
          variant="save"
          disabled={deciding}
          onClick={() => onDecide(meme.id, "saved", notes)}
          className="flex-1 h-11 rounded-none font-heading text-xs tracking-wide uppercase"
        >
          Save
        </Button>
        <Button
          variant="reject"
          disabled={deciding}
          onClick={() => onDecide(meme.id, "rejected", notes)}
          className="flex-1 h-11 rounded-none font-heading text-xs tracking-wide uppercase"
        >
          Pass
        </Button>
      </div>
    </div>
  )
}
