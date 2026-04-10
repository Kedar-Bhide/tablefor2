import React from "react";

export default function MealNutritionCard({ nutrition }) {
  if (!nutrition || !nutrition.calories || nutrition.calories <= 0) return null;

  return (
    <div style={styles.mealNutritionCard}>
      <p style={styles.mealNutritionTitle}>
        Total Calories: {nutrition.calories} kcal
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
              {nutrition[m.key] || 0}g
            </p>
          </div>
        ))}
      </div>
    </div>
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
    color: "#bbb",
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
};
