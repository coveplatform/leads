import { z } from "zod";

export const mode = z.enum(["feeling", "connections", "era_scene", "unexpected"]);
export const distance = z.enum(["focused", "explore", "wild"]);
export const uuid = z.string().uuid();

export const createDigSchema = z.object({
  seed: z.object({
    type: z.enum(["recording", "scene", "url"]),
    id: uuid.optional(),
    slug: z.string().max(80).optional(),
    url: z.string().max(2000).optional(),
  }),
  mode: mode.default("connections"),
  distance: distance.default("explore"),
  title: z.string().min(1).max(120).optional(),
});
export const nextSchema = z.object({
  mode: mode.optional(),
  distance: distance.optional(),
  nodeId: uuid.optional(),
});
export const actionSchema = z.object({
  action: z.enum([
    "pass",
    "keep",
    "love",
    "dig_deeper",
    "select",
    "wrong_direction",
    "back",
    "jump",
  ]),
  candidateId: z.string().max(120).optional(),
  nodeId: uuid.optional(),
  mode: mode.optional(),
  distance: distance.optional(),
  reasonCode: z
    .enum([
      "too_polished",
      "too_aggressive",
      "too_similar",
      "too_far_from_seed",
      "wrong_era",
      "not_interested_in_branch",
      "other",
    ])
    .optional(),
  idempotencyKey: z.string().min(8).max(120),
});
export const forkSchema = z.object({
  fromNodeId: uuid,
  mode: mode.default("connections"),
  distance: distance.default("explore"),
});
export const patchDigSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  status: z.enum(["active", "archived", "deleted"]).optional(),
});
export const createCrateSchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().max(400).optional(),
});
export const patchCrateSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  description: z.string().max(400).nullable().optional(),
});
export const addItemSchema = z
  .object({
    recordingId: uuid.optional(),
    sourceId: uuid.optional(),
    notes: z.string().max(2000).optional(),
    loved: z.boolean().optional(),
  })
  .refine((v) => v.recordingId || v.sourceId, { message: "recordingId or sourceId required" });
export const patchItemSchema = z.object({
  notes: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  status: z
    .enum(["saved", "loved", "to_investigate", "want_vinyl", "heard", "own", "buy_later"])
    .optional(),
  loved: z.boolean().optional(),
  moveToCrateId: uuid.optional(),
  copyToCrateId: uuid.optional(),
});
export const importsSchema = z.object({
  urls: z.array(z.string().min(1).max(2000)).min(1).max(20),
});
export const confirmSchema = z.object({ entityId: uuid.nullable() });
export const patchImportSchema = z.object({
  userTitle: z.string().max(200).nullable().optional(),
  userNotes: z.string().max(2000).nullable().optional(),
});
export const resolveSchema = z.object({ url: z.string().min(1).max(2000) });
export const patchProfileSchema = z.object({
  handle: z.string().max(40).nullable().optional(),
  homeRegion: z.string().max(80).nullable().optional(),
  personalizationOptIn: z.boolean().optional(),
  personalizationStrength: z.enum(["off", "light", "moderate"]).optional(),
  onboardingComplete: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
});
export const deleteSchema = z.object({ confirm: z.literal("DELETE") });
