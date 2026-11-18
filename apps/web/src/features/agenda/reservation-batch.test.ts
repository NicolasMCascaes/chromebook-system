import { describe, expect, it } from "vitest";
import { SLOT_OVERLAP_MESSAGE } from "@chromebook/shared";
import {
  canAddSlot,
  MAX_SLOTS,
  newSlot,
  overlapErrors,
  slotWithError,
  splitServerErrors,
  withOverlapErrors,
} from "./reservation-batch";

const CART_1 = "11111111-1111-4111-8111-111111111111";
const CART_2 = "22222222-2222-4222-8222-222222222222";

describe("reserva de vários horários", () => {
  it("limita a quantidade de blocos", () => {
    expect(canAddSlot(1)).toBe(true);
    expect(canAddSlot(MAX_SLOTS - 1)).toBe(true);
    expect(canAddSlot(MAX_SLOTS)).toBe(false);
  });

  it("um bloco novo pede a turma de novo e reaproveita a data do anterior", () => {
    const previous = newSlot("a", undefined, { date: "2030-03-05", cartId: "" });
    const next = newSlot("b", { ...previous, className: "7º ano", date: "2030-03-07", cartId: CART_1 }, { date: "2030-03-05", cartId: "" });

    expect(next).toMatchObject({ key: "b", className: "", date: "2030-03-07", cartId: "", fromPeriodId: "", toPeriodId: "" });
  });

  it("aponta o bloco que repete o mesmo carrinho em horário sobreposto", () => {
    const overlapping = overlapErrors([
      { cartId: CART_1, date: "2030-03-05", times: { startTime: "08:00", endTime: "09:00" } },
      { cartId: CART_2, date: "2030-03-05", times: { startTime: "08:00", endTime: "09:00" } },
      { cartId: CART_1, date: "2030-03-05", times: { startTime: "08:30", endTime: "09:30" } },
      { cartId: CART_1, date: "2030-03-06", times: { startTime: "08:00", endTime: "09:00" } },
      { cartId: CART_1, date: "2030-03-05", times: { startTime: "09:00", endTime: "10:00" } },
    ]);

    expect([...overlapping]).toEqual([2, 4]);
  });

  it("ignora blocos ainda sem horário escolhido", () => {
    const overlapping = overlapErrors([
      { cartId: CART_1, date: "2030-03-05", times: { startTime: "08:00", endTime: "09:00" } },
      { cartId: CART_1, date: "2030-03-05", times: null },
    ]);

    expect(overlapping.size).toBe(0);
  });

  it("acrescenta o erro de sobreposição sem esconder outro erro do carrinho", () => {
    const errors = withOverlapErrors([{}, {}, { cartId: "Carrinho ocupado." }], new Set([1, 2]));

    expect(errors).toEqual([{}, { cartId: SLOT_OVERLAP_MESSAGE }, { cartId: "Carrinho ocupado." }]);
  });

  it("distribui os erros da API para o bloco certo", () => {
    const errors = splitServerErrors(
      [
        { path: "teacherName", message: "Nome do professor é obrigatório." },
        { path: "slots.1.className", message: "Selecione a turma." },
        { path: "slots.2.cartId", message: "Carrinho ocupado." },
      ],
      3,
      false,
    );

    expect(errors).toEqual({
      teacherName: "Nome do professor é obrigatório.",
      slots: [{}, { className: "Selecione a turma." }, { cartId: "Carrinho ocupado." }],
    });
    expect(slotWithError(errors)).toBe(1);
  });

  it("no envio de um único horário, os erros sem índice vão para o primeiro bloco", () => {
    const errors = splitServerErrors([{ path: "cartId", message: "Carrinho ocupado." }], 1, true);

    expect(errors.slots).toEqual([{ cartId: "Carrinho ocupado." }]);
  });
});
