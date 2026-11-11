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
  isOwner: boolean;
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
