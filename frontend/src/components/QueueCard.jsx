import { fmt, scoreColor, sourceIcon } from "@/lib/helpers"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function QueueCard({ meme, selected, onClick }) {
  const isSelected = selected?.id === meme.id

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5 border-b border-border cursor-pointer transition-all",
        "hover:bg-accent",
        isSelected
          ? "bg-primary-glow border-l-[3px] border-l-primary"
          : "bg-transparent border-l-[3px] border-l-transparent"
      )}
    >
      {/* Thumbnail */}
      <div className="w-[52px] h-[52px] shrink-0 bg-muted rounded-none overflow-hidden">
        {meme.image_url ? (
          <img
            src={meme.image_url}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => (e.target.style.display = "none")}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xl">
            {meme.is_video ? "🎬" : "🖼️"}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px]">{sourceIcon[meme.source] ?? "📄"}</span>
          <span className="font-display text-[11px] tracking-wider text-muted-foreground uppercase">
            {meme.source}
          </span>
          {meme.ai_legal_flag && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              IP
            </Badge>
          )}
        </div>
        <p className="text-xs text-foreground truncate">
          {meme.caption || "(no caption)"}
        </p>
      </div>

      {/* Score */}
      <div className={cn("font-mono text-lg font-bold shrink-0 w-[34px] text-right", scoreColor(meme.ai_score))}>
        {fmt(meme.ai_score)}
      </div>
    </div>
  )
}
