import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, clinicianProfilesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export interface AdminRequest extends Request {
  userId: string;
  clinicianProfile: { id: string; role: string; isActive: boolean | null };
}

/**
 * Middleware that requires the authenticated user to have an admin role.
 * Used for system-level admin routes (safety-admin, rag-admin, observability).
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Token-based bypass for scripts/automation (e.g., ingestion scripts)
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken) {
    const authHeader = req.headers.authorization;
    if (authHeader === `Bearer ${adminToken}`) {
      (req as AdminRequest).userId = "admin-token";
      (req as AdminRequest).clinicianProfile = { id: "admin-token", role: "admin", isActive: true };
      next();
      return;
    }
  }

  // Dev/test-only bypass
  const devUserId = process.env.DEV_AUTH_USER_ID;
  if (devUserId && process.env.NODE_ENV !== "production") {
    const [profile] = await db.select()
      .from(clinicianProfilesTable)
      .where(and(
        eq(clinicianProfilesTable.userId, devUserId),
        eq(clinicianProfilesTable.isActive, true),
      ))
      .limit(1);

    if (!profile || profile.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    (req as AdminRequest).userId = devUserId;
    (req as AdminRequest).clinicianProfile = profile;
    next();
    return;
  }

  const auth = getAuth(req);
  const userId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId || undefined;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [profile] = await db.select()
    .from(clinicianProfilesTable)
    .where(and(
      eq(clinicianProfilesTable.userId, userId),
      eq(clinicianProfilesTable.isActive, true),
    ))
    .limit(1);

  if (!profile || profile.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  (req as AdminRequest).userId = userId;
  (req as AdminRequest).clinicianProfile = profile;
  next();
}
