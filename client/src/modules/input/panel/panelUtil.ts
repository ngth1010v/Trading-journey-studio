import type { RGB, RGBA } from "../../../shared/types/color.type";

/**
 * Converts camelCase, snake_case, or kebab-case keys into a clean, human-readable format.
 * Example: "symbolPrice" -> "Symbol price", "alignX" -> "Align x"
 */
export function formatLabel(key: string): string {
  if (!key) return "";
  const result = key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim();
  return result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
}

/**
 * Safely fetches a deeply nested property value given an array path.
 * Returns undefined if any key in the path is missing.
 */
export function getValueAtPath(obj: any, path: string[]): any {
  if (!obj) return undefined;
  let current = obj;
  for (const key of path) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

/**
 * Converts color arrays to standard CSS strings
 */
export const toRGBString = (color: RGB): string => 
  `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

export const toRGBAString = (color: RGBA): string => 
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;