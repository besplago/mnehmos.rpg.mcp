## ADR-004: Legacy Tool Surface Strategy (Deprecate vs Compatibility Mode)

### Status
Proposed

### Context
The consolidated runtime path is active, while `src/server/tools.ts` remains as a legacy-style tool surface.

### Problem
Without explicit policy, dual surfaces increase maintenance cost and risk behavior divergence.

### Decision (to be made)
Choose one explicit strategy and document it:
1. **Deprecate/remove legacy surface** with migration notes, or
2. **Retain compatibility mode** with explicit support guarantees and parity tests

### Consequences
**If deprecate**
- Lower long-term maintenance and less drift risk
- Requires migration communication for any dependents

**If retain compatibility**
- Better short-term backward compatibility
- Ongoing parity testing/maintenance overhead

### Acceptance Criteria
- [ ] ADR finalized with selected option
- [ ] README/docs updated with the decision
- [ ] If retained: parity test matrix for critical workflows
- [ ] If deprecated: staged removal plan and timeline

### Source
Architecture analysis: `docs/ARCHITECTURE-CODEBASE-ANALYSIS.md`
