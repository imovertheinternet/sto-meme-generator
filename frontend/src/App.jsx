import { useState, useEffect, useCallback } from "react";

const API = "/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n) => n?.toFixed(1) ?? "—";

const scoreColor = (n) => {
  if (n == null) return "#4a4540";
  if (n >= 7.5) return "#4a7c59";
  if (n >= 5.0) return "#c9a84c";
  return "#7c2d2d";
};

const sourceIcon = {
  instagram: "📸",
  tiktok: "🎵",
  reddit: "🤖",
  manual: "✋",
};

function ScorePill({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 20,
          fontWeight: 600,
          color: scoreColor(value),
        }}
      >
        {fmt(value)}
      </span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 11,
          letterSpacing: "0.08em",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 22,
          fontWeight: 600,
          color: color ?? "var(--amber)",
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 11,
          letterSpacing: "0.1em",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Queue Card ────────────────────────────────────────────────────────────────

function QueueCard({ meme, selected, onClick }) {
  const isSelected = selected?.id === meme.id;
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 12px",
        background: isSelected ? "var(--amber-glow)" : "transparent",
        borderLeft: `3px solid ${isSelected ? "var(--amber)" : "transparent"}`,
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        transition: "var(--transition)",
        alignItems: "center",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = "transparent";
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          width: 52,
          height: 52,
          flexShrink: 0,
          background: "var(--bg-elevated)",
          borderRadius: "var(--radius)",
          overflow: "hidden",
        }}
      >
        {meme.image_url ? (
          <img
            src={meme.image_url}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => (e.target.style.display = "none")}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            {meme.is_video ? "🎬" : "🖼️"}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 3,
          }}
        >
          <span style={{ fontSize: 11 }}>
            {sourceIcon[meme.source] ?? "📄"}
          </span>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 11,
              letterSpacing: "0.06em",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
            }}
          >
            {meme.source}
          </span>
          {meme.ai_legal_flag && (
            <span
              style={{
                fontSize: 10,
                color: "#c9a84c",
                background: "rgba(201,168,76,0.15)",
                padding: "1px 5px",
                borderRadius: 2,
              }}
            >
              ⚠ IP
            </span>
          )}
        </div>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {meme.caption || "(no caption)"}
        </p>
      </div>

      {/* Score */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 700,
          color: scoreColor(meme.ai_score),
          flexShrink: 0,
          width: 34,
          textAlign: "right",
        }}
      >
        {fmt(meme.ai_score)}
      </div>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ meme, onDecide, deciding }) {
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setNotes(meme?.user_notes ?? "");
  }, [meme?.id]);

  if (!meme) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-dim)",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 48 }}>🎯</div>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Select a meme to review
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Image */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          background: "var(--bg-elevated)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 200,
        }}
      >
        {meme.is_video ? (
          <div style={{ textAlign: "center", color: "var(--text-secondary)" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎬</div>
            <a
              href={meme.source_url}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--amber)", fontSize: 12 }}
            >
              Open video in browser →
            </a>
          </div>
        ) : (
          <img
            src={meme.image_url}
            alt={meme.caption}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
            }}
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        )}
      </div>

      {/* Scores bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          padding: "14px 20px",
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <ScorePill label="Overall" value={meme.ai_score} />
        <ScorePill label="Humor" value={meme.ai_humor_score} />
        <ScorePill label="Patch Fit" value={meme.ai_patch_score} />
        <ScorePill label="Original" value={meme.ai_originality_score} />
        {meme.ai_legal_flag && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "#c9a84c",
                textTransform: "uppercase",
              }}
            >
              IP Risk
            </span>
          </div>
        )}
      </div>

      {/* Meta + reasoning */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: "var(--text-primary)",
            lineHeight: 1.5,
          }}
        >
          {meme.caption || "(no caption)"}
        </p>
        {meme.ai_reasoning && (
          <p
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              fontStyle: "italic",
              padding: "8px 10px",
              background: "var(--bg-elevated)",
              borderRadius: "var(--radius)",
              borderLeft: "2px solid var(--amber-dim)",
            }}
          >
            {meme.ai_reasoning}
          </p>
        )}
        <div
          style={{
            display: "flex",
            gap: 12,
            fontSize: 11,
            color: "var(--text-dim)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span>♥ {meme.likes?.toLocaleString()}</span>
          <span>
            {sourceIcon[meme.source]} {meme.source}
          </span>
          <a
            href={meme.source_url}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--amber-dim)", textDecoration: "none" }}
          >
            ↗ source
          </a>
        </div>
      </div>

      {/* Notes */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional) — e.g. 'use skull icon instead of text'"
          style={{
            width: "100%",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            padding: "8px 10px",
            resize: "none",
            height: 56,
            outline: "none",
          }}
        />
      </div>

      {/* Decision buttons */}
      <div style={{ display: "flex", gap: 0 }}>
        {[
          {
            status: "approved",
            label: "✅  APPROVE",
            bg: "#1a3326",
            hover: "#4a7c59",
            border: "#4a7c59",
          },
          {
            status: "saved",
            label: "🔖  SAVE",
            bg: "#1a2033",
            hover: "#2d4a7c",
            border: "#2d4a7c",
          },
          {
            status: "rejected",
            label: "❌  PASS",
            bg: "#331a1a",
            hover: "#7c2d2d",
            border: "#7c2d2d",
          },
        ].map((btn) => (
          <button
            key={btn.status}
            disabled={deciding}
            onClick={() => onDecide(meme.id, btn.status, notes)}
            style={{
              flex: 1,
              padding: "14px 8px",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: btn.bg,
              color: "var(--text-primary)",
              borderTop: `2px solid ${btn.border}`,
              borderRight: "1px solid var(--border)",
              transition: "var(--transition)",
              opacity: deciding ? 0.5 : 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = btn.hover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = btn.bg)}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── History Panel ─────────────────────────────────────────────────────────────

function HistoryPanel({ onStatsChange }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("approved");
  const [loading, setLoading] = useState(false);
  const [selectedMeme, setSelectedMeme] = useState(null);
  const [changing, setChanging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/history?status=${filter}&limit=200`);
      setItems(await r.json());
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleChangeStatus = async (meme, newStatus) => {
    setChanging(true);
    try {
      await fetch(`${API}/meme/${meme.id}/decide`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          user_notes: meme.user_notes,
        }),
      });
      setItems((prev) => prev.filter((m) => m.id !== meme.id));
      setSelectedMeme(null);
      if (onStatsChange) onStatsChange();
    } finally {
      setChanging(false);
    }
  };

  const statusColors = {
    approved: "#4a7c59",
    saved: "#2d4a7c",
    rejected: "#7c2d2d",
  };
  const otherStatuses = ["approved", "saved", "rejected"].filter(
    (s) => s !== filter,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Filter tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
        {["approved", "saved", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => {
              setFilter(s);
              setSelectedMeme(null);
            }}
            style={{
              flex: 1,
              padding: "12px 8px",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: filter === s ? statusColors[s] : "transparent",
              color: filter === s ? "#fff" : "var(--text-secondary)",
              borderBottom:
                filter === s
                  ? `2px solid ${statusColors[s]}`
                  : "2px solid transparent",
              transition: "var(--transition)",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Grid */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
            gap: 8,
            alignContent: "start",
          }}
        >
          {loading && (
            <div
              style={{
                gridColumn: "1/-1",
                color: "var(--text-dim)",
                textAlign: "center",
                padding: 40,
              }}
            >
              Loading…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div
              style={{
                gridColumn: "1/-1",
                color: "var(--text-dim)",
                textAlign: "center",
                padding: 40,
              }}
            >
              Nothing here yet
            </div>
          )}
          {items.map((m) => (
            <div
              key={m.id}
              onClick={() => setSelectedMeme(m)}
              style={{ cursor: "pointer" }}
            >
              <div
                style={{
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                  border:
                    selectedMeme?.id === m.id
                      ? "2px solid var(--amber)"
                      : "1px solid var(--border)",
                  transition: "var(--transition)",
                }}
                onMouseEnter={(e) => {
                  if (selectedMeme?.id !== m.id)
                    e.currentTarget.style.borderColor = "var(--amber-dim)";
                }}
                onMouseLeave={(e) => {
                  if (selectedMeme?.id !== m.id)
                    e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <div
                  style={{
                    height: 100,
                    background: "var(--bg-surface)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {m.image_url ? (
                    <img
                      src={m.image_url}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                      onError={(e) => (e.target.style.display = "none")}
                    />
                  ) : (
                    <span style={{ fontSize: 28 }}>🎬</span>
                  )}
                </div>
                <div
                  style={{
                    padding: "6px 8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: scoreColor(m.ai_score),
                    }}
                  >
                    {fmt(m.ai_score)}
                  </span>
                  <span style={{ fontSize: 10 }}>{sourceIcon[m.source]}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Selected meme detail sidebar */}
        {selectedMeme && (
          <div
            style={{
              width: 320,
              flexShrink: 0,
              borderLeft: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                flex: 1,
                overflow: "hidden",
                background: "var(--bg-elevated)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 180,
              }}
            >
              {selectedMeme.image_url ? (
                <img
                  src={selectedMeme.image_url}
                  alt=""
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                  }}
                />
              ) : (
                <span style={{ fontSize: 48 }}>🎬</span>
              )}
            </div>
            <div
              style={{
                padding: "12px 14px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-primary)",
                  lineHeight: 1.5,
                }}
              >
                {selectedMeme.caption || "(no caption)"}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  fontSize: 11,
                  color: "var(--text-dim)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span>♥ {selectedMeme.likes?.toLocaleString()}</span>
                <span>
                  {sourceIcon[selectedMeme.source]} {selectedMeme.source}
                </span>
                <a
                  href={selectedMeme.source_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--amber-dim)", textDecoration: "none" }}
                >
                  ↗ source
                </a>
              </div>
              {selectedMeme.ai_reasoning && (
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                    fontStyle: "italic",
                    padding: "6px 8px",
                    background: "var(--bg-surface)",
                    borderRadius: "var(--radius)",
                    borderLeft: "2px solid var(--amber-dim)",
                  }}
                >
                  {selectedMeme.ai_reasoning}
                </p>
              )}
            </div>
            <div
              style={{
                padding: "10px 14px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Move to:
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {otherStatuses.map((s) => (
                  <button
                    key={s}
                    disabled={changing}
                    onClick={() => handleChangeStatus(selectedMeme, s)}
                    style={{
                      flex: 1,
                      padding: "10px 8px",
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: 12,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      background: statusColors[s],
                      color: "#fff",
                      borderRadius: "var(--radius)",
                      transition: "var(--transition)",
                      opacity: changing ? 0.5 : 1,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState("queue"); // queue | history
  const [queue, setQueue] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const [q, s] = await Promise.all([
        fetch(`${API}/queue?limit=100`).then((r) => r.json()),
        fetch(`${API}/stats`).then((r) => r.json()),
      ]);
      setQueue(q);
      setStats(s);
      if (q.length > 0 && !selected) setSelected(q[0]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleDecide = async (id, status, notes) => {
    setDeciding(true);
    try {
      await fetch(`${API}/meme/${id}/decide`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, user_notes: notes }),
      });
      const updated = queue.filter((m) => m.id !== id);
      setQueue(updated);
      setSelected(updated[0] ?? null);
      setStats((s) =>
        s
          ? { ...s, pending: s.pending - 1, [status]: (s[status] ?? 0) + 1 }
          : s,
      );
    } finally {
      setDeciding(false);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    await fetch(`${API}/run`, { method: "POST" });
    setTimeout(() => {
      setTriggering(false);
      loadQueue();
    }, 3000);
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 20px",
          height: 52,
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: "0.12em",
              color: "var(--amber)",
              textTransform: "uppercase",
            }}
          >
            STO
          </span>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 13,
              letterSpacing: "0.18em",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
            }}
          >
            Meme Agentf
          </span>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: "flex", gap: 20, marginLeft: 16 }}>
            <StatBadge label="Queue" value={stats.pending} />
            <StatBadge
              label="Approved"
              value={stats.approved}
              color="#4a7c59"
            />
            <StatBadge label="Saved" value={stats.saved} color="#5b6fa8" />
            <StatBadge
              label="Rejected"
              value={stats.rejected}
              color="#8a3a3a"
            />
          </div>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {/* View toggle */}
          {["queue", "history"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "6px 14px",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                background: view === v ? "var(--amber-glow)" : "transparent",
                color: view === v ? "var(--amber)" : "var(--text-secondary)",
                border: `1px solid ${view === v ? "var(--border-amber)" : "var(--border)"}`,
                borderRadius: "var(--radius)",
                transition: "var(--transition)",
              }}
            >
              {v}
            </button>
          ))}

          {/* Manual trigger */}
          <button
            onClick={handleTrigger}
            disabled={triggering}
            style={{
              padding: "6px 14px",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              background: triggering ? "var(--amber-dim)" : "var(--amber)",
              color: "#000",
              borderRadius: "var(--radius)",
              transition: "var(--transition)",
              opacity: triggering ? 0.7 : 1,
            }}
          >
            {triggering ? "⚡ Running…" : "⚡ Run Now"}
          </button>
        </div>
      </header>

      {/* Body */}
      {view === "queue" ? (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Queue list */}
          <div
            style={{
              width: 320,
              flexShrink: 0,
              borderRight: "1px solid var(--border)",
              overflowY: "auto",
            }}
          >
            {loading && (
              <div
                style={{
                  padding: 20,
                  color: "var(--text-dim)",
                  textAlign: "center",
                }}
              >
                Loading…
              </div>
            )}
            {!loading && queue.length === 0 && (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: "var(--text-dim)",
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 14,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  Queue empty
                </div>
                <div style={{ fontSize: 12 }}>
                  Hit "Run Now" to fetch new memes
                </div>
              </div>
            )}
            {queue.map((m) => (
              <QueueCard
                key={m.id}
                meme={m}
                selected={selected}
                onClick={() => setSelected(m)}
              />
            ))}
          </div>

          {/* Detail */}
          <DetailPanel
            meme={selected}
            onDecide={handleDecide}
            deciding={deciding}
          />
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <HistoryPanel onStatsChange={loadQueue} />
        </div>
      )}
    </div>
  );
}
