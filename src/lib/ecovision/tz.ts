
/** Time helpers evaluated in the camera site's timezone. */

export const SITE_TZ = "Asia/Kolkata";

const fmtCache = new Map<string, Intl.DateTimeFormat>();

export function isValidDate(
  value: Date | string | number | null | undefined
): boolean {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime());
}

function parts(d: Date, tz: string) {
  if (!isValidDate(d)) {
    throw new RangeError("Cannot format an invalid date.");
  }

  let formatter = fmtCache.get(tz);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

    fmtCache.set(tz, formatter);
  }

  const result: Record<string, string> = {};

  for (const part of formatter.formatToParts(d)) {
    result[part.type] = part.value;
  }

  return result;
}

/** Fractional hour of day (0-24) at the site. */
export function siteHour(d: Date, tz = SITE_TZ) {
  const p = parts(d, tz);
  return Number(p.hour) + Number(p.minute) / 60;
}

/** YYYY-MM-DD at the site. */
export function siteDay(d: Date, tz = SITE_TZ) {
  const p = parts(d, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Shift a YYYY-MM-DD key by n days. */
export function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + n));
  return t.toISOString().slice(0, 10);
}

/** Noon UTC of a day key. */
export function dayDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12));
}
