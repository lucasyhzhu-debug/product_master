// Phase 74.5.1: ChannelAdapter contract. Every adapter in convex/integrations/{source}/ implements this.
//
// Shape (RESEARCH.md §Architecture Patterns + §Phase Requirements R1):
// - `source`: the 8-source literal this adapter owns.
// - `fetch()`: HTTP payload retrieval — lives in a Convex action ("use node"). Raw payload type is adapter-specific.
// - `normalize()`: pure transform from raw payload to ChannelSaleEvent[]. No DB/network calls. Testable in isolation.
//
// Grabfood adapter per D74.5.1-L5: normalize() throws `Not implemented — requires orders:read OAuth scope`.
// Other 4 adapters produce real events.

import type { ExternalSource } from "../../lib/externalSource";
import type { ChannelSaleEvent } from "./channelSaleEvent";

export interface ChannelAdapter<TRawPayload = unknown> {
  /** The one source literal this adapter owns. Compile-time narrowed to a single ExternalSource. */
  readonly source: ExternalSource;

  /**
   * Fetch raw payload from the external platform.
   * Runs inside a Convex action (HTTP calls require "use node"). Not covered by this interface — adapters declare their own action(s) that ultimately feed normalize().
   *
   * Marked optional for adapters where fetch is driven by external webhooks or internal DB reads (e.g. `internal` adapter reads orders, `consignment` is admin-UI-triggered).
   */
  readonly fetch?: (args: unknown) => Promise<TRawPayload>;

  /**
   * Pure transform: raw payload → canonical events.
   * MUST be side-effect-free (no ctx.db reads/writes). Testable in isolation with fixture payloads.
   * Grabfood stub throws instead of returning events (D74.5.1-L5).
   */
  readonly normalize: (payload: TRawPayload) => ChannelSaleEvent[] | Promise<ChannelSaleEvent[]>;
}
