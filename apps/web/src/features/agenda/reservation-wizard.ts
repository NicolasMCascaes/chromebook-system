import {
  findOverlappingSlots,
  reservationBatchInputSchema,
  reservationInputSchema,
  type ClassPeriodDto,
  type ReservationBatchInput,
  type ReservationInput,
} from "@chromebook/shared";
import { canAddSlot, type SlotTimes, type SlotValues } from "./reservation-batch";
import type { PeriodSelection } from "./schedule-model";

export type WizardStep = "who" | "slots" | "review";

export const WIZARD_STEPS: { id: WizardStep; title: string }[] = [
  { id: "who", title: "Quem" },
  { id: "slots", title: "Horários" },
  { id: "review", title: "Revisar" },
];

export type SlotFields = Omit<SlotValues, "key">;

export interface WizardState {
  step: WizardStep;
  teacherName: string;
  slots: SlotValues[];
  draft: SlotValues | null;
  editingKey: string | null;
  nextKey: number;
}

export type WizardAction =
  | { type: "setName"; name: string }
  | { type: "goTo"; step: WizardStep }
  | { type: "updateDraft"; change: Partial<SlotFields> }
  | { type: "commitDraft" }
  | { type: "cancelDraft" }
  | { type: "newDraft"; values: SlotFields }
  | { type: "editSlot"; key: string }
  | { type: "duplicateSlot"; key: string; date: string }
  | { type: "removeSlot"; key: string }
  | { type: "setNotes"; key: string; notes: string };

export function stepNumber(step: WizardStep): number {
  return WIZARD_STEPS.findIndex((entry) => entry.id === step) + 1;
}

export function initialWizardState(rememberedName: string, firstDraft: SlotFields): WizardState {
  const teacherName = rememberedName.trim();
  return {
    step: teacherName ? "slots" : "who",
    teacherName,
    slots: [],
    draft: { ...firstDraft, key: "slot-0" },
    editingKey: null,
    nextKey: 1,
  };
}

function withNewDraft(state: WizardState, values: SlotFields): WizardState {
  return { ...state, draft: { ...values, key: `slot-${state.nextKey}` }, editingKey: null, nextKey: state.nextKey + 1 };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "setName":
      return { ...state, teacherName: action.name };
    case "goTo":
      return { ...state, step: action.step };
    case "updateDraft":
      return state.draft ? { ...state, draft: { ...state.draft, ...action.change } } : state;
    case "commitDraft": {
      const draft = state.draft;
      if (!draft) return state;
      if (state.editingKey) {
        return { ...state, slots: state.slots.map((slot) => (slot.key === state.editingKey ? draft : slot)), draft: null, editingKey: null };
      }
      if (!canAddSlot(state.slots.length)) return state;
      return { ...state, slots: [...state.slots, draft], draft: null };
    }
    case "cancelDraft":
      return state.slots.length > 0 ? { ...state, draft: null, editingKey: null } : state;
    case "newDraft":
      return canAddSlot(state.slots.length) ? withNewDraft(state, action.values) : state;
    case "editSlot": {
      const slot = state.slots.find((entry) => entry.key === action.key);
      return slot ? { ...state, draft: { ...slot }, editingKey: slot.key } : state;
    }
    case "duplicateSlot": {
      const slot = state.slots.find((entry) => entry.key === action.key);
      if (!slot || !canAddSlot(state.slots.length)) return state;
      const { key: _key, ...values } = slot;
      return withNewDraft(state, { ...values, date: action.date });
    }
    case "removeSlot": {
      const removed = state.slots.find((slot) => slot.key === action.key);
      if (!removed) return state;
      const slots = state.slots.filter((slot) => slot.key !== action.key);
      const closesDraft = state.editingKey === action.key;
      const next = { ...state, slots, draft: closesDraft ? null : state.draft, editingKey: closesDraft ? null : state.editingKey };
      if (slots.length > 0 || next.draft) return next;
      return withNewDraft({ ...next, step: next.step === "review" ? "slots" : next.step }, {
        ...removed,
        fromPeriodId: "",
        toPeriodId: "",
        notes: "",
      });
    }
    case "setNotes":
      return { ...state, slots: state.slots.map((slot) => (slot.key === action.key ? { ...slot, notes: action.notes } : slot)) };
  }
}

export function tapPeriod(periods: ClassPeriodDto[], selection: PeriodSelection, tappedId: string): PeriodSelection {
  const index = (id: string) => periods.findIndex((period) => period.id === id);
  const from = index(selection.fromPeriodId);
  const to = index(selection.toPeriodId);
  const tapped = index(tappedId);
  if (from >= 0 && from === to && tapped > from) return { fromPeriodId: selection.fromPeriodId, toPeriodId: tappedId };
  return { fromPeriodId: tappedId, toPeriodId: tappedId };
}

export function followingDraft(last: SlotValues, periods: ClassPeriodDto[]): SlotFields {
  const lastIndex = periods.findIndex((period) => period.id === last.toPeriodId);
  const next = lastIndex >= 0 ? periods[lastIndex + 1] : undefined;
  return {
    className: last.className,
    date: last.date,
    cartId: last.cartId,
    fromPeriodId: next?.id ?? "",
    toPeriodId: next?.id ?? "",
    notes: "",
  };
}

export function draftOverlapsList(
  draft: { cartId: string; date: string; times: SlotTimes | null },
  others: { cartId: string; date: string; times: SlotTimes | null }[],
): boolean {
  if (!draft.times || !draft.cartId) return false;
  const keyed = [...others, draft].map((slot) => ({
    cartId: slot.times ? slot.cartId : "",
    date: slot.date,
    startTime: slot.times?.startTime ?? "",
    endTime: slot.times?.endTime ?? "",
  }));
  return findOverlappingSlots(keyed).includes(keyed.length - 1);
}

export type Submission = { kind: "single"; input: ReservationInput } | { kind: "batch"; input: ReservationBatchInput };

export function buildSubmission(
  teacherName: string,
  slots: { slot: SlotValues; times: SlotTimes }[],
  newToken: () => string,
): Submission {
  const entries = slots.map(({ slot, times }) => ({
    cartId: slot.cartId,
    className: slot.className,
    date: slot.date,
    startTime: times.startTime,
    endTime: times.endTime,
    notes: slot.notes.trim() ? slot.notes.trim() : null,
    cancelToken: newToken(),
  }));
  const name = teacherName.trim();
  if (entries.length === 1) return { kind: "single", input: reservationInputSchema.parse({ teacherName: name, ...entries[0]! }) };
  return { kind: "batch", input: reservationBatchInputSchema.parse({ teacherName: name, slots: entries }) };
}

export function submissionSlots(submission: Submission): ReservationBatchInput["slots"] {
  if (submission.kind === "batch") return submission.input.slots;
  const { teacherName: _name, ...slot } = submission.input;
  return [slot];
}
