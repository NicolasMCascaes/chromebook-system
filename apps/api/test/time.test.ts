import { describe, expect, it } from "vitest";
import { addDays, computeFreeIntervals, isValidIsoDate, isWeekend, schoolNow, weekdayOf } from "@chromebook/shared";

describe("utilitários de data e hora", () => {
  it("calcula o dia da semana sem depender do fuso do servidor", () => {
    expect(weekdayOf("2030-03-04")).toBe(1);
    expect(isWeekend("2030-03-09")).toBe(true);
    expect(isWeekend("2030-03-10")).toBe(true);
    expect(isWeekend("2030-03-08")).toBe(false);
  });

  it("valida datas de calendário", () => {
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2030-02-29")).toBe(false);
    expect(isValidIsoDate("2030-13-01")).toBe(false);
  });

  it("soma dias atravessando meses", () => {
    expect(addDays("2030-02-27", 3)).toBe("2030-03-02");
  });

  it("converte o instante para o horário de São Paulo", () => {
    expect(schoolNow(new Date("2030-03-05T02:30:00Z"))).toEqual({ date: "2030-03-04", time: "23:30", minutes: 1410 });
    expect(schoolNow(new Date("2030-03-04T13:00:00Z"))).toMatchObject({ date: "2030-03-04", time: "10:00" });
  });

  it("calcula intervalos livres com reservas sobrepostas, nas bordas e após um horário mínimo", () => {
    expect(
      computeFreeIntervals("07:00", "18:00", [
        { start: "07:00", end: "08:00" },
        { start: "09:00", end: "10:00" },
        { start: "09:30", end: "11:00" },
        { start: "17:00", end: "18:00" },
      ]),
    ).toEqual([
      { start: "08:00", end: "09:00" },
      { start: "11:00", end: "17:00" },
    ]);
    expect(computeFreeIntervals("07:00", "18:00", [{ start: "10:00", end: "12:00" }], "11:00")).toEqual([
      { start: "12:00", end: "18:00" },
    ]);
    expect(computeFreeIntervals("07:00", "18:00", [], "18:30")).toEqual([]);
  });
});
