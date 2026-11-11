import type { ChromebookStatus, UserRole } from "./enums";

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
