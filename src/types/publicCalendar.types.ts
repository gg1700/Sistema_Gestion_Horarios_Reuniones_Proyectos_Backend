export interface PublicCalendarRange {
  from: string;
  to: string;
}

export interface PublicCalendarInterval {
  startsAt: string;
  endsAt: string;
}

export interface PublicCalendarEvent extends PublicCalendarInterval {
  title: string;
  description?: string;
  location?: string;
  timeZone: string;
}

export interface PublicCalendarResponse extends PublicCalendarRange {
  handleName: string;
  timeZone: string;
  events: PublicCalendarEvent[];
  busySlots: PublicCalendarInterval[];
  availableWindows: PublicCalendarInterval[];
}
