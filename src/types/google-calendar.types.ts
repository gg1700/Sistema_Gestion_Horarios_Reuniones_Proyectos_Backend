export interface GoogleCalendar {
  id: string;
  name: string;
  description: string;
  timezone: string;
  primary: boolean;
  canWrite: boolean;
  accessRole: string;
  color: string | null;
}

export interface SelectedGoogleCalendar {
  calendarId: string;
  calendarName: string;
  timezone: string;
  status: "connected";
}
