import { z } from 'zod';

const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const RiverPathSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  name: z.string(),
  points: z.array(PointSchema).min(2),
  width: z.number().positive(),
  sourceElevation: z.number(),
  mouthElevation: z.number(),
}).refine(
  (data) => data.sourceElevation > data.mouthElevation,
  {
    message: 'River must flow downhill: sourceElevation must be greater than mouthElevation',
  }
);

export type RiverPath = z.infer<typeof RiverPathSchema>;
export type Point = z.infer<typeof PointSchema>;
