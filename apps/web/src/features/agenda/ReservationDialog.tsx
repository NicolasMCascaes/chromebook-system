import { lazy, Suspense, useMemo, useRef, useState, type FormEvent } from "react";
import {
  isValidIsoDate,
  reservationBatchInputSchema,
  scheduleForClass,
  schoolNow,
  type AvailabilityDto,
  type CalendarDto,
  type ClassPeriodDto,
  type ClassScheduleDto,
  type SchoolNow,
  type ReservationBatchInput,
  type ReservationDto,
} from "@chromebook/shared";
import { SCHOOL_CLASSES } from "@chromebook/shared";
import { useAvailabilities, useCreateReservation, useCreateReservationBatch } from "../../api/hooks";
import { ApiError, errorMessage } from "../../api/client";
import { Modal } from "../../components/Modal";
import { FieldError } from "../../components/FieldError";
import { StatusMessage } from "../../components/StatusMessage";
import { formatDateLong, formatTimeRange, plural } from "../../lib/format";
import { zodFieldErrors, type FieldErrors } from "../../lib/form-errors";
import { cartSituation, validateReservationForm } from "./reservation-validation";
import {
  canAddSlot,
  MAX_SLOTS,
  newSlot,
  overlapErrors,
  slotWithError,
  splitServerErrors,
  withOverlapErrors,
  type BatchErrors,
  type SlotTimes,
  type SlotValues,
} from "./reservation-batch";
import { lastTeacherName, newCancelToken, rememberReservation, rememberTeacherName } from "../../lib/my-reservations";
import { describeWithSchedules, matchPeriods, periodRangeTimes, type PeriodSelection } from "./schedule-model";
import { cartStyle } from "./cart-style";

const DatePickerField = lazy(() => import("./DatePickerField").then((module) => ({ default: module.DatePickerField })));

export interface ReservationPrefill {
  date?: string;
  cartId?: string;
  startTime?: string;
  endTime?: string;
}

type SlotField = "className" | "date" | "startTime" | "endTime" | "cartId" | "notes";

type Step =
  | { kind: "form"; notice?: { kind: "error" | "info"; text: string } }
  | { kind: "review"; input: ReservationBatchInput; idempotencyKey: string }
  | { kind: "done"; reservations: ReservationDto[] };

type Schedule = Pick<CalendarDto, "schedules" | "carts" | "hours" | "today">;

interface ReservationDialogProps {
  open: boolean;
  onClose: () => void;
  prefill: ReservationPrefill;
  schedule: Schedule;
}

function hasStarted(period: ClassPeriodDto, date: string, now: SchoolNow): boolean {
  return date < now.date || (date === now.date && period.startTime < now.time);
}

function periodsForClass(schedules: ClassScheduleDto[], className: string): ClassPeriodDto[] {
  return className ? (scheduleForClass(schedules, className)?.periods ?? []) : [];
}

function initialSelection(
  periods: ClassPeriodDto[],
  date: string,
  now: SchoolNow,
  prefill: ReservationPrefill,
): PeriodSelection {
  const matched = prefill.startTime && prefill.endTime ? matchPeriods(periods, prefill.startTime, prefill.endTime) : null;
  if (matched) return matched;
  const firstPeriod = periods.find((period) => !hasStarted(period, date, now)) ?? periods[0];
  return { fromPeriodId: firstPeriod?.id ?? "", toPeriodId: firstPeriod?.id ?? "" };
}

function defaultCartId(schedule: Schedule): string {
  return schedule.carts.length === 1 ? schedule.carts[0]!.id : "";
}

function firstSlot(key: string, prefill: ReservationPrefill, schedule: Schedule): SlotValues {
  return {
    ...newSlot(key, undefined, { date: prefill.date ?? schedule.today, cartId: "" }),
    cartId: prefill.cartId ?? defaultCartId(schedule),
  };
}

function withoutTeacherName(errors: FieldErrors): FieldErrors {
  const { teacherName: _ignored, ...rest } = errors;
  return rest;
}

interface SlotState {
  periods: ClassPeriodDto[];
  times: SlotTimes | null;
  availability: AvailabilityDto | undefined;
}

