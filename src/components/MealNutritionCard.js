import React, { useState } from "react";

// Client-side Habit Spectrum Classifier (Professional Nutritionist Standard)
export const getHabitCategories = (nutrition) => {
  if (!nutrition || !nutrition.calories || nutrition.calories <= 0) return [];
  const { calories, protein_g, carbs_g, fat_g, fiber_g } = nutrition;
  const categories = [];

  const proteinCals = protein_g * 4;
  const carbCals = carbs_g * 4;
  const fatCals = fat_g * 9;

  const proteinPct = calories > 0 ? proteinCals / calories : 0;
  const carbPct = calories > 0 ? carbCals / calories : 0;
  const fatPct = calories > 0 ? fatCals / calories : 0;

  // 💪 Strength
  if (protein_g >= 20 || proteinPct >= 0.30) {
    categories.push({
      id: "strength",
      name: "Strength",
      color: "#3b82f6",
      bg: "#eff6ff",
      emoji: "💪",
      desc: "Protein Forward",
      score: proteinPct * 100 + protein_g
    });
  }

  // 🔋 Fuel
  if (carbs_g >= 40 || carbPct >= 0.50) {
    categories.push({
      id: "fuel",
      name: "Fuel",
      color: "#d97706",
      bg: "#fffbeb",
      emoji: "🔋",
      desc: "Carb Energy",
      score: carbPct * 100 + carbs_g
    });
  }

  // ⚖️ Balanced
  if (
    protein_g >= 15 &&
    carbs_g >= 20 &&
    fat_g >= 8 &&
    fiber_g >= 3
  ) {
    categories.push({
      id: "balanced",
      name: "Balanced",
      color: "#6366f1",
      bg: "#eef2ff",
      emoji: "⚖️",
      desc: "Well Rounded",
      score: 80 // High baseline for balanced meals
    });
  }

  // 🍽️ Filling
  if (
    protein_g >= 20 ||
    fiber_g >= 8
  ) {
    categories.push({
      id: "filling",
      name: "Filling",
      color: "#059669",
      bg: "#ecfdf5",
      emoji: "🍽️",
      desc: "Keeps You Full",
      score: protein_g + (fiber_g * 4)
    });
  }

  // 🌾 Fiber Hero
  if (fiber_g >= 8) {
    categories.push({
      id: "fiberHero",
      name: "Fiber Hero",
      color: "#16a34a",
      bg: "#f0fdf4",
      emoji: "🌾",
      desc: "Exceptional Fiber",
      score: fiber_g * 5
    });
  }

  // 🚀 Power Meal
  if (
    calories >= 500 &&
    protein_g >= 25 &&
    fiber_g >= 5
  ) {
    categories.push({
      id: "power",
      name: "Power Meal",
      color: "#7c3aed",
      bg: "#f5f3ff",
      emoji: "🚀",
      desc: "High Impact Nutrition",
      score: (calories / 10) + protein_g
    });
  }

  // 🎯 Lean Choice
  if (
    protein_g >= 15 &&
    fat_g <= 10
  ) {
    categories.push({
      id: "lean",
      name: "Lean Choice",
      color: "#0ea5e9",
      bg: "#f0f9ff",
      emoji: "🎯",
      desc: "Protein Efficient",
      score: protein_g + (20 - fat_g)
    });
  }

  // 🧸 Comfort
  if (
    fat_g >= 22 ||
    fatPct >= 0.40
  ) {
    categories.push({
      id: "comfort",
      name: "Comfort",
      color: "#ef4444",
      bg: "#fef2f2",
      emoji: "🧸",
      desc: "Rich & Satisfying",
      score: fatPct * 100 + fat_g
    });
  }

  // ⚡ Snack
  if (calories < 250) {
    categories.push({
      id: "snack",
      name: "Snack",
      color: "#eab308",
      bg: "#fefce8",
      emoji: "⚡",
      desc: "Quick Bite",
      score: 250 - calories
    });
  }

  // 🌿 Light
  if (
    calories < 150 &&
    fat_g < 4 &&
    protein_g < 8
  ) {
    categories.push({
      id: "light",
      name: "Light",
      color: "#0891b2",
      bg: "#e0f2fe",
      emoji: "🌿",
      desc: "Easy Going",
      score: (150 - calories) + (10 - fat_g) + (10 - protein_g)
    });
  }

  // Fallback
  if (categories.length === 0) {
    categories.push({
      id: "balanced",
      name: "Balanced",
      color: "#6366f1",
      bg: "#eef2ff",
      emoji: "⚖️",
      desc: "Well Rounded",
      score: 1
    });
  }

  // Rank by score descending and take top 3
  categories.sort((a, b) => b.score - a.score);
  return categories.slice(0, 3);
};

