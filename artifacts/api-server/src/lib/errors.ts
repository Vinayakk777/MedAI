import type { Response } from "express";

export interface ErrorResponse {
  error: string;
  code?: string;
}

/**
 * Sends a consistent error response across all routes.
 * Logs the internal error but returns a safe user-facing message.
 *
 * @example
 * sendError(res, 500, "Failed to fetch vitals", err, req.log);
 */
export function sendError(
  res: Response,
  status: number,
  message: string,
  internalError?: unknown,
  logger?: { error: (obj: unknown, msg?: string) => void },
): void {
  if (logger && internalError) {
    logger.error({ err: internalError }, message);
  }
  res.status(status).json({ error: message });
}