function ReservationForm({ schedule, prefill, onClose }: Omit<ReservationDialogProps, "open">) {
  const now = useMemo(() => schoolNow(new Date()), []);
  const nextKey = useRef(1);
  const [teacherName, setTeacherName] = useState(lastTeacherName);
  const [slots, setSlots] = useState<SlotValues[]>(() => [firstSlot("slot-0", prefill, schedule)]);
  const [serverErrors, setServerErrors] = useState<BatchErrors>({ slots: [] });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "form" });
  const createSingle = useCreateReservation();
  const createBatch = useCreateReservationBatch();
  const pending = createSingle.isPending || createBatch.isPending;
  const failure = slots.length === 1 ? createSingle.error : createBatch.error;

  const schedules = schedule.schedules.filter((entry) => entry.periods.length > 0);
  const cartIds = useMemo(() => schedule.carts.map((cart) => cart.id), [schedule.carts]);
  const availabilities = useAvailabilities(slots.map((slot) => (isValidIsoDate(slot.date) ? slot.date : null)));

  const slotStates: SlotState[] = slots.map((slot, index) => {
    const periods = periodsForClass(schedules, slot.className);
    return {
      periods,
      times: periodRangeTimes(periods, { fromPeriodId: slot.fromPeriodId, toPeriodId: slot.toPeriodId }),
      availability: availabilities[index],
    };
  });

  const validation = slots.map((slot, index) => {
    const state = slotStates[index]!;
    return validateReservationForm(
      {
        teacherName,
        className: slot.className,
        date: slot.date,
        startTime: state.times?.startTime ?? "",
        endTime: state.times?.endTime ?? "",
        cartId: slot.cartId,
        notes: slot.notes,
      },
      {
        now,
        hours: schedule.hours,
        availability: state.availability,
        invalidPeriodRange: state.periods.length > 0 && slot.fromPeriodId !== "" && !state.times,
      },
    );
  });
  const teacherNameError = validation[0]?.teacherName;
  const overlapping = overlapErrors(slots.map((slot, index) => ({ cartId: slot.cartId, date: slot.date, times: slotStates[index]!.times })));
  const slotErrors = withOverlapErrors(validation.map(withoutTeacherName), overlapping);
  const hasErrors = Boolean(teacherNameError) || slotErrors.some((errors) => Object.keys(errors).length > 0);

  function clearServerErrors() {
    setServerErrors({ slots: [] });
  }

  function updateSlot(key: string, change: Partial<SlotValues>) {
    clearServerErrors();
    setSlots((current) => current.map((slot) => (slot.key === key ? { ...slot, ...change } : slot)));
  }

  function touch(key: string, field: SlotField) {
    setTouched((current) => ({ ...current, [`${key}.${field}`]: true }));
  }

  function addSlot() {
    if (!canAddSlot(slots.length)) return;
    const key = `slot-${nextKey.current++}`;
    clearServerErrors();
    setSlots((current) => [...current, newSlot(key, current[current.length - 1], { date: schedule.today, cartId: defaultCartId(schedule) })]);
  }

  function removeSlot(key: string) {
    clearServerErrors();
    setSlots((current) => (current.length > 1 ? current.filter((slot) => slot.key !== key) : current));
  }

  function selectClass(slot: SlotValues, index: number, className: string) {
    const nextPeriods = periodsForClass(schedules, className);
    const keepsSelection = nextPeriods.some((period) => period.id === slot.fromPeriodId);
    const selection = keepsSelection
      ? { fromPeriodId: slot.fromPeriodId, toPeriodId: slot.toPeriodId }
      : initialSelection(nextPeriods, slot.date, now, index === 0 ? prefill : {});
    updateSlot(slot.key, { className, ...selection });
  }

  function selectFromPeriod(slot: SlotValues, periods: ClassPeriodDto[], fromPeriodId: string) {
    const nextFromIndex = periods.findIndex((period) => period.id === fromPeriodId);
    const toIndex = periods.findIndex((period) => period.id === slot.toPeriodId);
    updateSlot(slot.key, { fromPeriodId, toPeriodId: toIndex < nextFromIndex ? fromPeriodId : slot.toPeriodId });
  }

  function isVisible(slot: SlotValues, state: SlotState, field: SlotField): boolean {
    if (field === "startTime" || field === "endTime") return state.periods.length > 0;
    if (submitted || touched[`${slot.key}.${field}`]) return true;
    if (field === "date") return true;
    if (field === "cartId") return slot.cartId !== "";
    return false;
  }

  function errorFor(index: number, field: SlotField): string | undefined {
    const slot = slots[index]!;
    return serverErrors.slots[index]?.[field] ?? (isVisible(slot, slotStates[index]!, field) ? slotErrors[index]?.[field] : undefined);
  }

  const teacherNameMessage = serverErrors.teacherName ?? (submitted || touched.teacherName ? teacherNameError : undefined);

  function handleReview(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (hasErrors) return;
    const parsed = reservationBatchInputSchema.safeParse({
      teacherName,
      slots: slots.map((slot, index) => ({
        cartId: slot.cartId,
        className: slot.className,
        date: slot.date,
        startTime: slotStates[index]!.times?.startTime ?? "",
        endTime: slotStates[index]!.times?.endTime ?? "",
        notes: slot.notes,
        cancelToken: newCancelToken(),
      })),
    });
    if (!parsed.success) {
      const details = Object.entries(zodFieldErrors(parsed.error)).map(([path, message]) => ({ path, message }));
      setServerErrors(splitServerErrors(details, slots.length, false));
      return;
    }
    createSingle.reset();
    createBatch.reset();
    setStep({ kind: "review", input: parsed.data, idempotencyKey: crypto.randomUUID() });
  }

  async function send(input: ReservationBatchInput, idempotencyKey: string): Promise<ReservationDto[]> {
    if (input.slots.length === 1) {
      const reservation = await createSingle.mutateAsync({ input: { teacherName: input.teacherName, ...input.slots[0]! }, idempotencyKey });
      return [reservation];
    }
    const result = await createBatch.mutateAsync({ input, idempotencyKey });
    return result.reservations;
  }

  async function handleConfirm(input: ReservationBatchInput, idempotencyKey: string) {
    try {
      const reservations = await send(input, idempotencyKey);
      reservations.forEach((reservation, index) => rememberReservation(reservation.id, input.slots[index]!.cancelToken));
      rememberTeacherName(input.teacherName);
      setStep({ kind: "done", reservations });
    } catch (error) {
      if (error instanceof ApiError && [400, 409, 422].includes(error.status)) {
        const errors = splitServerErrors(error.body.details, input.slots.length, input.slots.length === 1);
        setServerErrors(errors);
        setSubmitted(true);
        setStep({ kind: "form", notice: { kind: "error", text: error.message } });
        const failedIndex = slotWithError(errors);
        if (failedIndex >= 0) {
          requestAnimationFrame(() =>
            document.getElementById(`reservation-${slots[failedIndex]?.key}`)?.scrollIntoView({ block: "start" }),
          );
        }
      }
    }
  }

  if (step.kind === "done") {
    const allPending = step.reservations.every((reservation) => reservation.status === "PENDING");
    const many = step.reservations.length > 1;
    return (
      <div className="reservation-done">
        {allPending ? (
          <StatusMessage kind="success">
            {many ? `Pedido com ${step.reservations.length} horários enviado.` : "Pedido enviado."} O horário fica separado
            para você enquanto o TI analisa; acompanhe a aprovação pela agenda.
          </StatusMessage>
        ) : (
          <StatusMessage kind="success">{many ? "Reservas confirmadas." : "Reserva confirmada."}</StatusMessage>
        )}
        <p className="muted small-text">
          Se precisar cancelar, abra a reserva na agenda usando este mesmo navegador. Em outro aparelho, peça o
          cancelamento ao TI.
        </p>
        <div className="reservation-slot-list">
          {step.reservations.map((reservation, index) => (
            <section key={reservation.id} className="reservation-slot-summary">
              {many && <h3>Horário {index + 1}</h3>}
              <ReservationSummary
                teacherName={reservation.teacherName}
                className={reservation.className}
                date={reservation.date}
                startTime={reservation.startTime}
                endTime={reservation.endTime}
                cartName={reservation.cartName}
                cartColor={reservation.cartColor}
                notes={reservation.notes}
                periodsLabel={describeWithSchedules(schedule.schedules, reservation.startTime, reservation.endTime)}
              />
            </section>
          ))}
        </div>
        <div className="actions">
          <button type="button" className="button primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    );
  }

  if (step.kind === "review") {
    const many = step.input.slots.length > 1;
    const reviewCarts = [...new Set(step.input.slots.map((slot) => slot.cartId))]
      .map((cartId) => schedule.carts.find((entry) => entry.id === cartId))
      .filter((cart) => cart !== undefined);
    return (
      <div className="reservation-review">
        <p className="muted">
          {many
            ? `Confira os ${step.input.slots.length} horários antes de enviar. O pedido passa pela aprovação do TI e só é registrado se todos os horários estiverem livres.`
            : "Confira os dados antes de enviar. O pedido passa pela aprovação do TI."}
        </p>
        <div className="reservation-slot-list">
          {step.input.slots.map((slot, index) => {
            const cart = schedule.carts.find((entry) => entry.id === slot.cartId);
            return (
              <section key={slot.cancelToken} className="reservation-slot-summary">
                {many && <h3>Horário {index + 1}</h3>}
                <ReservationSummary
                  teacherName={step.input.teacherName}
                  className={slot.className}
                  date={slot.date}
                  startTime={slot.startTime}
                  endTime={slot.endTime}
                  cartName={cart?.name ?? ""}
                  cartColor={cart?.color ?? "#999999"}
                  notes={slot.notes ?? null}
                  periodsLabel={describeWithSchedules(schedule.schedules, slot.startTime, slot.endTime)}
                />
              </section>
            );
          })}
        </div>
        {reviewCarts.length > 0 && (
          <StatusMessage kind="info">
            A reserva é do carrinho inteiro.{" "}
            {reviewCarts
              .map((cart) => `${cart.name}: ${plural(cart.equipment.available, "Chromebook disponível", "Chromebooks disponíveis")} hoje`)
              .join("; ")}
            . Essa quantidade pode mudar até a data da aula.
          </StatusMessage>
        )}
        {failure && (
          <StatusMessage kind="error">
            {errorMessage(failure)} Ao tentar de novo, a reserva não será duplicada.
          </StatusMessage>
        )}
        <div className="actions">
          <button type="button" className="button secondary" disabled={pending} onClick={() => setStep({ kind: "form" })}>
            Voltar e editar
          </button>
          <button
            type="button"
            className="button primary"
            disabled={pending}
            onClick={() => void handleConfirm(step.input, step.idempotencyKey)}
          >
            {pending ? "Enviando…" : "Enviar pedido"}
          </button>
        </div>
      </div>
    );
  }

  const many = slots.length > 1;

  return (
    <form className="form reservation-form" onSubmit={handleReview} noValidate>
      {step.notice && <StatusMessage kind={step.notice.kind}>{step.notice.text}</StatusMessage>}

      <label className="field">
        <span>Seu nome</span>
        <input
          value={teacherName}
          maxLength={100}
          autoComplete="name"
          autoFocus={!teacherName}
          onChange={(event) => {
            setServerErrors((current) => ({ ...current, teacherName: undefined }));
            setTeacherName(event.target.value);
          }}
          onBlur={() => setTouched((current) => ({ ...current, teacherName: true }))}
        />
        <FieldError message={teacherNameMessage} />
      </label>

      {slots.map((slot, index) => {
        const state = slotStates[index]!;
        const fromIndex = state.periods.findIndex((period) => period.id === slot.fromPeriodId);
        return (
          <section key={slot.key} id={`reservation-${slot.key}`} className={many ? "reservation-slot" : undefined}>
            {many && (
              <div className="reservation-slot-header">
                <h3>Horário {index + 1}</h3>
                <button type="button" className="button link small" onClick={() => removeSlot(slot.key)}>
                  Remover
                </button>
              </div>
            )}

            <div className="form-grid">
              <label className="field">
                <span>Turma</span>
                <select
                  value={slot.className}
                  autoFocus={index === 0 && Boolean(teacherName)}
                  onChange={(event) => {
                    selectClass(slot, index, event.target.value);
                    touch(slot.key, "className");
                  }}
                  onBlur={() => touch(slot.key, "className")}
                >
                  <option value="" disabled>
                    Selecione a turma
                  </option>
                  {SCHOOL_CLASSES.map((schoolClass) => (
                    <option key={schoolClass} value={schoolClass}>
                      {schoolClass}
                    </option>
                  ))}
                </select>
                <FieldError message={errorFor(index, "className")} />
              </label>
              <div className="field full">
                <span>Data</span>
                <Suspense
                  fallback={
                    <input
                      type="date"
                      value={slot.date}
                      min={schedule.today}
                      onChange={(event) => updateSlot(slot.key, { date: event.target.value })}
                    />
                  }
                >
                  <DatePickerField value={slot.date} cartIds={cartIds} onChange={(date) => updateSlot(slot.key, { date })} />
                </Suspense>
                <FieldError message={errorFor(index, "date")} />
              </div>
            </div>

            <fieldset className="field-group">
              <legend>Horário</legend>
              {schedules.length === 0 ? (
                <StatusMessage kind="empty">As aulas ainda não foram cadastradas. Fale com o TI para reservar.</StatusMessage>
              ) : (
                <div className="form-grid">
                  <label className="field">
                    <span>Da aula</span>
                    <select
                      value={slot.fromPeriodId}
                      disabled={state.periods.length === 0}
                      onChange={(event) => selectFromPeriod(slot, state.periods, event.target.value)}
                    >
                      {state.periods.length === 0 && <option value="">Selecione a turma primeiro</option>}
                      {state.periods.map((period) => {
                        const started = hasStarted(period, slot.date, now);
                        return (
                          <option key={period.id} value={period.id} disabled={started}>
                            {period.name} ({period.startTime}){started ? " (já passou)" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <FieldError message={errorFor(index, "startTime")} />
                  </label>
                  <label className="field">
                    <span>Até a aula</span>
                    <select
                      value={slot.toPeriodId}
                      disabled={state.periods.length === 0}
                      onChange={(event) => updateSlot(slot.key, { toPeriodId: event.target.value })}
                    >
                      {state.periods.length === 0 && <option value="">Selecione a turma primeiro</option>}
                      {state.periods.map((period, periodIndex) => (
                        <option key={period.id} value={period.id} disabled={periodIndex < fromIndex}>
                          {period.name} (até {period.endTime})
                        </option>
                      ))}
                    </select>
                    <FieldError message={errorFor(index, "endTime")} />
                  </label>
                </div>
              )}
              {state.times && (
                <p className="muted">Horário selecionado: {formatTimeRange(state.times.startTime, state.times.endTime)}</p>
              )}
            </fieldset>

            <fieldset className="field-group">
              <legend>Carrinho</legend>
              {schedule.carts.length === 0 ? (
                <StatusMessage kind="empty">Nenhum carrinho disponível para reserva.</StatusMessage>
              ) : (
                <div className="cart-options">
                  {schedule.carts.map((cart) => {
                    const status = cartSituation(
                      state.availability?.carts.find((entry) => entry.cartId === cart.id),
                      state.times,
                    );
                    return (
                      <label
                        key={cart.id}
                        className={status?.unavailable ? "cart-option is-unavailable" : "cart-option"}
                        style={cartStyle(cart.color)}
                      >
                        <input
                          type="radio"
                          name={`cartId-${slot.key}`}
                          value={cart.id}
                          disabled={status?.unavailable && slot.cartId !== cart.id}
                          checked={slot.cartId === cart.id}
                          onChange={() => updateSlot(slot.key, { cartId: cart.id })}
                        />
                        <span className="cart-option-body">
                          <strong>{cart.name}</strong>
                          <span className="muted">
                            {plural(cart.equipment.available, "Chromebook disponível", "Chromebooks disponíveis")}
                          </span>
                          {status && (
                            <span className={status.unavailable ? "cart-status is-busy" : "cart-status is-free"}>{status.text}</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <FieldError message={errorFor(index, "cartId")} />
            </fieldset>

            <label className="field">
              <span>Observação (opcional)</span>
              <textarea
                rows={2}
                maxLength={500}
                value={slot.notes}
                onChange={(event) => updateSlot(slot.key, { notes: event.target.value })}
                onBlur={() => touch(slot.key, "notes")}
              />
              <FieldError message={errorFor(index, "notes")} />
            </label>
          </section>
        );
      })}

      {canAddSlot(slots.length) ? (
        <button type="button" className="button secondary reservation-add-slot" onClick={addSlot}>
          Adicionar outro horário
        </button>
      ) : (
        <p className="muted small-text">Limite de {MAX_SLOTS} horários por pedido.</p>
      )}

      <div className="actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="button primary">
          {many ? `Revisar ${slots.length} horários` : "Revisar reserva"}
        </button>
      </div>
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
    <Modal open={props.open} title="Nova reserva" onClose={props.onClose}>
      <ReservationForm schedule={props.schedule} prefill={props.prefill} onClose={props.onClose} />
    </Modal>
  );
}
