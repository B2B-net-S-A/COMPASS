import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * GET /api/internal/sales-signals
 * GET /api/internal/sales-signals?since=2026-09-01T10:00:00Z
 *
 * Eksport SYGNAŁÓW SPRZEDAŻOWYCH dla ATLASA (CRM).
 *
 * PO CO: Talent Community Managerowie pytają konsultantów podczas onboardingu
 * i rozmów lifecycle, czy wiedzą o potrzebach u swojego klienta. Do tej pory
 * odpowiedzi lądowały w `lifecycle_notes` (is_private domyślnie TRUE) i nie
 * docierały do handlu — a to najtańszy lead, jaki firma ma, bo pochodzi od
 * kogoś, kto siedzi u klienta i wie, czego ten klient szuka.
 *
 * DLACZEGO WŁASNY SEKRET, A NIE `CRON_SECRET`: ten sam `CRON_SECRET` odblokowuje
 * `/api/migrate-compliance`, czyli zdolność uruchomienia DDL na bazie COMPASSA.
 * Nie jest to też `WORKDAYS_EXPORT_SECRET` ani `ROSTER_EXPORT_SECRET` — każdy
 * z nich otwiera dokładnie JEDNĄ trasę i ta własność ma zostać.
 *
 * DLACZEGO TYLKO GET: wszystkie trasy w `app/api/internal/` są odczytowe.
 * Sekret, który potrafi jedynie czytać, ma dużo mniejszy promień rażenia niż
 * taki, który potrafi też pisać. ATLAS nie potwierdza odbioru — trzyma własny
 * znacznik postępu i pyta o nachodzące okno, a idempotencja po stronie
 * konsumenta sprawia, że powtórka nic nie kosztuje.
 *
 * CZEGO TA TRASA NIE ODDAJE: niczego z kartoteki kadrowej poza imieniem
 * i e-mailem konsultanta oraz e-mailem zgłaszającego. Nie stawek
 * (`user_rates`), nie roli, nie managera, nie statusu zatrudnienia, nie dat.
 * Kontrakt wymusza sygnatura funkcji `public.atlas_sales_signals_export`,
 * nie dyscyplina tego handlera — nie da się stąd przypadkiem wyciągnąć
 * więcej, nawet zmieniając ten plik.
 */

export const dynamic = "force-dynamic";

/**
 * Akceptuje pełny ISO-8601. Pusty parametr = pełny eksport (pierwszy przebieg
 * konsumenta backfilluje wszystko, co trzymamy).
 *
 * Zła data jest ODRZUCANA, nie cicho zamieniana na NULL: literówka w `since`
 * zamieniłaby przyrostowe odpytanie w pełny skan przy każdym cyklu, i nikt
 * by tego nie zauważył poza rachunkiem za czas bazy.
 */
function parseSince(value: string | null): { ok: true; value: string | null } | { ok: false } {
  if (!value) return { ok: true, value: null };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { ok: false };
  return { ok: true, value: d.toISOString() };
}

export async function GET(request: NextRequest): Promise<Response> {
  const secret = process.env.SALES_SIGNALS_EXPORT_SECRET;
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

  const url = new URL(request.url);
  const since = parseSince(url.searchParams.get("since"));
  if (!since.ok) {
    return NextResponse.json(
      { error: "since musi być datą ISO-8601 (np. 2026-09-01T10:00:00Z)" },
      { status: 422 },
    );
  }

  const admin = createServiceClient();
  const { data, error } = await admin.rpc("atlas_sales_signals_export", {
    p_since: since.value,
  });

  if (error) {
    logger.error({ event: "sales_signals.export.failed", msg: error.message });
    // Generyczny komunikat — szczegóły bazy nie wychodzą na zewnątrz.
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }

  type Row = {
    id: string;
    company_name: string;
    need: string;
    contact_hint: string | null;
    context: string | null;
    reported_by_email: string | null;
    consultant_name: string | null;
    consultant_email: string | null;
    created_at: string;
  };

  const rows = (data ?? []) as Row[];

  return NextResponse.json({
    // Konsument traktuje PUSTĄ listę jako awarię po naszej stronie, nie jako
    // „nikt nic nie zgłosił" — i słusznie. Zwracamy `count`, żeby ta decyzja
    // dała się podjąć bez liczenia tablicy po drugiej stronie.
    count: rows.length,
    // Mapowanie POLE PO POLU, nie spreadem. Spread przepuściłby na zewnątrz
    // każdą kolumnę dorzuconą kiedyś do funkcji eksportowej — a to właśnie
    // ten handler jest ostatnim miejscem, w którym widać, co wychodzi.
    signals: rows.map((r) => ({
      id: r.id,
      company_name: r.company_name,
      need: r.need,
      contact_hint: r.contact_hint,
      context: r.context,
      reported_by_email: r.reported_by_email,
      consultant_name: r.consultant_name,
      consultant_email: r.consultant_email,
      created_at: r.created_at,
    })),
  });
}
