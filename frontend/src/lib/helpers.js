export const API = "/api"

export const fmt = (n) => n?.toFixed(1) ?? "—"

export const scoreColor = (n) => {
  if (n == null) return "text-muted-foreground"
  if (n >= 7.5) return "text-green-ok"
  if (n >= 5.0) return "text-primary"
  return "text-red-no"
}

export const scoreColorRaw = (n) => {
  if (n == null) return "#4a4540"
  if (n >= 7.5) return "#4a7c59"
  if (n >= 5.0) return "#a3e635"
  return "#7c2d2d"
}

export const sourceIcon = {
  instagram: "📸",
  tiktok: "🎵",
  reddit: "🤖",
  manual: "✋",
}
