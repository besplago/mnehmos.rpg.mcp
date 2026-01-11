/**
 * Consolidated Character Management Tool
 *
 * Replaces 8 individual tools with a single action-based tool:
 * - create_character -> action: 'create'
 * - get_character -> action: 'get'
 * - update_character -> action: 'update'
 * - list_characters -> action: 'list'
 * - delete_character -> action: 'delete'
 * - add_xp -> action: 'add_xp'
 * - get_level_progression -> action: 'get_progression'
 * - level_up -> action: 'level_up'
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { SessionContext } from '../types.js';
import { getDb } from '../../storage/index.js';
import { CharacterRepository } from '../../storage/repos/character.repo.js';
import { provisionStartingEquipment } from '../../services/starting-equipment.service.js';
import { createActionRouter, ActionDefinition, McpResponse } from '../../utils/action-router.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const ACTIONS = ['create', 'get', 'update', 'list', 'delete', 'add_xp', 'get_progression', 'level_up'] as const;
type CharacterAction = typeof ACTIONS[number];

const CharacterTypeSchema = z.enum(['pc', 'npc', 'enemy', 'neutral']);

const XP_TABLE: Record<number, number> = {
    1: 0, 2: 300, 3: 900, 4: 2700, 5: 6500, 6: 14000, 7: 23000, 8: 34000,
    9: 48000, 10: 64000, 11: 85000, 12: 100000, 13: 120000, 14: 140000,
    15: 165000, 16: 195000, 17: 225000, 18: 265000, 19: 305000, 20: 355000
};

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE HELPER
// ═══════════════════════════════════════════════════════════════════════════

function ensureDb() {
    const db = getDb(process.env.NODE_ENV === 'test' ? ':memory:' : 'rpg.db');
    return {
        db,
        characterRepo: new CharacterRepository(db)
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

const StatsSchema = z.object({
    str: z.number().int().min(0).default(10),
    dex: z.number().int().min(0).default(10),
    con: z.number().int().min(0).default(10),
    int: z.number().int().min(0).default(10),
    wis: z.number().int().min(0).default(10),
    cha: z.number().int().min(0).default(10),
});

const CreateSchema = z.object({
    action: z.literal('create'),
    name: z.string().min(1).describe('Character name (required)'),
    class: z.string().optional().default('Adventurer'),
    race: z.string().optional().default('Human'),
    background: z.string().optional().default('Folk Hero'),
    alignment: z.string().optional(),
    stats: StatsSchema.optional().default({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }),
    hp: z.number().int().min(1).optional(),
    maxHp: z.number().int().min(1).optional(),
    ac: z.number().int().min(0).optional().default(10),
    level: z.number().int().min(1).optional().default(1),
    characterType: CharacterTypeSchema.optional().default('pc'),
    factionId: z.string().optional(),
    behavior: z.string().optional(),
    knownSpells: z.array(z.string()).optional().default([]),
    preparedSpells: z.array(z.string()).optional().default([]),
    resistances: z.array(z.string()).optional().default([]),
    vulnerabilities: z.array(z.string()).optional().default([]),
    immunities: z.array(z.string()).optional().default([]),
    provisionEquipment: z.boolean().optional().default(true),
    customEquipment: z.array(z.string()).optional(),
    startingGold: z.number().int().min(0).optional()
});

const GetSchema = z.object({
    action: z.literal('get'),
    characterId: z.string().describe('Character ID to retrieve')
});

const ConditionSchema = z.object({
    name: z.string(),
    duration: z.number().int().optional(),
    source: z.string().optional()
});

const UpdateSchema = z.object({
    action: z.literal('update'),
    characterId: z.string().describe('Character ID to update'),
    name: z.string().min(1).optional(),
    race: z.string().optional(),
    class: z.string().optional(),
    hp: z.number().int().min(0).optional(),
    maxHp: z.number().int().min(1).optional(),
    ac: z.number().int().min(0).optional(),
    level: z.number().int().min(1).optional(),
    characterType: CharacterTypeSchema.optional(),
    stats: StatsSchema.partial().optional(),
    knownSpells: z.array(z.string()).optional(),
    preparedSpells: z.array(z.string()).optional(),
    conditions: z.array(ConditionSchema).optional(),
    addConditions: z.array(ConditionSchema).optional(),
    removeConditions: z.array(z.string()).optional()
});

const ListSchema = z.object({
    action: z.literal('list'),
    characterType: CharacterTypeSchema.optional()
});

const DeleteSchema = z.object({
    action: z.literal('delete'),
    characterId: z.string().describe('Character ID to delete')
});

const AddXpSchema = z.object({
    action: z.literal('add_xp'),
    characterId: z.string().describe('Character ID'),
    amount: z.number().int().min(1).describe('Amount of XP to add')
});

const GetProgressionSchema = z.object({
    action: z.literal('get_progression'),
    level: z.number().int().min(1).max(20).describe('Level to check progression for')
});

const LevelUpSchema = z.object({
    action: z.literal('level_up'),
    characterId: z.string().describe('Character ID'),
    hpIncrease: z.number().int().min(0).optional(),
    targetLevel: z.number().int().min(2).max(20).optional()
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert spell slots from array format [0, slots1, slots2, ...] to object format
 * The array format from provisionStartingEquipment has index 0 as cantrips (unused here),
 * and indices 1-9 as spell levels 1-9.
 */
