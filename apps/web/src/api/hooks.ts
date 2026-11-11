import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminReservationDto,
  AvailabilityDto,
  BlockDto,
  BlockInput,
  BlockMutationDto,
  CalendarDto,
  CartDto,
  CartInput,
  CartUpdate,
  ChromebookDto,
  ChromebookInput,
  ChromebookStatus,
  ChromebookUpdate,
  FailedNotificationDto,
  MeDto,
  ReservationDto,
  ReservationDecisionInput,
  ReservationInput,
  ReservationStatus,
  ReservationUpdate,
  SchoolSettingsDto,
  SchoolSettingsInput,
  SchoolSettingsMutationDto,
  UserDto,
  UserInput,
  UserUpdate,
} from "@chromebook/shared";
import { addDays, MAX_ADMIN_RANGE_DAYS, schoolNow } from "@chromebook/shared";
import { apiFetch } from "./client";

export const queryKeys = {
  me: ["me"] as const,
  calendar: (range: DateRange) => ["schedule", "calendar", range] as const,
  availability: (date: string) => ["schedule", "availability", date] as const,
  reservation: (id: string, withToken: boolean) => ["schedule", "reservation", id, withToken] as const,
  adminCarts: ["admin", "carts"] as const,
  adminChromebooks: (filters: ChromebookFilters) => ["admin", "chromebooks", filters] as const,
  adminUsers: ["admin", "users"] as const,
  adminReservations: (filters: AdminReservationFilters) => ["admin", "reservations", filters] as const,
  adminBlocks: (year: number) => ["admin", "blocks", year] as const,
  adminSettings: ["admin", "settings"] as const,
};

export interface AdminReservationFilters {
  from: string;
  to: string;
  cartId?: string;
  status?: ReservationStatus;
  search?: string;
}

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

function useInvalidateReservations() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "reservations"] }),
      queryClient.invalidateQueries({ queryKey: ["schedule"] }),
    ]);
}

export function useAdminReservations(filters: AdminReservationFilters) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.cartId) params.set("cartId", filters.cartId);
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  return useQuery({
    queryKey: queryKeys.adminReservations(filters),
    queryFn: () => apiFetch<AdminReservationDto[]>(`/api/admin/reservations?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}

export function usePendingReservations() {
  const today = schoolNow(new Date()).date;
  const filters: AdminReservationFilters = { from: today, to: addDays(today, MAX_ADMIN_RANGE_DAYS), status: "PENDING" };
  return useQuery({
    queryKey: queryKeys.adminReservations(filters),
    queryFn: () =>
      apiFetch<AdminReservationDto[]>(`/api/admin/reservations?${new URLSearchParams({ ...filters, status: "PENDING" }).toString()}`),
    refetchInterval: 60_000,
  });
}

export function useEditReservation() {
  const invalidate = useInvalidateReservations();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReservationUpdate }) =>
      apiFetch<AdminReservationDto>(`/api/admin/reservations/${id}`, { method: "PATCH", body: input }),
    onSettled: invalidate,
  });
}

export function useAdminCancelReservation() {
  const invalidate = useInvalidateReservations();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string | null }) =>
      apiFetch<ReservationDto>(`/api/admin/reservations/${id}/cancel`, { method: "POST", body: { reason } }),
    onSettled: invalidate,
  });
}

function useInvalidateBlocks() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "blocks"] }),
      queryClient.invalidateQueries({ queryKey: ["schedule"] }),
    ]);
}

export function useAdminBlocks(year: number) {
  return useQuery({
    queryKey: queryKeys.adminBlocks(year),
    queryFn: () => apiFetch<BlockDto[]>(`/api/admin/blocks?year=${year}`),
    placeholderData: keepPreviousData,
  });
}

export function usePreviewBlock() {
  return useMutation({
    mutationFn: (input: BlockInput) =>
      apiFetch<BlockMutationDto>("/api/admin/blocks?preview=true", { method: "POST", body: input }),
  });
}

export function useSaveBlock() {
  const invalidate = useInvalidateBlocks();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: BlockInput }) =>
      id
        ? apiFetch<BlockMutationDto>(`/api/admin/blocks/${id}`, { method: "PUT", body: input })
        : apiFetch<BlockMutationDto>("/api/admin/blocks", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteBlock() {
  const invalidate = useInvalidateBlocks();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/blocks/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useAdminSettings() {
  return useQuery({ queryKey: queryKeys.adminSettings, queryFn: () => apiFetch<SchoolSettingsDto>("/api/admin/settings") });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SchoolSettingsInput) =>
      apiFetch<SchoolSettingsMutationDto>("/api/admin/settings", { method: "PUT", body: input }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.adminSettings, result.settings);
      return queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
}

export function useRegenerateAccessCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<SchoolSettingsDto>("/api/admin/settings/access-code", { method: "POST" }),
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.adminSettings, settings),
  });
}

export function useDecideReservation() {
  const invalidate = useInvalidateReservations();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReservationDecisionInput }) =>
      apiFetch<AdminReservationDto>(`/api/admin/reservations/${id}/decision`, { method: "POST", body: input }),
    onSettled: invalidate,
  });
}

export function useApprovalRequest(id: string, approvalToken: string) {
  return useQuery({
    queryKey: ["approval", id, approvalToken],
    queryFn: () =>
      apiFetch<AdminReservationDto>(`/api/approvals/${id}`, { headers: { "X-Approval-Token": approvalToken } }),
    retry: false,
  });
}

export function useDecideByLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReservationDecisionInput }) =>
      apiFetch<AdminReservationDto>(`/api/approvals/${id}`, { method: "POST", body: input }),
    onSuccess: (reservation, { id, input }) =>
      queryClient.setQueryData(["approval", id, input.approvalToken], reservation),
  });
}

export function useFetchCartUpcomingReservations() {
  const queryClient = useQueryClient();
  return (cartId: string) =>
    queryClient.fetchQuery({
      queryKey: ["admin", "reservations", "cart-upcoming", cartId],
      queryFn: () => apiFetch<AdminReservationDto[]>(`/api/admin/carts/${cartId}/upcoming-reservations`),
      staleTime: 0,
    });
}

const FAILED_NOTIFICATIONS_KEY = ["admin", "notifications", "failed"] as const;

export function useFailedNotifications() {
  return useQuery({
    queryKey: FAILED_NOTIFICATIONS_KEY,
    queryFn: () => apiFetch<FailedNotificationDto[]>("/api/admin/notifications/failed"),
    refetchInterval: 60_000,
  });
}

export function useRetryNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ queued: boolean }>(`/api/admin/notifications/${id}/retry`, { method: "POST" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: FAILED_NOTIFICATIONS_KEY }),
  });
}
