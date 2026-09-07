import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient: () => ({ rpc }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

const secret = "availability-test-fixture";
const employee = "00000000-0000-4000-8000-000000000001";
const substitute = "00000000-0000-4000-8000-000000000002";
function snapshot() {
  return {
    schema_version: 1, basis: "calendar_full_day_approved_absences", complete: true,
    generated_at: "2026-09-07T10:00:00+00:00", date: "2026-09-07",
    working_day: true, window_end: "2026-10-07", count: 1,
    people: [{
      id: employee, email: "recruiter@example.com", employment_status: "active", available: false,
      absences: [{ id: employee, start_date: "2026-09-07", end_date: "2026-09-08", substitute_id: substitute }],
    }],
  };
}
async function call(authorization: string | null = `Bearer ${secret}`, query = "") {
  const { GET } = await import("../route");
  return GET(new NextRequest(`http://localhost/api/internal/availability${query}`, {
    headers: authorization ? { authorization } : {},
  }));
}
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: snapshot(), error: null });
  vi.stubEnv("AVAILABILITY_EXPORT_SECRET", secret);
});
afterEach(() => vi.unstubAllEnvs());

describe("availability export", () => {
  it("exports dates and named cover with a complete versioned snapshot", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body).toMatchObject(snapshot());
    expect(body.snapshot_version).toMatch(/^[a-f0-9]{64}$/);
    expect(rpc).toHaveBeenCalledWith("nexus_availability_export");
  });

  it("keeps the version stable between unchanged polls and changes it on cancellation", async () => {
    const first = await (await call()).json();
    const next = snapshot();
    next.generated_at = "2026-09-07T10:01:00+00:00";
    rpc.mockResolvedValue({ data: next, error: null });
    expect((await (await call()).json()).snapshot_version).toBe(first.snapshot_version);
    next.people[0].absences = [];
    next.people[0].available = true;
    expect((await (await call()).json()).snapshot_version).not.toBe(first.snapshot_version);
  });

  it("does not pass through sensitive or unexpected database fields", async () => {
    const data = snapshot();
    Object.assign(data.people[0], { rate: 999, note: "private employee note" });
    Object.assign(data.people[0].absences[0], { leave_type: "sick_leave", documentation_url: "private-document" });
    rpc.mockResolvedValue({ data, error: null });
    const body = JSON.stringify(await (await call()).json());
    for (const forbidden of ["rate", "note", "sick_leave", "documentation_url", "private-document"]) {
      expect(body).not.toContain(`"${forbidden}"`);
    }
  });

  it.each([null, "Bearer wrong", "Bearer cron-secret", "Bearer óóóóóóóóóóóóóóóóóóóóóóóó"])(
    "rejects invalid authentication before accessing employee data (%s)", async (authorization) => {
      expect((await call(authorization, `?secret=${secret}`)).status).toBe(401);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("reports missing configuration separately", async () => {
    vi.stubEnv("AVAILABILITY_EXPORT_SECRET", "");
    expect((await call()).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["empty", "partial", "duplicate", "malformed", "error"])(
    "refuses an unusable snapshot (%s)", async (kind) => {
      const data = snapshot();
      if (kind === "empty") { data.count = 0; data.people = []; }
      if (kind === "partial") data.count = 2;
      if (kind === "duplicate") { data.people.push(data.people[0]); data.count = 2; }
      if (kind === "malformed") data.people[0].absences[0].end_date = "2026-09-01";
      rpc.mockResolvedValue({ data, error: kind === "error" ? { message: "private database detail" } : null });
      const response = await call();
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("private database detail");
    },
  );

  it("returns a generic failure if the database connection throws", async () => {
    rpc.mockRejectedValue(new Error("private connection string"));
    expect((await call()).status).toBe(503);
  });
});
