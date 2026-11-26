import type { Request, Response, NextFunction } from "express";
import { verifySupabaseToken } from "../lib/supabase/server";

export interface AuthRequest extends Request {
  userId: string;
}

/**
 * Requires a valid Supabase session token.
 * Dev bypass: DEV_AUTH_USER_ID is honored only when NODE_ENV !== "production".
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const devUserId = process.env.DEV_AUTH_USER_ID;
  if (devUserId && process.env.NODE_ENV !== "production") {
    (req as AuthRequest).userId = devUserId;
    next();
    return;
  }

  (async () => {
    const userId = await verifySupabaseToken(req.headers.authorization);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    (req as AuthRequest).userId = userId;
    next();
  })().catch(() => {
    res.status(401).json({ error: "Unauthorized" });
  });
}
