import { z } from 'zod';
import type { Action } from './types';

const tile = z.string().min(1).max(32);

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
]);
