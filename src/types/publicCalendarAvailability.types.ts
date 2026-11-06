export interface PublicCalendarAvailabilitySlot {
  startsAt: string;
  endsAt: string;
}

export interface PublicCalendarAvailabilityResponse {
  handleName: string;
  name: string;
  firstSurname: string;
  timeZone: string;
  slots: PublicCalendarAvailabilitySlot[];
}