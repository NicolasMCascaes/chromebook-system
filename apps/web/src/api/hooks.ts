import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AvailabilityDto,
  CalendarDto,
  CartDto,
  CartInput,
  CartUpdate,
  ChromebookDto,
  ChromebookInput,
  ChromebookStatus,
  ChromebookUpdate,
  MeDto,
  ReservationDto,
  ReservationInput,
  UserDto,
  UserInput,
  UserUpdate,
} from "@chromebook/shared";
import { apiFetch } from "./client";

export const queryKeys = {
  me: ["me"] as const,
  calendar: (range: DateRange) => ["schedule", "calendar", range] as const,
  availability: (date: string) => ["schedule", "availability", date] as const,
  reservation: (id: string, withToken: boolean) => ["schedule", "reservation", id, withToken] as const,
  adminCarts: ["admin", "carts"] as const,
  adminChromebooks: (filters: ChromebookFilters) => ["admin", "chromebooks", filters] as const,
  adminUsers: ["admin", "users"] as const,
};

export interface DateRange {
  from: string;
  to: string;
}

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

export function useCalendar(range: DateRange | null) {
  return useQuery({
    queryKey: queryKeys.calendar(range ?? { from: "", to: "" }),
    queryFn: () => apiFetch<CalendarDto>(`/api/calendar?from=${range!.from}&to=${range!.to}`),
    enabled: range !== null,
    placeholderData: keepPreviousData,
  });
}

export function useAvailability(date: string | null) {
  return useQuery({
    queryKey: queryKeys.availability(date ?? ""),
    queryFn: () => apiFetch<AvailabilityDto>(`/api/availability?date=${date}`),
    enabled: date !== null,
    placeholderData: keepPreviousData,
  });
}

export function useReservation(id: string | null, cancelToken: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reservation(id ?? "", Boolean(cancelToken)),
    queryFn: () =>
      apiFetch<ReservationDto>(`/api/reservations/${id}`, {
        headers: cancelToken ? { "X-Cancel-Token": cancelToken } : undefined,
      }),
    enabled: id !== null,
  });
}

function useInvalidateSchedule() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["schedule"] });
}

export function useCreateReservation() {
  const invalidateSchedule = useInvalidateSchedule();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: ReservationInput; idempotencyKey: string }) =>
      apiFetch<ReservationDto>("/api/reservations", {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": idempotencyKey },
      }),
    onSettled: invalidateSchedule,
  });
}

export function useCancelReservation() {
  const invalidateSchedule = useInvalidateSchedule();
  return useMutation({
    mutationFn: ({ id, reason, cancelToken }: { id: string; reason?: string; cancelToken: string }) =>
      apiFetch<ReservationDto>(`/api/reservations/${id}/cancel`, {
        method: "POST",
        body: { reason: reason ?? null, cancelToken },
      }),
    onSettled: invalidateSchedule,
  });
}

export function useAdminCarts() {
  return useQuery({ queryKey: queryKeys.adminCarts, queryFn: () => apiFetch<CartDto[]>("/api/admin/carts") });
}

function useInvalidateEquipment() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.adminCarts }),
      queryClient.invalidateQueries({ queryKey: ["schedule"] }),
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
