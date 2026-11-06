export interface PhoneDigitsRange {
  minimum: number;
  maximum: number;
}

export const phoneDigitsByCountryCode: Record<string, PhoneDigitsRange> = {
  "591": { minimum: 8, maximum: 8 },
  "54": { minimum: 10, maximum: 11 },
  "55": { minimum: 10, maximum: 11 },
  "56": { minimum: 9, maximum: 9 },
  "57": { minimum: 10, maximum: 10 },
  "593": { minimum: 8, maximum: 9 },
  "595": { minimum: 7, maximum: 9 },
  "51": { minimum: 8, maximum: 9 },
  "598": { minimum: 8, maximum: 8 },
  "58": { minimum: 10, maximum: 10 },
  "52": { minimum: 10, maximum: 10 },
  "34": { minimum: 9, maximum: 9 },
  "1": { minimum: 10, maximum: 10 }
};
