function dateFromIso(date: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

const longDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDateLong(date: string): string {
  return capitalize(longDateFormatter.format(dateFromIso(date)));
}

export function formatDateShort(date: string): string {
  return shortDateFormatter.format(dateFromIso(date));
}

export function formatWeekday(date: string): string {
  return capitalize(weekdayFormatter.format(dateFromIso(date)));
}

export function formatTimeRange(start: string, end: string): string {
  return `${start} às ${end}`;
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
