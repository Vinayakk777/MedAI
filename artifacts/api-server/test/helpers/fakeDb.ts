import { randomUUID } from "node:crypto";

/**
 * In-memory implementation of the small slice of the Drizzle query builder
 * that the MedAI routes and pipelines use.
 *
 * This is intentionally *not* a general SQL engine. It supports the operators
 * declared in `drizzleMock.ts` and is only meant for deterministic unit and
 * integration tests. No network connection is ever opened.
 */

export type FakeRow = Record<string, any>;

export interface FakeTable {
  __name: string;
  [column: string]: any;
}

export function defineTable(name: string, columns: string[]): FakeTable {
  const table: FakeTable = { __name: name };
  for (const column of columns) {
    table[column] = { __table: name, name: column };
  }
  return table;
}

type Op = "select" | "insert" | "update" | "delete" | "execute";

function columnName(col: any): string | undefined {
  if (!col || typeof col !== "object") return undefined;
  return col.name;
}

function compareValues(a: any, b: any): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return a < b ? -1 : 1;
}

function matchLike(value: unknown, pattern: unknown): boolean {
  if (typeof value !== "string" || typeof pattern !== "string") return false;
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped.replace(/%/g, ".*").replace(/_/g, ".")}$`, "i");
  return regex.test(value);
}

function matches(row: FakeRow, predicate: any): boolean {
  if (!predicate) return true;

  switch (predicate.op) {
    case "eq": {
      const name = columnName(predicate.col);
      return name ? row[name] === predicate.val : false;
    }
    case "ne": {
      const name = columnName(predicate.col);
      return name ? row[name] !== predicate.val : false;
    }
    case "in": {
      const name = columnName(predicate.col);
      return name ? (predicate.vals as unknown[]).includes(row[name]) : false;
    }
    case "and":
      return (predicate.preds as any[]).every((p) => matches(row, p));
    case "or":
      return (predicate.preds as any[]).some((p) => matches(row, p));
    case "gt": {
      const name = columnName(predicate.col);
      return name ? compareValues(row[name], predicate.val) > 0 : false;
    }
    case "gte": {
      const name = columnName(predicate.col);
      return name ? compareValues(row[name], predicate.val) >= 0 : false;
    }
    case "lt": {
      const name = columnName(predicate.col);
      return name ? compareValues(row[name], predicate.val) < 0 : false;
    }
    case "lte": {
      const name = columnName(predicate.col);
      return name ? compareValues(row[name], predicate.val) <= 0 : false;
    }
    case "like":
    case "ilike": {
      const name = columnName(predicate.col);
      return name ? matchLike(row[name], predicate.val) : false;
    }
    // Raw SQL fragments are treated as satisfied. Tests that exercise SQL
    // ranking/keyword search use the returned rows, not the WHERE clause.
    case "sql":
    case "raw":
    case "join":
      return true;
    default:
      return true;
  }
}

export interface FakeDb {
  db: any;
  seed: (table: string, rows: FakeRow | FakeRow[]) => FakeRow[];
  getRows: (table: string) => FakeRow[];
  clear: () => void;
  failNext: (op: Op, table: string, error?: Error) => void;
}

export function createFakeDb(): FakeDb {
  const tables = new Map<string, FakeRow[]>();
  const failures = new Map<string, Error>();

  const rowsFor = (table: string): FakeRow[] => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table)!;
  };

  const maybeFail = (op: Op, table: string | undefined) => {
    const key = `${op}:${table ?? ""}`;
    const error = failures.get(key);
    if (error) {
      failures.delete(key);
      throw error;
    }
  };

  const normalize = (table: string, values: FakeRow): FakeRow => {
    const now = new Date();
    const row: FakeRow = { ...values };
    if (row.id === undefined) row.id = randomUUID();
    if (row.createdAt === undefined) row.createdAt = now;
    if (table === "conversations" || table === "medicalDocuments" || table === "docUploads") {
      if (row.updatedAt === undefined) row.updatedAt = now;
    }
    if (table === "conversations" && row.lastMessage === undefined) row.lastMessage = null;
    if (table === "messages" && row.attachments === undefined) row.attachments = [];
    if (table === "medicalDocuments") {
      if (row.chunkCount === undefined) row.chunkCount = 0;
      if (row.isIndexed === undefined) row.isIndexed = false;
      if (row.isArchived === undefined) row.isArchived = false;
    }
    if (table === "docUploads") {
      if (row.isArchived === undefined) row.isArchived = false;
    }
    return row;
  };

  const select = (fields?: Record<string, any>) => {
    let tableName: string | undefined;
    let predicate: any;
    let orderBy: any;
    let limitCount: number | undefined;
    let offsetCount: number | undefined;
    let executed = false;
    let result: FakeRow[] = [];

    const run = (): FakeRow[] => {
      if (executed) return result;
      executed = true;
      maybeFail("select", tableName);
      let rows = [...rowsFor(tableName!)];

      if (predicate) rows = rows.filter((row) => matches(row, predicate));

      if (orderBy !== undefined) {
        const arg = Array.isArray(orderBy) ? orderBy[0] : orderBy;
        const descending = arg?.op === "desc";
        const col = arg?.op === "desc" || arg?.op === "asc" ? arg.col : arg;
        const name = columnName(col);
        if (name) {
          rows.sort((a, b) => compareValues(a[name], b[name]) * (descending ? -1 : 1));
        }
      }

      if (offsetCount) rows = rows.slice(offsetCount);
      if (limitCount !== undefined) rows = rows.slice(0, limitCount);

      if (fields && typeof fields === "object") {
        const keys = Object.keys(fields);
        const single = keys.length === 1 ? fields[keys[0]] : undefined;
        if (keys.length === 1 && (single?.op === "count" || single?.op === "sql")) {
          return [{ [keys[0]]: rows.length }];
        }
        return rows.map((row) => {
          const projected: FakeRow = {};
          for (const key of keys) {
            const value = fields[key];
            projected[key] =
              value && typeof value === "object" && (value.op === "count" || value.op === "sql")
                ? rows.length
                : row[key];
          }
          return projected;
        });
      }

      return rows;
    };

    const query: any = {
      from(table: FakeTable) {
        tableName = table.__name;
        return query;
      },
      where(next: any) {
        predicate = next;
        return query;
      },
      orderBy(...args: any[]) {
        orderBy = args.length === 1 ? args[0] : args;
        return query;
      },
      limit(count: number) {
        limitCount = count;
        return query;
      },
      offset(count: number) {
        offsetCount = count;
        return query;
      },
      execute: async () => run(),
      then(resolve: (value: FakeRow[]) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve().then(run).then(resolve, reject);
      },
      catch(reject: (reason: unknown) => unknown) {
        return Promise.resolve().then(run).catch(reject);
      },
    };

    return query;
  };

  const insert = (table: FakeTable) => {
    const tableName = table.__name;
    let inserted: FakeRow[] = [];
    let hasValues = false;

    const materialize = () => {
      if (hasValues) return inserted;
      throw new Error("insert().values() was not called");
    };

    const query: any = {
      values(values: FakeRow | FakeRow[]) {
        maybeFail("insert", tableName);
        const input = Array.isArray(values) ? values : [values];
        inserted = input.map((value) => normalize(tableName, value));
        // Enforce the one foreign key the upload path depends on. Real
        // PostgreSQL rejects page rows whose parent attachment does not exist
        // yet, so the in-memory double must too.
        if (tableName === "chatAttachmentPages") {
          const parents = rowsFor("chatAttachments");
          for (const row of inserted) {
            if (!parents.some((parent) => parent.id === row.attachmentId)) {
              throw new Error(
                `foreign key violation: chat_attachment_pages.attachment_id ${row.attachmentId}`,
              );
            }
          }
        }
        rowsFor(tableName).push(...inserted);
        hasValues = true;
        return query;
      },
      returning: async () => materialize(),
      execute: async () => materialize(),
      onConflictDoNothing() {
        const value = materialize();
        return {
          then(resolve: (value: FakeRow[]) => unknown, reject?: (reason: unknown) => unknown) {
            return Promise.resolve(value).then(resolve, reject);
          },
          catch(reject: (reason: unknown) => unknown) {
            return Promise.resolve(value).catch(reject);
          },
        };
      },
      then(resolve: (value: FakeRow[]) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve().then(materialize).then(resolve, reject);
      },
      catch(reject: (reason: unknown) => unknown) {
        return Promise.resolve().then(materialize).catch(reject);
      },
    };

    return query;
  };

  const update = (table: FakeTable) => {
    const tableName = table.__name;
    let values: FakeRow = {};
    let predicate: any;
    let executed = false;
    let updated: FakeRow[] = [];

    const run = () => {
      if (executed) return updated;
      executed = true;
      maybeFail("update", tableName);
      updated = rowsFor(tableName).filter((row) => matches(row, predicate));
      for (const row of updated) Object.assign(row, values);
      return updated;
    };

    const query: any = {
      set(next: FakeRow) {
        values = next;
        return query;
      },
      where(next: any) {
        predicate = next;
        return query;
      },
      returning: async () => run(),
      execute: async () => run(),
      then(resolve: (value: FakeRow[]) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve().then(run).then(resolve, reject);
      },
      catch(reject: (reason: unknown) => unknown) {
        return Promise.resolve().then(run).catch(reject);
      },
    };

    return query;
  };

  const remove = (table: FakeTable) => {
    const tableName = table.__name;
    let predicate: any;
    let executed = false;
    let removed: FakeRow[] = [];

    const run = () => {
      if (executed) return removed;
      executed = true;
      maybeFail("delete", tableName);
      const all = rowsFor(tableName);
      removed = all.filter((row) => matches(row, predicate));
      tables.set(
        tableName,
        all.filter((row) => !matches(row, predicate)),
      );
      return removed;
    };

    const query: any = {
      where(next: any) {
        predicate = next;
        return query;
      },
      returning: async () => run(),
      execute: async () => run(),
      then(resolve: (value: FakeRow[]) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve().then(run).then(resolve, reject);
      },
      catch(reject: (reason: unknown) => unknown) {
        return Promise.resolve().then(run).catch(reject);
      },
    };

    return query;
  };

  const db: any = {
    select,
    insert,
    update,
    delete: remove,
    execute: async () => {
      maybeFail("execute", undefined);
      return { rows: [] };
    },
  };

  const fake: FakeDb = {
    db,
    seed(table, rows) {
      const input = Array.isArray(rows) ? rows : [rows];
      const normalized = input.map((row) => normalize(table, row));
      rowsFor(table).push(...normalized);
      return normalized;
    },
    getRows(table) {
      return rowsFor(table);
    },
    clear() {
      tables.clear();
      failures.clear();
    },
    failNext(op, table, error = new Error(`Simulated ${op} failure on ${table}`)) {
      failures.set(`${op}:${table}`, error);
    },
  };

  db.__fake = fake;
  return fake;
}
