// zod schemas for every Edge Function body (spec 10.5, 11.7). Unknown keys are rejected.
import { ActionSchema } from '@monopoli/engine';
import { z } from 'zod';

/** Trimmed, control characters stripped, 1-20 characters (spec 11.12). */
export const Nickname = z
  .string()
  .transform((s) => s.replace(/\p{Cc}/gu, '').trim())
  .pipe(z.string().min(1).max(20));

const Uuid = z.uuid();
const Hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const Level = z.enum(['easy', 'normal', 'hard']);

/** House-rule overrides a host may set (spec 7.12), with sane ranges. Money in classic units. */
export const HouseRules = z
  .object({
    startingCash: z.number().int().min(500).max(5000),
    goSalary: z.number().int().min(0).max(1000),
    doubleGoBonus: z.boolean(),
    freeParkingPot: z.boolean(),
    auctionOnDecline: z.boolean(),
    evenBuild: z.boolean(),
    unlimitedBuildings: z.boolean(),
    doubleRentOnSet: z.boolean(),
    noRentInJail: z.boolean(),
    offTurnManagement: z.boolean(),
    jailFine: z.number().int().min(0).max(500),
    turnTimerSec: z.union([z.literal(0), z.literal(30), z.literal(60), z.literal(90)]),
    timeLimitMin: z.union([
      z.literal(0),
      z.literal(30),
      z.literal(60),
      z.literal(90),
      z.literal(120),
    ]),
    auctionTimerSec: z.number().int().min(5).max(60),
    disconnectGraceSec: z.number().int().min(15).max(300),
    takeoverBotLevel: Level,
  })
  .partial()
  .strict();

export const RoomRules = z
  .object({ preset: z.enum(['official', 'house']), house: HouseRules })
  .strict();

export const CreateRoom = z
  .object({ mapId: z.string().min(1).max(32), nickname: Nickname, rules: RoomRules })
  .strict();

export const JoinRoom = z
  .object({
    code: z
      .string()
      .transform((s) => s.trim().toUpperCase())
      .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/)),
    nickname: Nickname,
  })
  .strict();

export const RoomOnly = z.object({ roomId: Uuid }).strict();

export const UpdateRoom = z
  .object({
    roomId: Uuid,
    patch: z
      .object({
        mapId: z.string().min(1).max(32),
        rules: RoomRules,
        addBot: z.object({ level: Level }).strict(),
        removeSeat: z.number().int().min(0).max(5), // bot removal or kick (host only)
        me: z
          .object({ nickname: Nickname, token: z.string().min(1).max(32), color: Hex })
          .partial()
          .strict(),
      })
      .partial()
      .strict(),
  })
  .strict();

export const SetReady = z.object({ roomId: Uuid, ready: z.boolean() }).strict();

export const GameAction = z
  .object({
    roomId: Uuid,
    clientActionId: Uuid,
    expectedVersion: z.number().int().min(0),
    action: ActionSchema,
  })
  .strict();

export type RoomRulesInput = z.infer<typeof RoomRules>;
