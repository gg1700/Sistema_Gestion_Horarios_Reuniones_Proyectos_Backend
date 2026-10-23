export interface ProfileSurname {
  surname: string | null;
  visible: boolean;
}

export interface ProfilePhone {
  id: string;
  phoneNumber: string;
  countryCode: string;
  countryName: string;
  visible: boolean;
}

export interface ProfileEmail {
  id: string;
  email: string;
  visible: boolean;
}

export interface ProfileAddress {
  id: string;
  address: string;
  visible: boolean;
}

export interface ProfileCountry {
  id: string;
  countryName: string;
  countryCode: string;
  visible: boolean;
}

export interface ProfileWorkExperience {
  id: string;
  title: string;
  description: string | null;
  companyName: string | null;
  startDate: string;
  endDate: string | null;
  visible: boolean;
}

export interface ProfileLink {
  id: string;
  text: string;
  url: string;
  visible: boolean;
}

export interface Profile {
  id: string;
  handleName: string;
  name: string;
  firstSurname: string;
  email: string;
  profilePicture: string | null;
  surname: ProfileSurname | null;
  phones: ProfilePhone[];
  contactEmails: ProfileEmail[];
  addresses: ProfileAddress[];
  countries: ProfileCountry[];
  workExperiences: ProfileWorkExperience[];
  links: ProfileLink[];
}

export type ProfileResponse =
  { success: true; data: Profile } | { success: false; message: string };
