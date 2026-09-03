import type { Request, Response, NextFunction } from "express";

export interface ValidatedRequest extends Request {
  validatedBody: unknown;
}

interface ZodIssue {
  path: (string | number)[];
  message: string;
}

interface ZodResult {
  success: boolean;
  data?: unknown;
  error?: { issues: ZodIssue[] };
}

interface ZodLike {
  safeParse(input: unknown): ZodResult;
}

function formatZodError(error: { issues: ZodIssue[] }): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    const key = path || "_root";
    if (!formatted[key]) formatted[key] = [];
    formatted[key].push(issue.message);
  }
  return formatted;
}

/**
 * Middleware factory that validates request body against a Zod schema.
 * Returns 400 with structured error details on validation failure.
 * Works with any schema object that has a `safeParse` method (Zod, zod/v4, etc.).
 *
 * @example
 * router.post("/dashboard/vitals", validateBody(insertVitalSchema), handler);
 */
export function validateBody(schema: ZodLike) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: formatZodError(result.error!),
      });
      return;
    }
    (req as ValidatedRequest).validatedBody = result.data;
    next();
  };
}

/**
 * Middleware factory that validates request query params against a Zod schema.
 * Returns 400 with structured error details on validation failure.
 *
 * @example
 * router.get("/rag/logs", validateQuery(z.object({ limit: z.string().optional() })), handler);
 */
export function validateQuery(schema: ZodLike) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: formatZodError(result.error!),
      });
      return;
    }
    next();
  };
}
