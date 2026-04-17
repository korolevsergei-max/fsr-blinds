"use client";

export function PrintToolbar({ count }: { count: number }) {
  return (
    <div className="no-print" style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      background: "#1a1a1a",
      color: "#fff",
      padding: "0.5rem 1rem",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "1rem",
      fontFamily: "Arial, sans-serif",
      fontSize: "13px",
    }}>
      <span>{count} blind{count === 1 ? "" : "s"} · {count} page{count === 1 ? "" : "s"} · Avery 2315</span>
      <button
        onClick={() => window.print()}
        style={{
          background: "#3b82f6",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          padding: "0.4rem 1rem",
          cursor: "pointer",
          fontWeight: "600",
          fontSize: "13px",
        }}
      >
        Print / Save PDF
      </button>
    </div>
  );
}
