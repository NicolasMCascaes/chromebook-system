import { useRef, useState, type FormEvent } from "react";
import {
  SCHOOL_CLASSES,
  MAX_CLASS_PERIODS,
  MAX_CLASS_SCHEDULES,
  minutesToTime,
  schoolSettingsInputSchema,
  SLOT_MINUTES_OPTIONS,
  timeToMinutes,
  type AdminReservationDto,
  type SchoolSettingsDto,
} from "@chromebook/shared";
import { useAdminSettings, useRegenerateAccessCode, useSaveSettings } from "../../api/hooks";
import { errorMessage } from "../../api/client";
import { StatusMessage } from "../../components/StatusMessage";
import { FieldError } from "../../components/FieldError";
import { AffectedReservations, ImpactConfirmation } from "../../features/admin/AffectedReservations";
import { publicAgendaLink, rememberAccessCode } from "../../lib/access-code";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "../../lib/form-errors";

interface PeriodRow {
  key: number;
  name: string;
  startTime: string;
  endTime: string;
}

interface ScheduleRow {
  key: number;
  name: string;
  classNames: string[];
  periods: PeriodRow[];
}

const DEFAULT_PERIOD_MINUTES = 50;
const LAST_START_MINUTES = 23 * 60 + 55;

function PublicLinkSection({ accessCode }: { accessCode: string }) {
  const regenerate = useRegenerateAccessCode();
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = publicAgendaLink(accessCode);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="card form">
      <h2>Link para os professores</h2>
      <p className="muted small-text">
        Só quem tem este link vê a agenda e faz reservas. Envie aos professores pelo canal da escola.
      </p>
      <div className="public-link">
        <input readOnly value={link} aria-label="Link da agenda" onFocus={(event) => event.target.select()} />
        <button type="button" className="button secondary" onClick={() => void copy()}>
          {copied ? "Copiado" : "Copiar link"}
        </button>
      </div>
      {regenerate.isError && <StatusMessage kind="error">{errorMessage(regenerate.error)}</StatusMessage>}
      {regenerate.isSuccess && !confirming && (
        <StatusMessage kind="success">Novo link gerado. O link anterior deixou de funcionar.</StatusMessage>
      )}
      {confirming ? (
        <div className="stack">
          <StatusMessage kind="info">
            O link atual deixará de funcionar imediatamente e será preciso enviar o novo link a todos os professores.
          </StatusMessage>
          <div className="actions">
            <button type="button" className="button secondary" onClick={() => setConfirming(false)}>
              Manter link atual
            </button>
            <button
              type="button"
              className="button danger"
              disabled={regenerate.isPending}
              onClick={() =>
                regenerate.mutate(undefined, {
                  onSuccess: (settings) => {
                    rememberAccessCode(settings.publicAccessCode);
                    setCopied(false);
                    setConfirming(false);
                  },
                })
              }
            >
              {regenerate.isPending ? "Gerando…" : "Gerar novo link"}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="button danger-outline" onClick={() => setConfirming(true)}>
            Gerar novo link
          </button>
        </div>
      )}
    </section>
  );
}

