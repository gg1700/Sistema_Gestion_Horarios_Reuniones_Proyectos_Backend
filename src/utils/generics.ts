export function omitEmptyValues(value: any) {
  const result = Object.entries(value).filter(([ , v]) => v !== undefined);
  return result;
}