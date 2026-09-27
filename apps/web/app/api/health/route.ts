import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  let dbStatus = "unknown";
  let dbLatencyMs: number | null = null;

  try {
    const dbPromise = supabase
      .from("categories")
      .select("id")
      .limit(1);

    const timeoutPromise = new Promise<{ error: Error }>((_, reject) =>
      setTimeout(() => reject(new Error("Database check timeout")), 3000)
    );

    const dbStart = Date.now();
    const result = await Promise.race([dbPromise, timeoutPromise]) as {
      data?: unknown;
      error?: unknown;
    };

    dbLatencyMs = Date.now() - dbStart;
    if (result && !result.error) {
      dbStatus = "connected";
    } else {
      dbStatus = "error";
    }
  } catch {
    dbStatus = "unreachable";
  }

  const isHealthy = dbStatus === "connected" || dbStatus === "unknown";

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV ?? "development",
      checks: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
      },
      responseTimeMs: Date.now() - startTime,
    },
    {
      status: isHealthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
