import { BADGES } from "./badges";
import { formatLocalDateKey, getMealLocalDateKey } from "./dateTime";

export function computeBadges(ownMeals, partnerMeals, lockedBadges = []) {
  const meals = [...ownMeals];

  // Total meals
  const totalMeals = meals.length;

  // Meals with photos
  const mealsWithPhotos = meals.filter((m) => m.photoURL).length;

  // Shared meals
  const sharedMeals = meals.filter((m) => m.isShared).length;

  // Breakfasts
  const breakfasts = meals.filter((m) => m.type === "Breakfast").length;

  // Days with 3+ meals
  const dayMap = {};
  meals.forEach((m) => {
    const dateStr = getMealLocalDateKey(m);
    if (!dayMap[dateStr]) dayMap[dateStr] = 0;
    dayMap[dateStr]++;
  });
  const daysWithThreePlus = Object.values(dayMap).filter((c) => c >= 3).length;

  // Current streak
  let currentStreak = 0;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = formatLocalDateKey(d);
    const count = dayMap[dateStr] || 0;
    if (count >= 3) {
      currentStreak++;
    } else if (i === 0) {
      continue;
    } else {
      break;
    }
  }

  // Couple streak
  let coupleStreak = 0;
  if (partnerMeals && partnerMeals.length > 0) {
    const partnerDayMap = {};
    partnerMeals.forEach((m) => {
      const dateStr = getMealLocalDateKey(m);
      if (!partnerDayMap[dateStr]) partnerDayMap[dateStr] = 0;
      partnerDayMap[dateStr]++;
    });

    const todayStr = formatLocalDateKey(new Date());
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = formatLocalDateKey(d);
      const isToday = dateStr === todayStr;
      if (dayMap[dateStr] >= 3 && partnerDayMap[dateStr] >= 3) {
        coupleStreak++;
      } else if (isToday) {
        continue;
      } else {
        break;
      }
    }
  }

  // Check which badges are earned
  const stats = {
    totalMeals,
    mealsWithPhotos,
    sharedMeals,
    breakfasts,
    daysWithThreePlus,
    currentStreak,
    coupleStreak,
  };

  return BADGES.map((badge) => ({
    ...badge,
    earned: lockedBadges.includes(badge.id) || badge.check(stats),
  }));
}