import { randomUUID } from "node:crypto";
import { addDays, isWeekend, schoolNow } from "@chromebook/shared";
import { createDatabase } from "../src/lib/db/client";
import { calendarBlocks, carts, chromebooks, reservations, users } from "../src/lib/db/schema";
import { readServerEnv } from "../src/lib/env";

const env = readServerEnv();
if (!env.DEV_AUTH_SECRET) {
  console.error("seed-demo só roda com DEV_AUTH_SECRET definido (ambiente de demonstração).");
  process.exit(1);
}

const { db, client } = createDatabase(env.DATABASE_URL, { max: 1 });

function schoolDay(offset: number): string {
  let date = schoolNow(new Date()).date;
  let remaining = offset;
  const step = offset >= 0 ? 1 : -1;
  while (isWeekend(date)) date = addDays(date, 1);
  while (remaining !== 0) {
    date = addDays(date, step);
    if (!isWeekend(date)) remaining -= step;
  }
  return date;
}

try {
  const existing = await db.select({ id: carts.id }).from(carts).limit(1);
  if (existing.length > 0) {
    console.log("O banco já possui carrinhos; nada foi alterado.");
    process.exit(0);
  }

  const [admin] = (await db
    .insert(users)
    .values({ id: randomUUID(), email: "admin@escola.demo", name: "TI", role: "ADMIN" })
    .returning({ id: users.id })) as [{ id: string }];

  const [acer, samsung] = (await db
    .insert(carts)
    .values([
      { name: "Carrinho 1", description: "Acer Chromebook 311", color: "#2e7d32", displayOrder: 1 },
      { name: "Carrinho 2", description: "Samsung Chromebook 4", color: "#6a1b9a", displayOrder: 2 },
    ])
    .returning({ id: carts.id })) as [{ id: string }, { id: string }];

  const devices = Array.from({ length: 30 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return [
      {
        assetTag: `ACER-${number}`,
        name: `Acer ${number}`,
        brandModel: "Acer Chromebook 311",
        cartId: acer.id,
        status: index < 2 ? ("MAINTENANCE" as const) : ("AVAILABLE" as const),
      },
      {
        assetTag: `SAMS-${number}`,
        name: `Samsung ${number}`,
        brandModel: "Samsung Chromebook 4",
        cartId: samsung.id,
        status: index < 5 ? ("MAINTENANCE" as const) : ("AVAILABLE" as const),
      },
    ];
  }).flat();
  await db.insert(chromebooks).values(devices);

  const booking = (
    cartId: string,
    teacherName: string,
    offset: number,
    startTime: string,
    endTime: string,
    className: string,
    notes: string | null = null,
  ) => ({
    cartId,
    teacherName,
    className,
    reservationDate: schoolDay(offset),
    startTime,
    endTime,
    notes,
    idempotencyKey: randomUUID(),
    requestHash: "seed",
  });

  await db.insert(reservations).values([
    booking(acer.id, "Ana Souza", 0, "07:20", "09:00", "7º A", "Pesquisa sobre biomas"),
    booking(samsung.id, "Bruno Lima", 0, "10:10", "11:00", "8º B"),
    booking(acer.id, "Carla Dias", 1, "07:20", "11:50", "9º A", "Simulado on-line"),
    booking(samsung.id, "Bruno Lima", 1, "07:20", "11:50", "6º C"),
    booking(acer.id, "Ana Souza", 2, "09:00", "09:50", "7º B"),
    booking(samsung.id, "Carla Dias", 3, "08:10", "09:50", "1º EM"),
    booking(acer.id, "Bruno Lima", 5, "10:10", "11:50", "8º A"),
    booking(acer.id, "Ana Souza", -1, "08:10", "09:00", "7º A"),
  ]);

  await db.insert(calendarBlocks).values([
    { kind: "HOLIDAY_MUNICIPAL", startDate: schoolDay(8), endDate: schoolDay(8), reason: "Aniversário da cidade", createdBy: admin.id },
    { kind: "BLOCK", startDate: schoolDay(4), endDate: schoolDay(4), reason: "Manutenção preventiva", cartId: samsung.id, createdBy: admin.id },
  ]);

  console.log("Dados de demonstração criados.");
} finally {
  await client.end();
}
