import type { CalendarController } from "@fullcalendar/react";
import type { CalendarView } from "./ScheduleCalendar";

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: "dayGridMonth", label: "Mês" },
  { value: "timeGridWeek", label: "Semana" },
  { value: "timeGridDay", label: "Dia" },
];

interface AgendaToolbarProps {
  controller: CalendarController;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
}

export function AgendaToolbar({ controller, view, onViewChange }: AgendaToolbarProps) {
  const title = controller.view?.title ?? "";

  return (
    <div className="agenda-toolbar">
      <div className="agenda-nav">
        <button type="button" className="button secondary" onClick={() => controller.today()}>
          Hoje
        </button>
        <button type="button" className="icon-button bordered" aria-label="Período anterior" onClick={() => controller.prev()}>
          ‹
        </button>
        <button type="button" className="icon-button bordered" aria-label="Próximo período" onClick={() => controller.next()}>
          ›
        </button>
        <h2 className="agenda-title" aria-live="polite">
          {title}
        </h2>
      </div>
      <div className="segmented" role="radiogroup" aria-label="Visualização">
        {VIEWS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={view === option.value}
            className={view === option.value ? "is-active" : undefined}
            onClick={() => {
              controller.changeView(option.value);
              onViewChange(option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
