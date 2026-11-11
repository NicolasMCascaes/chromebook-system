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

export const RESERVATION_STATUSES = ["CONFIRMED", "CANCELLED"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
};

export const CALENDAR_BLOCK_KINDS = [
  "BLOCK",
  "HOLIDAY_NATIONAL",
  "HOLIDAY_STATE",
  "HOLIDAY_MUNICIPAL",
  "SCHOOL_RECESS",
] as const;
export type CalendarBlockKind = (typeof CALENDAR_BLOCK_KINDS)[number];

export const CALENDAR_BLOCK_KIND_LABELS: Record<CalendarBlockKind, string> = {
  BLOCK: "Bloqueio",
  HOLIDAY_NATIONAL: "Feriado nacional",
  HOLIDAY_STATE: "Feriado estadual",
  HOLIDAY_MUNICIPAL: "Feriado municipal",
  SCHOOL_RECESS: "Recesso escolar",
};

export const MAX_CALENDAR_RANGE_DAYS = 62;
