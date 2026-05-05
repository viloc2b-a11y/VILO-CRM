import { confirmVisitFromToken } from "@/lib/vitalis/scheduler";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET ?t=... — confirma visita (etapa Scheduled → Visit Confirmed).
 * Enlace firmado enviado por WhatsApp (SCHEDULER_CONFIRM_SECRET o CRON_SECRET).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t")?.trim() ?? "";
  if (!token) {
    return new NextResponse("Falta el enlace de confirmación.", { status: 400 });
  }

  const result = await confirmVisitFromToken(token);
  if (!result.ok) {
    const body = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Confirmación</title></head><body>
<p>No se pudo confirmar (${result.reason ?? "error"}). Si ya confirmaste o hubo un cambio de cita, ignora este mensaje.</p>
</body></html>`;
    return new NextResponse(body, { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const body = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Gracias</title></head><body>
<p>¡Listo! Tu visita quedó confirmada. Te esperamos.</p>
</body></html>`;
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
