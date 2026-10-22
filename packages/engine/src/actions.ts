import { z } from 'zod';
import type { Action } from './types';

const tile = z.string().min(1).max(32);
const player = z.enum(['p0', 'p1', 'p2', 'p3', 'p4', 'p5']);
const money = z.number().int().nonnegative().max(1_000_000_000_000);
const bundle = z
  .object({
    cash: money,
    tiles: z.array(tile).max(28),
    jailCards: z.number().int().min(0).max(2),
  })
  .strict();

/** Strict allow-list for client intents (validated server-side before applyAction). */
export const ActionSchema: z.ZodType<Action> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('roll') }).strict(),
  z.object({ type: z.literal('buy') }).strict(),
  z.object({ type: z.literal('decline_buy') }).strict(),
  z.object({ type: z.literal('mortgage'), tile }).strict(),
  z.object({ type: z.literal('unmortgage'), tile }).strict(),
  z.object({ type: z.literal('pay_jail_fine') }).strict(),
  z.object({ type: z.literal('use_jail_card') }).strict(),
  z.object({ type: z.literal('end_turn') }).strict(),
  z.object({ type: z.literal('pay_debt') }).strict(),
  z.object({ type: z.literal('declare_bankruptcy') }).strict(),
  z.object({ type: z.literal('build'), tile }).strict(),
  z.object({ type: z.literal('sell_building'), tile }).strict(),
  z.object({ type: z.literal('auction_bid'), amount: money }).strict(),
  z.object({ type: z.literal('auction_withdraw') }).strict(),
  z.object({ type: z.literal('propose_trade'), to: player, give: bundle, get: bundle }).strict(),
  z.object({ type: z.literal('accept_trade'), id: z.string().max(16) }).strict(),
  z.object({ type: z.literal('decline_trade'), id: z.string().max(16) }).strict(),
  z.object({ type: z.literal('cancel_trade'), id: z.string().max(16) }).strict(),
  // system_timeout is server-only and deliberately not accepted from clients.
]);
