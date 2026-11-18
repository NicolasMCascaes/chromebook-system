import { describe, expect, it } from "vitest";
import type { ClassPeriodDto } from "@chromebook/shared";
import { MAX_SLOTS, type SlotValues } from "./reservation-batch";
import {
  buildSubmission,
  draftOverlapsList,
  followingDraft,
  initialWizardState,
  submissionSlots,
  tapPeriod,
  wizardReducer,
  type SlotFields,
  type WizardAction,
  type WizardState,
} from "./reservation-wizard";

const CART_1 = "11111111-1111-4111-8111-111111111111";
const CART_2 = "22222222-2222-4222-8222-222222222222";

const PERIODS: ClassPeriodDto[] = [
  { id: "p1", name: "1ª aula", startTime: "07:20", endTime: "08:10" },
  { id: "p2", name: "2ª aula", startTime: "08:10", endTime: "09:00" },
  { id: "p3", name: "3ª aula", startTime: "09:20", endTime: "10:10" },
  { id: "p4", name: "4ª aula", startTime: "10:10", endTime: "11:00" },
];

const BLANK: SlotFields = { className: "", date: "2030-03-05", cartId: "", fromPeriodId: "", toPeriodId: "", notes: "" };
const FILLED: SlotFields = { className: "7º ano", date: "2030-03-05", cartId: CART_1, fromPeriodId: "p1", toPeriodId: "p2", notes: "" };

function run(state: WizardState, ...actions: WizardAction[]): WizardState {
  return actions.reduce(wizardReducer, state);
}

function withSlots(count: number): WizardState {
  let state = run(initialWizardState("Ana Souza", BLANK), { type: "updateDraft", change: FILLED }, { type: "commitDraft" });
  for (let index = 1; index < count; index++) {
    state = run(state, { type: "newDraft", values: { ...FILLED, date: `2030-03-${String(5 + index).padStart(2, "0")}` } }, { type: "commitDraft" });
  }
  return state;
}

