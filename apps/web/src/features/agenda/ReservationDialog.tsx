import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  isValidIsoDate,
  scheduleForClass,
  schoolNow,
  SCHOOL_CLASSES,
  type AvailabilityDto,
  type CalendarDto,
  type CartDto,
  type ClassPeriodDto,
  type ClassScheduleDto,
  type ReservationDto,
  type SchoolNow,
} from "@chromebook/shared";
import { useAvailability, useCreateReservation, useCreateReservationBatch } from "../../api/hooks";
import { ApiError, errorMessage } from "../../api/client";
import { Modal } from "../../components/Modal";
import { FieldError } from "../../components/FieldError";
import { StatusMessage } from "../../components/StatusMessage";
import { formatDateLong, formatTimeRange, plural } from "../../lib/format";
import type { FieldErrors } from "../../lib/form-errors";
import { lastTeacherName, newCancelToken, rememberReservation, rememberTeacherName } from "../../lib/my-reservations";
import { cartSituation, validateReservationForm } from "./reservation-validation";
import { canAddSlot, MAX_SLOTS, splitServerErrors, type SlotTimes, type SlotValues } from "./reservation-batch";
import {
  buildSubmission,
  draftOverlapsList,
  followingDraft,
  initialWizardState,
  stepNumber,
  submissionSlots,
  tapPeriod,
  WIZARD_STEPS,
  wizardReducer,
  type SlotFields,
  type Submission,
  type WizardState,
  type WizardStep,
} from "./reservation-wizard";
import { describeWithSchedules, matchPeriods, nextSchoolDay, periodRangeTimes, type PeriodSelection } from "./schedule-model";
import { SLOT_OVERLAP_MESSAGE } from "@chromebook/shared";
import { cartStyle } from "./cart-style";
import "./wizard.css";

const DatePickerField = lazy(() => import("./DatePickerField").then((module) => ({ default: module.DatePickerField })));

export interface ReservationPrefill {
  date?: string;
  cartId?: string;
  startTime?: string;
  endTime?: string;
}

type Schedule = Pick<CalendarDto, "schedules" | "carts" | "hours" | "today">;

interface ReservationDialogProps {
  open: boolean;
  onClose: () => void;
  prefill: ReservationPrefill;
  schedule: Schedule;
}

interface WizardProps {
  schedule: Schedule;
  prefill: ReservationPrefill;
  onClose: () => void;
  rememberedName?: string;
}

type DraftField = "className" | "date" | "startTime" | "endTime" | "cartId";

function hasStarted(period: ClassPeriodDto, date: string, now: SchoolNow): boolean {
  return date < now.date || (date === now.date && period.startTime < now.time);
}

function periodsForClass(schedules: ClassScheduleDto[], className: string): ClassPeriodDto[] {
  return className ? (scheduleForClass(schedules, className)?.periods ?? []) : [];
}

function defaultSelection(periods: ClassPeriodDto[], date: string, now: SchoolNow, prefill: ReservationPrefill): PeriodSelection {
  const matched = prefill.startTime && prefill.endTime ? matchPeriods(periods, prefill.startTime, prefill.endTime) : null;
  if (matched) return matched;
  const first = periods.find((period) => !hasStarted(period, date, now));
  return { fromPeriodId: first?.id ?? "", toPeriodId: first?.id ?? "" };
}

function firstAvailableDate(date: string, now: SchoolNow, closingTime: string): string {
  return date === now.date && now.time >= closingTime ? nextSchoolDay(date, 1) : date;
}

function slotTimes(schedules: ClassScheduleDto[], slot: SlotFields): SlotTimes | null {
  return periodRangeTimes(periodsForClass(schedules, slot.className), slot);
}

function formatShortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(year!, month! - 1, day!).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return `${weekday}, ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

function Icon({ name }: { name: "edit" | "copy" | "trash" | "plus" | "check" | "back" }) {
  const paths: Record<typeof name, ReactNode> = {
    edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="M5 12l5 5 9-10" />,
    back: <path d="M15 5l-7 7 7 7" />,
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

function StepIndicator({ step }: { step: WizardStep }) {
  const current = stepNumber(step);
  return (
    <div className="wizard-steps">
      <p className="wizard-step-count">
        Passo {current} de {WIZARD_STEPS.length}
      </p>
      <ol className="wizard-step-list">
        {WIZARD_STEPS.map((entry, index) => {
          const number = index + 1;
          const state = number < current ? "is-done" : number === current ? "is-current" : "";
          return (
            <li key={entry.id} className={state} aria-current={number === current ? "step" : undefined}>
              <span className="wizard-step-dot" aria-hidden="true">
                {number < current ? <Icon name="check" /> : number}
              </span>
              <span className="wizard-step-title">{entry.title}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SlotCard({
  slot,
  index,
  cart,
  times,
  periodsLabel,
  error,
  active,
  actions,
  children,
}: {
  slot: SlotValues;
  index: number;
  cart: CartDto | undefined;
  times: SlotTimes | null;
  periodsLabel: string | null;
  error?: string;
  active?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const classes = ["slot-card", active ? "is-active" : "", error ? "has-error" : ""].filter(Boolean).join(" ");
  return (
    <li className={classes} style={cartStyle(cart?.color ?? "#999999")}>
      <div className="slot-card-row">
        <span className="slot-card-index" aria-hidden="true">
          {index + 1}
        </span>
        <div className="slot-card-text">
          <strong>
            {formatShortDate(slot.date)} · {times ? `${times.startTime}–${times.endTime}` : "sem horário"}
          </strong>
          <span className="muted">
            {slot.className} · {cart?.name ?? "sem carrinho"}
            {periodsLabel ? ` · ${periodsLabel}` : ""}
          </span>
        </div>
        {actions && <div className="slot-card-actions">{actions}</div>}
      </div>
      {error && (
        <p className="field-error slot-card-error" role="alert">
          {error}
        </p>
      )}
      {children}
    </li>
  );
}

function ChoiceChip({
  name,
  value,
  checked,
  disabled,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className={`choice-chip${disabled ? " is-disabled" : ""}`}>
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

export function ReservationWizard({ schedule, prefill, onClose, rememberedName }: WizardProps) {
  const now = useMemo(() => schoolNow(new Date()), []);
  const schedules = useMemo(() => schedule.schedules.filter((entry) => entry.periods.length > 0), [schedule.schedules]);
  const cartIds = useMemo(() => schedule.carts.map((cart) => cart.id), [schedule.carts]);
  const singleCartId = schedule.carts.length === 1 ? schedule.carts[0]!.id : "";
  const [state, dispatch] = useReducer(wizardReducer, undefined, (): WizardState =>
    initialWizardState(rememberedName ?? lastTeacherName(), {
      className: "",
      date: firstAvailableDate(prefill.date ?? schedule.today, now, schedule.hours.closingTime),
      cartId: prefill.cartId ?? singleCartId,
      fromPeriodId: "",
      toPeriodId: "",
      notes: "",
    }),
  );
  const [nameAttempted, setNameAttempted] = useState(false);
  const [draftAttempted, setDraftAttempted] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, FieldErrors>>({});
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<{ submission: Submission; idempotencyKey: string } | null>(null);
  const [done, setDone] = useState<ReservationDto[] | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const createSingle = useCreateReservation();
  const createBatch = useCreateReservationBatch();
  const sending = createSingle.isPending || createBatch.isPending;

  const draft = state.draft;
  const draftPeriods = draft ? periodsForClass(schedules, draft.className) : [];
  const draftTimes = draft ? periodRangeTimes(draftPeriods, draft) : null;
  const validDraftDate = draft && isValidIsoDate(draft.date) ? draft.date : null;
  const availabilityQuery = useAvailability(validDraftDate);
  const availability: AvailabilityDto | undefined =
    availabilityQuery.data?.date === validDraftDate ? availabilityQuery.data : undefined;

  const nameError = validateReservationForm(
    { teacherName: state.teacherName, className: "", date: "", startTime: "", endTime: "", cartId: "", notes: "" },
    { now, hours: schedule.hours },
  ).teacherName;

  const draftErrors: FieldErrors = useMemo(() => {
    if (!draft) return {};
    const errors = validateReservationForm(
      {
        teacherName: state.teacherName || "Professor",
        className: draft.className,
        date: draft.date,
        startTime: draftTimes?.startTime ?? "",
        endTime: draftTimes?.endTime ?? "",
        cartId: draft.cartId,
        notes: draft.notes,
      },
      { now, hours: schedule.hours, availability, invalidPeriodRange: draftPeriods.length > 0 && draft.fromPeriodId !== "" && !draftTimes },
    );
    delete errors.teacherName;
    delete errors.notes;
    if (draftPeriods.length === 0) {
      delete errors.startTime;
      delete errors.endTime;
      if (draft.className && !errors.className) errors.className = "Esta turma ainda não tem aulas cadastradas. Fale com o TI.";
    } else if (!draftTimes && !errors.endTime) {
      errors.startTime = "Escolha as aulas.";
    }
    const others = state.slots
      .filter((slot) => slot.key !== state.editingKey)
      .map((slot) => ({ cartId: slot.cartId, date: slot.date, times: slotTimes(schedules, slot) }));
    if (!errors.cartId && draftOverlapsList({ cartId: draft.cartId, date: draft.date, times: draftTimes }, others)) {
      errors.cartId = SLOT_OVERLAP_MESSAGE;
    }
    return errors;
  }, [draft, draftTimes, draftPeriods.length, state.teacherName, state.slots, state.editingKey, schedules, now, schedule.hours, availability]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [state.step, done]);

  function draftErrorFor(field: DraftField): string | undefined {
    if (!draft) return undefined;
    const server = state.editingKey ? serverErrors[state.editingKey]?.[field] : undefined;
    if (server) return server;
    const message = draftErrors[field];
    if (!message) return undefined;
    if (draftAttempted || field === "date") return message;
    if (field === "cartId") return draft.cartId ? message : undefined;
    if (field === "startTime" || field === "endTime") return draft.fromPeriodId ? message : undefined;
    return undefined;
  }

  function updateDraft(change: Partial<SlotFields>) {
    if (state.editingKey) setServerErrors(({ [state.editingKey!]: _removed, ...rest }) => rest);
    setNotice(null);
    dispatch({ type: "updateDraft", change });
  }

  function selectClass(className: string) {
    if (!draft) return;
    const periods = periodsForClass(schedules, className);
    const keeps = periods.some((period) => period.id === draft.fromPeriodId) && periods.some((period) => period.id === draft.toPeriodId);
    const isFirstDraft = state.slots.length === 0 && !state.editingKey;
    const selection = keeps ? { fromPeriodId: draft.fromPeriodId, toPeriodId: draft.toPeriodId } : defaultSelection(periods, draft.date, now, isFirstDraft ? prefill : {});
    updateDraft({ className, ...selection });
  }

  function commitDraft(): boolean {
    if (!draft) return true;
    setDraftAttempted(true);
    if (Object.keys(draftErrors).length > 0) {
      setNotice({ kind: "error", text: "Confira os campos destacados neste horário." });
      requestAnimationFrame(() => document.querySelector(".slot-builder .field-error")?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return false;
    }
    if (!state.editingKey && !canAddSlot(state.slots.length)) {
      setNotice({ kind: "error", text: `O pedido aceita no máximo ${MAX_SLOTS} horários.` });
      return false;
    }
    dispatch({ type: "commitDraft" });
    setDraftAttempted(false);
    setNotice(null);
    return true;
  }

  function addAnother() {
    const last = state.slots[state.slots.length - 1];
    if (!last || !canAddSlot(state.slots.length)) return;
    setDraftAttempted(false);
    dispatch({ type: "newDraft", values: followingDraft(last, periodsForClass(schedules, last.className)) });
  }

  function goTo(step: WizardStep) {
    setNotice(null);
    dispatch({ type: "goTo", step });
  }

  function handleContinue(event?: FormEvent) {
    event?.preventDefault();
    if (state.step === "who") {
      setNameAttempted(true);
      if (nameError) {
        setNotice({ kind: "error", text: nameError });
        return;
      }
      goTo("slots");
      return;
    }
    if (state.step === "slots") {
      if (draft && !commitDraft()) return;
      if (state.slots.length === 0 && !draft) return;
      goTo("review");
      return;
    }
    void handleSend();
  }

  async function handleSend() {
    const entries = state.slots.map((slot) => ({ slot, times: slotTimes(schedules, slot)! }));
    const attempt = pending ?? { submission: buildSubmission(state.teacherName, entries, newCancelToken), idempotencyKey: crypto.randomUUID() };
    setPending(attempt);
    setNotice(null);
    try {
      const reservations =
        attempt.submission.kind === "single"
          ? [await createSingle.mutateAsync({ input: attempt.submission.input, idempotencyKey: attempt.idempotencyKey })]
          : (await createBatch.mutateAsync({ input: attempt.submission.input, idempotencyKey: attempt.idempotencyKey })).reservations;
      const sentSlots = submissionSlots(attempt.submission);
      reservations.forEach((reservation, index) => rememberReservation(reservation.id, sentSlots[index]!.cancelToken));
      rememberTeacherName(state.teacherName.trim());
      setPending(null);
      setDone(reservations);
    } catch (error) {
      if (error instanceof ApiError && [400, 409, 422].includes(error.status)) {
        setPending(null);
        const split = splitServerErrors(error.body.details, state.slots.length, state.slots.length === 1);
        const byKey: Record<string, FieldErrors> = {};
        split.slots.forEach((errors, index) => {
          if (Object.keys(errors).length > 0) byKey[state.slots[index]!.key] = errors;
        });
        setServerErrors(byKey);
        setNotice({ kind: "error", text: error.message });
        if (split.teacherName) goTo("who");
        return;
      }
      setNotice({ kind: "error", text: `${errorMessage(error)} Ao tentar de novo, a reserva não será duplicada.` });
    }
  }

  function cartOf(slot: SlotFields): CartDto | undefined {
    return schedule.carts.find((cart) => cart.id === slot.cartId);
  }

  function periodsLabel(slot: SlotFields): string | null {
    const times = slotTimes(schedules, slot);
    if (!times) return null;
    return describeWithSchedules(
      schedules.filter((entry) => entry.classNames.includes(slot.className)),
      times.startTime,
      times.endTime,
    );
  }

  function firstServerError(key: string): string | undefined {
    const errors = serverErrors[key];
    return errors ? Object.values(errors)[0] : undefined;
  }

  const slotCount = state.slots.length;
  const countLabel = `${slotCount} de ${MAX_SLOTS} horários`;

  if (done) {
    const many = done.length > 1;
    const allPending = done.every((reservation) => reservation.status === "PENDING");
    return (
      <div className="wizard">
        <div className="wizard-content">
          <div className="wizard-done">
            <h3 ref={headingRef} tabIndex={-1} className="wizard-heading">
              {many ? `Pedido com ${done.length} horários enviado` : allPending ? "Pedido enviado" : "Reserva confirmada"}
            </h3>
            {allPending ? (
              <StatusMessage kind="success">
                Os horários ficam separados para você enquanto o TI analisa; acompanhe a aprovação pela agenda.
              </StatusMessage>
            ) : (
              <StatusMessage kind="success">{many ? "Reservas confirmadas." : "Reserva confirmada."}</StatusMessage>
            )}
            <ul className="slot-list">
              {done.map((reservation, index) => (
                <li key={reservation.id} className="slot-card" style={cartStyle(reservation.cartColor)}>
                  <div className="slot-card-row">
                    <span className="slot-card-index" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div className="slot-card-text">
                      <strong>
                        {formatShortDate(reservation.date)} · {reservation.startTime}–{reservation.endTime}
                      </strong>
                      <span className="muted">
                        {reservation.className} · {reservation.cartName}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="muted small-text">
              Para cancelar, abra a reserva na agenda neste mesmo navegador. Em outro aparelho, peça o cancelamento ao TI.
            </p>
          </div>
        </div>
        <footer className="wizard-footer">
          <span />
          <button type="button" className="button primary wizard-next" onClick={onClose}>
            Fechar
          </button>
        </footer>
      </div>
    );
  }

  const nameChip = state.teacherName.trim() && state.step !== "who" && (
    <div className="name-chip">
      <span>
        Prof. <strong>{state.teacherName.trim()}</strong>
      </span>
      <button type="button" className="button link" onClick={() => goTo("who")}>
        trocar
      </button>
    </div>
  );

  const listActions = (slot: SlotValues) => (
    <>
      <button type="button" className="icon-action" aria-label={`Editar horário de ${formatShortDate(slot.date)}`} onClick={() => {
        setDraftAttempted(false);
        dispatch({ type: "editSlot", key: slot.key });
        if (state.step !== "slots") goTo("slots");
      }}>
        <Icon name="edit" />
      </button>
      <button
        type="button"
        className="icon-action"
        aria-label={`Duplicar horário de ${formatShortDate(slot.date)} no próximo dia de aula`}
        disabled={!canAddSlot(slotCount)}
        onClick={() => {
          setDraftAttempted(false);
          dispatch({ type: "duplicateSlot", key: slot.key, date: nextSchoolDay(slot.date, 1) });
        }}
      >
        <Icon name="copy" />
      </button>
      <button type="button" className="icon-action danger" aria-label={`Remover horário de ${formatShortDate(slot.date)}`} onClick={() => dispatch({ type: "removeSlot", key: slot.key })}>
        <Icon name="trash" />
      </button>
    </>
  );

  const slotList = (
    <ul className="slot-list" aria-label="Horários do pedido">
      {state.slots.map((slot, index) => (
        <SlotCard
          key={slot.key}
          slot={slot}
          index={index}
          cart={cartOf(slot)}
          times={slotTimes(schedules, slot)}
          periodsLabel={periodsLabel(slot)}
          error={firstServerError(slot.key)}
          active={state.editingKey === slot.key}
          actions={listActions(slot)}
        />
      ))}
    </ul>
  );

  let content: ReactNode;
  if (state.step === "who") {
    content = (
      <div className="wizard-who">
        <h3 ref={headingRef} tabIndex={-1} className="wizard-heading">
          Quem vai usar os Chromebooks?
        </h3>
        <label className="field wizard-field">
          <span>Seu nome</span>
          <input
            value={state.teacherName}
            maxLength={100}
            autoComplete="name"
            autoFocus
            enterKeyHint="next"
            aria-invalid={Boolean(nameAttempted && nameError)}
            onChange={(event) => {
              setNotice(null);
              dispatch({ type: "setName", name: event.target.value });
            }}
          />
          <FieldError message={nameAttempted ? nameError : undefined} />
        </label>
        <p className="muted small-text">O nome fica salvo neste navegador para os próximos pedidos.</p>
      </div>
    );
  } else if (state.step === "slots") {
    const builder = draft ? (
      <section className="slot-builder" aria-labelledby="slot-builder-title">
        <div className="slot-builder-header">
          <h4 id="slot-builder-title">
            {state.editingKey ? `Editando o horário ${state.slots.findIndex((slot) => slot.key === state.editingKey) + 1}` : slotCount === 0 ? "Escolha o horário" : `Horário ${slotCount + 1}`}
          </h4>
          {slotCount > 0 && (
            <button type="button" className="button link" onClick={() => { setDraftAttempted(false); setNotice(null); dispatch({ type: "cancelDraft" }); }}>
              Cancelar
            </button>
          )}
        </div>

        <fieldset className="builder-group">
          <legend>Turma</legend>
          <div className="chip-grid class-grid">
            {SCHOOL_CLASSES.map((schoolClass) => (
              <ChoiceChip key={schoolClass} name={`turma-${draft.key}`} value={schoolClass} checked={draft.className === schoolClass} onChange={() => selectClass(schoolClass)}>
                {schoolClass}
              </ChoiceChip>
            ))}
          </div>
          <FieldError message={draftErrorFor("className")} />
        </fieldset>

        <div className="builder-group">
          <span className="builder-label" id={`data-${draft.key}`}>
            Data
          </span>
          <Suspense
            fallback={
              <input type="date" className="date-fallback" aria-labelledby={`data-${draft.key}`} value={draft.date} min={schedule.today} onChange={(event) => updateDraft({ date: event.target.value })} />
            }
          >
            <DatePickerField value={draft.date} cartIds={cartIds} onChange={(date) => updateDraft({ date })} />
          </Suspense>
          <FieldError message={draftErrorFor("date")} />
        </div>

        <fieldset className="builder-group">
          <legend>Aulas</legend>
          {schedules.length === 0 ? (
            <StatusMessage kind="empty">As aulas ainda não foram cadastradas. Fale com o TI para reservar.</StatusMessage>
          ) : draftPeriods.length === 0 ? (
            <p className="muted small-text">Escolha a turma para ver as aulas.</p>
          ) : (
            <>
              <p className="muted small-text builder-hint">Toque na primeira e depois na última aula.</p>
              <div className="chip-grid period-grid">
                {draftPeriods.map((period, index) => {
                  const fromIndex = draftPeriods.findIndex((entry) => entry.id === draft.fromPeriodId);
                  const toIndex = draftPeriods.findIndex((entry) => entry.id === draft.toPeriodId);
                  const selected = fromIndex >= 0 && index >= fromIndex && index <= Math.max(fromIndex, toIndex);
                  const started = hasStarted(period, draft.date, now);
                  const cartBusy = cartSituation(
                    availability?.carts.find((entry) => entry.cartId === draft.cartId),
                    { startTime: period.startTime, endTime: period.endTime },
                  )?.unavailable;
                  const classes = ["period-chip", selected ? "is-selected" : "", index === fromIndex || index === toIndex ? "is-edge" : "", cartBusy ? "is-busy" : ""].filter(Boolean).join(" ");
                  return (
                    <button
                      key={period.id}
                      type="button"
                      className={classes}
                      aria-pressed={selected}
                      disabled={started}
                      onClick={() => updateDraft(tapPeriod(draftPeriods, draft, period.id))}
                    >
                      <strong>{period.name}</strong>
                      <span>{started ? "já passou" : cartBusy ? "ocupado" : period.startTime}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {draftTimes && <p className="builder-summary">Horário: {formatTimeRange(draftTimes.startTime, draftTimes.endTime)}</p>}
          <FieldError message={draftErrorFor("startTime") ?? draftErrorFor("endTime")} />
        </fieldset>

        <fieldset className="builder-group">
          <legend>Carrinho</legend>
          {schedule.carts.length === 0 ? (
            <StatusMessage kind="empty">Nenhum carrinho disponível para reserva.</StatusMessage>
          ) : (
            <div className="cart-options">
              {schedule.carts.map((cart) => {
                const status = cartSituation(availability?.carts.find((entry) => entry.cartId === cart.id), draftTimes);
                return (
                  <label key={cart.id} className={status?.unavailable ? "cart-option is-unavailable" : "cart-option"} style={cartStyle(cart.color)}>
                    <input
                      type="radio"
                      name={`carrinho-${draft.key}`}
                      value={cart.id}
                      disabled={status?.unavailable && draft.cartId !== cart.id}
                      checked={draft.cartId === cart.id}
                      onChange={() => updateDraft({ cartId: cart.id })}
                    />
                    <span className="cart-option-body">
                      <strong>{cart.name}</strong>
                      <span className="muted">{plural(cart.equipment.available, "Chromebook disponível", "Chromebooks disponíveis")}</span>
                      {status && <span className={status.unavailable ? "cart-status is-busy" : "cart-status is-free"}>{status.text}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <FieldError message={draftErrorFor("cartId")} />
        </fieldset>

        <button type="button" className="button primary builder-commit" onClick={() => commitDraft()}>
          <Icon name={state.editingKey ? "check" : "plus"} />
          {state.editingKey ? "Salvar alterações" : "Adicionar à lista"}
        </button>
      </section>
    ) : null;

    content = (
      <div className={slotCount === 0 ? "wizard-slots is-empty" : "wizard-slots"}>
        <div className="wizard-heading-row wizard-slots-head">
          <h3 ref={headingRef} tabIndex={-1} className="wizard-heading">
            Quando e qual carrinho?
          </h3>
          {nameChip}
        </div>
        <div className="wizard-builder-column">
          {builder ?? (
            <div className="builder-closed">
              <p className="muted">
                {canAddSlot(slotCount) ? "Precisa de mais um horário? A turma, a data e o carrinho do último já vêm preenchidos." : `Limite de ${MAX_SLOTS} horários por pedido.`}
              </p>
              {canAddSlot(slotCount) && (
                <button type="button" className="button secondary add-slot" onClick={addAnother}>
                  <Icon name="plus" />
                  Adicionar outro horário
                </button>
              )}
            </div>
          )}
        </div>
        <aside className="wizard-order" aria-labelledby="order-title">
          <h4 id="order-title">Seu pedido ({slotCount})</h4>
          {slotCount === 0 ? (
            <p className="muted small-text order-empty">Os horários adicionados aparecem aqui. Você pode pedir até {MAX_SLOTS} de uma vez.</p>
          ) : (
            slotList
          )}
        </aside>
      </div>
    );
  } else {
    content = (
      <div className="wizard-review">
        <div className="wizard-heading-row">
          <h3 ref={headingRef} tabIndex={-1} className="wizard-heading">
            Confira o pedido
          </h3>
          {nameChip}
        </div>
        <p className="muted small-text">
          {slotCount > 1
            ? `São ${slotCount} horários. O pedido só é registrado se todos estiverem livres, e o TI aprova cada um.`
            : "O pedido passa pela aprovação do TI."}
        </p>
        <ul className="slot-list">
          {state.slots.map((slot, index) => (
            <SlotCard
              key={slot.key}
              slot={slot}
              index={index}
              cart={cartOf(slot)}
              times={slotTimes(schedules, slot)}
              periodsLabel={periodsLabel(slot)}
              error={firstServerError(slot.key)}
              actions={
                <button type="button" className="icon-action" aria-label={`Editar horário de ${formatShortDate(slot.date)}`} onClick={() => {
                  dispatch({ type: "editSlot", key: slot.key });
                  goTo("slots");
                }}>
                  <Icon name="edit" />
                </button>
              }
            >
              {openNotes[slot.key] || slot.notes ? (
                <label className="field slot-notes">
                  <span>Observação (opcional)</span>
                  <textarea rows={2} maxLength={500} value={slot.notes} onChange={(event) => dispatch({ type: "setNotes", key: slot.key, notes: event.target.value })} />
                </label>
              ) : (
                <button type="button" className="button link slot-notes-toggle" onClick={() => setOpenNotes((current) => ({ ...current, [slot.key]: true }))}>
                  + Observação
                </button>
              )}
            </SlotCard>
          ))}
        </ul>
        <p className="muted small-text">A reserva é do carrinho inteiro; a quantidade de Chromebooks disponíveis pode mudar até a data da aula.</p>
      </div>
    );
  }

  const backStep: WizardStep | null = state.step === "review" ? "slots" : state.step === "slots" ? "who" : null;
  const nextLabel = state.step === "review" ? (sending ? "Enviando…" : "Enviar pedido") : state.step === "slots" ? "Revisar" : "Continuar";

  return (
    <form className="wizard" onSubmit={handleContinue} noValidate>
      <StepIndicator step={state.step} />
      <div className="wizard-content">
        <div className="wizard-notice" aria-live="assertive">
          {notice && <StatusMessage kind={notice.kind}>{notice.text}</StatusMessage>}
        </div>
        {content}
      </div>
      <footer className="wizard-footer">
        {backStep ? (
          <button type="button" className="button secondary wizard-back" disabled={sending} onClick={() => goTo(backStep)}>
            <Icon name="back" />
            Voltar
          </button>
        ) : (
          <button type="button" className="button secondary wizard-back" onClick={onClose}>
            Cancelar
          </button>
        )}
        {state.step !== "who" && <span className="wizard-count">{countLabel}</span>}
        <button type="submit" className="button primary wizard-next" disabled={sending || (state.step === "slots" && slotCount === 0 && !draft)}>
          {nextLabel}
        </button>
      </footer>
    </form>
  );
}

interface SummaryProps {
  teacherName: string;
  className: string;
  date: string;
  startTime: string;
  endTime: string;
  cartName: string;
  cartColor: string;
  notes: string | null;
  periodsLabel: string | null;
}

export function ReservationSummary(props: SummaryProps) {
  return (
    <dl className="summary" style={cartStyle(props.cartColor)}>
      <dt>Professor</dt>
      <dd>{props.teacherName}</dd>
      <dt>Turma</dt>
      <dd>{props.className}</dd>
      <dt>Data</dt>
      <dd>{formatDateLong(props.date)}</dd>
      <dt>Horário</dt>
      <dd>
        {formatTimeRange(props.startTime, props.endTime)}
        {props.periodsLabel && <span className="muted"> ({props.periodsLabel})</span>}
      </dd>
      <dt>Carrinho</dt>
      <dd className="summary-cart">{props.cartName}</dd>
      {props.notes && (
        <>
          <dt>Observação</dt>
          <dd>{props.notes}</dd>
        </>
      )}
    </dl>
  );
}

export function ReservationDialog(props: ReservationDialogProps) {
  return (
    <Modal open={props.open} title="Nova reserva" onClose={props.onClose} className="wizard-modal">
      <ReservationWizard schedule={props.schedule} prefill={props.prefill} onClose={props.onClose} />
    </Modal>
  );
}
