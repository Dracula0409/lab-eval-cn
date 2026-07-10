// Lab sessions are split into two daily slots:
//   AN (forenoon):          00:30 -> 12:30 (same day)
//   FN (afternoon/evening): 12:30 -> 00:30 (next day)
//
// A module assigned during a slot stays visible to students for the rest of
// that slot, surviving logins/reconnects, and automatically stops being
// "current" the instant the next slot begins - unless the teacher explicitly
// reassigns or clears it sooner.
//
// All time math uses the server's local clock consistently (getHours/getDate
// etc.), so this assumes the server's system timezone is the lab's timezone.

const AN_START_MIN = 30;           // 00:30
const FN_START_MIN = 12 * 60 + 30; // 12:30

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getCurrentSlotKey(now = new Date()) {
  const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();

  if (minutesSinceMidnight >= AN_START_MIN && minutesSinceMidnight < FN_START_MIN) {
    // 00:30 - 12:29 -> AN slot, anchored to today
    return `${dateKey(now)}_AN`;
  }

  if (minutesSinceMidnight >= FN_START_MIN) {
    // 12:30 - 23:59 -> FN slot, started today
    return `${dateKey(now)}_FN`;
  }

  // 00:00 - 00:29 -> still part of yesterday's FN slot, which runs until 00:30 today
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return `${dateKey(yesterday)}_FN`;
}