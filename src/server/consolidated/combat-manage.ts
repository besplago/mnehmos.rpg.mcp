/**
 * Consolidated Combat Management Tool
 * Replaces 7 separate tools for encounter lifecycle management:
 * create_encounter, get_encounter_state, end_encounter, load_encounter,
 * advance_turn, roll_death_save, execute_lair_action
 */

import { z } from 'zod';
import { createActionRouter, ActionDefinition, McpResponse } from '../../utils/action-router.js';
import { SessionContext } from '../types.js';
import { RichFormatter } from '../utils/formatter.js';
import {
    handleCreateEncounter,
    handleGetEncounterState,
    handleEndEncounter,
    handleLoadEncounter,
    handleAdvanceTurn,
    handleRollDeathSave,
    handleExecuteLairAction
} from '../combat-tools.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const ACTIONS = ['create', 'get', 'end', 'load', 'advance', 'death_save', 'lair_action'] as const;
type CombatManageAction = typeof ACTIONS[number];

// ═══════════════════════════════════════════════════════════════════════════
// ACTION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

const ParticipantSchema = z.object({
    id: z.string(),
    name: z.string(),
    initiativeBonus: z.number().int(),
    hp: z.number().int().nonnegative(), // Allow 0 HP for dying characters
    maxHp: z.number().int().positive(),
    isEnemy: z.boolean().optional(),
    conditions: z.array(z.string()).default([]),
    position: z.object({
        x: z.number(),
        y: z.number(),
        z: z.number().optional()
    }).optional(),
    resistances: z.array(z.string()).optional(),
    vulnerabilities: z.array(z.string()).optional(),
    immunities: z.array(z.string()).optional()
});

const TerrainSchema = z.object({
    obstacles: z.array(z.string()).default([]),
    difficultTerrain: z.array(z.string()).optional(),
    water: z.array(z.string()).optional()
}).optional();

const CreateSchema = z.object({
    action: z.literal('create'),
    seed: z.string().describe('Seed for deterministic combat resolution'),
    participants: z.array(ParticipantSchema).min(1),
    terrain: TerrainSchema
});

const GetSchema = z.object({
    action: z.literal('get'),
    encounterId: z.string().describe('The ID of the encounter')
});

const EndSchema = z.object({
    action: z.literal('end'),
    encounterId: z.string().describe('The ID of the encounter')
});

const LoadSchema = z.object({
    action: z.literal('load'),
    encounterId: z.string().describe('The ID of the encounter to load')
});

const AdvanceSchema = z.object({
    action: z.literal('advance'),
    encounterId: z.string().describe('The ID of the encounter')
});

const DeathSaveSchema = z.object({
    action: z.literal('death_save'),
    encounterId: z.string().describe('The ID of the encounter'),
    characterId: z.string().describe('The ID of the character at 0 HP')
});

