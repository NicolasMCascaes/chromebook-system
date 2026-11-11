import { lazy, Suspense, useMemo, useState, type FormEvent } from "react";
import {
  isValidIsoDate,
  reservationInputSchema,
  schoolNow,
  type CalendarDto,
  type ClassPeriodDto,
  type SchoolNow,
  type ReservationDto,
  type ReservationInput,
} from "@chromebook/shared";
import { SCHOOL_CLASSES } from "@chromebook/shared";
import { useAvailability, useCreateReservation } from "../../api/hooks";
import { ApiError, errorMessage } from "../../api/client";
import { Modal } from "../../components/Modal";
import { FieldError } from "../../components/FieldError";
import { StatusMessage } from "../../components/StatusMessage";
import { formatDateLong, formatTimeRange, plural } from "../../lib/format";
import { zodFieldErrors, type FieldErrors } from "../../lib/form-errors";
import { cartSituation, validateReservationForm } from "./reservation-validation";
import { lastTeacherName, newCancelToken, rememberReservation, rememberTeacherName } from "../../lib/my-reservations";
import { describeWithSchedules, findMatchingSchedule, periodRangeTimes } from "./schedule-model";
import { cartStyle } from "./cart-style";

const DatePickerField = lazy(() => import("./DatePickerField").then((module) => ({ default: module.DatePickerField })));

export interface ReservationPrefill {
  date?: string;
  cartId?: string;
  startTime?: string;
  endTime?: string;
}

type TimeMode = "period" | "custom";

type FieldName = "teacherName" | "className" | "date" | "startTime" | "endTime" | "cartId" | "notes";

interface FormValues {
  teacherName: string;
  className: string;
  date: string;
  mode: TimeMode;
  scheduleId: string;
  fromPeriodId: string;
  toPeriodId: string;
  startTime: string;
  endTime: string;
  cartId: string;
  notes: string;
}

type Step =
  | { kind: "form"; notice?: { kind: "error" | "info"; text: string } }
  | { kind: "review"; input: ReservationInput; idempotencyKey: string }
  | { kind: "done"; reservation: ReservationDto };

interface ReservationDialogProps {
  open: boolean;
  onClose: () => void;
  prefill: ReservationPrefill;
  schedule: Pick<CalendarDto, "schedules" | "carts" | "hours" | "today">;
}

function hasStarted(period: ClassPeriodDto, date: string, now: SchoolNow): boolean {
  return date < now.date || (date === now.date && period.startTime < now.time);
}

function initialValues(prefill: ReservationPrefill, schedule: ReservationDialogProps["schedule"], now: SchoolNow): FormValues {
  const schedules = schedule.schedules.filter((entry) => entry.periods.length > 0);
  const matched =
    prefill.startTime && prefill.endTime ? findMatchingSchedule(schedules, prefill.startTime, prefill.endTime) : null;
  const usePeriods = schedules.length > 0 && (matched !== null || !prefill.startTime);
  const periods = (matched?.schedule ?? schedules[0])?.periods ?? [];
  const date = prefill.date ?? schedule.today;
  const firstPeriod = periods.find((period) => !hasStarted(period, date, now)) ?? periods[0];
  return {
    teacherName: lastTeacherName(),
    className: "",
    date,
    mode: usePeriods ? "period" : "custom",
    scheduleId: matched?.schedule.id ?? schedules[0]?.id ?? "",
    fromPeriodId: matched?.selection.fromPeriodId ?? firstPeriod?.id ?? "",
    toPeriodId: matched?.selection.toPeriodId ?? firstPeriod?.id ?? "",
    startTime: prefill.startTime ?? schedule.hours.openingTime,
    endTime: prefill.endTime ?? "",
    cartId: prefill.cartId ?? (schedule.carts.length === 1 ? schedule.carts[0]!.id : ""),
    notes: "",
  };
}

