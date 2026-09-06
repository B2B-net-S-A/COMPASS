import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Kontrakt eksportu sygnałów sprzedażowych dla ATLASA.
 *
 * Test broni czterech rzeczy, z których każda ma konkretny koszt przy złamaniu:
 *  1. własny sekret, NIE `CRON_SECRET` — tamten odblokowuje też
 *     /api/migrate-compliance, czyli DDL na bazie COMPASSA,
 *  2. brak fallbacku na `?secret=` — query stringi lądują w access logach,
 *  3. odpowiedź niesie DOKŁADNIE dwa pola kadrowe (imię i e-mail konsultanta
 *     plus e-mail zgłaszającego) i ani jednego więcej — bo `profiles` to pełna
 *     kartoteka: stawki, rola, manager, status zatrudnienia,
 *  4. `count` jest w odpowiedzi, żeby konsument odróżnił „nikt nic nie
 *     zgłosił" od „padło u nas".
 */

const rpcMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({ rpc: rpcMock }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const SECRET = "test-sales-signals-secret-0123456789";

const ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  company_name: "Klient Sp. z o.o.",
  need: "Szukają trzech seniorów Java do zespołu płatności.",
  contact_hint: "Anna Kowalska, Head of IT",
  context: "Konsultant pracuje u nich od roku.",
  reported_by_email: "tcm@dynaminds.pl",
  consultant_name: "Jan Nowak",
  consultant_email: "jan.nowak@dynaminds.pl",
  created_at: "2026-09-01T10:00:00.000Z",
};

async function call(url: string, headers: Record<string, string> = {}) {
  const { GET } = await import("../route");
  return GET(new NextRequest(url, { headers }));
}

const auth = { authorization: `Bearer ${SECRET}` };
const URL_BASE = "https://compass.dynaminds.pl/api/internal/sales-signals";

beforeEach(() => {
  vi.resetModules();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: [ROW], error: null });
  process.env.SALES_SIGNALS_EXPORT_SECRET = SECRET;
  // Celowo INNY — punkt 1 kontraktu sprawdza, że tamten tu nie działa.
  process.env.CRON_SECRET = "zupelnie-inny-sekret-crona";
});

afterEach(() => {
  delete process.env.SALES_SIGNALS_EXPORT_SECRET;
  delete process.env.CRON_SECRET;
});

describe("GET /api/internal/sales-signals", () => {
  it("zwraca sygnały przy poprawnym sekrecie", async () => {
    const res = await call(URL_BASE, auth);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.signals[0]).toMatchObject({
      company_name: "Klient Sp. z o.o.",
      need: "Szukają trzech seniorów Java do zespołu płatności.",
      contact_hint: "Anna Kowalska, Head of IT",
    });
  });

  it("niesie `count`, żeby pusta lista nie wyglądała jak awaria", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const res = await call(URL_BASE, auth);
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(body.signals).toEqual([]);
  });

  it("oddaje tożsamość konsultanta — to świadoma decyzja, nie przeciek", async () => {
    // Handel ma móc podziękować i rozliczyć bonus za polecenie. Regresja
    // w DRUGĄ stronę (zniknięcie tych pól) też jest błędem, więc asercja
    // jest pozytywna i celowa.
    const body = await (await call(URL_BASE, auth)).json();
    expect(body.signals[0].consultant_name).toBe("Jan Nowak");
    expect(body.signals[0].consultant_email).toBe("jan.nowak@dynaminds.pl");
    expect(body.signals[0].reported_by_email).toBe("tcm@dynaminds.pl");
  });

  it("NIE oddaje reszty kartoteki kadrowej, nawet gdy RPC ją zwróci", async () => {
    // Gdyby ktoś kiedyś rozszerzył funkcję eksportową albo zamienił mapowanie
    // pole-po-polu na spread, te dane wyszłyby na zewnątrz bez niczyjej decyzji.
    rpcMock.mockResolvedValue({
      data: [
        {
          ...ROW,
          hourly_rate: 185,
          role: "consultant",
          manager_id: "22222222-2222-2222-2222-222222222222",
          employment_status: "active",
          note: "wolny tekst kadrowy",
        },
      ],
      error: null,
    });

    const raw = JSON.stringify(await (await call(URL_BASE, auth)).json());
    expect(raw).not.toContain("hourly_rate");
    expect(raw).not.toContain("185");
    expect(raw).not.toContain("manager_id");
    expect(raw).not.toContain("employment_status");
    expect(raw).not.toContain("wolny tekst kadrowy");
  });

  it("przekazuje `since` do RPC jako ISO", async () => {
    await call(`${URL_BASE}?since=2026-09-01T10:00:00Z`, auth);
    expect(rpcMock).toHaveBeenCalledWith(
      "atlas_sales_signals_export",
      expect.objectContaining({ p_since: "2026-09-01T10:00:00.000Z" }),
    );
  });

  it("bez `since` robi pełny eksport (p_since = null)", async () => {
    await call(URL_BASE, auth);
    expect(rpcMock).toHaveBeenCalledWith(
      "atlas_sales_signals_export",
      expect.objectContaining({ p_since: null }),
    );
  });

  it("odrzuca niepoprawne `since` zamiast cicho robić pełny skan", async () => {
    const res = await call(`${URL_BASE}?since=wczoraj`, auth);
    expect(res.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("odrzuca CRON_SECRET — to inny sekret o innym zasięgu", async () => {
    const res = await call(URL_BASE, {
      authorization: `Bearer ${process.env.CRON_SECRET}`,
    });
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("odrzuca sekret podany w query stringu", async () => {
    const res = await call(`${URL_BASE}?secret=${SECRET}`);
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("bez konfiguracji zwraca 503, nie 401", async () => {
    delete process.env.SALES_SIGNALS_EXPORT_SECRET;
    const res = await call(URL_BASE, auth);
    expect(res.status).toBe(503);
  });

  it("na błędzie bazy zwraca 500 bez szczegółów", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'relation "sales_signals" does not exist' },
    });
    const res = await call(URL_BASE, auth);
    expect(res.status).toBe(500);

    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("sales_signals");
    expect(raw).not.toContain("relation");
  });
});
