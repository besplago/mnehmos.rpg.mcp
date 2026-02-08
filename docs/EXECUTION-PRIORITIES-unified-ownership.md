# Unified Ownership Execution Priorities

## Objective
Deliver a contract-first, multi-adapter architecture that makes this codebase the canonical unified tool backend for LLM runtimes while preserving production stability.

## Success Metrics
- 0 known metadata/schema drift defects in consolidated tools
- 100 percent of consolidated tools use explicit context injection
- 100 percent of consolidated handlers depend on domain facades, not direct DB access
- Legacy tool surface traffic below 5 percent before removal
- p95 tool latency does not regress by more than 10 percent during migration

## Priority 1: Lock Architectural Decisions and Guardrails

### Deliverables
1. Decision closure
- Finalize ADR-004 as compatibility mode with a clear deprecation trigger.
- Keep ADR-005 as the ownership architecture baseline.

2. Contract model and generators (thin slice)
- Define `ToolContract` type and generator interfaces.
- Migrate a representative thin slice (one combat, one world, one utility tool).
- Generate registry metadata and meta-tool outputs for migrated tools.

3. Safety rails
- Add parity tests ensuring generated metadata/actions/schemas match runtime behavior.
- Add CI gate that fails on contract drift for migrated tools.

### Exit Criteria
- Contract generation is running in CI for thin-slice tools.
- No behavioral regressions in migrated tools.
- ADR-004 decision is documented and discoverable.

## Priority 2: Migrate Core Runtime to Contracts and Explicit Context

### Deliverables
1. Contract migration
- Migrate consolidated tools to `ToolContract` objects.
- Remove manual metadata maps in `consolidated-registry` after parity passes.

2. Context hardening
- Remove module-level mutable context usage.
- Thread `SessionContext` via router and service signatures.
- Add parallel multi-session tests for combat/world/spatial scenarios.

3. Service facade rollout
- Introduce facades for combat, world, inventory, party, and session domains.
- Route consolidated handlers through facades first.

### Exit Criteria
- Majority of consolidated tool calls run through contract-generated registry.
- No module-level mutable context remains in migrated modules.
- Domain facade coverage includes critical gameplay paths.

## Priority 3: Complete Adapters and Prepare Legacy Removal

### Deliverables
1. Adapter completion
- MCP adapter fully generated from contracts.
- Add at least one non-MCP adapter spec target generated from the same contracts.

2. Legacy compatibility mode
- Implement forwarding from legacy surface to consolidated contracts.
- Add parity matrix tests for top workflows.
- Add runtime telemetry to measure legacy endpoint usage.

3. Planner metadata and workflows
- Publish prerequisites, next actions, and canonical workflows in contracts.
- Extend meta-tools to expose planner metadata for orchestration clients.

4. Removal readiness package
- Release notes, migration guide, and deprecation checklist.

### Exit Criteria
- 100 percent consolidated tools are contract-backed.
- Compatibility matrix is green for critical workflows.
- Legacy usage is below threshold and removal is announced.

## Workstreams

1. Platform contracts
- Scope: `ToolContract` model, registry/spec/doc generators, parity tests.

2. Runtime correctness
- Scope: context threading, race/leak testing, session isolation.

3. Domain services
- Scope: facade interfaces, handler rewiring, repository boundary cleanup.

4. Compatibility and migration
- Scope: legacy forwarding, telemetry, release communication.

## Risks and Mitigations

1. Migration churn across many files
- Mitigation: domain-by-domain rollout with parity tests per domain.

2. Behavior regressions during handler rewiring
- Mitigation: freeze action semantics; enforce snapshot and contract parity tests.

3. Performance overhead from extra abstraction
- Mitigation: benchmark before/after each domain migration; tune hot paths in services.

4. Consumer breakage from legacy removal
- Mitigation: compatibility mode, telemetry-based threshold, staged deprecation notices.
