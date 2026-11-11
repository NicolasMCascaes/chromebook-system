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

export const RESERVATION_STATUSES = ["PENDING", "CONFIRMED", "REJECTED", "CANCELLED"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const ACTIVE_RESERVATION_STATUSES = ["PENDING", "CONFIRMED"] as const satisfies readonly ReservationStatus[];

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  PENDING: "Aguardando aprovação",
  CONFIRMED: "Aprovada",
  REJECTED: "Recusada",
  CANCELLED: "Cancelada",
};

export function isActiveReservationStatus(status: ReservationStatus): boolean {
  return status === "PENDING" || status === "CONFIRMED";
}

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

export const SLOT_MINUTES_OPTIONS = [5, 10, 15, 20, 30, 60] as const;

export const MAX_ADMIN_RANGE_DAYS = 366;
export const MAX_CLASS_PERIODS = 15;
export const MAX_CLASS_SCHEDULES = 5;
export const MAX_NOTIFICATION_EMAILS = 10;

export const NOTIFICATION_STATUSES = ["PENDING", "SENT", "FAILED"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const SCHOOL_CLASSES = ["5º A", "5º B", "6º A", "6º B", "7º ano", "8º A", "8º B", "9º ano"] as const;
export type SchoolClass = (typeof SCHOOL_CLASSES)[number];
