import { z } from "zod";
import {
  CALENDAR_BLOCK_KINDS,
  CHROMEBOOK_STATUSES,
  MAX_ADMIN_RANGE_DAYS,
  SCHOOL_CLASSES,
  MAX_CALENDAR_RANGE_DAYS,
  MAX_CLASS_PERIODS,
  MAX_CLASS_SCHEDULES,
  MAX_NOTIFICATION_EMAILS,
  RESERVATION_STATUSES,
  SLOT_MINUTES_OPTIONS,
  USER_ROLES,
} from "./enums";
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

const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("E-mail inválido.").max(254, "E-mail muito longo."));

export const userInputSchema = z.object({
  email: emailAddress,
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

const schoolClass = z.enum(SCHOOL_CLASSES, { error: "Selecione a turma." });

export const reservationInputSchema = z
  .object({
    teacherName: requiredText("Nome do professor", 100),
    cartId: z.uuid("Selecione um carrinho."),
    className: schoolClass,
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

export const adminReservationQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    cartId: z.uuid("Carrinho inválido.").optional(),
    status: z.enum(RESERVATION_STATUSES, { error: "Situação inválida." }).optional(),
    search: z.string().trim().max(100, "Busca muito longa.").optional(),
  })
  .refine((value) => daysBetween(value.from, value.to) >= 0, {
    message: "A data final deve ser igual ou posterior à inicial.",
    path: ["to"],
  })
  .refine((value) => daysBetween(value.from, value.to) <= MAX_ADMIN_RANGE_DAYS, {
    message: `O período consultado deve ter no máximo ${MAX_ADMIN_RANGE_DAYS} dias.`,
    path: ["to"],
  });

export const reservationUpdateSchema = z
  .object({
    teacherName: requiredText("Nome do professor", 100).optional(),
    className: schoolClass.optional(),
    cartId: z.uuid("Selecione um carrinho.").optional(),
    date: isoDate.optional(),
    startTime: clockTime("Horário de início").optional(),
    endTime: clockTime("Horário de término").optional(),
    notes: optionalText("Observação", 500).optional(),
  })
  .refine(atLeastOneField, NO_FIELDS_MESSAGE);
export type ReservationUpdate = z.input<typeof reservationUpdateSchema>;

export const blockInputSchema = z
  .object({
    kind: z.enum(CALENDAR_BLOCK_KINDS, { error: "Tipo inválido." }),
    startDate: isoDate,
    endDate: isoDate,
    reason: requiredText("Motivo", 200),
    cartId: z.uuid("Carrinho inválido.").nullable().optional().default(null),
  })
  .refine((value) => daysBetween(value.startDate, value.endDate) >= 0, {
    message: "A data final deve ser igual ou posterior à inicial.",
    path: ["endDate"],
  })
  .refine((value) => daysBetween(value.startDate, value.endDate) <= MAX_ADMIN_RANGE_DAYS, {
    message: `O período deve ter no máximo ${MAX_ADMIN_RANGE_DAYS} dias.`,
    path: ["endDate"],
  })
  .refine((value) => value.kind === "BLOCK" || value.cartId === null, {
    message: "Feriados e recessos valem para todos os carrinhos.",
    path: ["cartId"],
  });
export type BlockInput = z.input<typeof blockInputSchema>;

export const blockQuerySchema = z.object({
  year: z.coerce.number({ error: "Ano inválido." }).int("Ano inválido.").min(2000, "Ano inválido.").max(2100, "Ano inválido."),
});

const classPeriodInputSchema = z
  .object({
    name: requiredText("Nome da aula", 40),
    startTime: clockTime("Início da aula"),
    endTime: clockTime("Término da aula"),
  })
  .refine((value) => timeToMinutes(value.endTime) > timeToMinutes(value.startTime), {
    message: "O término da aula deve ser posterior ao início.",
    path: ["endTime"],
  });

export const schoolSettingsInputSchema = z
  .object({
    openingTime: clockTime("Abertura"),
    closingTime: clockTime("Encerramento"),
    slotMinutes: z
      .number({ error: "Intervalo inválido." })
      .refine((value) => (SLOT_MINUTES_OPTIONS as readonly number[]).includes(value), "Intervalo inválido."),
    notificationEmails: z
      .array(emailAddress)
      .max(MAX_NOTIFICATION_EMAILS, `Informe no máximo ${MAX_NOTIFICATION_EMAILS} e-mails.`)
      .refine((emails) => new Set(emails).size === emails.length, "Há e-mails repetidos."),
    schedules: z
      .array(
        z.object({
          name: requiredText("Nome da grade", 60),
          classNames: z.array(schoolClass).default([]),
          periods: z.array(classPeriodInputSchema).max(MAX_CLASS_PERIODS, `Cadastre no máximo ${MAX_CLASS_PERIODS} aulas por grade.`),
        }),
      )
      .max(MAX_CLASS_SCHEDULES, `Cadastre no máximo ${MAX_CLASS_SCHEDULES} grades de horário.`),
  })
  .superRefine((value, context) => {
    const opening = timeToMinutes(value.openingTime);
    const closing = timeToMinutes(value.closingTime);
    if (closing <= opening) {
      context.addIssue({ code: "custom", message: "O encerramento deve ser posterior à abertura.", path: ["closingTime"] });
      return;
    }
    if (opening % value.slotMinutes !== 0 || closing % value.slotMinutes !== 0) {
      context.addIssue({
        code: "custom",
        message: `Abertura e encerramento devem ser múltiplos de ${value.slotMinutes} minutos.`,
        path: ["slotMinutes"],
      });
    }
    const names = value.schedules.map((schedule) => schedule.name.toLocaleLowerCase("pt-BR"));
    const assigned = new Set<string>();
    value.schedules.forEach((schedule, scheduleIndex) => {
      for (const className of schedule.classNames) {
        if (assigned.has(className)) {
          context.addIssue({
            code: "custom",
            message: `${className} já está em outra grade.`,
            path: ["schedules", scheduleIndex, "classNames"],
          });
        }
        assigned.add(className);
      }
      if (names.indexOf(names[scheduleIndex]!) !== scheduleIndex) {
        context.addIssue({ code: "custom", message: "Há grades com o mesmo nome.", path: ["schedules", scheduleIndex, "name"] });
      }
      const sorted = schedule.periods
        .map((period, index) => ({ ...period, index, start: timeToMinutes(period.startTime), end: timeToMinutes(period.endTime) }))
        .sort((a, b) => a.start - b.start);
      sorted.forEach((period, position) => {
        const path = ["schedules", scheduleIndex, "periods", period.index, "startTime"];
        if (period.start < opening || period.end > closing) {
          context.addIssue({ code: "custom", message: `${period.name} está fora do horário de funcionamento.`, path });
        } else if (period.start % value.slotMinutes !== 0 || period.end % value.slotMinutes !== 0) {
          context.addIssue({
            code: "custom",
            message: `Os horários de ${period.name} devem ser múltiplos de ${value.slotMinutes} minutos.`,
            path,
          });
        }
        const previous = sorted[position - 1];
        if (previous && period.start < previous.end) {
          context.addIssue({ code: "custom", message: `${period.name} se sobrepõe a ${previous.name}.`, path });
        }
      });
    });
  });
export type SchoolSettingsInput = z.input<typeof schoolSettingsInputSchema>;

export const ACCESS_CODE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export const APPROVAL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export const reservationDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"], { error: "Decisão inválida." }),
  reason: optionalText("Motivo", 300).optional().default(null),
  approvalToken: z.string().regex(APPROVAL_TOKEN_PATTERN, "Link de aprovação inválido.").optional(),
});
export type ReservationDecisionInput = z.input<typeof reservationDecisionSchema>;
