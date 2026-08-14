import type { UserRole } from "./types";

type Permission = string;

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  patient: [
    "view_own_record",
    "view_own_consultations",
    "view_own_medications",
    "view_own_allergies",
    "view_own_labs",
    "view_own_vitals",
    "provide_feedback",
    "manage_own_consent",
  ],
  nurse: [
    "view_patient_record",
    "view_consultations",
    "view_medications",
    "view_allergies",
    "view_labs",
    "view_vitals",
    "view_care_plans",
    "update_vitals",
    "create_observations",
    "view_alerts",
  ],
  doctor: [
    "view_patient_record",
    "view_consultations",
    "view_medications",
    "view_allergies",
    "view_labs",
    "view_vitals",
    "view_care_plans",
    "view_ai_reviews",
    "create_notes",
    "edit_notes",
    "finalize_notes",
    "review_ai_consultation",
    "accept_diagnosis",
    "reject_diagnosis",
    "modify_diagnosis",
    "create_care_plans",
    "create_follow_ups",
    "create_referrals",
    "manage_assignments",
    "view_alerts",
    "export_fhir",
    "view_audit_logs",
    "view_analytics",
  ],
  admin: [
    "view_patient_record",
    "view_consultations",
    "view_medications",
    "view_allergies",
    "view_labs",
    "view_vitals",
    "view_care_plans",
    "view_ai_reviews",
    "create_notes",
    "edit_notes",
    "finalize_notes",
    "review_ai_consultation",
    "accept_diagnosis",
    "reject_diagnosis",
    "modify_diagnosis",
    "create_care_plans",
    "create_follow_ups",
    "create_referrals",
    "manage_assignments",
    "view_alerts",
    "export_fhir",
    "view_audit_logs",
    "view_analytics",
    "manage_clinicians",
    "manage_roles",
    "view_all_patients",
    "manage_system_config",
    "audit_all_actions",
  ],
};

export class RBAC {
  hasPermission(role: UserRole, permission: Permission): boolean {
    const permissions = ROLE_PERMISSIONS[role];
    if (!permissions) return false;
    return permissions.includes(permission);
  }

  hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
    return permissions.some((p) => this.hasPermission(role, p));
  }

  hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
    return permissions.every((p) => this.hasPermission(role, p));
  }

  canAccessPatientRecord(role: UserRole): boolean {
    return this.hasPermission(role, "view_patient_record") ||
           this.hasPermission(role, "view_own_record");
  }

  canModifyPatientData(role: UserRole): boolean {
    return role === "doctor" || role === "admin";
  }

  canReviewAI(role: UserRole): boolean {
    return role === "doctor" || role === "admin";
  }

  canManageClinicians(role: UserRole): boolean {
    return role === "admin";
  }

  getPermissionsForRole(role: UserRole): Permission[] {
    return ROLE_PERMISSIONS[role] || [];
  }

  // Middleware helper: returns middleware function that checks permission
  requirePermission(permission: Permission) {
    return (role: UserRole): boolean => this.hasPermission(role, permission);
  }
}

export const rbac = new RBAC();
