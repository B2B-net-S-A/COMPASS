import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * GET /api/internal/workdays?from=2026-01&to=2026-08
 *
 * Eksport DNI ROBOCZYCH dla NEXUSA (decyzja D5).
 *
 * PO CO: NEXUS ocenia rekruterów wskaźnikami „na dzień" (Power Calling, CV/MD),
 * a nie zna nieobecności — do 2026-08-31 dzielił przez sztywne 5 dni, przez co
 * osoba na urlopie lądowała na imiennej liście „poniżej progu".
 *
 * DLACZEGO WŁASNY SEKRET, A NIE `CRON_SECRET`: ten sam `CRON_SECRET` odblokowuje
 * `/api/migrate-compliance`, czyli zdolność uruchomienia DDL na bazie COMPASSA.
 * Wydanie go NEXUSOWI oznaczałoby oddanie mu tej możliwości przy okazji eksportu
 * liczby dni urlopu. `WORKDAYS_EXPORT_SECRET` otwiera wyłącznie tę jedną trasę.
 *
 * CZEGO TA TRASA NIE ODDAJE: typu nieobecności, notatek, dokumentacji ani decyzji.
 * `leave_type` to dana o zdrowiu (`sick_leave`, `parental_leave`), a `note` zawiera
 * w produkcji wolny tekst medyczny. Kontrakt wymusza sygnatura funkcji
 * `public.nexus_workdays_export`, nie dyscyplina tego handlera — nie da się stąd
 * przypadkiem wyciągnąć więcej, nawet zmieniając ten plik.
 */

const MAX_MONTHS = 24;

function parseMonth(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [y, m] = value.split("-").map(Number);
  if (m < 1 || m > 12 || y < 2000 || y > 2100) return null;
  return `${value}-01`;
}

export async function GET(request: NextRequest): Promise<Response> {
  const secret = process.env.WORKDAYS_EXPORT_SECRET;
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
  const from = parseMonth(url.searchParams.get("from"));
  const to = parseMonth(url.searchParams.get("to"));
  if (!from || !to) {
    return NextResponse.json(
      { error: "from i to są wymagane w formacie YYYY-MM" },
      { status: 422 },
    );
  }
  if (from > to) {
    return NextResponse.json(
      { error: "from nie może być późniejsze niż to" },
      { status: 422 },
    );
  }

  const months =
    (new Date(to).getFullYear() - new Date(from).getFullYear()) * 12 +
    (new Date(to).getMonth() - new Date(from).getMonth()) +
    1;
  if (months > MAX_MONTHS) {
    return NextResponse.json(
      {
        error: `Zakres maksymalnie ${MAX_MONTHS} miesięcy (zażądano ${months})`,
      },
      { status: 422 },
    );
  }

  const admin = createServiceClient();
  const { data, error } = await admin.rpc("nexus_workdays_export", {
    p_from: from,
    p_to: to,
  });

  if (error) {
    logger.error({ event: "workdays.export.failed", msg: error.message });
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }

  type Row = {
    email: string;
    month: string;
    business_days: number;
    absence_days: number | string;
    working_days: number | string;
  };

  const rows = (data ?? []) as Row[];

  return NextResponse.json({
    from: from.slice(0, 7),
    to: to.slice(0, 7),
    // Nazwa źródła jedzie w odpowiedzi, żeby konsument mógł podpisać kafel
    // tym, czym liczba NAPRAWDĘ jest. W COMPASSIE chorobowe dla B2B jest
    // strukturalnie niezapisywalne (trigger Phase 29), a rekruterzy są
    // w większości B2B — więc to są „dni robocze minus zatwierdzony urlop",
    // a nie „dni faktycznie przepracowane". Podpisanie tego inaczej
    // odtworzyłoby defekt, który D5 naprawia.
    basis: "business_days_minus_approved_leave",
    people: rows.map((r) => ({
      email: r.email,
      month: String(r.month).slice(0, 7),
      business_days: Number(r.business_days),
      absence_days: Number(r.absence_days),
      working_days: Number(r.working_days),
    })),
  });
}
