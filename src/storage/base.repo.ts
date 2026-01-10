/**
 * Base Repository - Common patterns for all repositories
 *
 * DRY Consolidation: Extracts common CRUD patterns from 26 repository files.
 *
 * Features:
 * - Standard findById, findByName, listAll, delete operations
 * - JSON serialization/deserialization helpers
 * - Snake_case <-> camelCase mapping
 * - Timestamp management
 * - Schema validation through Zod
 *
 * Usage:
 *   class SecretRepository extends BaseRepository<Secret, SecretRow> {
 *       constructor(db: Database.Database) {
 *           super(db, 'secrets', SecretSchema);
 *       }
 *
 *       protected rowToEntity(row: SecretRow): Secret {
 *           return this.validateEntity({
 *               id: row.id,
 *               worldId: row.world_id,
 *               // ... mappings
 *           });
 *       }
 *   }
 */

import Database from 'better-sqlite3';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// BASE ENTITY TYPE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimum required fields for all entities
 */
export interface BaseEntity {
    id: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Entity that includes a name field (most entities)
 */
export interface NamedEntity extends BaseEntity {
    name: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// JSON FIELD HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * JSON serialization/deserialization utilities
 *
 * Used for converting complex objects to/from SQLite JSON strings
 */
export const jsonField = {
    /**
     * Serialize a value to JSON string for database storage
     */
    serialize(value: unknown): string {
        return JSON.stringify(value);
    },

    /**
     * Deserialize a JSON string from database, with fallback
     */
    deserialize<T>(json: string | null | undefined, fallback: T): T {
        if (!json) return fallback;
        try {
            return JSON.parse(json) as T;
        } catch {
            return fallback;
        }
    },

    /**
     * Deserialize and throw on error (for required fields)
     */
    deserializeStrict<T>(json: string): T {
        return JSON.parse(json) as T;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// TIMESTAMP HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate current ISO timestamp
 */
export function now(): string {
    return new Date().toISOString();
}

/**
 * Add timestamps to a new entity
 */
export function withCreateTimestamps<T extends Omit<BaseEntity, 'createdAt' | 'updatedAt'>>(
    entity: T
): T & { createdAt: string; updatedAt: string } {
    const timestamp = now();
    return {
        ...entity,
        createdAt: timestamp,
        updatedAt: timestamp
    };
}

/**
 * Update the updatedAt timestamp
 */
export function withUpdateTimestamp<T extends BaseEntity>(entity: T): T {
    return {
        ...entity,
        updatedAt: now()
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// CASE CONVERSION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert camelCase to snake_case
 */
export function toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Convert snake_case to camelCase
 */
export function toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert object keys from camelCase to snake_case
 */
export function keysToSnakeCase<T extends Record<string, unknown>>(
    obj: T
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        result[toSnakeCase(key)] = value;
    }
    return result;
}

/**
 * Convert object keys from snake_case to camelCase
 */
export function keysToCamelCase<T extends Record<string, unknown>>(
    obj: T
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        result[toCamelCase(key)] = value;
    }
    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// BASE REPOSITORY CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base repository with common CRUD operations
 *
 * @template TEntity - The domain entity type
 * @template TRow - The database row type (snake_case)
 */
export abstract class BaseRepository<
    TEntity extends BaseEntity,
    TRow extends Record<string, unknown> = Record<string, unknown>
> {
    constructor(
        protected db: Database.Database,
        protected tableName: string,
        protected schema: z.ZodType<TEntity>
    ) {}

    // ─────────────────────────────────────────────────────────────────────────
    // ABSTRACT METHODS (must be implemented by subclasses)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Convert a database row to a domain entity
     * Must handle snake_case -> camelCase conversion
     */
    protected abstract rowToEntity(row: TRow): TEntity;

    // ─────────────────────────────────────────────────────────────────────────
    // COMMON CRUD OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Find an entity by ID
     */
    findById(id: string): TEntity | null {
        const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`);
        const row = stmt.get(id) as TRow | undefined;

        if (!row) return null;
        return this.rowToEntity(row);
    }

    /**
     * Find an entity by name (if the entity has a name column)
     */
    findByName(name: string): TEntity | null {
        try {
            const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE name = ?`);
            const row = stmt.get(name) as TRow | undefined;

            if (!row) return null;
            return this.rowToEntity(row);
        } catch {
            // Table might not have a name column
            return null;
        }
    }

    /**
     * Find an entity by name (case-insensitive)
     */
    findByNameCaseInsensitive(name: string): TEntity | null {
        try {
            const stmt = this.db.prepare(
                `SELECT * FROM ${this.tableName} WHERE LOWER(name) = LOWER(?)`
            );
            const row = stmt.get(name) as TRow | undefined;

            if (!row) return null;
            return this.rowToEntity(row);
        } catch {
            return null;
        }
    }

    /**
     * List all entities
     */
    listAll(): TEntity[] {
        const stmt = this.db.prepare(`SELECT * FROM ${this.tableName}`);
        const rows = stmt.all() as TRow[];
        return rows.map(row => this.rowToEntity(row));
    }

    /**
     * Delete an entity by ID
     */
    delete(id: string): boolean {
        const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
        const result = stmt.run(id);
        return result.changes > 0;
    }

    /**
     * Check if an entity exists
     */
    exists(id: string): boolean {
        const stmt = this.db.prepare(`SELECT 1 FROM ${this.tableName} WHERE id = ? LIMIT 1`);
        return stmt.get(id) !== undefined;
    }

    /**
     * Count all entities
     */
    count(): number {
        const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`);
        const result = stmt.get() as { count: number };
        return result.count;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Validate an entity through the Zod schema
     */
    protected validateEntity(data: unknown): TEntity {
        return this.schema.parse(data);
    }

    /**
     * Safely validate, returning null on failure
     */
    protected safeValidateEntity(data: unknown): TEntity | null {
        const result = this.schema.safeParse(data);
        return result.success ? result.data : null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // QUERY HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Execute a raw query and map results
     */
    protected query(sql: string, params: unknown[] = []): TEntity[] {
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params) as TRow[];
        return rows.map(row => this.rowToEntity(row));
    }

    /**
     * Execute a raw query and get first result
     */
    protected queryOne(sql: string, params: unknown[] = []): TEntity | null {
        const stmt = this.db.prepare(sql);
        const row = stmt.get(...params) as TRow | undefined;
        return row ? this.rowToEntity(row) : null;
    }

    /**
     * Execute a non-select statement
     */
    protected execute(sql: string, params: Record<string, unknown> = {}): Database.RunResult {
        const stmt = this.db.prepare(sql);
        return stmt.run(params);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// WORLD-SCOPED REPOSITORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base for entities that belong to a world
 */
export interface WorldEntity extends BaseEntity {
    worldId: string;
}

/**
 * Repository for world-scoped entities
 */
export abstract class WorldScopedRepository<
    TEntity extends WorldEntity,
    TRow extends Record<string, unknown> = Record<string, unknown>
> extends BaseRepository<TEntity, TRow> {

    /**
     * Find all entities for a world
     */
    findByWorld(worldId: string): TEntity[] {
        const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE world_id = ?`);
        const rows = stmt.all(worldId) as TRow[];
        return rows.map(row => this.rowToEntity(row));
    }

    /**
     * Delete all entities for a world
     */
    deleteByWorld(worldId: string): number {
        const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE world_id = ?`);
        const result = stmt.run(worldId);
        return result.changes;
    }

    /**
     * Count entities for a world
     */
    countByWorld(worldId: string): number {
        const stmt = this.db.prepare(
            `SELECT COUNT(*) as count FROM ${this.tableName} WHERE world_id = ?`
        );
        const result = stmt.get(worldId) as { count: number };
        return result.count;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTER BUILDER HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper for building WHERE clauses with dynamic filters
 */
export class FilterBuilder {
    private clauses: string[] = [];
    private params: Record<string, unknown> = {};

    /**
     * Add a filter condition if value is defined
     */
    add(column: string, param: string, value: unknown): this {
        if (value !== undefined && value !== null) {
            this.clauses.push(`${column} = @${param}`);
            this.params[param] = value;
        }
        return this;
    }

    /**
     * Add a boolean filter (SQLite stores as 0/1)
     */
    addBoolean(column: string, param: string, value: boolean | undefined): this {
        if (value !== undefined) {
            this.clauses.push(`${column} = @${param}`);
            this.params[param] = value ? 1 : 0;
        }
        return this;
    }

    /**
     * Add a LIKE filter
     */
    addLike(column: string, param: string, value: string | undefined): this {
        if (value !== undefined && value !== '') {
            this.clauses.push(`${column} LIKE @${param}`);
            this.params[param] = `%${value}%`;
        }
        return this;
    }

    /**
     * Build the WHERE clause
     */
    build(): { where: string; params: Record<string, unknown> } {
        const where = this.clauses.length > 0
            ? `WHERE ${this.clauses.join(' AND ')}`
            : '';
        return { where, params: this.params };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export {
    Database
};
