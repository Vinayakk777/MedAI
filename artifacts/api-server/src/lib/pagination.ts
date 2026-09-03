import type { Request, Response } from "express";
import { sql, type SQL } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Extracts and clamps pagination parameters from query string.
 *
 * @example
 * const { limit, offset } = getPagination(req, { defaultLimit: 20, maxLimit: 100 });
 */
export function getPagination(
  req: Request,
  options?: { defaultLimit?: number; maxLimit?: number },
): PaginationParams {
  const defaultLimit = options?.defaultLimit ?? 20;
  const maxLimit = options?.maxLimit ?? 100;
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || defaultLimit, 1), maxLimit);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  return { limit, offset };
}

/**
 * Returns a SQL expression for counting total rows matching a condition.
 *
 * @example
 * const [total] = await db.select({ value: countExpr(conversationsTable, where) }).from(conversationsTable);
 */
export function countExpr(table: PgTable, where?: SQL): SQL {
  const base = sql<number>`count(*)`;
  if (where) {
    return sql<number>`(SELECT count(*) FROM ${table} WHERE ${where})`;
  }
  return base;
}
