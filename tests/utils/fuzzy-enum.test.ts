import { describe, it, expect } from 'vitest';
import {
    levenshtein,
    similarity,
    normalizeInput,
    matchAction,
    isGuidingError,
    resolveIdentifier,
    CRUD_ALIASES,
    extendAliases,
    createFuzzyActionSchema
} from '../../src/utils/fuzzy-enum.js';

describe('fuzzy-enum utilities', () => {
    describe('levenshtein', () => {
        it('should return 0 for identical strings', () => {
            expect(levenshtein('test', 'test')).toBe(0);
            expect(levenshtein('', '')).toBe(0);
        });

        it('should return length for empty string comparison', () => {
            expect(levenshtein('test', '')).toBe(4);
            expect(levenshtein('', 'test')).toBe(4);
        });

        it('should calculate correct distance for single edits', () => {
            expect(levenshtein('cat', 'hat')).toBe(1);  // substitution
            expect(levenshtein('cat', 'cats')).toBe(1); // insertion
            expect(levenshtein('cats', 'cat')).toBe(1); // deletion
        });

        it('should calculate correct distance for multiple edits', () => {
            expect(levenshtein('kitten', 'sitting')).toBe(3);
            expect(levenshtein('saturday', 'sunday')).toBe(3);
        });
    });

    describe('similarity', () => {
        it('should return 1 for identical strings', () => {
            expect(similarity('test', 'test')).toBe(1);
        });

        it('should return 0 for completely different strings', () => {
            expect(similarity('abc', 'xyz')).toBe(0);
        });

        it('should return value between 0 and 1', () => {
            const sim = similarity('create', 'creat');
            expect(sim).toBeGreaterThan(0);
            expect(sim).toBeLessThan(1);
        });

        it('should be case-insensitive', () => {
            expect(similarity('Create', 'create')).toBe(1);
            expect(similarity('CREATE', 'create')).toBe(1);
        });
    });

    describe('normalizeInput', () => {
        it('should lowercase and trim', () => {
            expect(normalizeInput('  CREATE  ')).toBe('create');
            expect(normalizeInput('UPDATE')).toBe('update');
        });

        it('should replace hyphens and spaces with underscores', () => {
            expect(normalizeInput('add-member')).toBe('add_member');
            expect(normalizeInput('add member')).toBe('add_member');
            expect(normalizeInput('add-party member')).toBe('add_party_member');
        });
    });

    describe('matchAction', () => {
        const actions = ['create', 'get', 'update', 'delete', 'list'] as const;
        const aliases = {
            'new': 'create' as const,
            'fetch': 'get' as const,
            'modify': 'update' as const,
            'remove': 'delete' as const
        };

        describe('Tier 1: Exact match', () => {
            it('should match exact action (case-insensitive)', () => {
                const result = matchAction('create', actions);
                expect(isGuidingError(result)).toBe(false);
                if (!isGuidingError(result)) {
                    expect(result.matched).toBe('create');
                    expect(result.exact).toBe(true);
                    expect(result.similarity).toBe(1.0);
                }
            });

            it('should match exact action with different case', () => {
                const result = matchAction('CREATE', actions);
                expect(isGuidingError(result)).toBe(false);
                if (!isGuidingError(result)) {
                    expect(result.matched).toBe('create');
                    expect(result.exact).toBe(true);
                }
            });

            it('should match with whitespace trimmed', () => {
                const result = matchAction('  update  ', actions);
                expect(isGuidingError(result)).toBe(false);
                if (!isGuidingError(result)) {
                    expect(result.matched).toBe('update');
                    expect(result.exact).toBe(true);
                }
            });
        });

        describe('Tier 2: Alias match', () => {
            it('should match alias to canonical action', () => {
                const result = matchAction('new', actions, aliases);
                expect(isGuidingError(result)).toBe(false);
                if (!isGuidingError(result)) {
                    expect(result.matched).toBe('create');
                    expect(result.exact).toBe(false);
                    expect(result.similarity).toBe(0.95);
                }
            });

            it('should match all aliases', () => {
                expect(matchAction('fetch', actions, aliases)).toHaveProperty('matched', 'get');
                expect(matchAction('modify', actions, aliases)).toHaveProperty('matched', 'update');
                expect(matchAction('remove', actions, aliases)).toHaveProperty('matched', 'delete');
            });
        });

        describe('Tier 3: Fuzzy match', () => {
            it('should match typos (missing letter)', () => {
                const result = matchAction('creat', actions, aliases);
                expect(isGuidingError(result)).toBe(false);
                if (!isGuidingError(result)) {
                    expect(result.matched).toBe('create');
                    expect(result.exact).toBe(false);
                    expect(result.similarity).toBeGreaterThan(0.6);
                }
            });

            it('should match typos (wrong letter)', () => {
                const result = matchAction('updete', actions, aliases);
                expect(isGuidingError(result)).toBe(false);
                if (!isGuidingError(result)) {
                    expect(result.matched).toBe('update');
                }
            });

            it('should match typos (extra letter)', () => {
                const result = matchAction('deletee', actions, aliases);
                expect(isGuidingError(result)).toBe(false);
                if (!isGuidingError(result)) {
                    expect(result.matched).toBe('delete');
                }
            });
        });

        describe('Guiding errors', () => {
            it('should return guiding error for unknown action', () => {
                const result = matchAction('xyz', actions, aliases);
                expect(isGuidingError(result)).toBe(true);
                if (isGuidingError(result)) {
                    expect(result.error).toBe('invalid_action');
                    expect(result.input).toBe('xyz');
                    expect(result.suggestions).toHaveLength(3);
                    expect(result.message).toContain('Did you mean');
                }
            });

            it('should include similarity percentages in suggestions', () => {
                const result = matchAction('createe', actions, aliases);
                // This might match fuzzy or return error depending on threshold
                if (isGuidingError(result)) {
                    expect(result.suggestions[0]).toHaveProperty('similarity');
                    expect(typeof result.suggestions[0].similarity).toBe('number');
                }
            });
        });
    });

    describe('resolveIdentifier', () => {
        const entities = [
            { id: 'uuid-1', name: 'Valeros' },
            { id: 'uuid-2', name: 'Seelah' },
            { id: 'uuid-3', name: 'Ezren' }
        ];

        const findById = (id: string) => entities.find(e => e.id === id) ?? null;
        const findByName = (name: string) => entities.find(e => e.name === name) ?? null;
        const listAll = () => entities;

        it('should find by exact UUID', () => {
            const result = resolveIdentifier('uuid-1', findById, findByName, listAll);
            expect(isGuidingError(result)).toBe(false);
            if (!isGuidingError(result)) {
                expect(result.name).toBe('Valeros');
            }
        });

        it('should find by exact name', () => {
            const result = resolveIdentifier('Valeros', findById, findByName, listAll);
            expect(isGuidingError(result)).toBe(false);
            if (!isGuidingError(result)) {
                expect(result.id).toBe('uuid-1');
            }
        });

        it('should find by case-insensitive name', () => {
            const result = resolveIdentifier('valeros', findById, findByName, listAll);
            expect(isGuidingError(result)).toBe(false);
            if (!isGuidingError(result)) {
                expect(result.name).toBe('Valeros');
            }
        });

        it('should find by fuzzy name match', () => {
            const result = resolveIdentifier('Valero', findById, findByName, listAll);
            // High similarity, should match
            expect(isGuidingError(result)).toBe(false);
            if (!isGuidingError(result)) {
                expect(result.name).toBe('Valeros');
            }
        });

        it('should return guiding error for unknown identifier', () => {
            const result = resolveIdentifier('Unknown', findById, findByName, listAll);
            expect(isGuidingError(result)).toBe(true);
            if (isGuidingError(result)) {
                expect(result.error).toBe('invalid_identifier');
                expect(result.suggestions).toHaveLength(3);
            }
        });
    });

    describe('CRUD_ALIASES', () => {
        it('should have aliases for all CRUD operations', () => {
            expect(CRUD_ALIASES['new']).toBe('create');
            expect(CRUD_ALIASES['fetch']).toBe('get');
            expect(CRUD_ALIASES['modify']).toBe('update');
            expect(CRUD_ALIASES['remove']).toBe('delete');
            expect(CRUD_ALIASES['all']).toBe('list');
        });
    });

    describe('extendAliases', () => {
        it('should merge base and extension aliases', () => {
            const base = { 'new': 'create' as const };
            const extension = { 'spawn': 'create' as const };
            const result = extendAliases(base, extension);

            expect(result['new']).toBe('create');
            expect(result['spawn']).toBe('create');
        });

        it('should allow extension to override base', () => {
            const base = { 'add': 'create' as const };
            const extension = { 'add': 'update' as const };
            const result = extendAliases(base, extension);

            expect(result['add']).toBe('update');
        });
    });

    describe('createFuzzyActionSchema', () => {
        const actions = ['create', 'get', 'update', 'delete'] as const;
        const aliases = { 'new': 'create' as const };
        const schema = createFuzzyActionSchema(actions, aliases);

        it('should parse exact action', () => {
            expect(schema.parse('create')).toBe('create');
            expect(schema.parse('get')).toBe('get');
        });

        it('should parse alias', () => {
            expect(schema.parse('new')).toBe('create');
        });

        it('should parse fuzzy match', () => {
            expect(schema.parse('creat')).toBe('create');
        });

        it('should throw on invalid action', () => {
            expect(() => schema.parse('xyz')).toThrow();
        });
    });
});
