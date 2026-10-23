export const regexPhone = /^\d{6,15}$/;

export const regexCountryCode = /^[1-9]\d{0,2}$/;

export const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const regexURL = /[\s\\x00-\\x1F\\x7F]/;

export const regexURLScheme = /^[a-z][a-z0-9+.-]*:/i;

export const regexHandleName = /^[a-z0-9-]{3,50}$/;

export const regexPassword = /^(?=.*[A-Za-z])(?=.*\d)\S{8,72}$/;
