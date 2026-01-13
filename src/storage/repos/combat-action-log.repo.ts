import Database from 'better-sqlite3';

/**
 * Combat Action Log Entry
 * Represents a single action taken during combat
 */
export interface CombatActionLogEntry {
    id?: number;
    encounterId: string;
    round: number;
    turnIndex: number;
    actorId: string;
    actorName: string;
    actionType: string;
    targetIds?: string[];
    resultSummary: string;
    resultDetail?: string;
    damageDealt?: number;
    healingDone?: number;
    hpChanges?: Record<string, { before: number; after: number }>;
    timestamp: string;
}

/**
 * CombatActionLogRepository - Persistence layer for combat action history
 *
 * PLAYTEST-FIX: This provides context compaction resilience by logging
 * all combat actions to the database. When Claude's context window compacts,
 * the action history can be retrieved to reconstruct what happened.
 */
export class CombatActionLogRepository {
    constructor(private db: Database.Database) {}

    /**
     * Log a combat action
     */
    log(entry: Omit<CombatActionLogEntry, 'id' | 'timestamp'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO combat_action_log
            (encounter_id, round, turn_index, actor_id, actor_name, action_type, target_ids, result_summary, result_detail, damage_dealt, healing_done, hp_changes, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            entry.encounterId,
            entry.round,
            entry.turnIndex,
            entry.actorId,
            entry.actorName,
            entry.actionType,
            entry.targetIds ? JSON.stringify(entry.targetIds) : null,
            entry.resultSummary,
            entry.resultDetail || null,
            entry.damageDealt ?? null,
            entry.healingDone ?? null,
            entry.hpChanges ? JSON.stringify(entry.hpChanges) : null,
            new Date().toISOString()
        );

        return result.lastInsertRowid as number;
    }

    /**
     * Get all actions for an encounter
     */
    getByEncounter(encounterId: string): CombatActionLogEntry[] {
        const stmt = this.db.prepare(`
            SELECT * FROM combat_action_log
            WHERE encounter_id = ?
            ORDER BY round ASC, turn_index ASC, id ASC
        `);

        const rows = stmt.all(encounterId) as CombatActionLogRow[];
        return rows.map(this.mapRow);
    }

    /**
     * Get actions for a specific round
     */
    getByRound(encounterId: string, round: number): CombatActionLogEntry[] {
        const stmt = this.db.prepare(`
            SELECT * FROM combat_action_log
            WHERE encounter_id = ? AND round = ?
            ORDER BY turn_index ASC, id ASC
        `);

        const rows = stmt.all(encounterId, round) as CombatActionLogRow[];
        return rows.map(this.mapRow);
    }

    /**
     * Get the most recent N actions
     */
    getRecent(encounterId: string, limit: number = 10): CombatActionLogEntry[] {
        const stmt = this.db.prepare(`
            SELECT * FROM combat_action_log
            WHERE encounter_id = ?
            ORDER BY id DESC
            LIMIT ?
        `);

        const rows = stmt.all(encounterId, limit) as CombatActionLogRow[];
        // Reverse to get chronological order (oldest first)
        return rows.map(this.mapRow).reverse();
    }

    /**
     * Get a summary of combat history for context reconstruction
     * Returns a compact format suitable for LLM context
     */
    getSummary(encounterId: string): string {
        const actions = this.getByEncounter(encounterId);

        if (actions.length === 0) {
            return 'No combat actions recorded.';
        }

        let summary = '📜 COMBAT HISTORY\n';
        let currentRound = 0;

        for (const action of actions) {
            if (action.round !== currentRound) {
                currentRound = action.round;
                summary += `\n─── Round ${currentRound} ───\n`;
            }
            summary += `• ${action.resultSummary}\n`;
        }

        return summary;
    }

    /**
     * Delete all actions for an encounter
     * Called when encounter ends
     */
    deleteByEncounter(encounterId: string): number {
        const stmt = this.db.prepare('DELETE FROM combat_action_log WHERE encounter_id = ?');
        const result = stmt.run(encounterId);
        return result.changes;
    }

    /**
     * Map database row to entry object
     */
    private mapRow(row: CombatActionLogRow): CombatActionLogEntry {
        return {
            id: row.id,
            encounterId: row.encounter_id,
            round: row.round,
            turnIndex: row.turn_index,
            actorId: row.actor_id,
            actorName: row.actor_name,
            actionType: row.action_type,
            targetIds: row.target_ids ? JSON.parse(row.target_ids) : undefined,
            resultSummary: row.result_summary,
            resultDetail: row.result_detail || undefined,
            damageDealt: row.damage_dealt ?? undefined,
            healingDone: row.healing_done ?? undefined,
            hpChanges: row.hp_changes ? JSON.parse(row.hp_changes) : undefined,
            timestamp: row.timestamp
        };
    }
}

interface CombatActionLogRow {
    id: number;
    encounter_id: string;
    round: number;
    turn_index: number;
    actor_id: string;
    actor_name: string;
    action_type: string;
    target_ids: string | null;
    result_summary: string;
    result_detail: string | null;
    damage_dealt: number | null;
    healing_done: number | null;
    hp_changes: string | null;
    timestamp: string;
}
