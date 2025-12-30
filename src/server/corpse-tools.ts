import { z } from 'zod';
import { getDb } from '../storage/index.js';
import { CorpseRepository } from '../storage/repos/corpse.repo.js';
import { LootTableSchema } from '../schema/corpse.js';
import { SessionContext } from './types.js';

/**
 * FAILED-004: Corpse/Loot System Tools
 * Tools for managing corpses, looting, and harvesting
 */

// ============================================================
// TOOL DEFINITIONS
// ============================================================

export const CorpseTools = {
    GET_CORPSE: {
        name: 'get_corpse',
        description: 'Get details about a corpse, including loot and harvestable resources.',
        inputSchema: z.object({
            corpseId: z.string()
        })
    },

    GET_CORPSE_BY_CHARACTER: {
        name: 'get_corpse_by_character',
        description: 'Get the corpse of a specific character (if they are dead).',
        inputSchema: z.object({
            characterId: z.string()
        })
    },

    LIST_CORPSES_IN_ENCOUNTER: {
        name: 'list_corpses_in_encounter',
        description: 'List all corpses from a combat encounter.',
        inputSchema: z.object({
            encounterId: z.string()
        })
    },

    LIST_CORPSES_NEARBY: {
        name: 'list_corpses_nearby',
        description: 'List corpses near a position in the world.',
        inputSchema: z.object({
            worldId: z.string(),
            x: z.number().int(),
            y: z.number().int(),
            radius: z.number().int().min(1).max(20).default(3)
        })
    },

    LOOT_CORPSE: {
        name: 'loot_corpse',
        description: 'Loot items from a corpse. Specify itemId for specific item, or use lootAll for everything.',
        inputSchema: z.object({
            characterId: z.string().describe('Character doing the looting'),
            corpseId: z.string(),
            itemId: z.string().optional().describe('Specific item to loot'),
            quantity: z.number().int().min(1).optional(),
            lootAll: z.boolean().optional().describe('Loot everything from the corpse')
        })
    },

    HARVEST_CORPSE: {
        name: 'harvest_corpse',
        description: 'Harvest resources from a corpse (scales, pelts). May require skill check.',
        inputSchema: z.object({
            characterId: z.string(),
            corpseId: z.string(),
            resourceType: z.string(),
            skillRoll: z.number().int().optional().describe('Result of skill check if required'),
            skillDC: z.number().int().optional().describe('DC of the skill check')
        })
    },

    CREATE_CORPSE: {
        name: 'create_corpse',
        description: 'Manually create a corpse for a dead character.',
        inputSchema: z.object({
            characterId: z.string(),
            characterName: z.string(),
            characterType: z.enum(['pc', 'npc', 'enemy', 'neutral']),
            creatureType: z.string().optional().describe('Creature type for loot table lookup'),
            cr: z.number().optional().describe('Challenge rating for loot scaling'),
            worldId: z.string().optional(),
            regionId: z.string().optional(),
            encounterId: z.string().optional(),
            position: z.object({ x: z.number(), y: z.number() }).optional()
        })
    },

    GENERATE_LOOT: {
        name: 'generate_loot',
        description: 'Generate loot for a corpse based on creature type and CR.',
        inputSchema: z.object({
            corpseId: z.string(),
            creatureType: z.string(),
            cr: z.number().optional()
        })
    },

    GET_CORPSE_INVENTORY: {
        name: 'get_corpse_inventory',
        description: 'Get the inventory of a corpse (items available to loot).',
        inputSchema: z.object({
            corpseId: z.string()
        })
    },

    CREATE_LOOT_TABLE: {
        name: 'create_loot_table',
        description: 'Create a loot table for a creature type.',
        inputSchema: LootTableSchema.omit({ id: true, createdAt: true, updatedAt: true })
    },

    GET_LOOT_TABLE: {
        name: 'get_loot_table',
        description: 'Get a loot table by ID or creature type.',
        inputSchema: z.object({
            id: z.string().optional(),
            creatureType: z.string().optional(),
            cr: z.number().optional()
        })
    },

    LIST_LOOT_TABLES: {
        name: 'list_loot_tables',
        description: 'List all registered loot tables.',
        inputSchema: z.object({})
    },

    ADVANCE_CORPSE_DECAY: {
        name: 'advance_corpse_decay',
        description: 'Process corpse decay when game time advances.',
        inputSchema: z.object({
            hoursAdvanced: z.number().int().min(1)
        })
    },

    CLEANUP_CORPSES: {
        name: 'cleanup_corpses',
        description: 'Remove corpses that have fully decayed (state = gone).',
        inputSchema: z.object({})
    }
} as const;

// ============================================================
// TOOL HANDLERS
// ============================================================

