import { COMPETENCY_CATALOG, REHEARSAL_DAYS, STORY_LIMITS } from '@grasp/engine';
import { z } from 'zod';

const competencyIds = new Set(COMPETENCY_CATALOG.map((c) => c.id));
const instant = z.iso.datetime({ offset: true }).transform((s) => new Date(s).toISOString());
// Postgres text and jsonb cannot hold a NUL character, and a lone surrogate is not valid Unicode.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((s) => !s.includes('\u0000') && !LONE_SURROGATE.test(s), 'Contains characters that cannot be stored');

export const storyIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[\w-]+$/);

// Tags are not capped at three: the editor allows more and the bank review asks to trim them. Ids the catalog no longer
// has are dropped rather than refused, so renaming a competency cannot stop a story from syncing.
export const storySchema = z.object({
  title: text(STORY_LIMITS.title),
  competencyIds: z
    .array(z.string().max(80))
    .max(50)
    .transform((ids) => [...new Set(ids.filter((id) => competencyIds.has(id)))]),
  draft: z.strictObject({
    situation: text(STORY_LIMITS.part),
    task: text(STORY_LIMITS.part),
    action: text(STORY_LIMITS.part),
    result: text(STORY_LIMITS.part),
    reflection: text(STORY_LIMITS.part),
  }),
  rehearsal: z
    .strictObject({
      step: z
        .number()
        .int()
        .min(0)
        .max(REHEARSAL_DAYS.length - 1),
      told: z.number().int().min(0).max(100_000),
      due: instant,
    })
    .optional(),
  deleted: z.literal(true).optional(),
  updatedAt: instant,
  createdAt: instant.optional(),
});

export type StoryDto = z.infer<typeof storySchema>;
