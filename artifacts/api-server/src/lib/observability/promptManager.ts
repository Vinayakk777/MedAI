import { db, promptVersionsTable, promptDeploymentsTable, abTestAssignmentsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import type { PromptVersionInput, ABTestAssignment } from "./types";

export class PromptManager {
  async createVersion(input: PromptVersionInput): Promise<{ id: string; version: number }> {
    // Get next version number
    const [last] = await db.select({ maxVersion: sql<number>`max(version)` })
      .from(promptVersionsTable)
      .where(eq(promptVersionsTable.name, input.name));

    const nextVersion = (last?.maxVersion ?? 0) + 1;

    const [saved] = await db.insert(promptVersionsTable).values({
      name: input.name,
      version: nextVersion,
      content: input.content,
      description: input.description,
      changeLog: input.changeLog,
      author: input.author,
      tags: input.tags,
      parentVersionId: input.parentVersionId,
      status: "draft",
    }).returning();

    return { id: saved.id, version: nextVersion };
  }

  async getVersionHistory(name: string) {
    return db.select()
      .from(promptVersionsTable)
      .where(eq(promptVersionsTable.name, name))
      .orderBy(desc(promptVersionsTable.version));
  }

  async getVersion(id: string) {
    const [version] = await db.select()
      .from(promptVersionsTable)
      .where(eq(promptVersionsTable.id, id))
      .limit(1);
    return version || null;
  }

  async getActiveVersion(name: string) {
    const [active] = await db.select()
      .from(promptVersionsTable)
      .where(and(
        eq(promptVersionsTable.name, name),
        eq(promptVersionsTable.status, "active"),
      ))
      .orderBy(desc(promptVersionsTable.version))
      .limit(1);
    return active || null;
  }

  async activateVersion(id: string, author: string): Promise<void> {
    const version = await this.getVersion(id);
    if (!version) throw new Error("Version not found");

    // Deactivate all other versions of this prompt
    await db.update(promptVersionsTable)
      .set({ status: "archived" })
      .where(and(
        eq(promptVersionsTable.name, version.name),
        eq(promptVersionsTable.status, "active"),
      ));

    // Activate this version
    await db.update(promptVersionsTable)
      .set({
        status: "active",
        activatedAt: new Date(),
      })
      .where(eq(promptVersionsTable.id, id));

    // Log deployment
    await db.insert(promptDeploymentsTable).values({
      promptVersionId: id,
      environment: "production",
      trafficPercent: 100,
      isActive: true,
      deployedBy: author,
    });
  }

  async rollback(name: string, targetVersion: number, author: string): Promise<void> {
    const [target] = await db.select()
      .from(promptVersionsTable)
      .where(and(
        eq(promptVersionsTable.name, name),
        eq(promptVersionsTable.version, targetVersion),
      ))
      .limit(1);

    if (!target) throw new Error(`Version ${targetVersion} not found`);

    // Mark current as rolled_back
    await db.update(promptVersionsTable)
      .set({ status: "rolled_back" })
      .where(and(
        eq(promptVersionsTable.name, name),
        eq(promptVersionsTable.status, "active"),
      ));

    // Create rollback (new version with old content)
    const [last] = await db.select({ maxVersion: sql<number>`max(version)` })
      .from(promptVersionsTable)
      .where(eq(promptVersionsTable.name, name));

    const [rolled] = await db.insert(promptVersionsTable).values({
      name,
      version: (last?.maxVersion ?? 0) + 1,
      content: target.content,
      description: `Rollback to version ${targetVersion}`,
      changeLog: `Rolled back to version ${targetVersion} by ${author}`,
      author,
      status: "active",
      parentVersionId: target.id,
      activatedAt: new Date(),
    }).returning();

    await db.insert(promptDeploymentsTable).values({
      promptVersionId: rolled.id,
      environment: "production",
      trafficPercent: 100,
      isActive: true,
      deployedBy: author,
    });
  }

  async compareVersions(idA: string, idB: string) {
    const [a, b] = await Promise.all([this.getVersion(idA), this.getVersion(idB)]);
    if (!a || !b) throw new Error("Version not found");

    return {
      versionA: { version: a.version, name: a.name, content: a.content, status: a.status },
      versionB: { version: b.version, name: b.name, content: b.content, status: b.status },
      differences: this.computeDiff(a.content, b.content),
    };
  }

  async assignABTest(input: ABTestAssignment): Promise<void> {
    await db.insert(abTestAssignmentsTable).values(input);
  }

  async getABTestResults(promptName: string) {
    const records = await db.select()
      .from(abTestAssignmentsTable)
      .where(eq(abTestAssignmentsTable.promptName, promptName));

    if (records.length === 0) return { total: 0, variantA: { count: 0, percentage: 0 }, variantB: { count: 0, percentage: 0 } };

    const variantAVal = records[0].variantA;
    const variantBVal = records[0].variantB;
    const aCount = records.filter((r) => r.assignedVariant === variantAVal).length;
    const bCount = records.filter((r) => r.assignedVariant === variantBVal).length;

    return {
      total: records.length,
      variantA: { count: aCount, percentage: (aCount / records.length) * 100 },
      variantB: { count: bCount, percentage: (bCount / records.length) * 100 },
    };
  }

  private computeDiff(a: string, b: string): { added: number; removed: number; changed: boolean } {
    const aLines = a.split("\n");
    const bLines = b.split("\n");
    const added = bLines.filter((l) => !aLines.includes(l)).length;
    const removed = aLines.filter((l) => !bLines.includes(l)).length;
    return { added, removed, changed: added > 0 || removed > 0 };
  }
}
