
import { handleCreateEncounter, handleExecuteCombatAction } from '../../src/server/handlers/combat-handlers.js';
import { getCombatManager } from '../../src/server/state/combat-manager.js';

// Mock character data for DB lookups
const mockCharacters: Record<string, any> = {};

vi.mock('../../src/server/db.js', () => ({
    getDb: vi.fn(() => ({
        prepare: vi.fn(() => ({
            run: vi.fn(),
            get: vi.fn(),
            all: vi.fn(() => [])
        })),
        transaction: (fn: any) => fn(),
        exec: vi.fn()
    }))
}));

vi.mock('../../src/storage/index.js', () => ({
    getDb: vi.fn(() => ({
        prepare: vi.fn(() => ({
            run: vi.fn(),
            get: vi.fn(),
            all: vi.fn(() => [])
        })),
        transaction: (fn: any) => fn(),
        exec: vi.fn()
    }))
}));

vi.mock('../../src/storage/repos/character.repo.js', () => ({
    CharacterRepository: vi.fn().mockImplementation(() => ({
        findById: vi.fn((id: string) => mockCharacters[id] || null)
    }))
}));

describe('Combat Regressions', () => {
    const mockCtx = { sessionId: 'test-session', connectionId: 'test-conn' };

    beforeEach(() => {
        const manager = getCombatManager();
        manager.clear();
        // Clear mock character data
        for (const key of Object.keys(mockCharacters)) {
            delete mockCharacters[key];
        }
    });

    it('should fuzzy match "Goblin Warrior" to "goblin" preset and populate AC', async () => {
        const result = await handleCreateEncounter({
            seed: 'test-seed',
            participants: [
                {
                    id: 'goblin-1',
                    name: 'Goblin Warrior', // Should match 'goblin'
                    hp: 7,
                    maxHp: 7,
                    initiativeBonus: 2,
                    isEnemy: true,
                    conditions: []
                }
            ]
        }, mockCtx);

        // Extract encounter ID from output
        const output = result.content[0].text;
        const encounterId = output.match(/Encounter ID: (encounter-[\w-]+)/)?.[1];
        expect(encounterId).toBeDefined();

        const engine = getCombatManager().get(`test-session:${encounterId}`);
        const goblin = engine?.getState().participants.find(p => p.id === 'goblin-1');

        expect(goblin).toBeDefined();
        expect(goblin?.ac).toBe(15); // Goblin preset AC
        expect(goblin?.name).toBe('Goblin'); // Should adopt preset name
    });

    it('should apply PC character AC from database in combat', async () => {
        // Setup: PC character exists in DB with AC 13
        mockCharacters['throk-id'] = {
            id: 'throk-id',
            name: 'Throk',
            characterClass: 'Barbarian',
            race: 'Half-Orc',
            level: 1,
            hp: 15,
            maxHp: 15,
            ac: 13,
            characterType: 'pc',
            stats: { str: 16, dex: 14, con: 14, int: 8, wis: 12, cha: 10 },
        };

        const result = await handleCreateEncounter({
            seed: 'pc-ac-test',
            participants: [
                {
                    id: 'throk-id',
                    name: 'Throk',
                    hp: 15,
                    maxHp: 15,
                    initiativeBonus: 2,
                    isEnemy: false,
                    conditions: []
                },
                {
                    id: 'goblin-1',
                    name: 'Goblin',
                    hp: 7,
                    maxHp: 7,
                    initiativeBonus: 2,
                    isEnemy: true,
                    conditions: []
                }
            ]
        }, mockCtx);

        const output = result.content[0].text;
        const encounterId = output.match(/Encounter ID: (encounter-[\w-]+)/)?.[1];
        expect(encounterId).toBeDefined();

        const engine = getCombatManager().get(`test-session:${encounterId}`);
        const throk = engine?.getState().participants.find(p => p.id === 'throk-id');

        expect(throk).toBeDefined();
        expect(throk?.ac).toBe(13); // Should use DB AC, not default 10
    });

    it('should block "damage" parameter in cast_spell (CRIT-006 anti-hallucination)', async () => {
        // Setup encounter first
        const initResult = await handleCreateEncounter({
            seed: 'test-seed-2',
            participants: [
                { id: 'wizard', name: 'Wizard', hp: 20, maxHp: 20, isEnemy: false, initiativeBonus: 0, conditions: [] },
                { id: 'target', name: 'Target', hp: 20, maxHp: 20, isEnemy: true, initiativeBonus: 0, conditions: [] }
            ]
        }, mockCtx);

        const encounterId = initResult.content[0].text.match(/Encounter ID: (encounter-[\w-]+)/)?.[1];

        // Try casting spell with forbidden "damage" parameter
        // CRIT-006: Should throw error to prevent LLM hallucination attacks
        try {
            await handleExecuteCombatAction({
                encounterId,
                action: 'cast_spell',
                actorId: 'wizard',
                targetId: 'target',
                spellName: 'Firebolt',
                slotLevel: 1,
                damage: 5, // SECURITY: This should be blocked
                damageType: 'fire'
            }, mockCtx);
            // If we reach here, the validation failed
            expect.fail('Expected damage parameter validation to throw error');
        } catch (e: any) {
            // CRIT-006: Should fail because of damage parameter validation
            expect(e.message).toContain('damage parameter not allowed');
        }
    });
});
