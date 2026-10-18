export type PrepareDepartmentNameResult =
  { ok: true; value: string } | { ok: false; error: "empty" };

export function prepareDepartmentName(raw: string): PrepareDepartmentNameResult {
  const name = raw.trim();
  if (!name) return { ok: false, error: "empty" };
  return { ok: true, value: name };
}