describe("assistente de reserva", () => {
  it("pula o passo do nome quando ele já está lembrado no navegador", () => {
    expect(initialWizardState("  Ana Souza ", BLANK)).toMatchObject({ step: "slots", teacherName: "Ana Souza" });
    expect(initialWizardState("", BLANK)).toMatchObject({ step: "who", teacherName: "" });
  });

  it("adiciona o horário em edição à lista e fecha o construtor", () => {
    const state = withSlots(1);

    expect(state.slots).toHaveLength(1);
    expect(state.slots[0]).toMatchObject(FILLED);
    expect(state.draft).toBeNull();
  });

  it("o novo horário já vem com a turma, a data, o carrinho e a aula seguinte do anterior", () => {
    const last: SlotValues = { ...FILLED, key: "slot-0", notes: "Prova" };

    expect(followingDraft(last, PERIODS)).toEqual({ ...FILLED, fromPeriodId: "p3", toPeriodId: "p3", notes: "" });
    expect(followingDraft({ ...last, fromPeriodId: "p4", toPeriodId: "p4" }, PERIODS)).toMatchObject({ fromPeriodId: "", toPeriodId: "" });
  });

  it("edita um horário da lista sem mudar a posição nem a quantidade", () => {
    const state = withSlots(3);
    const second = state.slots[1]!;

    const edited = run(state, { type: "editSlot", key: second.key }, { type: "updateDraft", change: { cartId: CART_2 } }, { type: "commitDraft" });

    expect(edited.slots).toHaveLength(3);
    expect(edited.slots[1]).toMatchObject({ key: second.key, cartId: CART_2 });
    expect(edited.editingKey).toBeNull();
  });

  it("duplica um horário para outra data como um novo item", () => {
    const state = withSlots(1);

    const duplicated = run(state, { type: "duplicateSlot", key: state.slots[0]!.key, date: "2030-03-06" });
    expect(duplicated.draft).toMatchObject({ ...FILLED, date: "2030-03-06" });
    expect(duplicated.draft!.key).not.toBe(state.slots[0]!.key);

    const committed = run(duplicated, { type: "commitDraft" });
    expect(committed.slots.map((slot) => slot.date)).toEqual(["2030-03-05", "2030-03-06"]);
  });

  it("remove um horário e, se a lista ficar vazia, reabre o construtor com a turma e o carrinho", () => {
    const state = run(withSlots(2), { type: "goTo", step: "review" });

    const one = run(state, { type: "removeSlot", key: state.slots[0]!.key });
    expect(one.slots).toHaveLength(1);
    expect(one.step).toBe("review");

    const none = run(one, { type: "removeSlot", key: one.slots[0]!.key });
    expect(none.slots).toHaveLength(0);
    expect(none.step).toBe("slots");
    expect(none.draft).toMatchObject({ className: "7º ano", cartId: CART_1, fromPeriodId: "", toPeriodId: "" });
  });

  it(`não passa de ${MAX_SLOTS} horários`, () => {
    const full = withSlots(MAX_SLOTS);
    expect(full.slots).toHaveLength(MAX_SLOTS);

    expect(run(full, { type: "newDraft", values: FILLED }).draft).toBeNull();
    expect(run(full, { type: "duplicateSlot", key: full.slots[0]!.key, date: "2030-04-01" }).draft).toBeNull();

    const edited = run(full, { type: "editSlot", key: full.slots[5]!.key }, { type: "updateDraft", change: { notes: "x" } }, { type: "commitDraft" });
    expect(edited.slots).toHaveLength(MAX_SLOTS);
    expect(edited.slots[5]!.notes).toBe("x");
  });

  it("acusa conflito com o mesmo carrinho em horário sobreposto de outro item", () => {
    const others = [{ cartId: CART_1, date: "2030-03-05", times: { startTime: "07:20", endTime: "09:00" } }];

    expect(draftOverlapsList({ cartId: CART_1, date: "2030-03-05", times: { startTime: "08:10", endTime: "09:00" } }, others)).toBe(true);
    expect(draftOverlapsList({ cartId: CART_2, date: "2030-03-05", times: { startTime: "08:10", endTime: "09:00" } }, others)).toBe(false);
    expect(draftOverlapsList({ cartId: CART_1, date: "2030-03-06", times: { startTime: "08:10", endTime: "09:00" } }, others)).toBe(false);
    expect(draftOverlapsList({ cartId: CART_1, date: "2030-03-05", times: { startTime: "09:00", endTime: "10:10" } }, others)).toBe(false);
    expect(draftOverlapsList({ cartId: CART_1, date: "2030-03-05", times: null }, others)).toBe(false);
  });

  it("voltar e continuar entre os passos não perde o nome, a lista nem o horário em edição", () => {
    const state = run(withSlots(2), { type: "newDraft", values: { ...FILLED, date: "2030-03-12" } });

    const back = run(state, { type: "goTo", step: "who" }, { type: "setName", name: "Ana Lima" }, { type: "goTo", step: "slots" });
    expect(back.slots).toEqual(state.slots);
    expect(back.draft).toEqual(state.draft);
    expect(back.teacherName).toBe("Ana Lima");

    const review = run(back, { type: "commitDraft" }, { type: "goTo", step: "review" }, { type: "setNotes", key: back.draft!.key, notes: "Levar fones" }, { type: "goTo", step: "slots" }, { type: "goTo", step: "review" });
    expect(review.slots).toHaveLength(3);
    expect(review.slots[2]!.notes).toBe("Levar fones");
  });

  it("toque na primeira e na última aula define a faixa; um novo toque recomeça", () => {
    const start = { fromPeriodId: "", toPeriodId: "" };
    const first = tapPeriod(PERIODS, start, "p2");
    expect(first).toEqual({ fromPeriodId: "p2", toPeriodId: "p2" });
    const range = tapPeriod(PERIODS, first, "p4");
    expect(range).toEqual({ fromPeriodId: "p2", toPeriodId: "p4" });
    expect(tapPeriod(PERIODS, range, "p3")).toEqual({ fromPeriodId: "p3", toPeriodId: "p3" });
    expect(tapPeriod(PERIODS, first, "p1")).toEqual({ fromPeriodId: "p1", toPeriodId: "p1" });
  });

  it("um horário vai para o envio individual de antes; três vão juntos no envio em lote", () => {
    let token = 0;
    const newToken = () => `${"t".repeat(42)}${token++}`;
    const slot = (date: string, notes = ""): { slot: SlotValues; times: { startTime: string; endTime: string } } => ({
      slot: { ...FILLED, key: date, date, notes },
      times: { startTime: "07:20", endTime: "09:00" },
    });

    const single = buildSubmission(" Ana Souza ", [slot("2030-03-05", "  Pesquisa ")], newToken);
    expect(single.kind).toBe("single");
    expect(single.input).toMatchObject({ teacherName: "Ana Souza", className: "7º ano", cartId: CART_1, date: "2030-03-05", startTime: "07:20", endTime: "09:00", notes: "Pesquisa" });
    expect(submissionSlots(single)).toHaveLength(1);

    const batch = buildSubmission("Ana Souza", [slot("2030-03-05"), slot("2030-03-06"), slot("2030-03-07")], newToken);
    expect(batch.kind).toBe("batch");
    const slots = submissionSlots(batch);
    expect(slots.map((entry) => entry.date)).toEqual(["2030-03-05", "2030-03-06", "2030-03-07"]);
    expect(new Set(slots.map((entry) => entry.cancelToken)).size).toBe(3);
    expect(slots.every((entry) => entry.notes === null)).toBe(true);
  });
});
