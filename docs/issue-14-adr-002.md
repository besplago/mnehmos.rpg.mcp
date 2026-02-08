## ADR-002: Explicit Session Context Injection

### Status
Proposed

### Context
Some consolidated tool modules use module-scoped mutable session context (example pattern in `src/server/consolidated/combat-manage.ts`).

### Problem
Module-scoped mutable context can produce hidden coupling and race/leak risks under concurrent calls and parallel tests.

### Decision
Require **explicit `SessionContext` injection** through router/handler signatures. Disallow module-scoped mutable context holders in consolidated tools.

### Consequences
**Positive**
- Predictable request scoping
- Better concurrency safety
- Easier test isolation and reasoning

**Trade-offs**
- Refactor touches many handlers/routers
- Transitional adapter code may be needed while migrating

### Acceptance Criteria
- [ ] No module-level mutable `SessionContext` holders in consolidated tool modules
- [ ] Router utilities support explicit context threading
- [ ] Multi-session/concurrency tests prove no context leakage
- [ ] Runtime behavior for existing tool calls remains unchanged

### Source
Architecture analysis: `docs/ARCHITECTURE-CODEBASE-ANALYSIS.md`
