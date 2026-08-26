import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";
import {
  LabelDocumentError,
  loadReyoPackLabel,
  type ReyoPackLabelDocument,
} from "@/lib/reyo-pack/label-documents";

export const runtime = "nodejs";

const paramsSchema = z.object({ shipmentId: z.string().uuid() });
const querySchema = z.object({
  download: z.enum(["0", "1"]).default("0"),
}).strict();

export async function GET(
  request: Request,
  context: { params: Promise<{ shipmentId: string }> },
): Promise<Response> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.read");
    const { shipmentId } = paramsSchema.parse(await context.params);
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { data, error } = await actor.supabaseAdmin
      .from("reyo_pack_label_documents")
      .select("id, shipment_id, external_document_reference, storage_bucket, storage_path, content_type, document_source, external_expires_at")
      .eq("workspace_id", actor.workspaceId)
      .eq("shipment_id", shipmentId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new LabelDocumentError(404, "LABEL_NOT_AVAILABLE", "No shipping label is available for this shipment.");
    }

    const label = await loadReyoPackLabel(
      data as ReyoPackLabelDocument,
      actor.supabaseAdmin.storage,
    );
    const { error: auditError } = await actor.supabaseAdmin.from("audit_events").insert({
      workspace_id: actor.workspaceId,
      actor_type: "human",
      actor_id: actor.userId,
      action: query.download === "1" ? "reyo_pack.label_downloaded" : "reyo_pack.label_viewed",
      resource_type: "shipment",
      resource_id: shipmentId,
      new_state: {
        labelDocumentId: data.id,
        documentSource: data.document_source,
        contentType: label.contentType,
      },
      source: "reyo_pack_api",
    });
    if (auditError) throw auditError;

    const disposition = query.download === "1" || !label.inline ? "attachment" : "inline";
    const responseBody = new ArrayBuffer(label.bytes.byteLength);
    new Uint8Array(responseBody).set(label.bytes);
    return new Response(responseBody, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `${disposition}; filename="amazon-label-${shipmentId}.${label.extension}"`,
        "Content-Length": String(label.bytes.byteLength),
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'; sandbox",
        "Content-Type": label.contentType,
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid label request.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (error instanceof LabelDocumentError) {
      return NextResponse.json({ error: error.message, code: error.code }, {
        status: error.status,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
