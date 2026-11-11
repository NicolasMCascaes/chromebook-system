import { describe, expect, it } from "vitest";
import type { AvailabilityDto, CartAvailabilityDto, SchoolHoursDto, SchoolNow } from "@chromebook/shared";
import { CART_BUSY_MESSAGE, INVALID_PERIOD_RANGE_MESSAGE, cartSituation, validateReservationForm, type ReservationDraft } from "./reservation-validation";

const HOURS: SchoolHoursDto = { openingTime: "07:20", closingTime: "11:50", slotMinutes: 5 };
const MONDAY_MORNING: SchoolNow = { date: "2030-03-04", time: "09:00", minutes: 540 };
const CART_ID = "4f7c2a51-8a43-4f0e-9d3a-2a4a8b1f6c11";

const VALID: ReservationDraft = {
  teacherName: "Ana Souza",
  className: "6º A",
  date: "2030-03-05",
  startTime: "08:10",
  endTime: "09:00",
  cartId: CART_ID,
  notes: "",
};

function cart(overrides: Partial<CartAvailabilityDto> = {}): CartAvailabilityDto {
  return { cartId: CART_ID, cartName: "Carrinho 1", cartColor: "#1565c0", availableEquipment: 30, block: null, busy: [], free: [], ...overrides };
}

function availability(overrides: Partial<AvailabilityDto> = {}): AvailabilityDto {
  return { date: VALID.date, bookable: true, reason: null, hours: HOURS, carts: [cart()], ...overrides };
}

const validate = (draft: Partial<ReservationDraft>, extra: Partial<Parameters<typeof validateReservationForm>[1]> = {}) =>
  validateReservationForm({ ...VALID, ...draft }, { now: MONDAY_MORNING, hours: HOURS, availability: availability(), ...extra });

describe("validação do formulário de reserva", () => {
  it("não aponta erro para um pedido válido", () => {
    expect(validate({})).toEqual({});
  });

  it("exige nome e turma", () => {
    const errors = validate({ teacherName: "  ", className: "" });
    expect(errors.teacherName).toBe("Nome do professor é obrigatório.");
    expect(errors.className).toBe("Selecione a turma.");
  });

  it("recusa fim de semana e dia que já passou", () => {
    expect(validate({ date: "2030-03-09" }).date).toBe("Não é possível reservar aos sábados e domingos.");
    expect(validate({ date: "2030-03-01" }).date).toBe("Não é possível reservar uma data ou horário que já passou.");
  });

  it("recusa término antes do início e intervalo de aulas invertido", () => {
    expect(validate({ startTime: "09:00", endTime: "08:10" }).endTime).toBe("O horário de término deve ser posterior ao de início.");
    expect(validate({ startTime: "", endTime: "" }, { invalidPeriodRange: true }).endTime).toBe(INVALID_PERIOD_RANGE_MESSAGE);
  });

  it("recusa horário fora do funcionamento ou fora da grade de minutos", () => {
    expect(validate({ startTime: "07:00", endTime: "08:00" }).startTime).toMatch(/horário de funcionamento \(07:20 às 11:50\)/);
    expect(validate({ startTime: "08:12", endTime: "09:00" }).startTime).toMatch(/múltiplos de 5 minutos/);
  });

  it("recusa horário de hoje que já começou", () => {
    const today = { date: MONDAY_MORNING.date, availability: availability({ date: MONDAY_MORNING.date }) };
    expect(validate({ date: today.date, startTime: "08:10", endTime: "09:00" }, { availability: today.availability }).startTime).toBe(
      "Não é possível reservar uma data ou horário que já passou.",
    );
    expect(validate({ date: today.date, startTime: "09:00", endTime: "09:50" }, { availability: today.availability })).toEqual({});
  });

  it("mostra o motivo quando a data está bloqueada", () => {
    const blocked = availability({ bookable: false, reason: "Feriado nacional: Carnaval", carts: [cart({ block: { kind: "HOLIDAY_NATIONAL", reason: "Carnaval" } })] });
    const errors = validate({}, { availability: blocked });
    expect(errors.date).toBe("Feriado nacional: Carnaval");
    expect(errors.cartId).toBeUndefined();
  });

  it("aponta carrinho ocupado ou bloqueado só para ele", () => {
    const busy = availability({
      carts: [cart({ busy: [{ start: "08:00", end: "08:30", reservationId: "r1", teacherName: "Bruno", className: "7º A", status: "CONFIRMED" }] })],
    });
    expect(validate({}, { availability: busy }).cartId).toBe(CART_BUSY_MESSAGE);
    const blockedCart = availability({ carts: [cart({ block: { kind: "BLOCK", reason: "Manutenção" } })] });
    expect(validate({}, { availability: blockedCart }).cartId).toBe("Este carrinho não está disponível nesta data (Manutenção).");
  });

  it("ignora disponibilidade de outra data", () => {
    const other = availability({ date: "2030-03-06", bookable: false, reason: "Feriado" });
    expect(validate({}, { availability: other })).toEqual({});
  });
});

describe("situação do carrinho", () => {
  it("diferencia livre, ocupado e bloqueado", () => {
    const times = { startTime: "09:00", endTime: "09:50" };
    expect(cartSituation(cart(), times)).toEqual({ text: "Livre neste horário", unavailable: false });
    expect(
      cartSituation(cart({ busy: [{ start: "09:30", end: "10:00", reservationId: "r", teacherName: "x", className: "y", status: "PENDING" }] }), times),
    ).toEqual({ text: "Ocupado neste horário", unavailable: true });
    expect(cartSituation(cart({ block: { kind: "BLOCK", reason: "x" } }), null)).toEqual({ text: "Indisponível nesta data", unavailable: true });
    expect(cartSituation(undefined, times)).toBeNull();
  });
});