function convertSpellSlotsToObject(slots: number[] | null) {
    if (!slots || slots.length === 0) return undefined;
    
    return {
        level1: { current: slots[1] || 0, max: slots[1] || 0 },
        level2: { current: slots[2] || 0, max: slots[2] || 0 },
        level3: { current: slots[3] || 0, max: slots[3] || 0 },
        level4: { current: slots[4] || 0, max: slots[4] || 0 },
        level5: { current: slots[5] || 0, max: slots[5] || 0 },
        level6: { current: slots[6] || 0, max: slots[6] || 0 },
        level7: { current: slots[7] || 0, max: slots[7] || 0 },
        level8: { current: slots[8] || 0, max: slots[8] || 0 },
        level9: { current: slots[9] || 0, max: slots[9] || 0 }
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

async function handleCreate(args: z.infer<typeof CreateSchema>): Promise<object> {
    const { db, characterRepo } = ensureDb();
    const now = new Date().toISOString();
    const className = args.class || 'Adventurer';

    // Calculate HP from constitution if not provided
    const conModifier = Math.floor(((args.stats?.con ?? 10) - 10) / 2);
    const baseHp = Math.max(1, 8 + conModifier);
    const hp = args.hp ?? baseHp;
    const maxHp = args.maxHp ?? hp;
    const characterId = randomUUID();

    // Provision starting equipment and spells if enabled
    let provisioningResult = null;
    const shouldProvision = args.provisionEquipment !== false &&
        (args.characterType === 'pc' || args.characterType === undefined);

    if (shouldProvision) {
        provisioningResult = provisionStartingEquipment(
            db,
            characterId,
            className,
            args.level ?? 1,
            {
                customEquipment: args.customEquipment,
                customSpells: args.knownSpells?.length ? args.knownSpells : undefined,
                startingGold: args.startingGold
            }
        );
    }

    // Build character
    const character = {
        id: characterId,
        name: args.name,
        race: args.race,
        background: args.background,
        alignment: args.alignment,
        characterClass: className,
        stats: args.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        hp,
        maxHp,
        ac: args.ac ?? 10,
        level: args.level ?? 1,
        characterType: args.characterType ?? 'pc',
        factionId: args.factionId,
        behavior: args.behavior,
        knownSpells: provisioningResult?.spellsGranted.length
            ? [...new Set([...args.knownSpells || [], ...provisioningResult.spellsGranted])]
            : args.knownSpells || [],
        cantripsKnown: provisioningResult?.cantripsGranted || [],
        preparedSpells: args.preparedSpells || [],
        resistances: args.resistances || [],
        vulnerabilities: args.vulnerabilities || [],
        immunities: args.immunities || [],
        spellSlots: convertSpellSlotsToObject(provisioningResult?.spellSlots ?? null),
        pactMagicSlots: provisioningResult?.pactMagicSlots || undefined,
        xp: 0,
        createdAt: now,
        updatedAt: now
    };

    characterRepo.create(character as any);

    const response: Record<string, unknown> = { ...character, success: true };
    if (provisioningResult) {
        response._provisioning = {
            equipmentGranted: provisioningResult.itemsGranted,
            spellsGranted: provisioningResult.spellsGranted,
            cantripsGranted: provisioningResult.cantripsGranted,
            startingGold: provisioningResult.startingGold,
            errors: provisioningResult.errors.length > 0 ? provisioningResult.errors : undefined
        };
    }

    return {
        ...response,
        message: `Created character: ${character.name}`
    };
}

async function handleGet(args: z.infer<typeof GetSchema>): Promise<object> {
    const { characterRepo } = ensureDb();
    const character = characterRepo.findById(args.characterId);

    if (!character) {
        throw new Error(`Character ${args.characterId} not found`);
    }

    return { ...character };
}

async function handleUpdate(args: z.infer<typeof UpdateSchema>): Promise<object> {
    const { characterRepo } = ensureDb();
    const updateData: Record<string, unknown> = {};

    // Map fields
    if (args.name !== undefined) updateData.name = args.name;
    if (args.race !== undefined) updateData.race = args.race;
    if (args.class !== undefined) updateData.characterClass = args.class;
    if (args.hp !== undefined) updateData.hp = args.hp;
    if (args.maxHp !== undefined) updateData.maxHp = args.maxHp;
    if (args.ac !== undefined) updateData.ac = args.ac;
    if (args.level !== undefined) updateData.level = args.level;
    if (args.characterType !== undefined) updateData.characterType = args.characterType;
    if (args.stats !== undefined) updateData.stats = args.stats;
    if (args.knownSpells !== undefined) updateData.knownSpells = args.knownSpells;
    if (args.preparedSpells !== undefined) updateData.preparedSpells = args.preparedSpells;

    // Handle conditions
    if (args.conditions !== undefined) {
        updateData.conditions = args.conditions;
    } else if (args.addConditions !== undefined || args.removeConditions !== undefined) {
        const existing = characterRepo.findById(args.characterId);
        if (!existing) {
            throw new Error(`Character ${args.characterId} not found`);
        }

        let currentConditions: Array<{ name: string; duration?: number; source?: string }> =
            (existing as any).conditions || [];

        if (args.removeConditions?.length) {
            const toRemove = new Set(args.removeConditions.map(n => n.toLowerCase()));
            currentConditions = currentConditions.filter(c => !toRemove.has(c.name.toLowerCase()));
        }

        if (args.addConditions?.length) {
            for (const newCond of args.addConditions) {
                const existingIdx = currentConditions.findIndex(
                    c => c.name.toLowerCase() === newCond.name.toLowerCase()
                );
                if (existingIdx >= 0) {
                    currentConditions[existingIdx] = { ...currentConditions[existingIdx], ...newCond };
                } else {
                    currentConditions.push(newCond);
                }
            }
        }

        updateData.conditions = currentConditions;
    }

    const updated = characterRepo.update(args.characterId, updateData);
    if (!updated) {
        throw new Error(`Failed to update character: ${args.characterId}`);
    }

    return {
        ...updated,
        success: true,
        message: 'Character updated successfully'
    };
}

async function handleList(args: z.infer<typeof ListSchema>): Promise<object> {
    const { characterRepo } = ensureDb();
    const characters = characterRepo.findAll({
        characterType: args.characterType
    });

    return {
        characters,
        count: characters.length,
        filter: args.characterType || 'all'
    };
}

async function handleDelete(args: z.infer<typeof DeleteSchema>): Promise<object> {
    const { db } = ensureDb();
    const stmt = db.prepare('DELETE FROM characters WHERE id = ?');
    stmt.run(args.characterId);

    return {
        success: true,
        characterId: args.characterId,
        message: 'Character deleted'
    };
}

async function handleAddXp(args: z.infer<typeof AddXpSchema>): Promise<object> {
    const { characterRepo } = ensureDb();
    const char = characterRepo.findById(args.characterId);

    if (!char) {
        throw new Error(`Character ${args.characterId} not found`);
    }

    const currentXp = (char as any).xp || 0;
    const newXp = currentXp + args.amount;
    const currentLevel = char.level;
    const nextLevelXp = XP_TABLE[currentLevel + 1];
    const canLevelUp = nextLevelXp !== undefined && newXp >= nextLevelXp;

    characterRepo.update(char.id, { xp: newXp });

    return {
        characterId: char.id,
        name: char.name,
        oldXp: currentXp,
        newXp,
        level: currentLevel,
        canLevelUp,
        nextLevelXp: nextLevelXp || null,
        message: canLevelUp
            ? `Added ${args.amount} XP. Total: ${newXp}. LEVEL UP AVAILABLE for Level ${currentLevel + 1}!`
            : `Added ${args.amount} XP. Total: ${newXp}.`
    };
}

async function handleGetProgression(args: z.infer<typeof GetProgressionSchema>): Promise<object> {
    const level = args.level;

    if (level >= 20) {
        return {
            level: 20,
            maxLevel: true,
            xpForCurrentLevel: XP_TABLE[20]
        };
    }

    const currentXpBase = XP_TABLE[level];
    const nextLevelXp = XP_TABLE[level + 1];

    return {
        level,
        xpRequiredForLevel: currentXpBase,
        xpForNextLevel: nextLevelXp,
        xpToNext: nextLevelXp - currentXpBase
    };
}

async function handleLevelUp(args: z.infer<typeof LevelUpSchema>): Promise<object> {
    const { characterRepo } = ensureDb();
    const char = characterRepo.findById(args.characterId);

    if (!char) {
        throw new Error(`Character ${args.characterId} not found`);
    }

    const currentLevel = char.level;
    const targetLevel = args.targetLevel || (currentLevel + 1);

    if (targetLevel <= currentLevel) {
        throw new Error(`Target level ${targetLevel} must be greater than current level ${currentLevel}`);
    }

    const updates: Record<string, unknown> = { level: targetLevel };

    if (args.hpIncrease) {
        updates.maxHp = (char.maxHp || 0) + args.hpIncrease;
        updates.hp = (char.hp || 0) + args.hpIncrease;
    }

    characterRepo.update(char.id, updates);

    return {
        characterId: char.id,
        name: char.name,
        oldLevel: currentLevel,
        newLevel: targetLevel,
        hpIncrease: args.hpIncrease || 0,
        newMaxHp: updates.maxHp || char.maxHp,
        message: `Leveled up to ${targetLevel}!`
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION ROUTER
// ═══════════════════════════════════════════════════════════════════════════

const definitions: Record<CharacterAction, ActionDefinition> = {
    create: {
        schema: CreateSchema,
        handler: handleCreate,
        aliases: ['new', 'add', 'spawn'],
        description: 'Create a new character'
    },
    get: {
        schema: GetSchema,
        handler: handleGet,
        aliases: ['fetch', 'find', 'retrieve'],
        description: 'Get character by ID'
    },
    update: {
        schema: UpdateSchema,
        handler: handleUpdate,
        aliases: ['modify', 'edit', 'set'],
        description: 'Update character properties'
    },
    list: {
        schema: ListSchema,
        handler: handleList,
        aliases: ['all', 'query', 'search'],
        description: 'List all characters'
    },
    delete: {
        schema: DeleteSchema,
        handler: handleDelete,
        aliases: ['remove', 'destroy'],
        description: 'Delete a character'
    },
    add_xp: {
        schema: AddXpSchema,
        handler: handleAddXp,
        aliases: ['xp', 'award_xp', 'grant_xp'],
        description: 'Add XP to a character'
    },
    get_progression: {
        schema: GetProgressionSchema,
        handler: handleGetProgression,
        aliases: ['progression', 'xp_table', 'level_info'],
        description: 'Get XP requirements for a level'
    },
    level_up: {
        schema: LevelUpSchema,
        handler: handleLevelUp,
        aliases: ['levelup', 'advance'],
        description: 'Level up a character'
    }
};

const router = createActionRouter({
    actions: ACTIONS,
    definitions,
    threshold: 0.6
});

// ═══════════════════════════════════════════════════════════════════════════
// TOOL DEFINITION & HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export const CharacterManageTool = {
    name: 'character_manage',
    description: `Manage characters and progression.
Actions: create, get, update, list, delete, add_xp, get_progression, level_up
Aliases: new/add/spawn->create, fetch/find->get, modify/edit->update, all/query->list, remove/destroy->delete, xp/award_xp->add_xp, progression->get_progression, levelup/advance->level_up`,
    inputSchema: z.object({
        action: z.string().describe('Action: create, get, update, list, delete, add_xp, get_progression, level_up'),
        // Create fields
        name: z.string().optional(),
        class: z.string().optional(),
        race: z.string().optional(),
        background: z.string().optional(),
        alignment: z.string().optional(),
        stats: StatsSchema.optional(),
        hp: z.number().int().optional(),
        maxHp: z.number().int().optional(),
        ac: z.number().int().optional(),
        level: z.number().int().optional(),
        characterType: CharacterTypeSchema.optional(),
        factionId: z.string().optional(),
        behavior: z.string().optional(),
        knownSpells: z.array(z.string()).optional(),
        preparedSpells: z.array(z.string()).optional(),
        resistances: z.array(z.string()).optional(),
        vulnerabilities: z.array(z.string()).optional(),
        immunities: z.array(z.string()).optional(),
        provisionEquipment: z.boolean().optional(),
        customEquipment: z.array(z.string()).optional(),
        startingGold: z.number().int().optional(),
        // Get/Update/Delete fields
        characterId: z.string().optional(),
        // Update condition fields
        conditions: z.array(ConditionSchema).optional(),
        addConditions: z.array(ConditionSchema).optional(),
        removeConditions: z.array(z.string()).optional(),
        // Add XP field
        amount: z.number().int().optional(),
        // Level up fields
        hpIncrease: z.number().int().optional(),
        targetLevel: z.number().int().optional()
    })
};

export async function handleCharacterManage(args: unknown, _ctx: SessionContext): Promise<McpResponse> {
    return router(args as Record<string, unknown>);
}