const LairActionSchema = z.object({
    action: z.literal('lair_action'),
    encounterId: z.string().describe('The ID of the encounter'),
    actionDescription: z.string().describe('Description of the lair action'),
    targetIds: z.array(z.string()).optional(),
    damage: z.number().int().min(0).optional(),
    damageType: z.string().optional(),
    savingThrow: z.object({
        ability: z.enum(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']),
        dc: z.number().int().min(1).max(30)
    }).optional(),
    halfDamageOnSave: z.boolean().default(true)
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT HOLDER (for passing session context to handlers)
// ═══════════════════════════════════════════════════════════════════════════

let currentContext: SessionContext | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// ACTION DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const definitions: Record<CombatManageAction, ActionDefinition> = {
    create: {
        schema: CreateSchema,
        handler: async (params: z.infer<typeof CreateSchema>) => {
            if (!currentContext) throw new Error('No session context');
            // Transform params to original format
            const originalParams = {
                seed: params.seed,
                participants: params.participants,
                terrain: params.terrain
            };
            const result = await handleCreateEncounter(originalParams, currentContext);
            return extractResultData(result, 'create');
        },
        aliases: ['start', 'new', 'begin', 'init']
    },

    get: {
        schema: GetSchema,
        handler: async (params: z.infer<typeof GetSchema>) => {
            if (!currentContext) throw new Error('No session context');
            const result = await handleGetEncounterState({ encounterId: params.encounterId }, currentContext);
            return extractResultData(result, 'get');
        },
        aliases: ['state', 'status', 'show']
    },

    end: {
        schema: EndSchema,
        handler: async (params: z.infer<typeof EndSchema>) => {
            if (!currentContext) throw new Error('No session context');
            const result = await handleEndEncounter({ encounterId: params.encounterId }, currentContext);
            return extractResultData(result, 'end');
        },
        aliases: ['finish', 'complete', 'stop', 'close']
    },

    load: {
        schema: LoadSchema,
        handler: async (params: z.infer<typeof LoadSchema>) => {
            if (!currentContext) throw new Error('No session context');
            const result = await handleLoadEncounter({ encounterId: params.encounterId }, currentContext);
            return extractResultData(result, 'load');
        },
        aliases: ['restore', 'resume', 'continue']
    },

    advance: {
        schema: AdvanceSchema,
        handler: async (params: z.infer<typeof AdvanceSchema>) => {
            if (!currentContext) throw new Error('No session context');
            const result = await handleAdvanceTurn({ encounterId: params.encounterId }, currentContext);
            return extractResultData(result, 'advance');
        },
        aliases: ['next', 'next_turn', 'advance_turn']
    },

    death_save: {
        schema: DeathSaveSchema,
        handler: async (params: z.infer<typeof DeathSaveSchema>) => {
            if (!currentContext) throw new Error('No session context');
            const result = await handleRollDeathSave({
                encounterId: params.encounterId,
                characterId: params.characterId
            }, currentContext);
            return extractResultData(result, 'death_save');
        },
        aliases: ['death_saving_throw', 'save_death', 'dying']
    },

    lair_action: {
        schema: LairActionSchema,
        handler: async (params: z.infer<typeof LairActionSchema>) => {
            if (!currentContext) throw new Error('No session context');
            const { action, ...lairParams } = params;
            const result = await handleExecuteLairAction(lairParams, currentContext);
            return extractResultData(result, 'lair_action');
        },
        aliases: ['lair', 'legendary', 'boss_action']
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function extractResultData(result: McpResponse, actionType: string): Record<string, unknown> {
    const text = result.content[0].text;

    // Try to extract STATE_JSON
    const stateMatch = text.match(/<!-- STATE_JSON\n([\s\S]*?)\nSTATE_JSON -->/);
    if (stateMatch) {
        try {
            const stateData = JSON.parse(stateMatch[1]);
            return {
                success: true,
                actionType,
                ...stateData,
                rawText: text.replace(/<!-- STATE_JSON[\s\S]*?STATE_JSON -->/, '').trim()
            };
        } catch {
            // Fall through to text parsing
        }
    }

    // Return as raw text
    return {
        success: true,
        actionType,
        message: text
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTER & TOOL DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

const router = createActionRouter({
    actions: ACTIONS,
    definitions,
    threshold: 0.6
});

export const CombatManageTool = {
    name: 'combat_manage',
    description: `Unified combat encounter management. Actions: ${ACTIONS.join(', ')}.
Aliases: start/begin→create, state/status→get, finish/stop→end, restore/resume→load, next→advance.

⚔️ COMBAT WORKFLOW:
1. create - Start encounter with participants and terrain
2. get - View current state
3. advance - Move to next turn
4. death_save - Roll death save for downed character
5. lair_action - Execute boss lair action
6. end - Finish combat

For combat ACTIONS (attack, move, cast), use combat_action tool instead.
For MAP operations (render, aoe, terrain), use combat_map tool instead.`,
    inputSchema: z.object({
        action: z.string().describe(`Action: ${ACTIONS.join(', ')}`),
        encounterId: z.string().optional().describe('Encounter ID (required for most actions)'),
        seed: z.string().optional().describe('Seed for new encounter (create only)'),
        participants: z.array(z.any()).optional().describe('Array of participants (create only)'),
        terrain: z.any().optional().describe('Terrain configuration (create only)'),
        characterId: z.string().optional().describe('Character ID (death_save only)'),
        actionDescription: z.string().optional().describe('Lair action description'),
        targetIds: z.array(z.string()).optional().describe('Target IDs for lair action'),
        damage: z.number().optional().describe('Lair action damage'),
        damageType: z.string().optional().describe('Damage type'),
        savingThrow: z.any().optional().describe('Saving throw for lair action'),
        halfDamageOnSave: z.boolean().optional().describe('Half damage on save')
    })
};

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCombatManage(args: unknown, ctx: SessionContext): Promise<McpResponse> {
    // Store context for handlers
    currentContext = ctx;

    try {
        const result = await router(args as Record<string, unknown>);
        const parsed = JSON.parse(result.content[0].text);

        let output = '';

        if (parsed.error) {
            output = RichFormatter.header('Error', '❌');
            output += RichFormatter.alert(parsed.message || 'Unknown error', 'error');
            if (parsed.suggestions) {
                output += '\n**Did you mean:**\n';
                parsed.suggestions.forEach((s: { action: string; similarity: number }) => {
                    output += `  • ${s.action} (${s.similarity}% match)\n`;
                });
            }
        } else {
            // Format based on action type
            switch (parsed.actionType) {
                case 'create':
                    output = RichFormatter.header('Combat Started', '⚔️');
                    if (parsed.encounterId) {
                        output += RichFormatter.keyValue({ 'Encounter ID': `\`${parsed.encounterId}\`` });
                    }
                    break;
                case 'get':
                    output = RichFormatter.header('Encounter State', '📋');
                    break;
                case 'end':
                    output = RichFormatter.header('Combat Ended', '🏁');
                    break;
                case 'load':
                    output = RichFormatter.header('Encounter Loaded', '📂');
                    break;
                case 'advance':
                    output = RichFormatter.header('Turn Advanced', '⏭️');
                    break;
                case 'death_save':
                    output = RichFormatter.header('Death Save', '💀');
                    break;
                case 'lair_action':
                    output = RichFormatter.header('Lair Action', '🏰');
                    break;
                default:
                    output = RichFormatter.header('Combat', '⚔️');
            }

            // Add raw text if present
            if (parsed.rawText) {
                output += '\n' + parsed.rawText + '\n';
            } else if (parsed.message) {
                output += '\n' + parsed.message + '\n';
            }

            // Add state info if present
            if (parsed.round !== undefined) {
                output += RichFormatter.keyValue({
                    'Round': parsed.round,
                    'Active': parsed.activeParticipant || 'N/A'
                });
            }
        }

        output += RichFormatter.embedJson(parsed, 'COMBAT_MANAGE');

        return {
            content: [{
                type: 'text' as const,
                text: output
            }]
        };
    } finally {
        currentContext = null;
    }
}