// Backward-compatibility fallback helper (returns primary category)
export const getHabitCategory = (nutrition) => {
  const cats = getHabitCategories(nutrition);
  return cats && cats.length > 0 ? cats[0] : null;
};

// Returns ALL matched categories (no top-3 cap) — used for stats/synthesis page
// so every spectrum bucket gets scored even if it didn't make the card
export const getAllHabitCategories = (nutrition) => {
  if (!nutrition || !nutrition.calories || nutrition.calories <= 0) return [];
  const { calories, protein_g, carbs_g, fat_g, fiber_g } = nutrition;
  const categories = [];

  const proteinCals = protein_g * 4;
  const carbCals = carbs_g * 4;
  const fatCals = fat_g * 9;
  const proteinPct = calories > 0 ? proteinCals / calories : 0;
  const carbPct = calories > 0 ? carbCals / calories : 0;
  const fatPct = calories > 0 ? fatCals / calories : 0;

  if (protein_g >= 20 || proteinPct >= 0.30) categories.push({ id: "strength" });
  if (carbs_g >= 40 || carbPct >= 0.50) categories.push({ id: "fuel" });
  if (protein_g >= 15 && carbs_g >= 20 && fat_g >= 8 && fiber_g >= 3) categories.push({ id: "balanced" });
  if (protein_g >= 20 || fiber_g >= 8) categories.push({ id: "filling" });
  if (fiber_g >= 8) categories.push({ id: "fiberHero" });
  if (calories >= 500 && protein_g >= 25 && fiber_g >= 5) categories.push({ id: "power" });
  if (protein_g >= 15 && fat_g <= 10) categories.push({ id: "lean" });
  if (fat_g >= 22 || fatPct >= 0.40) categories.push({ id: "comfort" });
  if (calories < 250) categories.push({ id: "snack" });
  if (calories < 150 && fat_g < 4 && protein_g < 8) categories.push({ id: "light" });

  // Fallback
  if (categories.length === 0) categories.push({ id: "balanced" });

  return categories; // NO slice — full list
};

// Returns a descriptive 2-line explanation WHY a category was assigned (for the tap-to-explain UX)
export const getWhyText = (cat, nutrition) => {
  if (!cat || !nutrition) return "";
  const { protein_g, carbs_g, fat_g, fiber_g, calories } = nutrition;
  switch (cat.id) {
    case "strength":
      return `Packed with ${Math.round(protein_g)}g of protein.\nEssential for muscle repair and keeping you full longer.`;
    case "fuel":
      return `Loaded with ${Math.round(carbs_g)}g of carbs.\nProvides sustained energy for your daily activities.`;
    case "balanced":
      return `Great macro balance! Includes ${Math.round(protein_g)}g protein, ${Math.round(carbs_g)}g carbs, and ${Math.round(fat_g)}g fat.\nPerfect for overall health and steady energy.`;
    case "filling":
      return `Contains ${Math.round(protein_g)}g protein and ${Math.round(fiber_g)}g fiber.\nDesigned to keep hunger at bay for hours.`;
    case "fiberHero":
      return `An impressive ${Math.round(fiber_g)}g of fiber.\nExcellent for gut health and steady digestion.`;
    case "power":
      return `High impact meal with ${Math.round(calories)} kcal and ${Math.round(protein_g)}g protein.\nGreat for intense days or serious recovery.`;
    case "lean":
      return `Efficient nutrition: ${Math.round(protein_g)}g protein with only ${Math.round(fat_g)}g fat.\nA clean, lean choice for your macros.`;
    case "comfort":
      return `Calorically dense with ${Math.round(fat_g)}g of fat.\nRich, satisfying, and perfect for when you need a treat.`;
    case "snack":
      return `Only ${Math.round(calories)} kcal.\nA quick, light bite to keep you going without weighing you down.`;
    case "light":
      return `Very light on digestion (${Math.round(calories)} kcal, ${Math.round(fat_g)}g fat).\nRestores energy gently without feeling heavy.`;

    // Legacy ones just in case
    case "vitality": return `${Math.round(fiber_g)}g fiber.\nA great boost of micronutrients.`;
    case "focus": return `${Math.round(fat_g)}g healthy fat.\nExcellent fuel for your brain.`;
    case "nurture": return `${Math.round(calories)} kcal.\nLight and easy to digest.`;
    default: return "";
  }
};