function SettingsForm({ settings }: { settings: SchoolSettingsDto }) {
  const [openingTime, setOpeningTime] = useState(settings.openingTime);
  const [closingTime, setClosingTime] = useState(settings.closingTime);
  const [slotMinutes, setSlotMinutes] = useState(settings.slotMinutes);
  const [emails, setEmails] = useState(settings.notificationEmails.join("\n"));
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const nextKey = useRef(1000);
  const [schedules, setSchedules] = useState<ScheduleRow[]>(() =>
    settings.schedules.map((schedule, scheduleIndex) => ({
      key: scheduleIndex,
      name: schedule.name,
      classNames: schedule.classNames,
      periods: schedule.periods.map((period, periodIndex) => ({ key: scheduleIndex * 100 + periodIndex, ...period })),
    })),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [affected, setAffected] = useState<AdminReservationDto[] | null>(null);
  const save = useSaveSettings();

  function takeKey(): number {
    nextKey.current += 1;
    return nextKey.current;
  }

  const updateSchedule = (key: number, change: (schedule: ScheduleRow) => ScheduleRow) =>
    setSchedules((current) => current.map((schedule) => (schedule.key === key ? change(schedule) : schedule)));

  const updatePeriod = (scheduleKey: number, periodKey: number, changes: Partial<PeriodRow>) =>
    updateSchedule(scheduleKey, (schedule) => ({
      ...schedule,
      periods: schedule.periods.map((period) => (period.key === periodKey ? { ...period, ...changes } : period)),
    }));

  function addPeriod(scheduleKey: number) {
    const key = takeKey();
    updateSchedule(scheduleKey, (schedule) => {
      const last = schedule.periods.at(-1);
      const start = Math.min(last ? timeToMinutes(last.endTime) : timeToMinutes(openingTime), LAST_START_MINUTES);
      const end = Math.min(start + DEFAULT_PERIOD_MINUTES, LAST_START_MINUTES);
      return {
        ...schedule,
        periods: [
          ...schedule.periods,
          { key, name: `${schedule.periods.length + 1}ª aula`, startTime: minutesToTime(start), endTime: minutesToTime(end) },
        ],
      };
    });
  }

  function addSchedule() {
    const key = takeKey();
    setSchedules((current) => [...current, { key, name: "", classNames: [], periods: [] }]);
  }

  function describeRisks(input: { openingTime: string; closingTime: string; notificationEmails: string[]; schedules: { name: string; periods: unknown[] }[] }): string[] {
    const risks: string[] = [];
    if (input.notificationEmails.length === 0) {
      risks.push("Nenhum e-mail cadastrado: os pedidos dos professores não serão avisados e só aparecerão na tela de Reservas.");
    }
    if (input.openingTime > settings.openingTime || input.closingTime < settings.closingTime) {
      risks.push("O horário de funcionamento ficou menor. Reservas já feitas fora do novo horário continuam marcadas e serão listadas depois de salvar.");
    }
    const keptNames = new Set(input.schedules.map((schedule) => schedule.name.trim().toLowerCase()));
    const removed = settings.schedules.filter((schedule) => !keptNames.has(schedule.name.trim().toLowerCase()));
    if (removed.length > 0) {
      risks.push(`Grade removida ou renomeada: ${removed.map((schedule) => schedule.name).join(", ")}. Os professores deixam de vê-la ao reservar por aula.`);
    }
    const removedPeriods = settings.schedules.reduce((total, schedule) => total + schedule.periods.length, 0) -
      input.schedules.reduce((total, schedule) => total + schedule.periods.length, 0);
    if (removedPeriods > 0) {
      risks.push(`${removedPeriods === 1 ? "1 aula foi removida" : `${removedPeriods} aulas foram removidas`} das grades.`);
    }
    return risks;
  }

  async function handleSubmit(event: FormEvent, confirmed = false) {
    event.preventDefault();
    setAffected(null);
    const parsed = schoolSettingsInputSchema.safeParse({
      openingTime,
      closingTime,
      slotMinutes,
      notificationEmails: emails
        .split(/[\s,;]+/)
        .map((email) => email.trim())
        .filter(Boolean),
      schedules: schedules.map((schedule) => ({
        name: schedule.name,
        classNames: schedule.classNames,
        periods: schedule.periods.map(({ name, startTime, endTime }) => ({ name, startTime, endTime })),
      })),
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    if (!confirmed) {
      const risks = describeRisks(parsed.data);
      if (risks.length > 0) {
        setWarnings(risks);
        return;
      }
    }
    setWarnings(null);
    try {
      const result = await save.mutateAsync(parsed.data);
      setAffected(result.affectedReservations);
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  const errorAt = (prefix: string) => Object.entries(errors).find(([path]) => path.startsWith(prefix))?.[1];

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      <section className="card form">
        <h2>Horário de funcionamento</h2>
        <p className="muted small-text">Vale de segunda a sexta. As reservas precisam começar e terminar dentro desse horário.</p>
        <div className="form-grid">
          <label className="field">
            <span>Abertura</span>
            <input type="time" value={openingTime} onChange={(event) => setOpeningTime(event.target.value)} />
            <FieldError message={errors.openingTime} />
          </label>
          <label className="field">
            <span>Encerramento</span>
            <input type="time" value={closingTime} onChange={(event) => setClosingTime(event.target.value)} />
            <FieldError message={errors.closingTime} />
          </label>
          <label className="field">
            <span>Intervalo dos horários</span>
            <select value={slotMinutes} onChange={(event) => setSlotMinutes(Number(event.target.value))}>
              {SLOT_MINUTES_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} minutos
                </option>
              ))}
            </select>
            <FieldError message={errors.slotMinutes} />
          </label>
        </div>
      </section>

      <section className="card form">
        <h2>Grades de aulas</h2>
        <p className="muted small-text">
          Cada grade tem as próprias aulas e intervalos. Ao reservar por aula, a grade é escolhida pela turma marcada abaixo.
        </p>
        {schedules.length === 0 && <StatusMessage kind="empty">Nenhuma grade cadastrada.</StatusMessage>}
        {schedules.map((schedule, scheduleIndex) => (
          <div key={schedule.key} className="stack schedule-card">
            <div className="schedule-header">
              <label className="field">
                <span>Nome da grade</span>
                <input
                  value={schedule.name}
                  maxLength={60}
                  placeholder="Ex.: 6º A, 6º B e 7º ano"
                  onChange={(event) => updateSchedule(schedule.key, (current) => ({ ...current, name: event.target.value }))}
                />
                <FieldError message={errors[`schedules.${scheduleIndex}.name`]} />
              </label>
              <button
                type="button"
                className="button link danger-text"
                onClick={() => setSchedules((current) => current.filter((item) => item.key !== schedule.key))}
              >
                Remover grade
              </button>
            </div>
            <fieldset className="class-picker">
              <legend>Turmas que usam esta grade (escolhida automaticamente ao reservar)</legend>
              {SCHOOL_CLASSES.map((schoolClass) => {
                const owner = schedules.find((item) => item.key !== schedule.key && item.classNames.includes(schoolClass));
                return (
                  <label key={schoolClass} className="field checkbox" title={owner ? `Já está em ${owner.name}` : undefined}>
                    <input
                      type="checkbox"
                      checked={schedule.classNames.includes(schoolClass)}
                      disabled={Boolean(owner)}
                      onChange={(event) =>
                        updateSchedule(schedule.key, (current) => ({
                          ...current,
                          classNames: event.target.checked
                            ? SCHOOL_CLASSES.filter((item) => item === schoolClass || current.classNames.includes(item))
                            : current.classNames.filter((item) => item !== schoolClass),
                        }))
                      }
                    />
                    <span>{schoolClass}</span>
                  </label>
                );
              })}
              <FieldError message={errors[`schedules.${scheduleIndex}.classNames`]} />
            </fieldset>
            {schedule.periods.map((period, periodIndex) => (
              <div key={period.key} className="period-row">
                <label className="field">
                  <span>Aula</span>
                  <input
                    value={period.name}
                    maxLength={40}
                    onChange={(event) => updatePeriod(schedule.key, period.key, { name: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Início</span>
                  <input
                    type="time"
                    value={period.startTime}
                    onChange={(event) => updatePeriod(schedule.key, period.key, { startTime: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Término</span>
                  <input
                    type="time"
                    value={period.endTime}
                    onChange={(event) => updatePeriod(schedule.key, period.key, { endTime: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="button link danger-text"
                  aria-label={`Remover ${period.name}`}
                  onClick={() =>
                    updateSchedule(schedule.key, (current) => ({
                      ...current,
                      periods: current.periods.filter((item) => item.key !== period.key),
                    }))
                  }
                >
                  Remover
                </button>
                <FieldError message={errorAt(`schedules.${scheduleIndex}.periods.${periodIndex}.`)} />
              </div>
            ))}
            <FieldError message={errors[`schedules.${scheduleIndex}.periods`]} />
            <div>
              <button
                type="button"
                className="button secondary"
                disabled={schedule.periods.length >= MAX_CLASS_PERIODS}
                onClick={() => addPeriod(schedule.key)}
              >
                Adicionar aula
              </button>
            </div>
          </div>
        ))}
        <FieldError message={errors.schedules} />
        <div>
          <button type="button" className="button secondary" disabled={schedules.length >= MAX_CLASS_SCHEDULES} onClick={addSchedule}>
            Adicionar grade
          </button>
        </div>
      </section>

      <section className="card form">
        <h2>Aviso de novos pedidos</h2>
        <label className="field">
          <span>E-mails que recebem os pedidos para aprovar (um por linha)</span>
          <textarea value={emails} rows={3} onChange={(event) => setEmails(event.target.value)} />
          <FieldError message={errorAt("notificationEmails")} />
        </label>
      </section>

      {save.isError && <StatusMessage kind="error">{errorMessage(save.error)}</StatusMessage>}
      {save.isSuccess && affected && (
        <>
          <StatusMessage kind="success">Configurações salvas.</StatusMessage>
          <AffectedReservations reservations={affected} intro="Fora do novo horário," />
        </>
      )}
      {warnings ? (
        <ImpactConfirmation
          title="Confira antes de salvar"
          consequences={warnings}
          reservations={[]}
          confirmLabel="Salvar mesmo assim"
          busy={save.isPending}
          onBack={() => setWarnings(null)}
          onConfirm={() => handleSubmit({ preventDefault() {} } as FormEvent, true)}
        />
      ) : (
        <div className="actions">
          <button type="submit" className="button primary" disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar configurações"}
          </button>
        </div>
      )}
    </form>
  );
}

export function SettingsPage() {
  const settings = useAdminSettings();
  if (settings.isPending) return <StatusMessage kind="loading">Carregando configurações…</StatusMessage>;
  if (settings.isError) return <StatusMessage kind="error">{errorMessage(settings.error)}</StatusMessage>;
  return (
    <div className="stack">
      <PublicLinkSection accessCode={settings.data.publicAccessCode} />
      <SettingsForm settings={settings.data} />
    </div>
  );
}
