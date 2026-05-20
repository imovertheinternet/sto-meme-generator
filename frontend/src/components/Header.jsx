import { StatBadge } from "@/components/StatBadge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function Header({ stats, view, setView, onTrigger, triggering }) {
  return (
    <header className="flex items-center gap-5 px-5 h-[52px] bg-card border-b border-border shrink-0">
      {/* Logo */}
      <div className="flex items-baseline gap-2 shrink-0">
        <span className="font-display font-extrabold text-xl tracking-[0.12em] text-amber uppercase">
          STO
        </span>
        <span className="font-display text-[13px] tracking-[0.18em] text-muted-foreground uppercase">
          Meme Agent
        </span>
      </div>

      {/* Stats */}
      {stats && (
        <div className="flex gap-6 ml-2">
          <StatBadge label="Queue" value={stats.pending} />
          <StatBadge label="Approved" value={stats.approved} className="text-green-ok" />
          <StatBadge label="Saved" value={stats.saved} className="text-blue-save" />
          <StatBadge label="Rejected" value={stats.rejected} className="text-red-no" />
        </div>
      )}

      <div className="ml-auto flex gap-4 items-center">
        {/* View toggle */}
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Manual trigger */}
        <Button
          onClick={onTrigger}
          disabled={triggering}
          size="sm"
          className="font-heading"
        >
          {triggering ? "Running..." : "Run Now"}
        </Button>
      </div>
    </header>
  )
}
