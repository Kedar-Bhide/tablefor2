import React from "react";

export default function MealNutritionCard({ nutrition, editable = false, onNutritionChange = null }) {
  if (!nutrition || !nutrition.calories || nutrition.calories <= 0) return null;

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
          ].map((m) => (
            <div key={m.key} style={styles.mealNutritionPill}>
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
                  {nutrition[m.key] || 0}
                </span>
                <span style={styles.mealNutritionUnit}>{m.unit}</span>
              </p>
            </div>
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
  }
};
