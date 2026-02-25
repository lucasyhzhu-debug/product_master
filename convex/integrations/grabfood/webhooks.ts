import { httpAction } from "../../_generated/server";

/**
 * Receive incoming GrabFood orders via webhook.
 *
 * GrabFood POSTs the full Order object here when a customer places an order.
 * We must return HTTP 200 immediately, then process asynchronously.
 *
 * Register this URL in the GrabFood developer portal:
 *   https://<your-deployment>.convex.site/api/grabfood/order
 *
 * TODO: Add HMAC signature validation using the HMAC Secret from your
 *       GrabFood project dashboard (Credentials → HMAC Secret).
 */
export const handleOrderWebhook = httpAction(async (_ctx, request) => {
  const body = await request.text();

  let order: any;
  try {
    order = JSON.parse(body);
  } catch {
    console.log("GrabFood webhook: invalid JSON body");
    return new Response("OK", { status: 200 });
  }

  const orderID: string = order?.orderID ?? "unknown";
  const shortNum: string = order?.shortOrderNumber ?? "?";
  const merchantID: string = order?.merchantID ?? "unknown";

  console.log(`GrabFood webhook: new order ${shortNum} (${orderID}) for merchant ${merchantID}`);
  console.log("GrabFood order payload:", JSON.stringify(order, null, 2));

  // TODO (next step): store the order in grabfoodOrders table and
  // trigger respondToOrder with toState="ACCEPTED" if auto-accept is enabled.

  return new Response("OK", { status: 200 });
});

/**
 * Receive menu sync result webhooks from GrabFood.
 * GrabFood POSTs here after a menu sync job completes.
 */
export const handleMenuSyncWebhook = httpAction(async (_ctx, request) => {
  const body = await request.text();

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("OK", { status: 200 });
  }

  const { requestID, merchantID, jobID, status, errors } = payload;
  console.log(`GrabFood menu sync: ${status} for merchant ${merchantID} (job: ${jobID}, requestID: ${requestID})`);

  if (status === "FAILED" || status === "PARTIAL_FAILURE") {
    console.log("GrabFood menu sync errors:", errors);
  }

  return new Response("OK", { status: 200 });
});
