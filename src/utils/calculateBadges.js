import { collection, query, where, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { BADGES } from "./badges";
import { formatLocalDateKey, getMealLocalDateKey } from "./dateTime";

export async function calculateBadges(uid, partnerUid = null) {
  const mealsRef = collection(db, "meals");

  // Fetch all user meals
  const snap = await getDocs(query(mealsRef, where("uid", "==", uid)));
  const ownMeals = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Only own meals for all calculations
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
      // today not yet complete, keep going back
      continue;
    } else {
      break;
    }
  }

  // Couple streak
  let coupleStreak = 0;
  if (partnerUid) {
    const partnerSnap = await getDocs(query(mealsRef, where("uid", "==", partnerUid)));
    const partnerMeals = partnerSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

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

  // Fetch previously locked badges from Firestore
  const userSnap2 = await getDoc(doc(db, "users", uid));
  const lockedBadges = userSnap2.exists()
    ? userSnap2.data().earnedBadges || []
    : [];

  const earned = BADGES.map((badge) => ({
    ...badge,
    earned: lockedBadges.includes(badge.id) || badge.check(stats),
  }));

  // Save any newly earned badges back to Firestore
  const newlyEarned = earned
    .filter((b) => b.earned && !lockedBadges.includes(b.id))
    .map((b) => b.id);

  if (newlyEarned.length > 0) {
    await updateDoc(doc(db, "users", uid), {
      earnedBadges: [...lockedBadges, ...newlyEarned],
    });
  }

  return earned;
}