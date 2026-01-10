/**
 * Logger - Structured logging for RPG-MCP
 *
 * Hygiene Improvement: Replaces raw console statements with structured logging.
 *
 * Features:
 * - Log levels (debug, info, warn, error)
 * - Environment-based log level control (RPG_LOG_LEVEL)
 * - Module prefixes for easy filtering
 * - Silent mode for tests
 * - MCP-compatible stderr output (stdout reserved for MCP protocol)
 *
 * Usage:
 *   import { createLogger } from '../utils/logger.js';
 *   const log = createLogger('Combat');
 *
 *   log.debug('Detailed info');  // Only shown when RPG_LOG_LEVEL=debug
 *   log.info('Normal operation');
 *   log.warn('Potential issue');
 *   log.error('Something broke');
 *
 * Environment:
 *   RPG_LOG_LEVEL=debug|info|warn|error|silent (default: info)
 *   NODE_ENV=test automatically sets silent
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface Logger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;

    /** Create a child logger with additional prefix */
    child(prefix: string): Logger;

    /** Check if a log level is enabled */
    isEnabled(level: LogLevel): boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOG LEVEL CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    silent: 4
};

/**
 * Get the configured log level from environment
 * - RPG_LOG_LEVEL takes priority
 * - NODE_ENV=test defaults to silent
 * - Otherwise defaults to info
 */
function getConfiguredLevel(): LogLevel {
    const envLevel = process.env.RPG_LOG_LEVEL?.toLowerCase() as LogLevel | undefined;

    if (envLevel && envLevel in LOG_LEVEL_PRIORITY) {
        return envLevel;
    }

    // Silent in test environment unless explicitly set
    if (process.env.NODE_ENV === 'test') {
        return 'silent';
    }

    return 'info';
}

// Cache the configured level
let configuredLevel: LogLevel | null = null;

function getLevel(): LogLevel {
    if (configuredLevel === null) {
        configuredLevel = getConfiguredLevel();
    }
    return configuredLevel;
}

/**
 * Reset the cached level (useful for tests)
 */
export function resetLogLevel(): void {
    configuredLevel = null;
}

/**
 * Override the log level programmatically
 */
export function setLogLevel(level: LogLevel): void {
    configuredLevel = level;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

class StderrLogger implements Logger {
    private prefix: string;

    constructor(prefix: string) {
        this.prefix = prefix;
    }

    private shouldLog(level: LogLevel): boolean {
        const configuredPriority = LOG_LEVEL_PRIORITY[getLevel()];
        const messagePriority = LOG_LEVEL_PRIORITY[level];
        return messagePriority >= configuredPriority;
    }

    isEnabled(level: LogLevel): boolean {
        return this.shouldLog(level);
    }

    private formatMessage(level: LogLevel, message: string): string {
        const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
        const levelTag = level.toUpperCase().padEnd(5);
        return `[${timestamp}] [${levelTag}] [${this.prefix}] ${message}`;
    }

    debug(message: string, ...args: unknown[]): void {
        if (this.shouldLog('debug')) {
            console.error(this.formatMessage('debug', message), ...args);
        }
    }

    info(message: string, ...args: unknown[]): void {
        if (this.shouldLog('info')) {
            console.error(this.formatMessage('info', message), ...args);
        }
    }

    warn(message: string, ...args: unknown[]): void {
        if (this.shouldLog('warn')) {
            console.error(this.formatMessage('warn', message), ...args);
        }
    }

    error(message: string, ...args: unknown[]): void {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message), ...args);
        }
    }

    child(prefix: string): Logger {
        return new StderrLogger(`${this.prefix}:${prefix}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a logger instance with the given module prefix
 *
 * @example
 * const log = createLogger('Combat');
 * log.info('Combat started');
 * // Output: [12:34:56.789] [INFO ] [Combat] Combat started
 *
 * const childLog = log.child('Initiative');
 * childLog.debug('Rolling initiative');
 * // Output: [12:34:56.790] [DEBUG] [Combat:Initiative] Rolling initiative
 */
export function createLogger(prefix: string): Logger {
    return new StderrLogger(prefix);
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL LOGGER (for backwards compatibility during migration)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Global logger instance for quick access
 * Prefer creating module-specific loggers with createLogger()
 */
export const logger = createLogger('RPG-MCP');

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log a structured object with pretty formatting
 */
export function logObject(logger: Logger, level: LogLevel, label: string, obj: unknown): void {
    const formatted = JSON.stringify(obj, null, 2);
    switch (level) {
        case 'debug':
            logger.debug(`${label}:\n${formatted}`);
            break;
        case 'info':
            logger.info(`${label}:\n${formatted}`);
            break;
        case 'warn':
            logger.warn(`${label}:\n${formatted}`);
            break;
        case 'error':
            logger.error(`${label}:\n${formatted}`);
            break;
    }
}

/**
 * Create a timer for performance logging
 *
 * @example
 * const timer = createTimer(log);
 * // ... do work ...
 * timer.done('Operation completed'); // Logs with duration
 */
export function createTimer(logger: Logger): { done: (message: string) => void } {
    const start = performance.now();
    return {
        done(message: string): void {
            const duration = performance.now() - start;
            logger.debug(`${message} (${duration.toFixed(2)}ms)`);
        }
    };
}

/**
 * Wrap an async function with entry/exit logging
 */
export function withLogging<TArgs extends unknown[], TResult>(
    logger: Logger,
    name: string,
    fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
    return async (...args: TArgs): Promise<TResult> => {
        logger.debug(`${name} started`);
        const timer = createTimer(logger);
        try {
            const result = await fn(...args);
            timer.done(`${name} completed`);
            return result;
        } catch (error) {
            logger.error(`${name} failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return String(error);
}

/**
 * Log an error with stack trace if available
 */
export function logError(logger: Logger, message: string, error: unknown): void {
    const errorMessage = getErrorMessage(error);
    logger.error(`${message}: ${errorMessage}`);

    if (error instanceof Error && error.stack && logger.isEnabled('debug')) {
        logger.debug(`Stack trace:\n${error.stack}`);
    }
}
