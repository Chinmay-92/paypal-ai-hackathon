import type { NextRequest } from "next/server";
import { addMessage, processAnalysisOutbox } from "@/application/changes";
import { PortalMessageInput } from "@/application/schemas";
import { one, pool } from "@/persistence/db";
import { currentCustomer, handle, parseBody } from "@/server/http";

export async function POST(req: NextRequest) {
  return handle(
    req,
    async () => {
      const actor = await currentCustomer();
      const { body } = await parseBody(req, PortalMessageInput);
      const customer = await one<{ name: string }>(pool(), "SELECT name FROM customers WHERE tenant_id = $1 AND id = $2", [actor.tenantId, actor.customerId]);
      const result = await addMessage(actor, actor.jobId, { authorLabel: customer?.name ?? "Customer", authorRole: "customer", body });
      await processAnalysisOutbox(3).catch(() => undefined);
      return { messageId: result.messageId };
    },
    { status: 201 },
  );
}
