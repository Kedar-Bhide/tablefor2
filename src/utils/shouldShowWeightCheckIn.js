/**
 * Determines if the weight check-in popup should be shown.
 *
 * Check-in dates are the 1st and 15th of every month.
 * Grace window: shows on days 1-3 and 15-17.
 * Snooze: pushes to next day only (not 48 hours).
 * Already done: if lastWeightCheckIn matches this period's date, don't show.
 */
export function shouldShowWeightCheckIn({
  lastWeightCheckIn = null,
  weightInsightSnooze = null,
}) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed
  const day = today.getDate();
  const todayStr = formatDate(year, month + 1, day);

  // Determine which check-in period we're in
  let checkInDate = null;
  let periodStart = null;
  let periodEnd = null;
  let isLastDay = false;
  let dayNumber = null; // 1, 2, or 3 within the grace window

  if (day >= 1 && day <= 3) {
    checkInDate = formatDate(year, month + 1, 1);
    dayNumber = day; // 1, 2, or 3
    isLastDay = day === 3;

    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const lastDayOfPrevMonth = new Date(year, month, 0).getDate();
    periodStart = formatDate(prevYear, prevMonth + 1, 15);
    periodEnd = formatDate(prevYear, prevMonth + 1, lastDayOfPrevMonth);

  } else if (day >= 15 && day <= 17) {
    checkInDate = formatDate(year, month + 1, 15);
    dayNumber = day - 14; // 1, 2, or 3
    isLastDay = day === 17;

    periodStart = formatDate(year, month + 1, 1);
    periodEnd = formatDate(year, month + 1, 14);

  } else {
    return {
      shouldShow: false,
      checkInDate: null,
      periodStart: null,
      periodEnd: null,
      isLastDay: false,
      dayNumber: null,
    };
  }

  // Already completed this check-in
  if (lastWeightCheckIn === checkInDate) {
    return {
      shouldShow: false,
      checkInDate,
      periodStart,
      periodEnd,
      isLastDay,
      dayNumber,
    };
  }

  // Snooze check — only skip if snoozed TODAY
  // Snooze just pushes to next day's first app open
  if (weightInsightSnooze) {
    const snoozeDate = new Date(weightInsightSnooze);
    const snoozeDateStr = formatDate(
      snoozeDate.getFullYear(),
      snoozeDate.getMonth() + 1,
      snoozeDate.getDate()
    );
    if (snoozeDateStr === todayStr) {
      // Already snoozed today — don't show again until tomorrow
      return {
        shouldShow: false,
        checkInDate,
        periodStart,
        periodEnd,
        isLastDay,
        dayNumber,
      };
    }
  }

  return {
    shouldShow: true,
    checkInDate,
    periodStart,
    periodEnd,
    isLastDay,
    dayNumber,
  };
}

function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}