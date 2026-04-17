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
      <p style={styles.mealNutritionTitle}>
        Total Calories:{" "}
        <span 
          className="editable-macro"
          contentEditable={editable} 
          suppressContentEditableWarning 
          onBlur={(e) => onNutritionChange && onNutritionChange('calories', Number(e.target.innerText.replace(/\D/g, '')))}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.target.blur())}
          style={{ outline: "none", cursor: editable ? "text" : "default" }}
        >
          {nutrition.calories}
        </span>
        {" "}kcal
      </p>
      <div style={styles.mealNutritionRow}>
        {[
          { label: "Protein", key: "protein_g" },
          { label: "Carbs", key: "carbs_g" },
          { label: "Fat", key: "fat_g" },
          { label: "Fiber", key: "fiber_g" },
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
              <span style={styles.mealNutritionUnit}>g</span>
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
    backgroundColor: "#fafafa",
    borderRadius: "12px",
    padding: "0.8rem 1rem",
    marginBottom: "0.8rem",
  },
  mealNutritionTitle: {
    fontSize: "0.82rem",
    fontWeight: "600",
    color: "#ff6b6b",
    margin: "0 0 0.6rem 0",
  },
  mealNutritionRow: {
    display: "flex",
    gap: "0.4rem",
  },
  mealNutritionPill: {
    flex: 1,
    textAlign: "center",
  },
  mealNutritionLabel: {
    fontSize: "0.62rem",
    color: "#777",
    margin: "0 0 2px 0",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  mealNutritionValue: {
    fontSize: "0.95rem",
    fontWeight: "700",
    color: "#555",
    margin: 0,
  },
  mealNutritionUnit: {
    display: "inline-block",
    marginLeft: "1px",
    pointerEvents: "none"
  }
};
