import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * GET /api/internal/workdays?from=2026-01&to=2026-08&bucket=month
 * GET /api/internal/workdays?from=2026-08-24&to=2026-08-24&bucket=week
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

// ~2 lata. Sufit istnieje, żeby jedno żądanie nie zamieniło się w skan całej historii.
const MAX_SPAN_DAYS = 750;

/**
 * Akceptuje `YYYY-MM` (miesiąc) i `YYYY-MM-DD` (dzień).
 *
 * Granulacja tygodniowa jest potrzebna, bo Power Calling w NEXUSIE raportuje
 * TYDZIEŃ ISO. Przybliżanie tygodnia z miesięcznej średniej byłoby zgadywaniem
 * — czyli dokładnie tym defektem, który ten endpoint likwiduje.
 */
function parseDay(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    if (m < 1 || m > 12 || y < 2000 || y > 2100) return null;
    return `${value}-01`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    return value;
  }
  return null;
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
  const from = parseDay(url.searchParams.get("from"));
  const to = parseDay(url.searchParams.get("to"));
  const bucket = url.searchParams.get("bucket") ?? "month";
  if (bucket !== "month" && bucket !== "week") {
    // Nieznana granulacja jest ODRZUCANA, nie cicho zamieniana na miesiąc:
    // literówka dałaby wtedy liczby miesięczne pod etykietą tygodnia.
    return NextResponse.json(
      { error: "bucket musi być 'month' albo 'week'" },
      { status: 422 },
    );
  }
  if (!from || !to) {
    return NextResponse.json(
      { error: "from i to są wymagane w formacie YYYY-MM albo YYYY-MM-DD" },
      { status: 422 },
    );
  }
  if (from > to) {
    return NextResponse.json(
      { error: "from nie może być późniejsze niż to" },
      { status: 422 },
    );
  }

  const spanDays =
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
    86_400_000;
  if (spanDays > MAX_SPAN_DAYS) {
    return NextResponse.json(
      {
        error: `Zakres maksymalnie ${MAX_SPAN_DAYS} dni (zażądano ${spanDays})`,
      },
      { status: 422 },
    );
  }

  const admin = createServiceClient();
  const { data, error } = await admin.rpc("nexus_workdays_export", {
    p_from: from,
    p_to: to,
    p_bucket: bucket,
  });

  if (error) {
    logger.error({ event: "workdays.export.failed", msg: error.message });
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }

  type Row = {
    email: string;
    period_start: string;
    period_end: string;
    business_days: number;
    absence_days: number | string;
    working_days: number | string;
  };

  const rows = (data ?? []) as Row[];

  return NextResponse.json({
    from,
    to,
    bucket,
    // Nazwa źródła jedzie w odpowiedzi, żeby konsument mógł podpisać kafel
    // tym, czym liczba NAPRAWDĘ jest. W COMPASSIE chorobowe dla B2B jest
    // strukturalnie niezapisywalne (trigger Phase 29), a rekruterzy są
    // w większości B2B — więc to są „dni robocze minus zatwierdzony urlop",
    // a nie „dni faktycznie przepracowane". Podpisanie tego inaczej
    // odtworzyłoby defekt, który D5 naprawia.
    basis: "business_days_minus_approved_leave",
    people: rows.map((r) => ({
      email: r.email,
      period_start: String(r.period_start).slice(0, 10),
      period_end: String(r.period_end).slice(0, 10),
      business_days: Number(r.business_days),
      absence_days: Number(r.absence_days),
      working_days: Number(r.working_days),
    })),
  });
}
