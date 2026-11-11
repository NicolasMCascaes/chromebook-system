import { describe, expect, it } from "vitest";
import type { CalendarBlockDto, ClassPeriodDto, ReservationDto, SchoolHoursDto, SchoolNow } from "@chromebook/shared";
import {
  computeDayStatus,
  describePeriodRange,
  matchPeriods,
  nearestSchoolDay,
  nextSchoolDay,
  periodRangeTimes,
} from "./schedule-model";

const HOURS: SchoolHoursDto = { openingTime: "07:20", closingTime: "11:50", slotMinutes: 5 };
const MONDAY_MORNING: SchoolNow = { date: "2030-03-04", time: "07:00", minutes: 420 };
const CARTS = ["cart-a", "cart-b"];

const PERIODS: ClassPeriodDto[] = [
  { id: "p1", name: "1ª aula", startTime: "07:20", endTime: "08:10" },
  { id: "p2", name: "2ª aula", startTime: "08:10", endTime: "09:00" },
  { id: "p3", name: "3ª aula", startTime: "09:00", endTime: "09:50" },
  { id: "p4", name: "4ª aula", startTime: "10:10", endTime: "11:00" },
  { id: "p5", name: "5ª aula", startTime: "11:00", endTime: "11:50" },
];

function reservation(cartId: string, date: string, startTime: string, endTime: string): ReservationDto {
  return {
    id: `${cartId}-${date}-${startTime}`,
    cartId,
    cartName: cartId,
    cartColor: "#123456",
    teacherName: "Ana",
    className: "7º A",
    date,
    startTime,
    endTime,
    status: "CONFIRMED",
    notes: null,
    canCancel: false,
    createdAt: "2030-03-01T12:00:00Z",
  };
}

function block(overrides: Partial<CalendarBlockDto>): CalendarBlockDto {
  return {
    id: "block-1",
    kind: "HOLIDAY_NATIONAL",
    startDate: "2030-03-05",
    endDate: "2030-03-05",
    reason: "Carnaval",
    cartId: null,
    ...overrides,
  };
}

function status(date: string, reservations: ReservationDto[], blocks: CalendarBlockDto[] = [], now = MONDAY_MORNING) {
  return computeDayStatus(date, { hours: HOURS, reservations, blocks }, CARTS, now);
}

describe("computeDayStatus", () => {
  it("marca o dia sem reservas", () => {
    expect(status("2030-03-05", [])).toMatchObject({ kind: "empty", label: "Sem reservas" });
  });

  it("indica horários livres quando há reserva mas sobra tempo", () => {
    const result = status("2030-03-05", [reservation("cart-a", "2030-03-05", "07:20", "08:10")]);
    expect(result).toMatchObject({ kind: "available", reservationCount: 1 });
  });

  it("indica dia sem horários livres apenas quando todos os carrinhos estão ocupados", () => {
    const full = [
      reservation("cart-a", "2030-03-05", "07:20", "11:50"),
      reservation("cart-b", "2030-03-05", "07:20", "11:50"),
    ];
    expect(status("2030-03-05", full).kind).toBe("full");
    expect(status("2030-03-05", full.slice(0, 1)).kind).toBe("available");
  });

  it("mostra o motivo do bloqueio global", () => {
    const result = status("2030-03-05", [], [block({})]);
    expect(result).toMatchObject({ kind: "blocked", blockReason: "Feriado nacional: Carnaval" });
  });

  it("só bloqueia o dia quando todos os carrinhos filtrados estão bloqueados", () => {
    const cartBlock = block({ kind: "BLOCK", reason: "Manutenção", cartId: "cart-a" });
    expect(status("2030-03-05", [], [cartBlock]).kind).toBe("empty");
    const result = computeDayStatus("2030-03-05", { hours: HOURS, reservations: [], blocks: [cartBlock] }, ["cart-a"], MONDAY_MORNING);
    expect(result.kind).toBe("blocked");
  });

  it("não exibe estado para fim de semana, dias passados ou hoje após o expediente", () => {
    expect(status("2030-03-09", []).kind).toBe("closed");
    expect(status("2030-03-01", []).kind).toBe("closed");
    expect(status("2030-03-04", [], [], { date: "2030-03-04", time: "12:00", minutes: 720 }).kind).toBe("closed");
  });

  it("considera apenas o tempo restante quando o dia é hoje", () => {
    const now: SchoolNow = { date: "2030-03-04", time: "11:00", minutes: 660 };
    const reservations = [
      reservation("cart-a", "2030-03-04", "11:00", "11:50"),
      reservation("cart-b", "2030-03-04", "10:10", "11:50"),
    ];
    expect(status("2030-03-04", reservations, [], now).kind).toBe("full");
  });
});

describe("seleção por aula", () => {
  it("converte o intervalo de aulas em horário", () => {
    expect(periodRangeTimes(PERIODS, { fromPeriodId: "p2", toPeriodId: "p4" })).toEqual({ startTime: "08:10", endTime: "11:00" });
    expect(periodRangeTimes(PERIODS, { fromPeriodId: "p4", toPeriodId: "p2" })).toBeNull();
  });

  it("reconhece horários que coincidem com aulas", () => {
    expect(matchPeriods(PERIODS, "07:20", "09:00")).toEqual({ fromPeriodId: "p1", toPeriodId: "p2" });
    expect(matchPeriods(PERIODS, "07:30", "09:00")).toBeNull();
  });

  it("descreve o intervalo pelo nome das aulas", () => {
    expect(describePeriodRange(PERIODS, "10:10", "11:00")).toBe("4ª aula");
    expect(describePeriodRange(PERIODS, "07:20", "11:50")).toBe("1ª aula até 5ª aula");
    expect(describePeriodRange(PERIODS, "07:25", "08:10")).toBeNull();
  });
});

describe("navegação por dias letivos", () => {
  it("pula o fim de semana", () => {
    expect(nextSchoolDay("2030-03-08", 1)).toBe("2030-03-11");
    expect(nextSchoolDay("2030-03-11", -1)).toBe("2030-03-08");
    expect(nearestSchoolDay("2030-03-09")).toBe("2030-03-11");
    expect(nearestSchoolDay("2030-03-06")).toBe("2030-03-06");
  });
});
