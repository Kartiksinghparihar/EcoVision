import * as SunCalc from "suncalc";
import { SITE_TZ, siteDay, dayDate, siteHour } from "./tz";

/** Sunrise/sunset as fractional site-local hours for a day key (YYYY-MM-DD) or Date. */
export function getSunTimes(day: string | Date, lat: number, lng: number, tz = SITE_TZ) {
  const key = typeof day === "string" ? day : siteDay(day, tz);
  const t = SunCalc.getTimes(dayDate(key), lat, lng);
  const h = (d: Date | null, fb: number) => (d && !isNaN(d.getTime()) ? siteHour(d, tz) : fb);
  return { sunrise: h(t.sunrise, 6), sunset: h(t.sunset, 18) };
}

export function isNight(ts: Date, lat: number, lng: number, tz = SITE_TZ) {
  const { sunrise, sunset } = getSunTimes(ts, lat, lng, tz);
  const hr = siteHour(ts, tz);
  return hr < sunrise || hr > sunset;
}