// React.memo: prevents re-renders when parent state changes but props haven't
export default React.memo(function MealNutritionCard({
  nutrition,
  editable = false,
  onNutritionChange = null,
  analysisStatus = "completed",
  onRetry = null,
  isRetrying = false
}) {
  // ⚑ All hooks MUST come before any early returns (Rules of Hooks)
  const [activePillId, setActivePillId] = useState(null);
  const categories = getHabitCategories(nutrition) || [];

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
    <div style={styles.mealNutritionCard}>
      {/* keyframe for the why-strip fade-in */}
      <style>{`@keyframes _mnc_fadeUp{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {categories.length > 0 && (
        <div style={{
          marginBottom: "12px",
          paddingBottom: "10px",
          borderBottom: "1px solid #f3f4f6"
        }}>
          {/* Pill row */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
            {categories.map((cat, idx) => {
              const isActive = activePillId === cat.id;
              return (
                <div
                  key={cat.id || idx}
                  onMouseEnter={() => setActivePillId(cat.id)}
                  onMouseLeave={() => setActivePillId(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    backgroundColor: isActive ? cat.color : cat.bg,
                    color: isActive ? "#fff" : cat.color,
                    padding: "3px 8px",
                    borderRadius: "12px",
                    border: `1px solid ${isActive ? cat.color : cat.color + "30"}`,
                    cursor: "pointer",
                    transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease",
                    userSelect: "none"
                  }}
                >
                  <span style={{ fontSize: "0.85rem", lineHeight: 1 }}>{cat.emoji}</span>
                  <span style={{
                    fontSize: "0.65rem",
                    fontWeight: "800",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em"
                  }}>
                    {cat.name}
                  </span>
                  <span style={{
                    fontSize: "0.58rem",
                    color: isActive ? "rgba(255,255,255,0.75)" : `${cat.color}cc`,
                    fontWeight: "600",
                    marginLeft: "2px",
                    borderLeft: `1px solid ${isActive ? "rgba(255,255,255,0.3)" : cat.color + "33"}`,
                    paddingLeft: "4px"
                  }}>
                    {cat.desc}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Tap-to-explain: why-strip */}
          {activePillId && (() => {
            const activeCat = categories.find(c => c.id === activePillId);
            if (!activeCat) return null;
            const why = getWhyText(activeCat, nutrition);
            return (
              <div
                key={activePillId}
                style={{
                  marginTop: "8px",
                  padding: "6px 10px",
                  borderRadius: "8px",
                  backgroundColor: activeCat.bg,
                  borderLeft: `3px solid ${activeCat.color}`,
                  fontSize: "0.7rem",
                  color: activeCat.color,
                  fontWeight: "600",
                  lineHeight: "1.4",
                  animation: "_mnc_fadeUp 0.16s ease",
                  display: "flex",
                  gap: "6px"
                }}
              >
                <span style={{ fontSize: "1.1em" }}>{activeCat.emoji}</span>
                <span style={{ whiteSpace: "pre-wrap", paddingTop: "1px" }}>{why}</span>
              </div>
            );
          })()}
        </div>
      )}
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
  );
});

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
