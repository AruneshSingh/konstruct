/**
 * Deep-merge two JSON-like values. Used to merge settings packages into
 * agent settings files.
 *
 * Rules:
 *   - Arrays: concatenate and deduplicate (primitive items only)
 *   - Objects: recursive merge; source keys win for scalars
 *   - Scalars: source wins
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as (keyof T)[]) {
    const srcVal = source[key];
    const tgtVal = result[key];

    if (srcVal === undefined) continue;

    if (Array.isArray(srcVal) && Array.isArray(tgtVal)) {
      // Concatenate and deduplicate (works for primitives; objects kept as-is)
      const merged = [...tgtVal, ...srcVal];
      const seen = new Set<unknown>();
      const deduped: unknown[] = [];
      for (const item of merged) {
        const key = typeof item === 'object' && item !== null ? JSON.stringify(item) : item;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(item);
        }
      }
      (result as Record<string, unknown>)[key as string] = deduped;
    } else if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
      (result as Record<string, unknown>)[key as string] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      (result as Record<string, unknown>)[key as string] = srcVal;
    }
  }

  return result;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}
