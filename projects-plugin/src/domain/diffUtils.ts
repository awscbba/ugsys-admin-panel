export function computeModifiedFields<T extends Record<string, unknown>>(
  original: T,
  edited: T,
): Partial<T> {
  const modified: Partial<T> = {};
  for (const key of Object.keys(edited) as Array<keyof T>) {
    const origVal = original[key];
    const editVal = edited[key];
    if (Array.isArray(origVal) && Array.isArray(editVal)) {
      if (JSON.stringify(origVal) !== JSON.stringify(editVal)) {
        modified[key] = editVal;
      }
    } else if (origVal !== editVal) {
      modified[key] = editVal;
    }
  }
  return modified;
}
