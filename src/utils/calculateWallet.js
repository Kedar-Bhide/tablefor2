import { collection, query, where, limit, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

const CUTOFFS = {
  Breakfast: 11,
  Lunch: 14,
  Dinner: 21,
};

export const WHITELISTED_WALLET_UIDS = [
  "f4Pnwy9imIeYEn987KNkATi2yG33",
  "P8Hw72zyZqhJ19oxNZ9LYQTJvLT2"
];

export function getRewardForMeal(meal) {
  const type = meal.type;
  if (!CUTOFFS[type]) return 0;

  const cutoffHour = CUTOFFS[type];

  // Priority 1: localTime string "HH:MM" — saved at log time, timezone safe forever
  if (meal.localTime) {
    const [h, min] = meal.localTime.split(":").map(Number);
    const mealHour = h + min / 60;
    if (mealHour <= cutoffHour) return 2.0;
    if (mealHour <= cutoffHour + 1) return 1.0;
    return 0.5;
  }

  // Priority 2: localHour number — saved at log time, timezone safe
  if (meal.localHour !== undefined && meal.localHour !== null) {
    const mealHour = meal.localHour;
    if (mealHour <= cutoffHour) return 2.0;
    if (mealHour <= cutoffHour + 1) return 1.0;
    return 0.5;
  }

  // Priority 3: old meals — no local time saved
  // Best effort: use createdAt but acknowledge it may be wrong for timezone travelers
  const mealDate = meal.createdAt?.toDate
    ? meal.createdAt.toDate()
    : new Date(meal.createdAt);
  const mealHour = mealDate.getHours() + mealDate.getMinutes() / 60;
  if (mealHour <= cutoffHour) return 2.0;
  if (mealHour <= cutoffHour + 1) return 1.0;
  return 0.5;
}

export async function calculateWallet(uid) {
  if (!WHITELISTED_WALLET_UIDS.includes(uid)) {
    return { total: 0, fullCount: 0, halfCount: 0, quarterCount: 0, resetAt: null };
  }
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  const resetAt = userSnap.exists() && userSnap.data().walletResetAt
    ? userSnap.data().walletResetAt.toDate()
    : null;

  const q = query(collection(db, "meals"), where("uid", "==", uid), limit(1000));
  const snap = await getDocs(q);
  const meals = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const filtered = resetAt
    ? meals.filter((m) => {
      const mealDate = m.createdAt?.toDate
        ? m.createdAt.toDate()
        : new Date(m.createdAt);
      return mealDate > resetAt;
    })
    : meals;

  let total = 0;
  let fullCount = 0;
  let halfCount = 0;
  let quarterCount = 0;

  filtered.forEach((meal) => {
    const reward = getRewardForMeal(meal);
    if (reward === 2.0) fullCount++;
    else if (reward === 1.0) halfCount++;
    else if (reward === 0.5) quarterCount++;
    total += reward;
  });

  return {
    total: Math.round(total * 100) / 100,
    fullCount,
    halfCount,
    quarterCount,
    resetAt,
  };
}