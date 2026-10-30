export const regexPhone = /^\d{6,15}$/;

export const regexCountryCode = /^[1-9]\d{0,2}$/;

export const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const regexURL = /[\s\\x00-\\x1F\\x7F]/;

export const regexURLScheme = /^[a-z][a-z0-9+.-]*:/i;

export const regexHandleName = /^[a-z0-9-]{3,50}$/;

export const regexDate = /^\d{4}-\d{2}-\d{2}$/;

export const regexForbiddenUrlCharacters = /[\s\p{Cc}]/u;

export const timezoneRegex = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-])*$/;