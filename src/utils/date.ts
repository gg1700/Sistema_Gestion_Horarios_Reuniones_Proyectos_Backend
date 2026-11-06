import * as DateConstants from "../utils/constants/date.constants";

export function getLocalWeekDay(date: Date, timeZone: string) {
  const weekDay = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone,
    weekday: "short"
  }).format(date);

  return DateConstants.days[weekDay];
}

export function getLocalTime(date: Date, timeZone: string) {
  const localTime = date.toLocaleTimeString("en-US", {
    timeZone: timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  return localTime;
}

export function getLocalDate(date: Date, timeZone: string): string {
  const localDate = date.toLocaleDateString("en-CA", {
    timeZone: timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return localDate;
}