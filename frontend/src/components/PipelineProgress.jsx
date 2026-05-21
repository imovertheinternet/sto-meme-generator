import { cn } from "@/lib/utils"

const STEP_LABELS = ["Scraping", "Deduplicating", "AI Scoring", "Saving", "Complete"]

export function PipelineProgress({ pipeline }) {
  if (!pipeline || !pipeline.running) return null

  const { step, total_steps, label, detail, scoring_done, scoring_total } = pipeline
  const pct = total_steps > 0 ? Math.round((step / total_steps) * 100) : 0

  // For scoring step, use per-meme progress
  const scoringPct =
    step === 3 && scoring_total > 0
      ? Math.round((scoring_done / scoring_total) * 100)
      : null

  return (
    <div className="bg-card border-b border-border px-5 py-2.5 flex items-center gap-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <span className="font-heading text-xs text-foreground">
          Step {step}/{total_steps}
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex-1 flex flex-col gap-1">
        <div className="h-1.5 bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${scoringPct ?? pct}%` }}
          />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-muted-foreground">{label}</span>
          <span className="text-[11px] text-muted-foreground font-mono">
            {scoringPct != null ? `${scoring_done}/${scoring_total} memes` : detail}
          </span>
        </div>
      </div>

      {/* Step dots */}
      <div className="flex gap-1.5 shrink-0">
        {STEP_LABELS.map((s, i) => (
          <div
            key={s}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-colors",
              i + 1 < step ? "bg-primary" :
              i + 1 === step ? "bg-primary animate-pulse" :
              "bg-muted-foreground/30"
            )}
            title={s}
          />
        ))}
      </div>
    </div>
  )
}
