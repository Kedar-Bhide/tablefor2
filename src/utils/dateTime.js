export function formatLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLocalTimeHHMM(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function getMealCreatedAtDate(meal) {
  if (!meal?.createdAt) return null;
  return meal.createdAt?.toDate ? meal.createdAt.toDate() : new Date(meal.createdAt);
}

export function getMealLocalDateKey(meal) {
  if (meal?.localDate) return meal.localDate;
  const createdAt = getMealCreatedAtDate(meal);
  return createdAt ? formatLocalDateKey(createdAt) : null;
}

export function getCurrentTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
}
