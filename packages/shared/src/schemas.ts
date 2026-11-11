import { z } from "zod";
import { CHROMEBOOK_STATUSES, MAX_CALENDAR_RANGE_DAYS, USER_ROLES } from "./enums";
import { daysBetween, isValidIsoDate, TIME_PATTERN, timeToMinutes } from "./time";

const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} é obrigatório.` })
    .trim()
    .min(1, `${label} é obrigatório.`)
    .max(max, `${label} deve ter no máximo ${max} caracteres.`);

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} deve ter no máximo ${max} caracteres.`)
    .nullable()
    .transform((value) => (value === null || value === "" ? null : value));

const atLeastOneField = (value: Record<string, unknown>) => Object.values(value).some((field) => field !== undefined);
const NO_FIELDS_MESSAGE = "Informe ao menos um campo para atualizar.";

const cartFields = {
  name: requiredText("Nome", 60),
  description: optionalText("Descrição", 200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor deve estar no formato #RRGGBB."),
  displayOrder: z.number().int("Ordem deve ser um número inteiro.").min(0).max(999),
  active: z.boolean(),
};

export const cartInputSchema = z.object({
  name: cartFields.name,
  description: cartFields.description.optional().default(null),
  color: cartFields.color,
  displayOrder: cartFields.displayOrder.default(0),
  active: cartFields.active.default(true),
});
export type CartInput = z.input<typeof cartInputSchema>;

export const cartUpdateSchema = z
  .object({
    name: cartFields.name.optional(),
    description: cartFields.description.optional(),
    color: cartFields.color.optional(),
    displayOrder: cartFields.displayOrder.optional(),
    active: cartFields.active.optional(),
  })
  .refine(atLeastOneField, NO_FIELDS_MESSAGE);
export type CartUpdate = z.input<typeof cartUpdateSchema>;

const chromebookFields = {
  assetTag: requiredText("Identificação", 40).transform((value) => value.toUpperCase()),
  name: requiredText("Nome", 80),
  brandModel: requiredText("Marca/modelo", 80),
  cartId: z.uuid("Carrinho inválido."),
  status: z.enum(CHROMEBOOK_STATUSES, { error: "Situação inválida." }),
};

export const chromebookInputSchema = z.object({
  assetTag: chromebookFields.assetTag,
  name: chromebookFields.name,
  brandModel: chromebookFields.brandModel,
  cartId: chromebookFields.cartId,
  status: chromebookFields.status.default("AVAILABLE"),
});
export type ChromebookInput = z.input<typeof chromebookInputSchema>;

export const chromebookUpdateSchema = z
  .object({
    assetTag: chromebookFields.assetTag.optional(),
    name: chromebookFields.name.optional(),
    brandModel: chromebookFields.brandModel.optional(),
    cartId: chromebookFields.cartId.optional(),
    status: chromebookFields.status.optional(),
  })
  .refine(atLeastOneField, NO_FIELDS_MESSAGE);
export type ChromebookUpdate = z.input<typeof chromebookUpdateSchema>;

export const chromebookFilterSchema = z.object({
  cartId: chromebookFields.cartId.optional(),
  status: chromebookFields.status.optional(),
});

const userRole = z.enum(USER_ROLES, { error: "Perfil inválido." });

export const userInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("E-mail inválido.").max(254, "E-mail muito longo.")),
  name: requiredText("Nome", 100),
  role: userRole.default("PROFESSOR"),
});
export type UserInput = z.input<typeof userInputSchema>;

export const userUpdateSchema = z
  .object({
    name: requiredText("Nome", 100).optional(),
    role: userRole.optional(),
    active: z.boolean().optional(),
  })
  .refine(atLeastOneField, NO_FIELDS_MESSAGE);
export type UserUpdate = z.input<typeof userUpdateSchema>;

const isoDate = z
  .string({ error: "Data é obrigatória." })
  .refine(isValidIsoDate, "Data inválida. Use o formato AAAA-MM-DD.");

const clockTime = (label: string) =>
  z.string({ error: `${label} é obrigatório.` }).regex(TIME_PATTERN, `${label} inválido. Use o formato HH:MM.`);

export const CANCEL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

const cancelToken = z.string().regex(CANCEL_TOKEN_PATTERN, "Código de cancelamento inválido.");

export const reservationInputSchema = z
  .object({
    teacherName: requiredText("Nome do professor", 100),
    cartId: z.uuid("Selecione um carrinho."),
    className: requiredText("Turma", 60),
    date: isoDate,
    startTime: clockTime("Horário de início"),
    endTime: clockTime("Horário de término"),
    notes: optionalText("Observação", 500).optional().default(null),
    cancelToken,
  })
  .refine((value) => timeToMinutes(value.endTime) > timeToMinutes(value.startTime), {
    message: "O horário de término deve ser posterior ao de início.",
    path: ["endTime"],
  });
export type ReservationInput = z.input<typeof reservationInputSchema>;

export const reservationCancelSchema = z.object({
  reason: optionalText("Motivo", 300).optional().default(null),
  cancelToken: cancelToken.optional(),
});
export type ReservationCancelInput = z.input<typeof reservationCancelSchema>;

export const calendarQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    cartId: z.uuid("Carrinho inválido.").optional(),
  })
  .refine((value) => daysBetween(value.from, value.to) >= 0, {
    message: "A data final deve ser igual ou posterior à inicial.",
    path: ["to"],
  })
  .refine((value) => daysBetween(value.from, value.to) <= MAX_CALENDAR_RANGE_DAYS, {
    message: `O período consultado deve ter no máximo ${MAX_CALENDAR_RANGE_DAYS} dias.`,
    path: ["to"],
  });

export const availabilityQuerySchema = z.object({
  date: isoDate,
  cartId: z.uuid("Carrinho inválido.").optional(),
});
