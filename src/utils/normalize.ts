export function collapseSpaces(s: string) {
  return s
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, " ");
}

export function capitalize(s: string) {
  return s
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}