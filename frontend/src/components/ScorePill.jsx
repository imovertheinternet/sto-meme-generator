import { fmt, scoreColor } from "@/lib/helpers"
import { cn } from "@/lib/utils"

export function ScorePill({ label, value }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn("font-mono text-xl font-semibold", scoreColor(value))}>
        {fmt(value)}
      </span>
      <span className="font-display text-[11px] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  )
}
