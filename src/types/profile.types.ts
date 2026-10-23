export interface EditablePersonalInfo {
  name?: string;
  firstSurname?: string;
  surname?: Surname;
  phones?: Phone[];
  contactEmails?: ContactEmail[];
  addresses?: Address[];
  links?: Link[];
  countries?: Country[];
}

export interface EditablePersonalInfoDB {
  name?: string;
  first_surname?: string;
  surname?: SurnameDB;
  phones?: PhoneDB[];
  contact_emails?: ContactEmailDB[];
  addresses?: AddressDB[];
  links?: LinkDB[];
  countries?: CountryDB[];
}

export interface Surname {
  surname: string;
  visibility: boolean;
}

export interface SurnameDB {
  surname: string,
  visible: boolean
}

export interface Phone {
  id: string;
  phoneNumber: string;
  countryCode: string;
  visibility: boolean;
}

export interface PhoneDB {
  id: string;
  number: string;
  code: string;
  visible: boolean;
}

export interface ContactEmail {
  id: string;
  email: string;
  visibility: boolean;
}

export interface ContactEmailDB {
  id: string;
  address: string;
  visible: boolean;
}

export interface Address {
  id: string;
  address: string;
  visibility: boolean;
}

export interface AddressDB {
  id: string;
  address: string;
  visible: boolean;
}

export interface Link {
  id: string;
  text: string;
  url: string;
  visibility: boolean;
}

export interface LinkDB {
  id: string;
  text: string;
  url: string;
  visible: boolean;
}

export interface Country {
  id: string;
  countryName: string;
  visibility: boolean;
}

export interface CountryDB {
  id: string;
  name: string;
  visible: boolean;
}

export type NewPhone = Omit<Phone, "id">;
export type NewContactEmail = Omit<ContactEmail, "id">;
export type NewAddress = Omit<Address, "id">;
export type NewLink = Omit<Link, "id">;
export type NewCountry = Omit<Country, "id">;

export type NewPhoneDB = Omit<PhoneDB, "id">;
export type NewContactEmailDB = Omit<ContactEmailDB, "id">;
export type NewAddressDB = Omit<AddressDB, "id">;
export type NewLinkDB = Omit<LinkDB, "id">;
export type NewCountryDB = Omit<CountryDB, "id">;

export interface NewWorkExperience {
  title: string;
  description: string | null;
  companyName: string | null;
  startDate: string;
  endDate: string | null;
  visibility: boolean;
}

export interface NewWorkExperienceDB {
  title: string;
  description: string | null;
  company_name: string | null;
  start_date: string;
  end_date: string | null;
  visible: boolean;
}

export interface AdditionalInfo {
  surname?: Surname;
  phones?: NewPhone[];
  contactEmails?: NewContactEmail[];
  addresses?: NewAddress[];
  links?: NewLink[];
  countries?: NewCountry[];
  workExperiences?: NewWorkExperience[];
}

export interface AdditionalInfoDB {
  surname?: SurnameDB;
  phones?: NewPhoneDB[];
  contact_emails?: NewContactEmailDB[];
  addresses?: NewAddressDB[];
  links?: NewLinkDB[];
  countries?: NewCountryDB[];
  work_experiences?: NewWorkExperienceDB[];
}
