import { z } from 'zod';

export const TileSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  x: z.number(),
  y: z.number(),
  elevation: z.number(),
  temperature: z.number(),
  moisture: z.number().min(0).max(1),
  biome: z.string(),
});

export type Tile = z.infer<typeof TileSchema>;
