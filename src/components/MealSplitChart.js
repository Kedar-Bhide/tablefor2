import React from "react";

function MealSplitChart({ data, totalLabel = "meals" }) {
  if (!data || data.length === 0) {
    return <p style={{ color: "#999", fontSize: "0.85rem", textAlign: "center", padding: "2rem 0" }}>No meals</p>;
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div style={{ width: "100%", padding: "0.5rem 0" }}>
      {/* Total count */}
      <div style={{ textAlign: "center", marginBottom: "1rem" }}>
        <span style={{ fontSize: "1.6rem", fontWeight: "bold", color: "#333" }}>{total}</span>
        <span style={{ fontSize: "0.75rem", color: "#888", marginLeft: "4px" }}>{totalLabel}</span>
      </div>

      {/* Stacked bar */}
      <div style={{
        display: "flex",
        height: "14px",
        borderRadius: "7px",
        overflow: "hidden",
        marginBottom: "1rem",
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.06)",
      }}>
        {data.map((entry, i) => (
          <div
            key={entry.name}
            style={{
              width: `${(entry.value / total) * 100}%`,
              backgroundColor: entry.color,
              transition: "width 0.4s ease",
            }}
          />
        ))}
      </div>

      {/* Legend rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
        {data.map((entry) => {
          const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
          return (
            <div key={entry.name} style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}>
              <div style={{
                width: "10px",
                height: "10px",
                borderRadius: "3px",
                backgroundColor: entry.color,
                flexShrink: 0,
              }} />
              <span style={{ fontSize: "0.8rem", color: "#555", flex: 1 }}>{entry.name}</span>
              <span style={{ fontSize: "0.75rem", color: "#999", fontVariantNumeric: "tabular-nums" }}>
                {entry.value}
              </span>
              <span style={{ fontSize: "0.7rem", color: "#bbb", width: "32px", textAlign: "right" }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MealSplitChart;
