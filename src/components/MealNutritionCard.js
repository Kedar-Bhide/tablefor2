import React from "react";

export default function MealNutritionCard({ 
  nutrition, 
  editable = false, 
  onNutritionChange = null,
  analysisStatus = "completed",
  onRetry = null,
  isRetrying = false
}) {
  if ((analysisStatus === "analyzing" || isRetrying) && (!nutrition || !nutrition.calories)) {
    return (
      <div style={styles.mealNutritionCard}>
        <div style={{ ...styles.mealNutritionRow, justifyContent: "center", alignItems: "center", padding: "10px 0" }}>
          <div className="spinner-small" style={{ marginRight: "10px" }} />
          <p style={{ margin: 0, color: "#666", fontSize: "0.9rem" }}>Calculating nutrition...</p>
        </div>
      </div>
    );
  }

  if (analysisStatus === "failed") {
    return (
      <div style={styles.mealNutritionCard}>
        <div style={{ ...styles.mealNutritionRow, flexDirection: "column", alignItems: "center", gap: "10px" }}>
          <p style={{ margin: 0, color: "#d93025", fontSize: "0.9rem", fontWeight: "600" }}>
            Failed to calculate nutrition
          </p>
          <button 
            onClick={(e) => { e.stopPropagation(); onRetry && onRetry(); }}
            style={{
              padding: "6px 16px",
              backgroundColor: "#ff6b6b",
              color: "white",
              border: "none",
              borderRadius: "20px",
              fontSize: "0.8rem",
              fontWeight: "600",
              cursor: "pointer"
            }}
          >
            Retry Analysis
          </button>
        </div>
      </div>
    );
  }

  if (!editable && (!nutrition || !nutrition.calories || nutrition.calories <= 0)) return null;

  return (
    <>
      <style>
        {`
          .editable-macro {
            padding: 0 4px;
            border-radius: 4px;
            transition: all 0.2s ease;
          }
          .editable-macro:focus {
            outline: 1px dashed #aaa !important;
            background-color: #fff;
            padding: 0 4px;
          }
          .spinner-small {
            width: 16px;
            height: 16px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #ff6b6b;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <div style={styles.mealNutritionCard}>
        <div style={styles.mealNutritionRow}>
          {[
            { label: "Calories", key: "calories", unit: "kcal" },
            { label: "Protein", key: "protein_g", unit: "g" },
            { label: "Carbs", key: "carbs_g", unit: "g" },
            { label: "Fat", key: "fat_g", unit: "g" },
            { label: "Fiber", key: "fiber_g", unit: "g" },
          ].map((m, idx, arr) => (
            <React.Fragment key={m.key}>
              <div style={styles.mealNutritionPill}>
                <p style={styles.mealNutritionLabel}>{m.label}</p>
                <p style={styles.mealNutritionValue}>
                  <span 
                    className="editable-macro"
                    contentEditable={editable} 
                    suppressContentEditableWarning 
                    onBlur={(e) => onNutritionChange && onNutritionChange(m.key, Number(e.target.innerText.replace(/\D/g, '')))}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.target.blur())}
                    style={{ outline: "none", cursor: editable ? "text" : "default" }}
                  >
                    {Math.round(nutrition[m.key] || 0)}
                  </span>
                  <span style={styles.mealNutritionUnit}>{m.unit}</span>
                </p>
              </div>
              {idx < arr.length - 1 && <div style={styles.separator} />}
            </React.Fragment>
          ))}
        </div>
      </div>
    </>
  );
}

const styles = {
  mealNutritionCard: {
    backgroundColor: "#fff",
    borderRadius: "16px",
    padding: "1rem",
    marginBottom: "1rem",
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },
  mealNutritionRow: {
    display: "flex",
    gap: "0.25rem",
    justifyContent: "space-between",
  },
  mealNutritionPill: {
    flex: 1,
    textAlign: "center",
    minWidth: 0, // Allow shrinking
  },
  mealNutritionLabel: {
    fontSize: "0.58rem",
    color: "#888",
    margin: "0 0 4px 0",
    textTransform: "uppercase",
    fontWeight: "600",
    letterSpacing: "0.02em",
  },
  mealNutritionValue: {
    fontSize: "0.85rem",
    fontWeight: "800",
    color: "#333",
    margin: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  mealNutritionUnit: {
    fontSize: "0.6rem",
    color: "#aaa",
    fontWeight: "400",
    marginLeft: "1px",
    pointerEvents: "none"
  },
  separator: {
    width: "1px",
    backgroundColor: "#eee",
    height: "20px",
    alignSelf: "center",
  }
};
