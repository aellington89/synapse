// Public liveness check: the target of Playwright's readiness wait now, and of the Compose
// healthcheck from #4's part 4, which adds one `SELECT 1` (finance-stack/app/app/api/health).
export function GET() {
  return Response.json({ status: "ok" });
}
