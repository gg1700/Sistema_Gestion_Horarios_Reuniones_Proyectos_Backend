export interface EditablePersonalInfo {
  name?: string;
  firstSurname?: string;
  surname?: Surname;
  phones?: Phone[];
  contactEmails?: ContactEmail[];
  addresses?: Address[];
  links?: Link[];
}

export interface EditablePersonalInfoDB {
  name?: string;
  first_surname?: string;
  surname?: SurnameDB;
  phones?: PhoneDB[];
  contact_emails?: ContactEmailDB[];
  addresses?: AddressDB[];
  links?: LinkDB[];
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