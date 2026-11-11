import { useState, type FormEvent } from "react";
import {
  MAX_CLASS_PERIODS,
  minutesToTime,
  schoolSettingsInputSchema,
  SLOT_MINUTES_OPTIONS,
  timeToMinutes,
  type AdminReservationDto,
  type SchoolSettingsDto,
} from "@chromebook/shared";
import { useAdminSettings, useSaveSettings } from "../../api/hooks";
import { errorMessage } from "../../api/client";
import { StatusMessage } from "../../components/StatusMessage";
import { FieldError } from "../../components/FieldError";
import { AffectedReservations } from "../../features/admin/AffectedReservations";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "../../lib/form-errors";

interface PeriodRow {
  key: number;
  name: string;
  startTime: string;
  endTime: string;
}

const DEFAULT_PERIOD_MINUTES = 50;

function SettingsForm({ settings }: { settings: SchoolSettingsDto }) {
  const [openingTime, setOpeningTime] = useState(settings.openingTime);
  const [closingTime, setClosingTime] = useState(settings.closingTime);
  const [slotMinutes, setSlotMinutes] = useState(settings.slotMinutes);
  const [emails, setEmails] = useState(settings.notificationEmails.join("\n"));
  const [periods, setPeriods] = useState<PeriodRow[]>(() => settings.periods.map((period, index) => ({ key: index, ...period })));
  const [nextKey, setNextKey] = useState(settings.periods.length);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [affected, setAffected] = useState<AdminReservationDto[] | null>(null);
  const save = useSaveSettings();

  const updatePeriod = (key: number, changes: Partial<PeriodRow>) =>
    setPeriods((current) => current.map((period) => (period.key === key ? { ...period, ...changes } : period)));

  function addPeriod() {
    const last = periods.at(-1);
    const start = last ? timeToMinutes(last.endTime) : timeToMinutes(openingTime);
    const end = Math.min(start + DEFAULT_PERIOD_MINUTES, 23 * 60 + 55);
    setPeriods((current) => [
      ...current,
      { key: nextKey, name: `${current.length + 1}ª aula`, startTime: minutesToTime(start), endTime: minutesToTime(end) },
    ]);
    setNextKey(nextKey + 1);
  }

  async function handleSubmit(event: FormEvent) {
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
      periods: periods.map(({ name, startTime, endTime }) => ({ name, startTime, endTime })),
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    try {
      const result = await save.mutateAsync(parsed.data);
      setAffected(result.affectedReservations);
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  const emailError = Object.entries(errors).find(([path]) => path.startsWith("notificationEmails"))?.[1];
  const periodError = (index: number) =>
    Object.entries(errors).find(([path]) => path.startsWith(`periods.${index}.`))?.[1];

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
        <h2>Aulas</h2>
        <p className="muted small-text">O professor pode escolher o horário pelas aulas ao reservar.</p>
        {periods.length === 0 && <StatusMessage kind="empty">Nenhuma aula cadastrada.</StatusMessage>}
        {periods.map((period, index) => (
          <div key={period.key} className="period-row">
            <label className="field">
              <span>Nome</span>
              <input value={period.name} maxLength={40} onChange={(event) => updatePeriod(period.key, { name: event.target.value })} />
            </label>
            <label className="field">
              <span>Início</span>
              <input type="time" value={period.startTime} onChange={(event) => updatePeriod(period.key, { startTime: event.target.value })} />
            </label>
            <label className="field">
              <span>Término</span>
              <input type="time" value={period.endTime} onChange={(event) => updatePeriod(period.key, { endTime: event.target.value })} />
            </label>
            <button
              type="button"
              className="button link danger-text"
              aria-label={`Remover ${period.name}`}
              onClick={() => setPeriods((current) => current.filter((item) => item.key !== period.key))}
            >
              Remover
            </button>
            <FieldError message={periodError(index)} />
          </div>
        ))}
        <FieldError message={errors.periods} />
        <div>
          <button type="button" className="button secondary" disabled={periods.length >= MAX_CLASS_PERIODS} onClick={addPeriod}>
            Adicionar aula
          </button>
        </div>
      </section>

      <section className="card form">
        <h2>Aviso de novas reservas</h2>
        <label className="field">
          <span>E-mails que recebem cada nova reserva (um por linha)</span>
          <textarea value={emails} rows={3} onChange={(event) => setEmails(event.target.value)} />
          <FieldError message={emailError} />
        </label>
      </section>

      {save.isError && <StatusMessage kind="error">{errorMessage(save.error)}</StatusMessage>}
      {save.isSuccess && affected && (
        <>
          <StatusMessage kind="success">Configurações salvas.</StatusMessage>
          <AffectedReservations reservations={affected} intro="Fora do novo horário," />
        </>
      )}
      <div className="actions">
        <button type="submit" className="button primary" disabled={save.isPending}>
          {save.isPending ? "Salvando…" : "Salvar configurações"}
        </button>
      </div>
    </form>
  );
}

export function SettingsPage() {
  const settings = useAdminSettings();
  if (settings.isPending) return <StatusMessage kind="loading">Carregando configurações…</StatusMessage>;
  if (settings.isError) return <StatusMessage kind="error">{errorMessage(settings.error)}</StatusMessage>;
  return <SettingsForm settings={settings.data} />;
}
