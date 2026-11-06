export const today = new Date();

export const tody60YearsAgo = new Date(new Date().setFullYear(new Date().getFullYear() - 100));

export const days: Record<string, number> = {
  "Sun": 0,
  "Mon": 1,
  "Tue": 2,
  "Wed": 3,
  "Thu": 4,
  "Fri": 5,
  "Sat": 6
}