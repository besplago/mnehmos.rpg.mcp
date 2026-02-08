import {
    createLogger,
    setLogLevel,
    resetLogLevel,
    getErrorMessage,
    createTimer,
    logger
} from '../../src/utils/logger.js';

describe('logger utilities', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // Reset log level before each test
        resetLogLevel();
        // Spy on console.error (MCP uses stderr)
        consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleSpy.mockRestore();
        resetLogLevel();
    });

    describe('createLogger', () => {
        it('should create a logger with the given prefix', () => {
            setLogLevel('info');
            const log = createLogger('TestModule');
            log.info('Test message');

            expect(consoleSpy).toHaveBeenCalled();
            const output = consoleSpy.mock.calls[0][0] as string;
            expect(output).toContain('[TestModule]');
            expect(output).toContain('Test message');
        });

        it('should include log level in output', () => {
            setLogLevel('info');
            const log = createLogger('Test');

            log.info('Info message');
            expect(consoleSpy.mock.calls[0][0]).toContain('[INFO ]');

            log.warn('Warn message');
            expect(consoleSpy.mock.calls[1][0]).toContain('[WARN ]');

            log.error('Error message');
            expect(consoleSpy.mock.calls[2][0]).toContain('[ERROR]');
        });

        it('should include timestamp in output', () => {
            setLogLevel('info');
            const log = createLogger('Test');
            log.info('Test');

            const output = consoleSpy.mock.calls[0][0] as string;
            // Format: HH:mm:ss.SSS
            expect(output).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
        });
    });

    describe('log levels', () => {
        it('should respect info level (default)', () => {
            setLogLevel('info');
            const log = createLogger('Test');

            log.debug('Debug message');
            expect(consoleSpy).not.toHaveBeenCalled();

            log.info('Info message');
            expect(consoleSpy).toHaveBeenCalledTimes(1);

            log.warn('Warn message');
            expect(consoleSpy).toHaveBeenCalledTimes(2);

            log.error('Error message');
            expect(consoleSpy).toHaveBeenCalledTimes(3);
        });

        it('should respect debug level', () => {
            setLogLevel('debug');
            const log = createLogger('Test');

            log.debug('Debug message');
            expect(consoleSpy).toHaveBeenCalledTimes(1);
        });

        it('should respect warn level', () => {
            setLogLevel('warn');
            const log = createLogger('Test');

            log.info('Info message');
            expect(consoleSpy).not.toHaveBeenCalled();

            log.warn('Warn message');
            expect(consoleSpy).toHaveBeenCalledTimes(1);

            log.error('Error message');
            expect(consoleSpy).toHaveBeenCalledTimes(2);
        });

        it('should respect error level', () => {
            setLogLevel('error');
            const log = createLogger('Test');

            log.warn('Warn message');
            expect(consoleSpy).not.toHaveBeenCalled();

            log.error('Error message');
            expect(consoleSpy).toHaveBeenCalledTimes(1);
        });

        it('should respect silent level', () => {
            setLogLevel('silent');
            const log = createLogger('Test');

            log.debug('Debug');
            log.info('Info');
            log.warn('Warn');
            log.error('Error');

            expect(consoleSpy).not.toHaveBeenCalled();
        });
    });

    describe('child logger', () => {
        it('should create child logger with combined prefix', () => {
            setLogLevel('info');
            const log = createLogger('Parent');
            const childLog = log.child('Child');

            childLog.info('Test message');

            const output = consoleSpy.mock.calls[0][0] as string;
            expect(output).toContain('[Parent:Child]');
        });

        it('should support multiple levels of nesting', () => {
            setLogLevel('info');
            const log = createLogger('A');
            const child = log.child('B').child('C');

            child.info('Test');

            const output = consoleSpy.mock.calls[0][0] as string;
            expect(output).toContain('[A:B:C]');
        });
    });

    describe('isEnabled', () => {
        it('should correctly report enabled levels', () => {
            setLogLevel('warn');
            const log = createLogger('Test');

            expect(log.isEnabled('debug')).toBe(false);
            expect(log.isEnabled('info')).toBe(false);
            expect(log.isEnabled('warn')).toBe(true);
            expect(log.isEnabled('error')).toBe(true);
        });
    });

    describe('getErrorMessage', () => {
        it('should extract message from Error', () => {
            const error = new Error('Test error');
            expect(getErrorMessage(error)).toBe('Test error');
        });

        it('should return string errors directly', () => {
            expect(getErrorMessage('String error')).toBe('String error');
        });

        it('should stringify other types', () => {
            expect(getErrorMessage(null)).toBe('null');
            expect(getErrorMessage(undefined)).toBe('undefined');
            expect(getErrorMessage(42)).toBe('42');
            expect(getErrorMessage({ foo: 'bar' })).toBe('[object Object]');
        });
    });

    describe('createTimer', () => {
        it('should log elapsed time', async () => {
            setLogLevel('debug');
            const log = createLogger('Test');
            const timer = createTimer(log);

            // Small delay to ensure measurable time
            await new Promise(resolve => setTimeout(resolve, 10));

            timer.done('Operation completed');

            expect(consoleSpy).toHaveBeenCalled();
            const output = consoleSpy.mock.calls[0][0] as string;
            expect(output).toContain('Operation completed');
            expect(output).toMatch(/\(\d+\.\d+ms\)/);
        });
    });

    describe('global logger', () => {
        it('should be available as singleton', () => {
            setLogLevel('info');
            logger.info('Global logger test');

            expect(consoleSpy).toHaveBeenCalled();
            const output = consoleSpy.mock.calls[0][0] as string;
            expect(output).toContain('[RPG-MCP]');
        });
    });

    describe('additional arguments', () => {
        it('should pass additional arguments to console.error', () => {
            setLogLevel('info');
            const log = createLogger('Test');
            const extra = { key: 'value' };

            log.info('Message with extra', extra);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Message with extra'),
                extra
            );
        });
    });
});
