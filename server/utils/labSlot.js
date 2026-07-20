// Lab sessions are split into two daily slots:
//   FN (forenoon): 00:30 -> 13:00 (same day)
//   AN (afternoon): 13:00 -> 17:30 (same day)
//
// A module assigned during a slot stays visible to students for the rest of
// that slot, surviving logins/reconnects, and automatically stops being
// "current" the instant the next slot begins - unless the teacher explicitly
// reassigns or clears it sooner.
//
// All time math uses the server's local clock consistently (getHours/getDate
// etc.), so this assumes the server's system timezone is the lab's timezone.

const FN_START_MIN = 30;           // 00:30
const AN_START_MIN = 13 * 60;      // 13:00
const AN_END_MIN = 17 * 60 + 30;   // 17:30

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getCurrentSlotKey(now = new Date()) {
  const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();

  if (minutesSinceMidnight >= FN_START_MIN && minutesSinceMidnight < AN_START_MIN) {
    // 00:30 - 12:59 -> FN slot, anchored to today
    return `${dateKey(now)}_FN`;
  }

  if (minutesSinceMidnight >= AN_START_MIN && minutesSinceMidnight < AN_END_MIN) {
    // 13:00 - 17:29 -> AN slot, anchored to today
    return `${dateKey(now)}_AN`;
  }

  // Outside teaching hours, default to the nearest upcoming slot.
  return `${dateKey(now)}_${minutesSinceMidnight < FN_START_MIN ? 'FN' : 'AN'}`;
}
