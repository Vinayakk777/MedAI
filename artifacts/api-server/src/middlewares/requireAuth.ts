import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

export interface AuthRequest extends Request {
  userId: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Dev/test-only bypass. NEVER honored in production.
  // Only active when NODE_ENV !== "production" AND DEV_AUTH_USER_ID is set.
  const devUserId = process.env.DEV_AUTH_USER_ID;
  if (devUserId && process.env.NODE_ENV !== "production") {
    (req as AuthRequest).userId = devUserId;
    next();
    return;
  }

  const auth = getAuth(req);
  const userId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId || undefined;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as AuthRequest).userId = userId;
  next();
}