function getRepo(): CorpseRepository {
    const db = getDb(process.env.NODE_ENV === 'test' ? ':memory:' : 'rpg.db');
    return new CorpseRepository(db);
}

export async function handleGetCorpse(args: unknown, _ctx: SessionContext) {
    const parsed = CorpseTools.GET_CORPSE.inputSchema.parse(args);
    const repo = getRepo();

    const corpse = repo.findById(parsed.corpseId);
    if (!corpse) {
        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify({
                    found: false,
                    corpseId: parsed.corpseId,
                    message: 'Corpse not found'
                }, null, 2)
            }]
        };
    }

    const inventory = repo.getAvailableLoot(parsed.corpseId);

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                found: true,
                corpse,
                availableLoot: inventory,
                canLoot: corpse.state !== 'gone' && inventory.length > 0,
                canHarvest: corpse.harvestable && corpse.state !== 'skeletal' && corpse.state !== 'gone'
            }, null, 2)
        }]
    };
}

export async function handleGetCorpseByCharacter(args: unknown, _ctx: SessionContext) {
    const parsed = CorpseTools.GET_CORPSE_BY_CHARACTER.inputSchema.parse(args);
    const repo = getRepo();

    const corpse = repo.findByCharacterId(parsed.characterId);
    if (!corpse) {
        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify({
                    found: false,
                    characterId: parsed.characterId,
                    message: 'No corpse found for this character'
                }, null, 2)
            }]
        };
    }

    const inventory = repo.getAvailableLoot(corpse.id);

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                found: true,
                corpse,
                availableLoot: inventory
            }, null, 2)
        }]
    };
}

export async function handleListCorpsesInEncounter(args: unknown, _ctx: SessionContext) {
    const parsed = CorpseTools.LIST_CORPSES_IN_ENCOUNTER.inputSchema.parse(args);
    const repo = getRepo();

    const corpses = repo.findByEncounterId(parsed.encounterId);

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                encounterId: parsed.encounterId,
                count: corpses.length,
                corpses: corpses.map(c => ({
                    id: c.id,
                    characterName: c.characterName,
                    characterType: c.characterType,
                    state: c.state,
                    looted: c.looted,
                    position: c.position
                }))
            }, null, 2)
        }]
    };
}

export async function handleListCorpsesNearby(args: unknown, _ctx: SessionContext) {
    const parsed = CorpseTools.LIST_CORPSES_NEARBY.inputSchema.parse(args);
    const repo = getRepo();

    const corpses = repo.findNearPosition(parsed.worldId, parsed.x, parsed.y, parsed.radius);

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                worldId: parsed.worldId,
                center: { x: parsed.x, y: parsed.y },
                radius: parsed.radius,
                count: corpses.length,
                corpses: corpses.map(c => ({
                    id: c.id,
                    characterName: c.characterName,
                    state: c.state,
                    looted: c.looted,
                    position: c.position,
                    distance: c.position
                        ? Math.sqrt(Math.pow(c.position.x - parsed.x, 2) + Math.pow(c.position.y - parsed.y, 2))
                        : null
                }))
            }, null, 2)
        }]
    };
}

export async function handleLootCorpse(args: unknown, _ctx: SessionContext) {
    const parsed = CorpseTools.LOOT_CORPSE.inputSchema.parse(args);
    const repo = getRepo();

    if (parsed.lootAll) {
        const looted = repo.lootAll(parsed.corpseId, parsed.characterId);
        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify({
                    success: true,
                    lootedBy: parsed.characterId,
                    corpseId: parsed.corpseId,
                    itemsLooted: looted,
                    totalItems: looted.length
                }, null, 2)
            }]
        };
    }

    if (!parsed.itemId) {
        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify({
                    success: false,
                    reason: 'Must specify itemId or set lootAll: true'
                }, null, 2)
            }]
        };
    }

    const result = repo.lootItem(parsed.corpseId, parsed.itemId, parsed.characterId, parsed.quantity);

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                success: result.success,
                lootedBy: parsed.characterId,
                corpseId: parsed.corpseId,
                itemId: result.itemId,
                quantity: result.quantity,
                reason: result.reason
            }, null, 2)
        }]
    };
}

export async function handleHarvestCorpse(args: unknown, _ctx: SessionContext) {
    const parsed = CorpseTools.HARVEST_CORPSE.inputSchema.parse(args);
    const repo = getRepo();

    const skillCheck = parsed.skillRoll !== undefined && parsed.skillDC !== undefined
        ? { roll: parsed.skillRoll, dc: parsed.skillDC }
        : undefined;

    const result = repo.harvestResource(
        parsed.corpseId,
        parsed.resourceType,
        parsed.characterId,
        { skillCheck }
    );

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                success: result.success,
                harvestedBy: parsed.characterId,
                corpseId: parsed.corpseId,
                resourceType: result.resourceType,
                quantity: result.quantity,
                skillCheck: skillCheck ? {
                    roll: skillCheck.roll,
                    dc: skillCheck.dc,
                    passed: skillCheck.roll >= skillCheck.dc
                } : 'not required',
                reason: result.reason
            }, null, 2)
        }]
    };
}

