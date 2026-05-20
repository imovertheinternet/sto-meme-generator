import { cn } from "@/lib/utils"

export function StatBadge({ label, value, className }) {
  return (
    <div className="flex flex-col items-center gap-px">
      <span className={cn("font-mono text-[22px] font-semibold text-primary", className)}>
        {value}
      </span>
      <span className="font-display text-[11px] tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  )
}
