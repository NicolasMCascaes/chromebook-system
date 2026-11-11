export const USER_ROLES = ["PROFESSOR", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CHROMEBOOK_STATUSES = ["AVAILABLE", "MAINTENANCE", "INACTIVE"] as const;
export type ChromebookStatus = (typeof CHROMEBOOK_STATUSES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  PROFESSOR: "Professor",
  ADMIN: "Administrador",
};

export const CHROMEBOOK_STATUS_LABELS: Record<ChromebookStatus, string> = {
  AVAILABLE: "Disponível",
  MAINTENANCE: "Manutenção",
  INACTIVE: "Inativo",
};

export const SCHOOL_TIME_ZONE = "America/Sao_Paulo";