export async function handleCreateCorpse(args: unknown, _ctx: SessionContext) {
    const parsed = CorpseTools.CREATE_CORPSE.inputSchema.parse(args);
    const repo = getRepo();

    const corpse = repo.createFromDeath(
        parsed.characterId,
        parsed.characterName,
        parsed.characterType,
        {
            creatureType: parsed.creatureType,
            cr: parsed.cr,
            worldId: parsed.worldId,
            regionId: parsed.regionId,
            encounterId: parsed.encounterId,
            position: parsed.position
        }
    );

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                success: true,
                corpse,
                message: `Corpse created for ${parsed.characterName}`
            }, null, 2)
        }]
    };
}

export async function handleGenerateLoot(args: unknown, _ctx: SessionContext) {
    const parsed = CorpseTools.GENERATE_LOOT.inputSchema.parse(args);
    const repo = getRepo();

    const result = repo.generateLoot(parsed.corpseId, parsed.creatureType, parsed.cr);

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                success: true,
                corpseId: parsed.corpseId,
                creatureType: parsed.creatureType,
                cr: parsed.cr,
                loot: {
                    items: result.itemsAdded,
                    currency: result.currency,
                    harvestable: result.harvestable
                }
            }, null, 2)
        }]
    };
}

export async function handleGetCorpseInventory(args: unknown, _ctx: SessionContext) {
    const parsed = CorpseTools.GET_CORPSE_INVENTORY.inputSchema.parse(args);
    const repo = getRepo();

    const inventory = repo.getCorpseInventory(parsed.corpseId);
    const available = repo.getAvailableLoot(parsed.corpseId);

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                corpseId: parsed.corpseId,
                totalItems: inventory.length,
                availableToLoot: available.length,
                inventory,
                available
            }, null, 2)
        }]
    };
}

export async function handleCreateLootTable(args: unknown, _ctx: SessionContext) {
    const parsed = CorpseTools.CREATE_LOOT_TABLE.inputSchema.parse(args);
    const repo = getRepo();

    const table = repo.createLootTable(parsed);

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                success: true,
                lootTable: table,
                message: `Loot table "${table.name}" created for creature types: ${table.creatureTypes.join(', ')}`
            }, null, 2)
        }]
    };
}

export async function handleGetLootTable(args: unknown, _ctx: SessionContext) {
    const parsed = CorpseTools.GET_LOOT_TABLE.inputSchema.parse(args);
    const repo = getRepo();

    let table = null;
    if (parsed.id) {
        table = repo.findLootTableById(parsed.id);
    } else if (parsed.creatureType) {
        table = repo.findLootTableByCreatureType(parsed.creatureType, parsed.cr);
    }

    if (!table) {
        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify({
                    found: false,
                    message: 'No matching loot table found'
                }, null, 2)
            }]
        };
    }

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                found: true,
                lootTable: table
            }, null, 2)
        }]
    };
}

export async function handleListLootTables(args: unknown, _ctx: SessionContext) {
    CorpseTools.LIST_LOOT_TABLES.inputSchema.parse(args);
    const repo = getRepo();

    const tables = repo.listLootTables();

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                count: tables.length,
                tables: tables.map(t => ({
                    id: t.id,
                    name: t.name,
                    creatureTypes: t.creatureTypes,
                    crRange: t.crRange
                }))
            }, null, 2)
        }]
    };
}

export async function handleAdvanceCorpseDecay(args: unknown, _ctx: SessionContext) {
    const parsed = CorpseTools.ADVANCE_CORPSE_DECAY.inputSchema.parse(args);
    const repo = getRepo();

    const changes = repo.processDecay(parsed.hoursAdvanced);

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                success: true,
                hoursAdvanced: parsed.hoursAdvanced,
                corpsesDecayed: changes.length,
                changes: changes.map(c => ({
                    corpseId: c.corpseId,
                    from: c.oldState,
                    to: c.newState
                }))
            }, null, 2)
        }]
    };
}

export async function handleCleanupCorpses(args: unknown, _ctx: SessionContext) {
    CorpseTools.CLEANUP_CORPSES.inputSchema.parse(args);
    const repo = getRepo();

    const count = repo.cleanupGoneCorpses();

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                success: true,
                corpsesRemoved: count
            }, null, 2)
        }]
    };
}
