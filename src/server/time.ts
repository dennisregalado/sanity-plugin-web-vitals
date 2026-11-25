/** Milliseconds `timeZone` is ahead of UTC at `date` (negative west of UTC). */
function timeZoneOffset(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(date)
      .map((part) => [part.type, Number(part.value)]),
  )
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** The instant local midnight began on the day `date` falls on in `timeZone`. DST-aware. */
export function startOfDayInTimeZone(date: Date, timeZone: string) {
  const local = new Date(date.getTime() + timeZoneOffset(date, timeZone))
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  // The offset at midnight can differ from the offset now on a DST change day.
  const guess = midnightAsUtc - timeZoneOffset(new Date(midnightAsUtc), timeZone)
  return new Date(midnightAsUtc - timeZoneOffset(new Date(guess), timeZone))
}

export type Windows = {start: Date; end: Date; prevStart: Date; prevEnd: Date}

/**
 * The current and previous periods for a range. Today runs from local midnight in `timeZone` and is
 * compared with yesterday over the same elapsed time; yesterday's start comes from the calendar, so
 * a DST day of 23 or 25 hours lines up. 7d and 30d are rolling windows ending now.
 */
export function getWindows(
  range: 'today' | '7d' | '30d',
  timeZone: string,
  now = new Date(),
): Windows {
  if (range === 'today') {
    const start = startOfDayInTimeZone(now, timeZone)
    const prevStart = startOfDayInTimeZone(new Date(start.getTime() - 1), timeZone)
    return {
      start,
      end: now,
      prevStart,
      prevEnd: new Date(prevStart.getTime() + (now.getTime() - start.getTime())),
    }
  }

  const days = range === '7d' ? 7 : 30
  const durationMs = days * 24 * 60 * 60 * 1000
  const start = new Date(now.getTime() - durationMs)
  return {
    start,
    end: now,
    prevStart: new Date(start.getTime() - durationMs),
    prevEnd: start,
  }
}
