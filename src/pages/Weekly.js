import React, { useEffect, useState, useCallback, useMemo } from "react";
import { auth, db } from "../firebase";
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { PieChart, Pie, Cell } from "recharts";
import { formatLocalDateKey, getMealLocalDateKey } from "../utils/dateTime";

function Weekly({ setCurrentPage, setGalleryDate, setGalleryFilter, globalUserData, globalPartnerData }) {
  const user = auth.currentUser;
  const partnerUid = globalPartnerData?.uid || null;
  const partnerName = globalPartnerData?.name || null;
  const [coupleStreakCount, setCoupleStreakCount] = useState(0);
  const [monthDate, setMonthDate] = useState(new Date());
  const [monthMeals, setMonthMeals] = useState([]);
  const [partnerMonthMeals, setPartnerMonthMeals] = useState([]);
  const [weeklyNutrition, setWeeklyNutrition] = useState([]);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null);
  const [calendarDayMeals, setCalendarDayMeals] = useState([]);
  const [monthlyNutrition, setMonthlyNutrition] = useState(null);
  const [fullDayMap, setFullDayMap] = useState({});
  const [monthlyInsight, setMonthlyInsight] = useState(null);
  const [showInsightPopup, setShowInsightPopup] = useState(false);
  const [dismissingInsight, setDismissingInsight] = useState(false);
  const [weightInsight, setWeightInsight] = useState(null);
  const [showWeightInsight, setShowWeightInsight] = useState(false);

  useEffect(() => {
    const fetchInsights = async () => {
      // Fetch latest weight insight
      try {
        const insightsSnap = await getDocs(
          collection(db, "users", user.uid, "weightInsights")
        );
        if (!insightsSnap.empty) {
          const latest = insightsSnap.docs
            .sort((a, b) => b.id.localeCompare(a.id))[0];
          setWeightInsight({ ...latest.data(), id: latest.id });
        }
      } catch (e) {
        console.error("Failed to fetch weight insight:", e);
      }
      // Check for monthly insight to show
      try {
        const now = new Date();
        const dayOfMonth = now.getDate();
        const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
        const insightKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

        const dismissed = globalUserData?.dismissedInsights || [];

        const insightSnap = await getDoc(
          doc(db, "users", user.uid, "insights", insightKey)
        );

        if (insightSnap.exists()) {
          setMonthlyInsight({ ...insightSnap.data(), key: insightKey });
          // Only auto-show in first 7 days and if not dismissed
          if (dayOfMonth <= 7 && !dismissed.includes(insightKey)) {
            setShowInsightPopup(true);
          }
        }
      } catch (e) {
        console.error("Failed to fetch monthly insight:", e);
      }
    };
    fetchInsights();
  }, [user.uid, globalUserData?.dismissedInsights]);

  useEffect(() => {
    const fetchWeekMeals = async () => {
      // Fetch own meals AND partner meals in parallel for faster load
      const allMealsQ = query(
        collection(db, "meals"),
        where("uid", "==", user.uid)
      );

      const [allMealsSnap, partnerSnap] = await Promise.all([
        getDocs(allMealsQ),
        partnerUid
          ? getDocs(query(collection(db, "meals"), where("uid", "==", partnerUid)))
          : Promise.resolve(null),
      ]);

      const ownMeals = allMealsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const allMeals = [...ownMeals];

      // Build dayMap from ALL meals for streak
      const dayMap = {};
      allMeals.forEach((m) => {
        const dateStr = getMealLocalDateKey(m);
        if (!dayMap[dateStr]) dayMap[dateStr] = 0;
        dayMap[dateStr]++;
      });
      setFullDayMap(dayMap);

      // Build weekly nutrition per day
      const last7 = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = formatLocalDateKey(d);
        const dayMeals = allMeals.filter(
          (m) => m.uid === user.uid &&
            (getMealLocalDateKey(m) === dateStr) &&
            m.nutrition
        );
        const totalsRaw = dayMeals.reduce((acc, m) => ({
          calories: acc.calories + (m.nutrition.calories || 0),
          protein_g: acc.protein_g + (m.nutrition.protein_g || 0),
          carbs_g: acc.carbs_g + (m.nutrition.carbs_g || 0),
          fat_g: acc.fat_g + (m.nutrition.fat_g || 0),
          fiber_g: acc.fiber_g + (m.nutrition.fiber_g || 0),
        }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });

        const totals = {
          calories: Math.round(totalsRaw.calories),
          protein_g: Math.round(totalsRaw.protein_g),
          carbs_g: Math.round(totalsRaw.carbs_g),
          fat_g: Math.round(totalsRaw.fat_g),
          fiber_g: Math.round(totalsRaw.fiber_g),
        };
        last7.push({
          date: dateStr,
          label: d.toLocaleDateString("en-US", { weekday: "short" }),
          ...totals,
          hasMeals: dayMeals.length > 0,
        });
      }
      setWeeklyNutrition(last7);

      // Couple streak from parallel partner fetch result
      if (partnerUid && partnerSnap) {
        const partnerOwnMeals = partnerSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const partnerDayMap = {};
        partnerOwnMeals.forEach((m) => {
          const dateStr = getMealLocalDateKey(m);
          if (!partnerDayMap[dateStr]) partnerDayMap[dateStr] = 0;
          partnerDayMap[dateStr]++;
        });

        const todayStr = formatLocalDateKey(new Date());
        let coupleStreak = 0;
        for (let i = 0; i < 365; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = formatLocalDateKey(d);
          const isToday = dateStr === todayStr;
          if ((dayMap[dateStr] || 0) >= 3 && (partnerDayMap[dateStr] || 0) >= 3) {
            coupleStreak++;
          } else if (isToday) {
            continue;
          } else {
            break;
          }
        }
        setCoupleStreakCount(coupleStreak);
      }
    };
    fetchWeekMeals();
  }, [user.uid, partnerUid]);

  const fetchMonthMeals = useCallback(async () => {
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59);

    const ownQuery = query(
      collection(db, "meals"),
      where("uid", "==", user.uid),
      where("createdAt", ">=", start),
      where("createdAt", "<=", end)
    );

    // Fetch own and partner month meals in parallel
    const [snap, pSnap] = await Promise.all([
      getDocs(ownQuery),
      partnerUid
        ? getDocs(query(
          collection(db, "meals"),
          where("uid", "==", partnerUid),
          where("createdAt", ">=", start),
          where("createdAt", "<=", end)
        ))
        : Promise.resolve(null),
    ]);

    const ownMonthMeals = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const partnerMonthMealsData = pSnap
      ? pSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      : [];

    setMonthMeals(ownMonthMeals);
    setPartnerMonthMeals(partnerMonthMealsData);

    // Calculate monthly nutrition totals from my meals only
    const mealsWithNutrition = ownMonthMeals.filter((m) => m.nutrition);

    if (mealsWithNutrition.length > 0) {
      const totals = mealsWithNutrition.reduce((acc, m) => ({
        calories: acc.calories + (m.nutrition.calories || 0),
        protein_g: acc.protein_g + (m.nutrition.protein_g || 0),
        carbs_g: acc.carbs_g + (m.nutrition.carbs_g || 0),
        fat_g: acc.fat_g + (m.nutrition.fat_g || 0),
        fiber_g: acc.fiber_g + (m.nutrition.fiber_g || 0),
      }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });

      const daysWithMeals = new Set(
        mealsWithNutrition.map((m) => getMealLocalDateKey(m))
      ).size;

      setMonthlyNutrition({
        avgCalories: Math.round(totals.calories / daysWithMeals),
        avgProtein: Math.round(totals.protein_g / daysWithMeals),
        avgCarbs: Math.round(totals.carbs_g / daysWithMeals),
        avgFat: Math.round(totals.fat_g / daysWithMeals),
        avgFiber: Math.round(totals.fiber_g / daysWithMeals),
        daysTracked: daysWithMeals,
        totalMeals: mealsWithNutrition.length,
      });
    } else {
      setMonthlyNutrition(null);
    }
  }, [monthDate, user.uid, partnerUid]);

  useEffect(() => {
    fetchMonthMeals();
  }, [fetchMonthMeals]);

  // Memoized: only recomputes when fullDayMap changes, not on every render
  const streakCount = useMemo(() => {
    let streak = 0;
    const todayStr = formatLocalDateKey(new Date());
    for (let i = 0; i < 365; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = formatLocalDateKey(d);
      const isToday = dateStr === todayStr;
      const count = fullDayMap[dateStr] || 0;
      if (count >= 3) {
        streak++;
      } else if (isToday) {
        continue;
      } else {
        break;
      }
    }
    return streak;
  }, [fullDayMap]);

  const getDayMealCount = (dateStr, meals) => {
    return meals.filter((m) => {
      return getMealLocalDateKey(m) === dateStr;
    }).length;
  };

  const getCalendarColor = (myCount, partnerCount) => {
    const iHit = myCount >= 3;
    const partnerHit = partnerCount >= 3;
    if (iHit && partnerHit) return "#ff6b6b";
    if (iHit) return "#ffb347";
    if (partnerHit) return "#ffb6c1";
    return "#f5f5f5";
  };

  const renderCalendar = () => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = formatLocalDateKey(new Date());
    const cells = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} style={styles.calCell} />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = formatLocalDateKey(date);
      const myCount = getDayMealCount(dateStr, monthMeals);
      const partnerCount = getDayMealCount(dateStr, partnerMonthMeals);
      const bgColor = getCalendarColor(myCount, partnerCount);
      const isToday = dateStr === today;

      cells.push(
        <div key={d} className="clickable-card" onClick={() => handleCalendarDayTap(dateStr)} style={{
          ...styles.calCell,
          backgroundColor: bgColor,
          border: isToday ? "2px solid #ff6b6b" : "2px solid transparent",
          cursor: "pointer",
        }}>
          <span style={styles.calDay}>{d}</span>
        </div>
      );
    }
    return cells;
  };

  const monthName = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"];
  const MEAL_COLORS = ["#ffb347", "#ff6b6b", "#ff69b4", "#a29bfe"];

  const getMealSplit = (meals) =>
    MEAL_TYPES.map((type, i) => ({
      name: type,
      value: meals.filter((m) => m.type === type).length,
      color: MEAL_COLORS[i],
    })).filter((d) => d.value > 0);

  const mySplit = getMealSplit(monthMeals || []);
  const partnerSplit = getMealSplit(partnerMonthMeals || []);
  const totalMeals = (monthMeals || []).length;
  const daysHit = [...new Set((monthMeals || []).map((m) => getMealLocalDateKey(m)))]
    .filter((dateStr) => getDayMealCount(dateStr, monthMeals || []) >= 3).length;

  const handleCalendarDayTap = async (dateStr) => {
    try {
      const start = new Date(dateStr + "T00:00:00");
      const end = new Date(dateStr + "T23:59:59");

      const q = query(
        collection(db, "meals"),
        where("uid", "==", user.uid),
        where("createdAt", ">=", start),
        where("createdAt", "<=", end)
      );
      const snap = await getDocs(q);
      const meals = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((m) => {
          return getMealLocalDateKey(m) === dateStr;
        });

      setCalendarDayMeals(meals);
      setSelectedCalendarDay(dateStr);
    } catch (e) {
      console.error("Error fetching day meals:", e);
      setCalendarDayMeals([]);
      setSelectedCalendarDay(dateStr);
    }
  };

  const getDayNutritionTotals = (meals) => {
    if (!meals || meals.length === 0) return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
    const totals = meals
      .filter((m) => m.nutrition)
      .reduce((acc, m) => ({
        calories: acc.calories + (m.nutrition.calories || 0),
        protein_g: acc.protein_g + (m.nutrition.protein_g || 0),
        carbs_g: acc.carbs_g + (m.nutrition.carbs_g || 0),
        fat_g: acc.fat_g + (m.nutrition.fat_g || 0),
        fiber_g: acc.fiber_g + (m.nutrition.fiber_g || 0),
      }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });

    return {
      calories: Math.round(totals.calories),
      protein_g: Math.round(totals.protein_g),
      carbs_g: Math.round(totals.carbs_g),
      fat_g: Math.round(totals.fat_g),
      fiber_g: Math.round(totals.fiber_g),
    };
  };

  const handleDismissInsight = async () => {
    if (!monthlyInsight || dismissingInsight) return;
    setDismissingInsight(true);
    setShowInsightPopup(false);
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const existing = userSnap.data()?.dismissedInsights || [];
      if (!existing.includes(monthlyInsight.key)) {
        await updateDoc(doc(db, "users", user.uid), {
          dismissedInsights: [...existing, monthlyInsight.key],
        });
      }
    } catch (e) {
      console.error("Failed to save dismissed insight:", e);
    } finally {
      setDismissingInsight(false);
    }
  };

  return (
    <>
      <div style={styles.container}>
        <h2 style={styles.title}>Stats</h2>

        {/* Streak Banners */}
        <div style={styles.streakRow}>
          <div style={styles.streakCard}>
            <span style={styles.streakEmoji}>🔥</span>
            <p style={styles.streakNumber}>{streakCount}</p>
            <p style={styles.streakSub}>Days with 3+ meals{"\n"}in a row</p>
          </div>
          {/* Couple Streak */}
          {partnerUid && (
            <div style={styles.streakCard}>
              <span style={styles.streakEmoji}>💑</span>
              <p style={styles.streakNumber}>{coupleStreakCount}</p>
              <p style={styles.streakSub}>with {partnerName ? partnerName.split(" ")[0] : "partner"}</p>
            </div>
          )}
        </div>

        {/* Weekly Macro Trend */}
        {weeklyNutrition?.some((d) => d.hasMeals && d.calories > 0) && (
          <div style={{ ...styles.card, animation: "slideUpFade 0.4s ease both" }}>
            <p style={styles.cardTitle}>📊 Weekly Macros</p>
            <div style={styles.macroTable}>
              {/* Header row */}
              <div style={styles.macroTableRow}>
                <div style={styles.macroTableLabelCell} />
                {weeklyNutrition.map((day) => (
                  <div key={day.date} style={styles.macroTableHeaderCell}>
                    {day.label}
                  </div>
                ))}
              </div>
              {/* Macro rows */}
              {[
                { key: "protein_g", label: "Protein", color: "#ff6b6b" },
                { key: "carbs_g", label: "Carbs", color: "#ffb347" },
                { key: "fat_g", label: "Fat", color: "#7ec8a4" },
                { key: "fiber_g", label: "Fiber", color: "#a78bfa" },
              ].map((macro, rowIdx) => (
                <div
                  key={macro.key}
                  style={{
                    ...styles.macroTableRow,
                    backgroundColor: rowIdx % 2 === 0 ? "#fafafa" : "white",
                    borderRadius: "6px",
                  }}
                >
                  <div style={{ ...styles.macroTableLabelCell, color: macro.color }}>
                    {macro.label}
                  </div>
                  {weeklyNutrition.map((day) => (
                    <div key={day.date} style={styles.macroTableCell}>
                      {day.hasMeals && day[macro.key] > 0
                        ? <span style={{ color: macro.color, fontWeight: "600" }}>
                          {day[macro.key]}g
                        </span>
                        : <span style={styles.macroTableEmpty}>—</span>
                      }
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Monthly Calendar */}
        <div style={styles.card}>
          <div style={styles.monthNav}>
            <button style={styles.navButton} onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}>‹</button>
            <p style={styles.cardTitle}>{monthName}</p>
            <button style={styles.navButton} onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}>›</button>
          </div>

          {/* Day Labels */}
          <div style={styles.calGrid}>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d} style={styles.calHeader}>{d}</div>
            ))}
            {renderCalendar()}
          </div>

          {/* Legend */}
          <div style={styles.legend}>
            <div style={styles.legendItem}>
              <div style={{ ...styles.legendDot, backgroundColor: "#ffb347" }} />
              <span>You 3+</span>
            </div>
            {partnerUid && (
              <>
                <div style={styles.legendItem}>
                  <div style={{ ...styles.legendDot, backgroundColor: "#ffb6c1" }} />
                  <span>{partnerName ? partnerName.split(" ")[0] : "Partner"} 3+</span>
                </div>
                <div style={styles.legendItem}>
                  <div style={{ ...styles.legendDot, backgroundColor: "#ff6b6b" }} />
                  <span>Both 3+</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Monthly Summary */}
        <div style={styles.card}>
          <p style={styles.cardTitle}>Monthly Summary</p>
          <div style={styles.summaryRow}>
            <div style={styles.summaryItem}>
              <p style={styles.summaryNumber}>{totalMeals}</p>
              <p style={styles.summarySub}>Total meals</p>
            </div>
            <div style={styles.summaryDivider} />
            <div style={styles.summaryItem}>
              <p style={styles.summaryNumber}>{daysHit}</p>
              <p style={styles.summarySub}>Days with 3+</p>
            </div>
            <div style={styles.summaryDivider} />
            {partnerUid && (
              <>
                <div style={styles.summaryDivider} />
                <div style={styles.summaryItem}>
                  <p style={styles.summaryNumber}>{coupleStreakCount}</p>
                  <p style={styles.summarySub}>Couple streak</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Monthly Macro Overview */}
        {monthlyNutrition && (
          <div style={{ ...styles.card, animation: "slideUpFade 0.5s ease both" }}>
            <p style={styles.cardTitle}>🗓️ {monthName} Nutrition</p>

            {/* Calorie headline */}
            <div style={{ ...styles.monthCalorieRow, marginTop: "1rem" }}>
              <div style={styles.monthCalorieCard}>
                <p style={styles.monthCalorieNumber}>{monthlyNutrition.avgCalories}</p>
                <p style={styles.monthCalorieLabel}>avg kcal/day</p>
              </div>
              <div style={styles.monthCalorieCard}>
                <p style={styles.monthCalorieNumber}>{monthlyNutrition.totalMeals}</p>
                <p style={styles.monthCalorieLabel}>meals tracked</p>
              </div>
            </div>

            {/* Macro averages grid */}
            <div style={styles.monthMacroGrid}>
              {[
                { key: "avgProtein", label: "Protein", color: "#ff6b6b" },
                { key: "avgCarbs", label: "Carbs", color: "#ffb347" },
                { key: "avgFat", label: "Fat", color: "#7ec8a4" },
                { key: "avgFiber", label: "Fiber", color: "#a78bfa" },
              ].map((macro) => (
                <div key={macro.key} style={styles.monthMacroCard}>
                  <p style={styles.monthMacroLabel}>{macro.label}</p>
                  <p style={{ ...styles.monthMacroValue, color: macro.color }}>
                    {monthlyNutrition[macro.key] || 0}g
                  </p>
                  <p style={styles.monthMacroSub}>daily avg</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meal Type Split */}
        <div style={styles.card}>
          <p style={styles.cardTitle}>{partnerUid ? `Meal Split — ${monthName}` : `Your Meals — ${monthName}`}</p>
          <div style={{ ...styles.cardTitle, marginTop: "1rem" }}></div>
          <div style={styles.splitRow}>

            {/* Mine */}
            <div style={styles.splitSide}>
              <p style={styles.splitName}>You</p>
              {mySplit.length === 0 ? (
                <p style={styles.splitEmpty}>No meals</p>
              ) : (
                <>
                  <PieChart width={130} height={130}>
                    <Pie
                      data={mySplit}
                      cx={60}
                      cy={60}
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {mySplit.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                  <div style={styles.splitLegend}>
                    {mySplit.map((entry) => (
                      <div key={entry.name} style={styles.splitLegendItem}>
                        <div style={{ ...styles.splitDot, backgroundColor: entry.color }} />
                        <span style={styles.splitLabel}>{entry.name}</span>
                        <span style={styles.splitCount}>{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {partnerUid && (
              <>
                <div style={styles.splitDivider} />
                <div style={styles.splitSide}>
                  <p style={styles.splitName}>{partnerName ? partnerName.split(" ")[0] : "Partner"}</p>
                  {partnerSplit.length === 0 ? (
                    <p style={styles.splitEmpty}>No meals</p>
                  ) : (
                    <>
                      <PieChart width={130} height={130}>
                        <Pie
                          data={partnerSplit}
                          cx={60}
                          cy={60}
                          innerRadius={35}
                          outerRadius={55}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {partnerSplit.map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                      <div style={styles.splitLegend}>
                        {partnerSplit.map((entry) => (
                          <div key={entry.name} style={styles.splitLegendItem}>
                            <div style={{ ...styles.splitDot, backgroundColor: entry.color }} />
                            <span style={styles.splitLabel}>{entry.name}</span>
                            <span style={styles.splitCount}>{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {/* Day Nutrition Popup - Moved outside container for perfect centering */}
      {selectedCalendarDay && (
        <div
          style={styles.overlayCenter}
          onClick={() => setSelectedCalendarDay(null)}
        >
          <div
            style={styles.bloomSheet}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={styles.dayPopupHeader}>
              <div>
                <p style={styles.dayPopupDate}>
                  {new Date(selectedCalendarDay + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "long", month: "long", day: "numeric"
                  })}
                </p>
                <p style={styles.dayPopupMealCount}>
                  {calendarDayMeals.length} meal{calendarDayMeals.length !== 1 ? "s" : ""} logged
                </p>
              </div>
            </div>

            {calendarDayMeals.length === 0 ? (
              <p style={styles.dayPopupEmpty}>No meals logged this day 🍽️</p>
            ) : getDayNutritionTotals(calendarDayMeals).calories === 0 ? (
              <>
                <p style={styles.dayPopupEmpty}>
                  {calendarDayMeals.length} meal{calendarDayMeals.length !== 1 ? "s" : ""} logged — nutrition data coming soon ✨
                </p>
                <div style={styles.dayMealList}>
                  {calendarDayMeals.map((meal) => (
                    <div key={meal.id} style={styles.dayMealRow}>
                      <div style={styles.dayMealLeft}>
                        {meal.photoURL && (
                          <img src={meal.photoURL} alt={meal.name} style={styles.dayMealThumb} loading="lazy" />
                        )}
                        <div>
                          <p style={styles.dayMealName}>{meal.name}</p>
                          <p style={styles.dayMealMeta}>{meal.type}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Compute nutrition totals once for the whole popup */}
                {(() => {
                  const dayTotals = getDayNutritionTotals(calendarDayMeals);
                  return (
                    <>
                      {/* Calorie headline */}
                      {dayTotals.calories > 0 && (
                        <div style={styles.dayCalorieCard}>
                          <div style={{ textAlign: "left" }}>
                            <p style={styles.dayCalorieNumber}>
                              {dayTotals.calories}
                              {globalUserData?.nutrientGoals && (
                                <span style={styles.dayPopupCalorieTarget}> / {globalUserData.nutrientGoals.calories}</span>
                              )}
                            </p>
                            <p style={styles.dayCalorieLabel}>kcal consumed</p>
                          </div>
                          {globalUserData?.nutrientGoals && (
                            <div
                              style={{
                                textAlign: "right",
                                marginLeft: "auto",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-end",
                              }}
                            >
                              <p
                                style={{
                                  ...styles.dayPopupCalorieRemaining,
                                  color:
                                    (globalUserData.nutrientGoals.calories - dayTotals.calories) >= 0
                                      ? "#7ec8a4"
                                      : "#ff6b6b",
                                }}
                              >
                                {Math.abs(
                                  globalUserData.nutrientGoals.calories - dayTotals.calories
                                )}
                              </p>

                              <p
                                style={{
                                  ...styles.dayCalorieLabel,
                                  color:
                                    (globalUserData.nutrientGoals.calories - dayTotals.calories) >= 0
                                      ? "#7ec8a4"
                                      : "#ff6b6b",
                                }}
                              >
                                {(globalUserData.nutrientGoals.calories - dayTotals.calories) >= 0
                                  ? "under"
                                  : "over"}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Macro bars */}
                      {dayTotals.calories > 0 && (
                        <div style={styles.dayMacroSection}>
                          <div style={styles.macroGrid}>
                            {[
                              { key: "protein_g", label: "Protein", color: "#ff6b6b" },
                              { key: "carbs_g", label: "Carbs", color: "#ffb347" },
                              { key: "fat_g", label: "Fat", color: "#7ec8a4" },
                              { key: "fiber_g", label: "Fiber", color: "#a78bfa" },
                            ].map((macro) => {
                              const eaten = dayTotals[macro.key] || 0;
                              const goal = globalUserData?.nutrientGoals?.[macro.key];

                              return (
                                <div key={macro.key} style={styles.macroGridItem}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                    <p style={styles.macroGridLabel}>{macro.label}</p>
                                    <p style={{ ...styles.macroGridValue, color: macro.color }}>
                                      {eaten}{goal ? `/${goal}` : ""}g
                                    </p>
                                  </div>
                                  {goal && (
                                    <div style={styles.dayPopupMacroBarTrack}>
                                      <div style={{
                                        ...styles.dayPopupMacroBarFill,
                                        backgroundColor: macro.color,
                                        width: `${goal > 0 ? Math.min((eaten / goal) * 100, 100) : 0}%`
                                      }} />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Meal breakdown list */}
                <div style={styles.dayMealList}>
                  <p style={styles.dayMealListTitle}>Meals</p>
                  {calendarDayMeals.map((meal) => (
                    <div key={meal.id} style={styles.dayMealRow}>
                      <div style={styles.dayMealLeft}>
                        {meal.photoURL && (
                          <img
                            src={meal.photoURL}
                            alt={meal.name}
                            style={styles.dayMealThumb}
                            loading="lazy"
                          />
                        )}
                        <div>
                          <p style={styles.dayMealName}>{meal.name}</p>
                          <p style={styles.dayMealMeta}>{meal.type}</p>
                        </div>
                      </div>
                      {meal.nutrition && (
                        <p style={styles.dayMealCalories}>
                          {meal.nutrition.calories} kcal
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* View in Gallery button */}
                <button
                  style={styles.galleryButton}
                  onClick={() => {
                    setSelectedCalendarDay(null);
                    setGalleryDate(selectedCalendarDay);
                    setGalleryFilter("mine");
                    setCurrentPage("gallery");
                  }}
                >
                  View Photos 📷
                </button>

              </>
            )}

            <button
              style={styles.dayPopupBack}
              onClick={() => setSelectedCalendarDay(null)}
            >
              ← Back
            </button>
          </div>
        </div>
      )}
      {/* Monthly Insight Popup */}
      {showInsightPopup && monthlyInsight && (
        <div
          style={styles.overlayCenter}
          onClick={handleDismissInsight}
        >
          <div
            style={styles.insightPopup}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top decoration */}
            <div style={styles.insightPopupGlow} />

            {/* Header */}
            <div style={styles.insightPopupHeader}>
              <p style={styles.insightPopupEyebrow}>Monthly Recap</p>
              <p style={styles.insightPopupMonth}>{monthlyInsight.month} {monthlyInsight.year} 🌙</p>
            </div>

            {/* Nutrition summary */}
            {monthlyInsight.nutrition && (
              <div style={styles.insightNutritionRow}>
                {[
                  { label: "Calories", value: `${monthlyInsight.nutrition.avgCalories} kcal`, color: "#ff6b6b" },
                  { label: "Protein", value: `${monthlyInsight.nutrition.avgProtein}g`, color: "#ff6b6b" },
                  { label: "Carbs", value: `${monthlyInsight.nutrition.avgCarbs}g`, color: "#ffb347" },
                  { label: "Fat", value: `${monthlyInsight.nutrition.avgFat}g`, color: "#7ec8a4" },
                ].map((item) => (
                  <div key={item.label} style={styles.insightNutritionPill}>
                    <p style={styles.insightNutritionLabel}>{item.label}</p>
                    <p style={{ ...styles.insightNutritionValue, color: item.color }}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Divider */}
            <div style={styles.insightDivider} />

            {/* AI Insight text */}
            <p style={styles.insightPopupText}>{monthlyInsight.insight}</p>

            {/* Days tracked */}
            {monthlyInsight.nutrition && (
              <p style={styles.insightPopupMeta}>
                Based on {monthlyInsight.nutrition.daysTracked} tracked days · {monthlyInsight.nutrition.totalMeals} meals logged
              </p>
            )}

            {/* Dismiss button */}
            <button
              style={{
                ...styles.insightPopupButton,
                opacity: dismissingInsight ? 0.6 : 1,
              }}
              onClick={handleDismissInsight}
              disabled={dismissingInsight}
            >
              {dismissingInsight ? "Saving..." : "Got it! 👍"}
            </button>

            {/* Small disclaimer */}
            <p style={styles.insightDisclaimer}>
              AI-generated insights · Not medical advice
            </p>
          </div>
        </div>
      )}
      {/* Last month's insight revisit */}
      {monthlyInsight && !showInsightPopup && (
        <button
          style={styles.revisitInsightButton}
          onClick={() => {
            setShowInsightPopup(true);
          }}
        >
          📋 View {monthlyInsight.month} insights
        </button>
      )}
      {/* Weight Insight Button */}
      {weightInsight && (
        <button
          style={styles.weightInsightButton}
          onClick={() => setShowWeightInsight(true)}
        >
          ✨ View insights · {weightInsight.date}
        </button>
      )}

      {/* Weight Insight Popup */}
      {showWeightInsight && weightInsight && (
        <div
          style={styles.overlayCenter}
          onClick={() => setShowWeightInsight(false)}
        >
          <div
            style={styles.bloomSheet}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={styles.insightPopupEyebrow}>Your Insights ✨</p>
            <p style={styles.insightPopupPeriod}>
              {weightInsight.periodStart} → {weightInsight.periodEnd}
            </p>

            {/* Weight summary */}
            <div style={styles.insightWeightRow}>
              <div style={styles.insightWeightItem}>
                <p style={styles.insightWeightLabel}>Previous</p>
                <p style={styles.insightWeightValue}>{weightInsight.previousWeight}kg</p>
              </div>
              <div style={styles.insightWeightArrow}>→</div>
              <div style={styles.insightWeightItem}>
                <p style={styles.insightWeightLabel}>Current</p>
                <p style={styles.insightWeightValue}>{weightInsight.newWeight}kg</p>
              </div>
              {weightInsight.targetWeight && (
                <>
                  <div style={styles.insightWeightArrow}>·</div>
                  <div style={styles.insightWeightItem}>
                    <p style={styles.insightWeightLabel}>Target</p>
                    <p style={styles.insightWeightValue}>{weightInsight.targetWeight}kg</p>
                  </div>
                </>
              )}
            </div>

            {/* Weight delta */}
            {weightInsight.weightDelta !== undefined && (
              <p style={{
                ...styles.insightWeightDelta,
                color: weightInsight.weightDelta <= 0 ? "#7ec8a4" : "#ffb347",
              }}>
                {weightInsight.weightDelta === 0
                  ? "No change this period"
                  : weightInsight.weightDelta < 0
                    ? `↓ ${Math.abs(weightInsight.weightDelta)}kg this period`
                    : `↑ ${weightInsight.weightDelta}kg this period`}
              </p>
            )}

            <div style={styles.insightDivider} />

            {/* Insight text */}
            <p style={styles.insightPopupText}>{weightInsight.insight}</p>

            <p style={styles.insightDisclaimer}>
              AI-generated · Not medical advice
            </p>

            <button
              style={styles.insightPopupButton}
              onClick={() => setShowWeightInsight(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  container: {
    maxWidth: "400px",
    margin: "0 auto",
    padding: "2rem 1.5rem",
    backgroundColor: "#fffaf5",
    minHeight: "100vh",
  },
  title: {
    fontSize: "1.8rem",
    color: "#333",
    marginBottom: "1.5rem",
  },
  streakRow: {
    display: "flex",
    gap: "1rem",
    marginBottom: "1rem",
  },
  streakCard: {
    flex: 1,
    backgroundColor: "#fff5f5",
    borderRadius: "12px",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  streakEmoji: {
    fontSize: "1.8rem",
  },
  streakNumber: {
    fontWeight: "bold",
    fontSize: "1.6rem",
    color: "#ff6b6b",
    margin: "4px 0 0 0",
  },
  streakSub: {
    color: "#666",
    fontSize: "0.8rem",
    margin: 0,
    textAlign: "center",
    whiteSpace: "pre-line",
    lineHeight: 1.4,
  },
  card: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "1.2rem",
    marginBottom: "1rem",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  cardTitle: {
    fontWeight: "bold",
    color: "#333",
    marginBottom: "1rem",
    fontSize: "1rem",
    margin: 0,
  },
  monthNav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "1rem",
  },
  navButton: {
    background: "none",
    border: "none",
    fontSize: "1.5rem",
    cursor: "pointer",
    color: "#ff6b6b",
    padding: "0 0.5rem",
  },
  calGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "4px",
    marginBottom: "1rem",
  },
  calHeader: {
    textAlign: "center",
    fontSize: "0.75rem",
    color: "#666",
    paddingBottom: "4px",
  },
  calCell: {
    aspectRatio: "1",
    borderRadius: "6px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  calDay: {
    fontSize: "0.75rem",
    color: "#555",
    lineHeight: 1,
  },
  legend: {
    display: "flex",
    gap: "1rem",
    justifyContent: "center",
    marginTop: "0.5rem",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    fontSize: "0.75rem",
    color: "#888",
  },
  legendDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
  },
  summaryRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    marginTop: "1rem",
  },
  summaryItem: {
    flex: 1,
    textAlign: "center",
  },
  summaryNumber: {
    fontSize: "1.8rem",
    fontWeight: "bold",
    color: "#ff6b6b",
    margin: 0,
  },
  summarySub: {
    fontSize: "0.8rem",
    color: "#666",
    margin: "4px 0 0 0",
  },
  summaryDivider: {
    width: "1px",
    height: "40px",
    backgroundColor: "#f0f0f0",
  },
  splitRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: "1rem",
  },
  splitSide: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  splitName: {
    fontWeight: "bold",
    color: "#333",
    fontSize: "0.9rem",
    margin: "0 0 0.3rem 0",
  },
  splitEmpty: {
    color: "#666",
    fontSize: "0.85rem",
    marginTop: "2rem",
  },
  splitDivider: {
    width: "1px",
    backgroundColor: "#f0f0f0",
    alignSelf: "stretch",
    margin: "0 0.5rem",
  },
  splitLegend: {
    width: "100%",
    paddingLeft: "0.5rem",
  },
  splitLegendItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    marginBottom: "0.3rem",
  },
  splitDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  splitLabel: {
    fontSize: "0.75rem",
    color: "#555",
    flex: 1,
  },
  splitCount: {
    fontSize: "0.75rem",
    fontWeight: "bold",
    color: "#333",
  },
  overlayCenter: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 150,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1.5rem",
    animation: "fadeInOverlay 0.3s ease both",
    backdropFilter: "blur(4px)",
  },
  bloomSheet: {
    backgroundColor: "white",
    borderRadius: "24px",
    padding: "1.5rem",
    width: "100%",
    maxWidth: "380px",
    maxHeight: "85vh",
    overflowY: "auto",
    animation: "bloomOpen 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },
  dayPopupHeader: {
    marginBottom: "1rem",
  },
  dayPopupDate: {
    fontSize: "1rem",
    fontWeight: "700",
    color: "#333",
    margin: "0 0 2px 0",
  },
  dayPopupMealCount: {
    fontSize: "0.8rem",
    color: "#666",
    margin: 0,
  },
  dayPopupEmpty: {
    fontSize: "0.9rem",
    color: "#777",
    textAlign: "center",
    padding: "2rem 0",
    margin: 0,
  },
  dayCalorieCard: {
    backgroundColor: "#fff5f5",
    borderRadius: "12px",
    padding: "0.8rem 1rem",
    marginBottom: "1rem",
    display: "flex",
    alignItems: "baseline",
    gap: "0.4rem",
  },
  dayCalorieNumber: {
    fontSize: "1.8rem",
    fontWeight: "700",
    color: "#ff6b6b",
    margin: 0,
    animation: "countUp 0.5s ease both",
  },
  dayCalorieLabel: {
    fontSize: "0.85rem",
    color: "#ffb3b3",
    margin: 0,
  },
  dayMacroSection: {
    marginBottom: "1rem",
  },
  dayMealList: {
    borderTop: "1px solid #f5f5f5",
    paddingTop: "1rem",
    marginBottom: "1rem",
  },
  dayMealListTitle: {
    fontSize: "0.8rem",
    color: "#666",
    margin: "0 0 0.6rem 0",
    fontWeight: "600",
  },
  dayMealRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.7rem",
  },
  dayMealLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    flex: 1,
  },
  dayMealThumb: {
    width: "40px",
    height: "40px",
    borderRadius: "8px",
    objectFit: "cover",
  },
  dayMealName: {
    fontSize: "0.88rem",
    color: "#333",
    margin: "0 0 2px 0",
    fontWeight: "500",
  },
  dayMealMeta: {
    fontSize: "0.75rem",
    color: "#666",
    margin: 0,
  },
  dayMealCalories: {
    fontSize: "0.8rem",
    color: "#ff6b6b",
    margin: 0,
    fontWeight: "600",
  },
  galleryButton: {
    width: "100%",
    padding: "0.7rem",
    backgroundColor: "#fffaf5",
    color: "#ff6b6b",
    border: "1px solid #ffddcc",
    borderRadius: "10px",
    fontSize: "0.88rem",
    cursor: "pointer",
    marginBottom: "0.5rem",
    fontWeight: "500",
  },
  dayPopupBack: {
    width: "100%",
    padding: "0.5rem",
    backgroundColor: "transparent",
    color: "#888",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  monthCalorieRow: {
    display: "flex",
    gap: "0.8rem",
    marginBottom: "1rem",
  },
  monthCalorieCard: {
    flex: 1,
    backgroundColor: "#fff5f5",
    borderRadius: "12px",
    padding: "0.8rem",
    textAlign: "center",
  },
  monthCalorieNumber: {
    fontSize: "1.6rem",
    fontWeight: "700",
    color: "#ff6b6b",
    margin: "0 0 2px 0",
    animation: "countUp 0.5s ease both",
  },
  monthCalorieLabel: {
    fontSize: "0.72rem",
    color: "#ffb3b3",
    margin: 0,
  },
  macroGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.6rem",
    marginBottom: "0.5rem",
  },
  macroGridItem: {
    backgroundColor: "#fafafa",
    borderRadius: "10px",
    padding: "0.6rem 0.8rem",
  },
  macroGridLabel: {
    fontSize: "0.72rem",
    color: "#777",
    margin: "0 0 2px 0",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  macroGridValue: {
    fontSize: "1.1rem",
    fontWeight: "700",
    margin: 0,
  },
  monthMacroGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.6rem",
    marginTop: "0.5rem",
  },
  monthMacroCard: {
    backgroundColor: "#fafafa",
    borderRadius: "10px",
    padding: "0.8rem",
    textAlign: "center"
  },
  monthMacroLabel: {
    fontSize: "0.72rem",
    color: "#777",
    margin: "0 0 4px 0",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  monthMacroValue: {
    fontSize: "1.4rem",
    fontWeight: "700",
    margin: "0 0 2px 0",
  },
  monthMacroSub: {
    fontSize: "0.7rem",
    color: "#888",
    margin: 0,
  },
  macroTable: {
    width: "100%",
    overflowX: "auto",
    marginTop: "1rem",
  },
  macroTableRow: {
    display: "flex",
    alignItems: "center",
    padding: "0.3rem 0",
  },
  macroTableLabelCell: {
    width: "56px",
    minWidth: "56px",
    fontSize: "0.78rem",
    fontWeight: "600",
    color: "#888",
  },
  macroTableHeaderCell: {
    flex: 1,
    fontSize: "0.7rem",
    color: "#777",
    textAlign: "center",
    fontWeight: "500",
  },
  macroTableCell: {
    flex: 1,
    fontSize: "0.75rem",
    textAlign: "center",
    padding: "0.2rem 0",
  },
  macroTableEmpty: {
    color: "#666",
    fontSize: "0.75rem",
  },
  insightPopup: {
    backgroundColor: "white",
    borderRadius: "24px",
    padding: "1.8rem 1.5rem 1.2rem",
    width: "100%",
    maxWidth: "380px",
    maxHeight: "85vh",
    overflowY: "auto",
    animation: "bloomOpen 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
    boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
    position: "relative",
    overflow: "hidden",
  },
  insightPopupGlow: {
    position: "absolute",
    top: "-40px",
    right: "-40px",
    width: "140px",
    height: "140px",
    borderRadius: "50%",
    backgroundColor: "rgba(255,107,107,0.08)",
    pointerEvents: "none",
  },
  insightPopupHeader: {
    marginBottom: "1.2rem",
  },
  insightPopupMonth: {
    fontSize: "1.4rem",
    fontWeight: "700",
    color: "#333",
    margin: 0,
  },
  insightNutritionRow: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "1.2rem",
  },
  insightNutritionPill: {
    flex: 1,
    backgroundColor: "#fafafa",
    borderRadius: "10px",
    padding: "0.5rem 0.3rem",
    textAlign: "center",
  },
  insightNutritionLabel: {
    fontSize: "0.62rem",
    color: "#777",
    margin: "0 0 2px 0",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  insightNutritionValue: {
    fontSize: "0.9rem",
    fontWeight: "700",
    margin: 0,
  },
  insightPopupMeta: {
    fontSize: "0.72rem",
    color: "#777",
    margin: "0 0 1.2rem 0",
    textAlign: "center",
  },
  insightPopupButton: {
    width: "100%",
    padding: "0.85rem",
    backgroundColor: "#ff6b6b",
    color: "white",
    border: "none",
    borderRadius: "12px",
    fontSize: "0.95rem",
    fontWeight: "600",
    cursor: "pointer",
    marginBottom: "0.6rem",
    transition: "opacity 0.2s ease",
  },
  revisitInsightButton: {
    width: "100%",
    padding: "0.7rem",
    backgroundColor: "transparent",
    color: "#777",
    border: "1px solid #eee",
    borderRadius: "10px",
    fontSize: "0.82rem",
    cursor: "pointer",
    marginTop: "0.5rem",
    marginBottom: "1rem",
  },
  weightInsightButton: {
    width: "100%",
    padding: "0.8rem",
    backgroundColor: "#fffaf5",
    color: "#ff6b6b",
    border: "1px solid #ffddcc",
    borderRadius: "12px",
    fontSize: "0.88rem",
    fontWeight: "500",
    cursor: "pointer",
    marginTop: "0.5rem",
    marginBottom: "1rem",
  },
  insightPopupEyebrow: {
    fontSize: "0.72rem",
    color: "#ffb3b3",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    margin: "0 0 4px 0",
    fontWeight: "600",
  },
  insightPopupPeriod: {
    fontSize: "0.78rem",
    color: "#777",
    margin: "0 0 1rem 0",
  },
  insightWeightRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fafafa",
    borderRadius: "12px",
    padding: "0.8rem 1rem",
    marginBottom: "0.5rem",
  },
  insightWeightItem: {
    textAlign: "center",
  },
  insightWeightLabel: {
    fontSize: "0.65rem",
    color: "#777",
    margin: "0 0 2px 0",
    textTransform: "uppercase",
  },
  insightWeightValue: {
    fontSize: "1.1rem",
    fontWeight: "700",
    color: "#333",
    margin: 0,
  },
  insightWeightArrow: {
    fontSize: "1rem",
    color: "#666",
  },
  insightWeightDelta: {
    fontSize: "0.82rem",
    fontWeight: "600",
    margin: "0 0 0.8rem 0",
    textAlign: "center",
  },
  insightDivider: {
    height: "1px",
    backgroundColor: "#f5f5f5",
    margin: "0.8rem 0",
  },
  insightPopupText: {
    fontSize: "0.92rem",
    color: "#444",
    lineHeight: 1.7,
    margin: "0 0 0.8rem 0",
    whiteSpace: "pre-line",
  },
  insightDisclaimer: {
    fontSize: "0.65rem",
    color: "#666",
    textAlign: "center",
    margin: "0 0 1rem 0",
  },
  dayPopupCalorieTarget: {
    fontSize: "0.9rem",
    color: "#ccc",
    fontWeight: "400",
  },
  dayPopupCalorieRemaining: {
    fontSize: "1.2rem",
    fontWeight: "700",
    margin: 0,
  },
  dayPopupMacroBarTrack: {
    height: "4px",
    backgroundColor: "#f0f0f0",
    borderRadius: "999px",
    overflow: "hidden",
    marginTop: "2px",
  },
  dayPopupMacroBarFill: {
    height: "100%",
    borderRadius: "999px",
    transition: "width 0.4s ease",
  },
};

export default Weekly;