import { z } from 'zod';

/**
 * HIGH-008: Theft System Schema
 * Tracks stolen item provenance, heat decay, and fence mechanics
 */

export const HeatLevelSchema = z.enum(['burning', 'hot', 'warm', 'cool', 'cold']);
export type HeatLevel = z.infer<typeof HeatLevelSchema>;

export const StolenItemRecordSchema = z.object({
    id: z.string(),
    itemId: z.string(),
    stolenFrom: z.string().describe('Original owner character ID'),
    stolenBy: z.string().describe('Thief character ID'),
    stolenAt: z.string().datetime(),
    stolenLocation: z.string().nullable().describe('Region/structure ID where theft occurred'),

    // Heat system
    heatLevel: HeatLevelSchema.default('burning'),
    heatUpdatedAt: z.string().datetime(),

    // Detection
    reportedToGuards: z.boolean().default(false),
    bounty: z.number().int().min(0).default(0),
    witnesses: z.array(z.string()).default([]).describe('NPC IDs who witnessed the theft'),

    // Resolution
    recovered: z.boolean().default(false),
    recoveredAt: z.string().datetime().nullable(),
    fenced: z.boolean().default(false),
    fencedAt: z.string().datetime().nullable(),
    fencedTo: z.string().nullable().describe('Fence NPC ID'),

    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
});

export type StolenItemRecord = z.infer<typeof StolenItemRecordSchema>;

export const FenceNpcSchema = z.object({
    npcId: z.string(),
    factionId: z.string().nullable().describe("e.g., 'thieves-guild'"),
    buyRate: z.number().min(0.1).max(1.0).default(0.4).describe('Fraction of item value they pay'),
    maxHeatLevel: HeatLevelSchema.default('hot').describe('Maximum heat they will accept'),
    dailyHeatCapacity: z.number().int().min(0).default(100).describe('Total heat points they can absorb per day'),
    currentDailyHeat: z.number().int().min(0).default(0),
    lastResetAt: z.string().datetime(),
    specializations: z.array(z.string()).default([]).describe('Item types they prefer'),
    cooldownDays: z.number().int().min(0).default(7).describe('Days to remove stolen flag'),
    reputation: z.number().int().min(0).max(100).default(50).describe('Fence reliability')
});

export type FenceNpc = z.infer<typeof FenceNpcSchema>;

// Heat level to numeric value for capacity calculations
export const HEAT_VALUES: Record<HeatLevel, number> = {
    burning: 100,
    hot: 50,
    warm: 25,
    cool: 10,
    cold: 5
};

// Heat decay rules (in game days)
export const HEAT_DECAY_RULES = {
    burning_to_hot: 1,    // 1 day
    hot_to_warm: 3,       // 3 days
    warm_to_cool: 7,      // 1 week
    cool_to_cold: 14,     // 2 weeks
    cold_fully: 30        // Never fully clears for unique items
};

// Heat level order for comparison
export const HEAT_LEVEL_ORDER: HeatLevel[] = ['cold', 'cool', 'warm', 'hot', 'burning'];

export function getNextHeatLevel(current: HeatLevel): HeatLevel | null {
    const idx = HEAT_LEVEL_ORDER.indexOf(current);
    if (idx <= 0) return null; // Already cold
    return HEAT_LEVEL_ORDER[idx - 1];
}

export function compareHeatLevels(a: HeatLevel, b: HeatLevel): number {
    return HEAT_LEVEL_ORDER.indexOf(a) - HEAT_LEVEL_ORDER.indexOf(b);
}
