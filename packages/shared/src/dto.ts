import type { CalendarBlockKind, ChromebookStatus, ReservationStatus, UserRole } from "./enums";
import type { TimeInterval } from "./time";

export interface MeDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CartEquipmentSummary {
  total: number;
  available: number;
  maintenance: number;
  inactive: number;
}

export interface CartDto {
  id: string;
  name: string;
  description: string | null;
  color: string;
  displayOrder: number;
  active: boolean;
  equipment: CartEquipmentSummary;
  createdAt: string;
  updatedAt: string;
}

export interface ChromebookDto {
  id: string;
  assetTag: string;
  name: string;
  brandModel: string;
  cartId: string;
  cartName: string;
  status: ChromebookStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: { path: string; message: string }[];
}

export interface SchoolHoursDto {
  openingTime: string;
  closingTime: string;
  slotMinutes: number;
}

export interface ClassPeriodDto {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface ClassScheduleDto {
  id: string;
  name: string;
  periods: ClassPeriodDto[];
}

export interface ReservationDto {
  id: string;
  cartId: string;
  cartName: string;
  cartColor: string;
  teacherName: string;
  className: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
  notes: string | null;
  canCancel: boolean;
  createdAt: string;
}

export interface CalendarBlockDto {
  id: string;
  kind: CalendarBlockKind;
  startDate: string;
  endDate: string;
  reason: string;
  cartId: string | null;
}

export interface CalendarDto {
  today: string;
  nowTime: string;
  hours: SchoolHoursDto;
  schedules: ClassScheduleDto[];
  carts: CartDto[];
  reservations: ReservationDto[];
  blocks: CalendarBlockDto[];
}

export interface CartAvailabilityDto {
  cartId: string;
  cartName: string;
  cartColor: string;
  availableEquipment: number;
  block: { kind: CalendarBlockKind; reason: string } | null;
  busy: (TimeInterval & { reservationId: string; teacherName: string; className: string })[];
  free: TimeInterval[];
}

export interface AvailabilityDto {
  date: string;
  bookable: boolean;
  reason: string | null;
  hours: SchoolHoursDto;
  carts: CartAvailabilityDto[];
}

export interface AdminReservationDto extends ReservationDto {
  cancelReason: string | null;
  cancelledAt: string | null;
  updatedAt: string;
}

export interface BlockDto extends CalendarBlockDto {
  cartName: string | null;
  createdAt: string;
}

export interface BlockMutationDto {
  block: BlockDto | null;
  affectedReservations: AdminReservationDto[];
}

export interface SchoolSettingsDto extends SchoolHoursDto {
  notificationEmails: string[];
  schedules: ClassScheduleDto[];
  publicAccessCode: string;
}

export interface SchoolSettingsMutationDto {
  settings: SchoolSettingsDto;
  affectedReservations: AdminReservationDto[];
}