function ReservationForm({
  schedule,
  prefill,
  onClose,
}: Omit<ReservationDialogProps, "open">) {
  const now = useMemo(() => schoolNow(new Date()), []);
  const [values, setValues] = useState<FormValues>(() => initialValues(prefill, schedule, now));
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "form" });
  const create = useCreateReservation();

  const validDate = isValidIsoDate(values.date) ? values.date : null;
  const availability = useAvailability(validDate);
  const dayAvailability = availability.data?.date === validDate ? availability.data : undefined;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setServerErrors({});
    setValues((current) => ({ ...current, [key]: value }));
  };
  const touch = (field: FieldName) => setTouched((current) => ({ ...current, [field]: true }));

  const schedules = schedule.schedules.filter((entry) => entry.periods.length > 0);
  const periods = schedules.find((entry) => entry.id === values.scheduleId)?.periods ?? [];
  const classSchedule = schedules.find((entry) => entry.classNames.includes(values.className));

  function selectSchedule(scheduleId: string) {
    const firstPeriod = schedules.find((entry) => entry.id === scheduleId)?.periods[0]?.id ?? "";
    setValues((current) => ({ ...current, scheduleId, fromPeriodId: firstPeriod, toPeriodId: firstPeriod }));
  }

  function selectFromPeriod(fromPeriodId: string) {
    const nextFromIndex = periods.findIndex((period) => period.id === fromPeriodId);
    const toIndex = periods.findIndex((period) => period.id === values.toPeriodId);
    setServerErrors({});
    setValues((current) => ({ ...current, fromPeriodId, toPeriodId: toIndex < nextFromIndex ? fromPeriodId : current.toPeriodId }));
  }

  function selectClass(className: string) {
    const target = schedules.find((entry) => entry.classNames.includes(className));
    set("className", className);
    if (target && target.id !== values.scheduleId) selectSchedule(target.id);
  }

  const selectedTimes = useMemo(() => {
    if (values.mode === "period") {
      return periodRangeTimes(periods, { fromPeriodId: values.fromPeriodId, toPeriodId: values.toPeriodId });
    }
    return values.startTime && values.endTime ? { startTime: values.startTime, endTime: values.endTime } : null;
  }, [values.mode, values.fromPeriodId, values.toPeriodId, values.startTime, values.endTime, periods]);

  const fromIndex = periods.findIndex((period) => period.id === values.fromPeriodId);
  const cartIds = useMemo(() => schedule.carts.map((cart) => cart.id), [schedule.carts]);

  const errors = useMemo(
    () =>
      validateReservationForm(
        {
          teacherName: values.teacherName,
          className: values.className,
          date: values.date,
          startTime: selectedTimes?.startTime ?? "",
          endTime: selectedTimes?.endTime ?? "",
          cartId: values.cartId,
          notes: values.notes,
        },
        {
          now,
          hours: schedule.hours,
          availability: dayAvailability,
          invalidPeriodRange: values.mode === "period" && !selectedTimes,
        },
      ),
    [values, selectedTimes, now, schedule.hours, dayAvailability],
  );

  function isVisible(field: FieldName): boolean {
    if (submitted || touched[field]) return true;
    if (field === "date") return true;
    if (field === "startTime" || field === "endTime") return selectedTimes !== null || values.mode === "period";
    if (field === "cartId") return values.cartId !== "";
    return false;
  }

  const errorFor = (field: FieldName) => serverErrors[field] ?? (isVisible(field) ? errors[field] : undefined);

  function handleReview(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    const parsed = reservationInputSchema.safeParse({
      teacherName: values.teacherName,
      cartId: values.cartId,
      className: values.className,
      date: values.date,
      startTime: selectedTimes?.startTime ?? "",
      endTime: selectedTimes?.endTime ?? "",
      notes: values.notes,
      cancelToken: newCancelToken(),
    });
    if (!parsed.success) {
      setServerErrors(zodFieldErrors(parsed.error));
      return;
    }
    create.reset();
    setStep({ kind: "review", input: parsed.data, idempotencyKey: crypto.randomUUID() });
  }

  async function handleConfirm(input: ReservationInput, idempotencyKey: string) {
    try {
      const reservation = await create.mutateAsync({ input, idempotencyKey });
      rememberReservation(reservation.id, input.cancelToken);
      rememberTeacherName(input.teacherName);
      setStep({ kind: "done", reservation });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setStep({ kind: "form", notice: { kind: "error", text: error.message } });
        return;
      }
      if (error instanceof ApiError && (error.status === 422 || error.status === 400)) {
        setServerErrors(error.fieldErrors());
        setStep({ kind: "form", notice: { kind: "error", text: error.message } });
      }
    }
  }

  if (step.kind === "done") {
    const reservation = step.reservation;
    return (
      <div className="reservation-done">
        {reservation.status === "PENDING" ? (
          <StatusMessage kind="success">
            Pedido enviado. O horário fica separado para você enquanto o TI analisa; acompanhe a aprovação pela agenda.
          </StatusMessage>
        ) : (
          <StatusMessage kind="success">Reserva confirmada.</StatusMessage>
        )}
        <p className="muted small-text">
          Se precisar cancelar, abra a reserva na agenda usando este mesmo navegador. Em outro aparelho, peça o
          cancelamento ao TI.
        </p>
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
        <div className="actions">
          <button type="button" className="button primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    );
  }

  if (step.kind === "review") {
    const cart = schedule.carts.find((entry) => entry.id === step.input.cartId);
    return (
      <div className="reservation-review">
        <p className="muted">Confira os dados antes de enviar. O pedido passa pela aprovação do TI.</p>
        <ReservationSummary
          teacherName={step.input.teacherName}
          className={step.input.className}
          date={step.input.date}
          startTime={step.input.startTime}
          endTime={step.input.endTime}
          cartName={cart?.name ?? ""}
          cartColor={cart?.color ?? "#999999"}
          notes={step.input.notes ?? null}
          periodsLabel={describeWithSchedules(schedule.schedules, step.input.startTime, step.input.endTime)}
        />
        {cart && (
          <StatusMessage kind="info">
            A reserva é do carrinho inteiro. Hoje ele tem{" "}
            {plural(cart.equipment.available, "Chromebook disponível", "Chromebooks disponíveis")}; essa quantidade pode
            mudar até a data da aula.
          </StatusMessage>
        )}
        {create.isError && (
          <StatusMessage kind="error">
            {errorMessage(create.error)} Ao tentar de novo, a reserva não será duplicada.
          </StatusMessage>
        )}
        <div className="actions">
          <button type="button" className="button secondary" disabled={create.isPending} onClick={() => setStep({ kind: "form" })}>
            Voltar e editar
          </button>
          <button
            type="button"
            className="button primary"
            disabled={create.isPending}
            onClick={() => void handleConfirm(step.input, step.idempotencyKey)}
          >
            {create.isPending ? "Enviando…" : "Enviar pedido"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="form reservation-form" onSubmit={handleReview} noValidate>
      {step.notice && <StatusMessage kind={step.notice.kind}>{step.notice.text}</StatusMessage>}

      <div className="form-grid">
        <label className="field">
          <span>Seu nome</span>
          <input
            value={values.teacherName}
            maxLength={100}
            autoComplete="name"
            autoFocus={!values.teacherName}
            onChange={(event) => set("teacherName", event.target.value)}
            onBlur={() => touch("teacherName")}
          />
          <FieldError message={errorFor("teacherName")} />
        </label>
        <label className="field">
          <span>Turma</span>
          <select
            value={values.className}
            autoFocus={Boolean(values.teacherName)}
            onChange={(event) => {
              selectClass(event.target.value);
              touch("className");
            }}
            onBlur={() => touch("className")}
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
          <FieldError message={errorFor("className")} />
        </label>
        <div className="field full">
          <span>Data</span>
          <Suspense
            fallback={
              <input type="date" value={values.date} min={schedule.today} onChange={(event) => set("date", event.target.value)} />
            }
          >
            <DatePickerField value={values.date} cartIds={cartIds} onChange={(date) => set("date", date)} />
          </Suspense>
          <FieldError message={errorFor("date")} />
        </div>
      </div>

      <fieldset className="field-group">
        <legend>Horário</legend>
        {schedules.length > 0 && (
          <div className="segmented" role="radiogroup" aria-label="Forma de escolher o horário">
            <button
              type="button"
              role="radio"
              aria-checked={values.mode === "period"}
              className={values.mode === "period" ? "is-active" : undefined}
              onClick={() => set("mode", "period")}
            >
              Por aula
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={values.mode === "custom"}
              className={values.mode === "custom" ? "is-active" : undefined}
              onClick={() => set("mode", "custom")}
            >
              Outro horário
            </button>
          </div>
        )}

        {values.mode === "period" ? (
          <div className="form-grid">
            {!classSchedule && schedules.length > 1 && (
              <label className="field full">
                <span>Horário da turma</span>
                <select value={values.scheduleId} onChange={(event) => selectSchedule(event.target.value)}>
                  {schedules.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Da aula</span>
              <select value={values.fromPeriodId} onChange={(event) => selectFromPeriod(event.target.value)}>
                {periods.map((period) => {
                  const started = hasStarted(period, values.date, now);
                  return (
                    <option key={period.id} value={period.id} disabled={started}>
                      {period.name} ({period.startTime}){started ? " (já passou)" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="field">
              <span>Até a aula</span>
              <select value={values.toPeriodId} onChange={(event) => set("toPeriodId", event.target.value)}>
                {periods.map((period, index) => (
                  <option key={period.id} value={period.id} disabled={index < fromIndex}>
                    {period.name} (até {period.endTime})
                  </option>
                ))}
              </select>
              <FieldError message={errorFor("endTime")} />
            </label>
          </div>
        ) : (
          <div className="form-grid">
            <label className="field">
              <span>Início</span>
              <input
                type="time"
                step={schedule.hours.slotMinutes * 60}
                min={schedule.hours.openingTime}
                max={schedule.hours.closingTime}
                value={values.startTime}
                onChange={(event) => set("startTime", event.target.value)}
                onBlur={() => touch("startTime")}
              />
              <FieldError message={errorFor("startTime")} />
            </label>
            <label className="field">
              <span>Término</span>
              <input
                type="time"
                step={schedule.hours.slotMinutes * 60}
                min={schedule.hours.openingTime}
                max={schedule.hours.closingTime}
                value={values.endTime}
                onChange={(event) => set("endTime", event.target.value)}
                onBlur={() => touch("endTime")}
              />
              <FieldError message={errorFor("endTime")} />
            </label>
          </div>
        )}
        {selectedTimes && <p className="muted">Horário selecionado: {formatTimeRange(selectedTimes.startTime, selectedTimes.endTime)}</p>}
        <p className="muted small-text">
          Funcionamento: {formatTimeRange(schedule.hours.openingTime, schedule.hours.closingTime)}
        </p>
      </fieldset>

      <fieldset className="field-group">
        <legend>Carrinho</legend>
        {schedule.carts.length === 0 ? (
          <StatusMessage kind="empty">Nenhum carrinho disponível para reserva.</StatusMessage>
        ) : (
          <div className="cart-options">
            {schedule.carts.map((cart) => {
              const status = cartSituation(
                dayAvailability?.carts.find((entry) => entry.cartId === cart.id),
                selectedTimes,
              );
              return (
                <label
                  key={cart.id}
                  className={status?.unavailable ? "cart-option is-unavailable" : "cart-option"}
                  style={cartStyle(cart.color)}
                >
                  <input
                    type="radio"
                    name="cartId"
                    value={cart.id}
                    disabled={status?.unavailable && values.cartId !== cart.id}
                    checked={values.cartId === cart.id}
                    onChange={() => set("cartId", cart.id)}
                  />
                  <span className="cart-option-body">
                    <strong>{cart.name}</strong>
                    <span className="muted">
                      {plural(cart.equipment.available, "Chromebook disponível", "Chromebooks disponíveis")}
                    </span>
                    {status && <span className={status.unavailable ? "cart-status is-busy" : "cart-status is-free"}>{status.text}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <FieldError message={errorFor("cartId")} />
      </fieldset>

      <label className="field">
        <span>Observação (opcional)</span>
        <textarea
          rows={2}
          maxLength={500}
          value={values.notes}
          onChange={(event) => set("notes", event.target.value)}
          onBlur={() => touch("notes")}
        />
        <FieldError message={errorFor("notes")} />
      </label>

      <div className="actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="button primary">
          Revisar reserva
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
