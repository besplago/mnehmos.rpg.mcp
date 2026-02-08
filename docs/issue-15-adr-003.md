## ADR-003: Domain Service/Facade Boundary

### Status
Proposed

### Context
Consolidated MCP handlers currently include direct persistence access patterns (e.g., direct DB/repository calls).

### Problem
Transport-layer handlers directly coupling to DB lifecycle/persistence details increases test friction and architectural rigidity.

### Decision
Introduce **domain service/facade interfaces** between MCP handlers and repositories:
- Server/tool handlers depend on service interfaces
- Services coordinate domain operations and repository calls
- Storage layer owns DB lifecycle and repository implementation details

### Consequences
**Positive**
- Improved separation of concerns
- Better testability via service mocks
- Cleaner boundaries for future transport/runtime changes

**Trade-offs**
- Additional abstraction layer and wiring
- Requires phased migration to avoid regressions

### Acceptance Criteria
- [ ] Combat, world, and inventory handlers route through service facades first
- [ ] Handlers no longer call `getDb()` directly
- [ ] Unit tests can mock services without DB dependency
- [ ] Architecture docs updated with boundary contracts

### Source
Architecture analysis: `docs/ARCHITECTURE-CODEBASE-ANALYSIS.md`
