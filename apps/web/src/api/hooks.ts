import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CartDto,
  CartInput,
  CartUpdate,
  ChromebookDto,
  ChromebookInput,
  ChromebookStatus,
  ChromebookUpdate,
  MeDto,
  UserDto,
  UserInput,
  UserUpdate,
} from "@chromebook/shared";
import { apiFetch } from "./client";

export const queryKeys = {
  me: ["me"] as const,
  carts: ["carts"] as const,
  adminCarts: ["admin", "carts"] as const,
  adminChromebooks: (filters: ChromebookFilters) => ["admin", "chromebooks", filters] as const,
  adminUsers: ["admin", "users"] as const,
};

export interface ChromebookFilters {
  cartId?: string;
  status?: ChromebookStatus;
}

export function useMe(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<MeDto>("/api/me"),
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useActiveCarts() {
  return useQuery({ queryKey: queryKeys.carts, queryFn: () => apiFetch<CartDto[]>("/api/carts") });
}

export function useAdminCarts() {
  return useQuery({ queryKey: queryKeys.adminCarts, queryFn: () => apiFetch<CartDto[]>("/api/admin/carts") });
}

function useInvalidateEquipment() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.adminCarts }),
      queryClient.invalidateQueries({ queryKey: queryKeys.carts }),
      queryClient.invalidateQueries({ queryKey: ["admin", "chromebooks"] }),
    ]);
}

export function useSaveCart() {
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CartInput | CartUpdate }) =>
      id
        ? apiFetch<CartDto>(`/api/admin/carts/${id}`, { method: "PATCH", body: input })
        : apiFetch<CartDto>("/api/admin/carts", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useAdminChromebooks(filters: ChromebookFilters) {
  const params = new URLSearchParams();
  if (filters.cartId) params.set("cartId", filters.cartId);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  return useQuery({
    queryKey: queryKeys.adminChromebooks(filters),
    queryFn: () => apiFetch<ChromebookDto[]>(`/api/admin/chromebooks${query ? `?${query}` : ""}`),
  });
}

export function useSaveChromebook() {
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ChromebookInput | ChromebookUpdate }) =>
      id
        ? apiFetch<ChromebookDto>(`/api/admin/chromebooks/${id}`, { method: "PATCH", body: input })
        : apiFetch<ChromebookDto>("/api/admin/chromebooks", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useAdminUsers() {
  return useQuery({ queryKey: queryKeys.adminUsers, queryFn: () => apiFetch<UserDto[]>("/api/admin/users") });
}

export function useAuthorizeUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UserInput) => apiFetch<UserDto>("/api/admin/users", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UserUpdate }) =>
      apiFetch<UserDto>(`/api/admin/users/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers }),
  });
}
