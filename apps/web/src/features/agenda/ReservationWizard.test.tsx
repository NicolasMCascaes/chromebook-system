import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CalendarDto } from "@chromebook/shared";
import { ReservationWizard } from "./ReservationDialog";

vi.mock("../../lib/env", () => ({ env: { apiUrl: "http://api.teste", devAuth: true, supabaseUrl: "", supabaseAnonKey: "" } }));

const schedule: Pick<CalendarDto, "schedules" | "carts" | "hours" | "today"> = {
  today: "2030-03-04",
  hours: { openingTime: "07:00", closingTime: "12:00", slotMinutes: 5 },
  schedules: [
    {
      id: "s1",
      name: "Manhã",
      classNames: ["7º ano"],
      periods: [{ id: "p1", name: "1ª aula", startTime: "07:20", endTime: "08:10" }],
    },
  ],
  carts: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Carrinho Azul",
      description: null,
      color: "#1565c0",
      displayOrder: 0,
      active: true,
      equipment: { total: 30, available: 28, maintenance: 2, inactive: 0 },
      createdAt: "2030-01-01T00:00:00Z",
      updatedAt: "2030-01-01T00:00:00Z",
    },
  ],
};

function render(rememberedName: string): string {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <ReservationWizard schedule={schedule} prefill={{ date: "2030-03-05" }} onClose={() => undefined} rememberedName={rememberedName} />
    </QueryClientProvider>,
  );
}

describe("tela do assistente de reserva", () => {
  it("com o nome lembrado, abre direto nos horários e mostra o nome como etiqueta", () => {
    const html = render("Ana Souza");

    expect(html).toContain("Passo <!-- -->2<!-- --> de <!-- -->3");
    expect(html).toContain("Ana Souza");
    expect(html).toContain("trocar");
    expect(html).not.toContain("Seu nome");
    expect(html).toContain("7º ano");
    expect(html).toContain("Carrinho Azul");
    expect(html).toContain("Adicionar à lista");
  });

  it("sem nome lembrado, começa pedindo o nome", () => {
    const html = render("");

    expect(html).toContain("Passo <!-- -->1<!-- --> de <!-- -->3");
    expect(html).toContain("Seu nome");
    expect(html).toContain("Continuar");
  });
});
