import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { bearerSecretMatches } from "@/lib/api/bearer-secret";
import { createServiceClient } from "@/lib/supabase/admin";
import { selectInChunks } from "@/lib/supabase/select-in-chunks";
import { logger } from "@/lib/logger";

/**
 * POST /api/internal/sales-signals/status
 *
 * Zwrot statusu sygnału sprzedażowego z ATLASA (audyt integracji 14.09, INT-10).
 *
 * PO CO: TCM zgłaszał sygnał „klient szuka ludzi" i nie wiedział, czy sprzedaż
 * cokolwiek z nim zrobiła. ATLAS po konwersji w szansę albo archiwizacji
 * („nie dla nas") odsyła tu paczkę statusów; karta rozmowy pokazuje wynik.
 *
 * DLACZEGO OSOBNY SEKRET (`SALES_SIGNALS_STATUS_SECRET`): eksport sygnałów to
 * odczyt, ta trasa PISZE. Inny kierunek, inny promień rażenia — wyciek sekretu
 * eksportu nie może pozwolić fałszować statusów i odwrotnie.
 *
 * KONTRAKT:
 *   body `{ updates: [{ signal_id, status: converted|archived, deal_id,
 *          deal_title, handled_by_name, handled_by_email, reason, handled_at }] }`,
 *   najwyżej 200 pozycji; 422 przy niepoprawnym kształcie.
 *   Zapis tylko gdy `handled_at >= zapisany` (odporność na kolejność i powtórki).
 *   Nieznany `signal_id` nie jest błędem — trafia do `unknown` (karta mogła
 *   zostać usunięta albo przestać być sygnałem).
 *   Odpowiedź 200 `{ accepted, ignored_stale, unknown }`.
 */

export const dynamic = "force-dynamic";

const MAX_UPDATES = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (max: number) => z.string().max(max).nullable().optional();

const updateSchema = z.object({
  signal_id: z.string().min(1).max(100),
  status: z.enum(["converted", "archived"]),
  deal_id: text(200),
  deal_title: text(500),
  handled_by_name: text(200),
  handled_by_email: text(320),
  reason: text(2000),
  handled_at: z.iso.datetime({ offset: true }),
});

const bodySchema = z.object({
  updates: z.array(updateSchema).max(MAX_UPDATES),
});

type Update = z.infer<typeof updateSchema>;

type StatusRow = {
  card_id: string;
  status: string;
  atlas_deal_id: string | null;
  atlas_deal_title: string | null;
  handled_by_name: string | null;
  handled_by_email: string | null;
  reason: string | null;
  handled_at: string;
  received_at: string;
};

function reply(body: unknown, status = 200): Response {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.SALES_SIGNALS_STATUS_SECRET;
  if (!secret) {
    // 503, nie 401: „nie skonfigurowano" to inny stan niż „zły sekret".
    return reply({ error: "Not configured" }, 503);
  }
  if (!bearerSecretMatches(request.headers.get("authorization"), secret)) {
    return reply({ error: "Unauthorized" }, 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return reply({ error: "Niepoprawny JSON" }, 422);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return reply(
      {
        error: `Niepoprawna paczka statusów (max ${MAX_UPDATES} pozycji)`,
        issues: parsed.error.issues.slice(0, 10).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      422,
    );
  }

  // Duplikaty w jednej paczce: wygrywa najnowszy handled_at.
  // Klucz deduplikacji to identyfikator PO normalizacji (audyt 2026-09-22, INT-16):
  // UUID_RE jest case-insensitive, a zapis idzie już małymi literami, więc ta sama
  // karta raz lower, raz UPPER dawała dwa wiersze o jednym card_id w jednym upsercie
  // — Postgres odrzuca wtedy CAŁĄ paczkę („cannot affect row a second time").
  const latest = new Map<string, Update>();
  for (const u of parsed.data.updates) {
    const key = u.signal_id.toLowerCase();
    const prev = latest.get(key);
    if (!prev || Date.parse(u.handled_at) >= Date.parse(prev.handled_at)) {
      latest.set(key, u);
    }
  }

  const unknown: string[] = [];
  const candidates: Update[] = [];
  for (const u of Array.from(latest.values())) {
    // Nie-UUID nie może być kartą — zapytanie z nim wywróciłoby się na typie kolumny.
    if (UUID_RE.test(u.signal_id)) candidates.push(u);
    else unknown.push(u.signal_id);
  }

  const admin = createServiceClient();
  try {
    const ids = candidates.map((u) => u.signal_id.toLowerCase());
    const [cards, stored] = await Promise.all([
      selectInChunks<{ id: string }>({
        source: "tech_interview_cards",
        column: "id",
        ids,
        query: () => admin.from("tech_interview_cards").select("id"),
      }),
      selectInChunks<{ card_id: string; handled_at: string }>({
        source: "tech_card_sales_status",
        column: "card_id",
        ids,
        query: () => admin.from("tech_card_sales_status").select("card_id, handled_at"),
      }),
    ]);

    const known = new Set(cards.map((c) => c.id.toLowerCase()));
    const storedAt = new Map(
      stored.map((s) => [s.card_id.toLowerCase(), Date.parse(s.handled_at)]),
    );
    const receivedAt = new Date().toISOString();

    let ignoredStale = 0;
    const rows: StatusRow[] = [];
    for (const u of candidates) {
      const id = u.signal_id.toLowerCase();
      if (!known.has(id)) {
        unknown.push(u.signal_id);
        continue;
      }
      const previous = storedAt.get(id);
      if (previous !== undefined && Date.parse(u.handled_at) < previous) {
        ignoredStale += 1;
        continue;
      }
      rows.push({
        card_id: id,
        status: u.status,
        atlas_deal_id: u.deal_id ?? null,
        atlas_deal_title: u.deal_title ?? null,
        handled_by_name: u.handled_by_name ?? null,
        handled_by_email: u.handled_by_email ?? null,
        reason: u.reason ?? null,
        handled_at: new Date(u.handled_at).toISOString(),
        received_at: receivedAt,
      });
    }

    if (rows.length > 0) {
      const { error } = await admin
        .from("tech_card_sales_status")
        .upsert(rows, { onConflict: "card_id" });
      if (error) throw new Error(error.message);
    }

    logger.info({
      event: "sales_signals.status.received",
      accepted: rows.length,
      ignored_stale: ignoredStale,
      unknown: unknown.length,
    });
    return reply({ accepted: rows.length, ignored_stale: ignoredStale, unknown });
  } catch (e) {
    logger.error({
      event: "sales_signals.status.failed",
      msg: e instanceof Error ? e.message : String(e),
    });
    // Generyczny komunikat — szczegóły bazy nie wychodzą na zewnątrz.
    return reply({ error: "Status update failed" }, 500);
  }
}
