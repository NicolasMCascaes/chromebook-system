import { z } from "zod";
import { CHROMEBOOK_STATUSES, USER_ROLES } from "./enums";

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
