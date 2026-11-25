/**
 * Tiny stand-in for the drizzle-orm operators used by the modules under test.
 *
 * The fake database understands these plain-object predicates, so route and
 * pipeline tests can exercise real filtering/ownership logic without a
 * PostgreSQL instance.
 */

export interface Predicate {
  op: string;
  [key: string]: unknown;
}

export function eq(col: unknown, val: unknown): Predicate {
  return { op: "eq", col, val };
}

export function ne(col: unknown, val: unknown): Predicate {
  return { op: "ne", col, val };
}

export function and(...preds: Predicate[]): Predicate {
  return { op: "and", preds };
}

export function or(...preds: Predicate[]): Predicate {
  return { op: "or", preds };
}

export function inArray(col: unknown, vals: unknown[]): Predicate {
  return { op: "in", col, vals };
}

export function desc(col: unknown): Predicate {
  return { op: "desc", col };
}

export function asc(col: unknown): Predicate {
  return { op: "asc", col };
}

export function count(): Predicate {
  return { op: "count" };
}

function sqlTag(strings: TemplateStringsArray, ...values: unknown[]): Predicate {
  return { op: "sql", strings: Array.from(strings), values };
}

sqlTag.raw = (value: string): Predicate => ({ op: "raw", value });
sqlTag.join = (chunks: unknown[], separator: unknown): Predicate => ({
  op: "join",
  chunks,
  separator,
});

export const sql = sqlTag as unknown as {
  (strings: TemplateStringsArray, ...values: unknown[]): Predicate;
  raw: (value: string) => Predicate;
  join: (chunks: unknown[], separator: unknown) => Predicate;
};

export const gt = (col: unknown, val: unknown): Predicate => ({ op: "gt", col, val });
export const gte = (col: unknown, val: unknown): Predicate => ({ op: "gte", col, val });
export const lt = (col: unknown, val: unknown): Predicate => ({ op: "lt", col, val });
export const lte = (col: unknown, val: unknown): Predicate => ({ op: "lte", col, val });
export const like = (col: unknown, val: unknown): Predicate => ({ op: "like", col, val });
export const ilike = (col: unknown, val: unknown): Predicate => ({ op: "ilike", col, val });
