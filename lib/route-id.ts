export function isSafeRouteId(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value === "." ||
    value === ".."
  ) {
    return false;
  }

  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}
