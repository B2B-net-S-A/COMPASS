import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * GET /api/internal/roster
 *
 * Eksport ROSTERU dla NEXUSA (Etap 5 integracji COMPASS ↔ NEXUS).
 *
 * PO CO: COMPASS jest źródłem prawdy o zatrudnieniu — `employment_status`
 * odbiera dostęp w trzech warstwach. NEXUS flipuje `users.is_active` RĘCZNIE,
 * więc konto osoby, która odeszła, bywa tam aktywne jeszcze długo po ostatnim
 * dniu pracy.
 *
 * DLACZEGO WŁASNY SEKRET, A NIE `CRON_SECRET`: ten sam `CRON_SECRET`
 * odblokowuje `/api/migrate-compliance`, czyli zdolność uruchomienia DDL na
 * bazie COMPASSA. Nie jest to też `WORKDAYS_EXPORT_SECRET` — tamten otwiera
 * dokładnie JEDNĄ trasę i ta własność ma zostać.
 *
 * CZEGO TA TRASA NIE ODDAJE: niczego poza adresem i statusem zatrudnienia.
 * Nie nazwiska, nie stanowiska, nie managera, nie stawek (`user_rates`), nie
 * dat zatrudnienia — a `profiles` to pełna kartoteka kadrowa. NEXUS
 * potrzebuje odpowiedzi na jedno pytanie: „czy ta osoba u nas jeszcze
 * pracuje". Kontrakt wymusza sygnatura funkcji `public.nexus_roster_export`,
 * nie dyscyplina tego handlera — nie da się stąd przypadkiem wyciągnąć
 * więcej, nawet zmieniając ten plik.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const secret = process.env.ROSTER_EXPORT_SECRET;
  if (!secret) {
    // 503, nie 401: „nie skonfigurowano" to inny stan niż „zły sekret",
    // a mylenie ich zamienia brak wdrożenia w pozorny problem z hasłem.
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  // Wyłącznie nagłówek. Bez fallbacku na `?secret=` — query stringi lądują
  // w access logach pośredników, a ten sekret ma żyć długo.
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!provided || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient();
  const { data, error } = await admin.rpc("nexus_roster_export");

  if (error) {
    logger.error({ event: "roster.export.failed", msg: error.message });
    // Generyczny komunikat — szczegóły bazy nie wychodzą na zewnątrz.
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }

  type Row = { email: string; employment_status: string | null };
  const rows = (data ?? []) as Row[];

  // Konsument (NEXUS) traktuje PUSTĄ listę jako awarię po naszej stronie, nie
  // jako „wszyscy odeszli" — i słusznie. Zwracamy `count`, żeby ta decyzja
  // dała się podjąć bez liczenia tablicy po drugiej stronie.
  return NextResponse.json({
    count: rows.length,
    people: rows.map((r) => ({
      email: r.email,
      employment_status: r.employment_status,
    })),
  });
}
