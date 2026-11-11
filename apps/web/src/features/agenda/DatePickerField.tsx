import { useMemo, useState } from "react";
import { DayButton, DayPicker, type DayButtonProps } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { schoolNow, type CalendarDto } from "@chromebook/shared";
import { useCalendar } from "../../api/hooks";
import { formatDateLong } from "../../lib/format";
import { computeDayStatus, type DayStatus } from "./schedule-model";

interface DatePickerFieldProps {
  value: string;
  cartIds: string[];
  onChange: (date: string) => void;
}

const UNAVAILABLE_KINDS = new Set<DayStatus["kind"]>(["closed", "blocked", "full"]);

function toIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromIso(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

function monthRange(month: Date) {
  return {
    from: toIso(new Date(month.getFullYear(), month.getMonth(), 1)),
    to: toIso(new Date(month.getFullYear(), month.getMonth() + 1, 0)),
  };
}

function dayTitle(status: DayStatus | undefined): string | undefined {
  if (!status) return undefined;
  if (status.kind === "blocked") return status.blockReason;
  if (status.kind === "full") return "Sem horários livres";
  if (status.kind === "closed") return "Sem aula ou data já passou";
  return undefined;
}

export function DatePickerField({ value, cartIds, onChange }: DatePickerFieldProps) {
  const now = useMemo(() => schoolNow(new Date()), []);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => fromIso(value));
  const calendar = useCalendar(monthRange(month));

  const statusOf = useMemo(() => {
    const cache = new Map<string, DayStatus>();
    const data: Pick<CalendarDto, "hours" | "blocks" | "reservations"> | undefined = calendar.data;
    return (date: Date): DayStatus | undefined => {
      const iso = toIso(date);
      if (!data) return iso < now.date ? { kind: "closed", label: "", reservationCount: 0 } : undefined;
      let status = cache.get(iso);
      if (!status) {
        status = computeDayStatus(iso, data, cartIds, now);
        cache.set(iso, status);
      }
      return status;
    };
  }, [calendar.data, cartIds, now]);

  const isKind = (kind: DayStatus["kind"]) => (date: Date) => statusOf(date)?.kind === kind;

  const components = useMemo(
    () => ({
      DayButton: (props: DayButtonProps) => <DayButton {...props} title={dayTitle(statusOf(props.day.date))} />,
    }),
    [statusOf],
  );

  return (
    <div className="date-picker">
      <button
        type="button"
        className="date-picker-trigger"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{formatDateLong(value)}</span>
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="date-picker-panel">
          <DayPicker
            mode="single"
            locale={ptBR}
            weekStartsOn={1}
            required
            selected={fromIso(value)}
            month={month}
            onMonthChange={setMonth}
            startMonth={fromIso(now.date)}
            disabled={(date) => UNAVAILABLE_KINDS.has(statusOf(date)?.kind ?? "empty")}
            modifiers={{ closed: isKind("closed"), blocked: isKind("blocked"), full: isKind("full"), partial: isKind("available") }}
            modifiersClassNames={{ closed: "day-closed", blocked: "day-blocked", full: "day-full", partial: "day-partial" }}
            components={components}
            onSelect={(date) => {
              if (!date) return;
              onChange(toIso(date));
              setOpen(false);
            }}
          />
          <p className="date-picker-legend">
            <span className="legend-closed">Cinza: sem aula ou já passou</span>
            <span className="legend-blocked">Vermelho: bloqueado ou sem horários livres</span>
            <span className="legend-partial">Ponto: já tem reservas, mas há horários livres</span>
          </p>
          {calendar.isFetching && <p className="muted small-text">Carregando disponibilidade do mês…</p>}
        </div>
      )}
    </div>
  );
}
