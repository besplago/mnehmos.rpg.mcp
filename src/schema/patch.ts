import { z } from 'zod';

export const MapPatchSchema = z.object({
    op: z.enum(['add', 'remove', 'replace']),
    path: z.string(),
    value: z.unknown().optional(),
    timestamp: z.string().datetime(),
});

export type MapPatch = z.infer<typeof MapPatchSchema>;

export const AnnotationSchema = z.object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    text: z.string(),
    authorId: z.string(),
    createdAt: z.string().datetime(),
});

export type Annotation = z.infer<typeof AnnotationSchema>;
