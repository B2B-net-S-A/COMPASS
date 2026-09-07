import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Explicit projection also strips unexpected database fields at the HTTP boundary.
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const absence = z.object({
  id: z.string().uuid(),
  start_date: day,
  end_date: day,
  substitute_id: z.string().uuid().nullable(),
}).refine((row) => row.start_date <= row.end_date);
const snapshotSchema = z.object({
  schema_version: z.literal(1),
  basis: z.literal("calendar_full_day_approved_absences"),
  complete: z.literal(true),
  generated_at: z.string().datetime({ offset: true }),
  date: day,
  working_day: z.boolean(),
  window_end: day,
  count: z.number().int().positive(),
  people: z.array(z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    employment_status: z.string(),
    available: z.boolean(),
    absences: z.array(absence),
  })).min(1),
}).refine((row) => row.count === row.people.length
  && new Set(row.people.map((person) => person.id)).size === row.count);

function reply(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const secret = process.env.AVAILABILITY_EXPORT_SECRET;
  if (!secret) return reply({ error: "Not configured" }, 503);
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || Buffer.byteLength(provided) !== Buffer.byteLength(secret)
    || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
    return reply({ error: "Unauthorized" }, 401);
  }

  try {
    const { data, error } = await createServiceClient().rpc("nexus_availability_export");
    const parsed = snapshotSchema.safeParse(data);
    if (error || !parsed.success) {
      logger.error({ event: "availability.export.failed", invalid_snapshot: !parsed.success });
      return reply({ error: "Availability export unavailable" }, 503);
    }
    const { generated_at, ...content } = parsed.data;
    const snapshot_version = createHash("sha256").update(JSON.stringify(content)).digest("hex");
    return reply({ ...content, generated_at, snapshot_version }, 200);
  } catch {
    logger.error({ event: "availability.export.failed" });
    return reply({ error: "Availability export unavailable" }, 503);
  }
}
