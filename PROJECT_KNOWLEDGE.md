# mnehmos.rpg.mcp - Knowledge Base Document

## Quick Reference

| Property | Value |
|----------|-------|
| **Repository** | https://github.com/Mnehmos/mnehmos.rpg.mcp |
| **Primary Language** | TypeScript (strict mode, ESM) |
| **Project Type** | MCP Server |
| **Status** | Active (Alpha) |
| **Tool Count** | 32 (28 consolidated + 4 meta/event) |
| **Tests** | 1889 passing, 6 skipped |
| **Last Updated** | 2026-02-07 |

## Overview

mnehmos.rpg.mcp is a rules-enforced RPG backend MCP server that transforms any LLM into a game master with mechanical integrity. It provides a complete D&D 5e-compatible simulation kernel where LLMs propose narrative intentions but the engine validates and executes all game mechanics, preventing AI hallucination of dice rolls, spell slots, or hit points. Players interact through natural language with an AI dungeon master while the server handles all combat, spellcasting, inventory, quests, and world state with full SQLite persistence.

## Architecture

### System Design

The project implements an Event-Driven Agentic AI Architecture based on the OODA loop pattern (Observe-Orient-Decide-Act). LLMs act as the "brain" proposing intentions, while the engine serves as the "nervous system" validating constraints and executing actions. The system uses the Model Context Protocol (MCP) to expose 32 tools that LLMs can call to interact with the game world. All world state is persisted in SQLite with WAL mode, supporting multi-tenant projects, parallel worlds, and deterministic replay. The server can run via stdio, TCP, Unix sockets, or WebSockets for integration with various MCP clients.

The architecture enforces a key invariant: LLMs never directly mutate world state. All changes flow through validated tool calls, creating an anti-hallucination design where the AI cannot invent game outcomes.

### Consolidated Tool Pattern

The server uses an **action-routed consolidated tool** architecture. Instead of exposing 145+ individual tools (one per operation), all operations are grouped into 28 domain tools that accept an `action` parameter with fuzzy matching:

```typescript
// Old: 7 separate tools
create_character, get_character, update_character, delete_character, ...

// New: 1 consolidated tool with action routing
character_manage({ action: "create", name: "Thorgrim", ... })
character_manage({ action: "get", characterId: "abc-123" })
character_manage({ action: "update", characterId: "abc-123", hp: 15 })
```

Each consolidated tool:
- Uses `action-router.ts` for fuzzy enum matching (typos like "atack" → "attack")
- Returns guiding error messages listing valid actions on mismatch
- Wraps responses with `RichFormatter` embedding structured JSON in HTML comments
- Accepts a `SessionContext` for multi-session support

### Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| MCP Server Entry | Server init, transport setup, tool registration | `src/server/index.ts` |
| Consolidated Registry | Registers all 28 consolidated tools | `src/server/consolidated-registry.ts` |
| Consolidated Tools | Action-routed tool handlers (28 tools) | `src/server/consolidated/` |
| Combat Handlers | Combat engine handler implementations | `src/server/handlers/combat-handlers.ts` |
| Spatial Handlers | Spatial/room handler implementations | `src/server/handlers/spatial-handlers.ts` |
| Meta Tools | Tool discovery (search_tools, load_tool_schema) | `src/server/meta-tools.ts` |
| Event System | PubSub + MCP notification streaming | `src/server/events.ts` |
| Combat Engine | Initiative, damage calculation, death saves, spatial combat | `src/engine/combat/` |
| Magic System | Spell validation, slot tracking, concentration, scrolls | `src/engine/magic/` |
| Spatial Engine | Grid movement, collision detection, pathfinding | `src/engine/spatial/` |
| World Generator | Procedural generation with Perlin noise, 28+ biomes | `src/engine/worldgen/` |
| Storage Layer | SQLite repositories (27 repos) with migration system | `src/storage/` |
| Schema Definitions | Zod validation schemas (29 schemas) for all data structures | `src/schema/` |
| Preset Data | 1100+ creature presets, 50+ encounter presets, 30+ locations | `src/data/` |
| Math Utilities | Dice rolling, algebra solver, physics calculations | `src/math/` |
| Action Router | Fuzzy enum matching with guiding errors | `src/utils/action-router.ts` |
| Tool Metadata | Consolidated tool descriptions and category tags | `src/server/tool-metadata.ts` |

### Data Flow

```
Player Intent (Natural Language)
    |
LLM Interpretation -> MCP Tool Call (action-routed)
    |
Consolidated Tool -> Action Router -> Schema Validation (Zod)
    |
Handler Function -> Engine Logic -> Constraint Checking
    |
Database Update (SQLite) -> Event Emission (PubSub)
    |
RichFormatter Response -> LLM Narration -> Player
```

For combat specifically:
```
Player: "I attack the goblin"
    |
LLM -> combat_action({ action: "attack", targetId: "goblin-1" })
    |
Action Router: Match "attack" -> handleExecuteCombatAction()
    |
Combat Engine: Roll initiative, check AC, calculate damage
    |
Update HP in database -> Emit combat_state_changed event
    |
Return combat result with embedded JSON (hit/miss, damage, new HP)
    |
LLM narrates outcome based on mechanical result
```

## API Surface

### Tool Architecture

All 32 tools are registered via MCP protocol. The 28 consolidated tools use action routing; 4 are standalone meta/event tools. All consolidated tools accept a `sessionId` parameter for multi-session support.

### Meta & Event Tools (4 standalone)

| Tool | Purpose |
|------|---------|
| `search_tools` | Search tools by keyword or category |
| `load_tool_schema` | Load full Zod schema for a tool on-demand |
| `subscribe_to_events` | Subscribe to PubSub event topics (combat, quest, etc.) |
| `unsubscribe_from_events` | Unsubscribe from event topics |

### Consolidated Tools (28 action-routed)

Each tool accepts `{ action: string, ...params }`. The `action` parameter is fuzzy-matched.

#### Character & Party

| Tool | Actions | Purpose |
|------|---------|---------|
| `character_manage` | create, get, update, delete, list, level_up | Character CRUD + progression |
| `party_manage` | create, add_member, remove_member, get, list, disband | Party management |
| `rest_manage` | short, long | Short/long rest mechanics (HP, spell slots, abilities) |

#### Combat

| Tool | Actions | Purpose |
|------|---------|---------|
| `combat_manage` | create, get, end, load, advance_turn, death_save, lair_action | Encounter lifecycle |
| `combat_action` | attack, cast_spell, move, dodge, disengage, hide, dash, help, ready, shove, grapple, use_item, improvise | In-combat action resolution |
| `combat_map` | render, aoe, terrain, prop, measure, generate_patch, generate_pattern | Tactical map operations |

#### Magic & Effects

| Tool | Actions | Purpose |
|------|---------|---------|
| `concentration_manage` | check, get, break, list | Concentration tracking |
| `scroll_manage` | use, create, identify, list | Spell scroll mechanics |
| `aura_manage` | create, get, list, remove, tick, apply, check | Persistent aura effects |

#### Items & Economy

| Tool | Actions | Purpose |
|------|---------|---------|
| `item_manage` | create, get, list, update, delete, search | Item template CRUD |
| `inventory_manage` | give, remove, equip, unequip, transfer, list, use | Character inventory operations |
| `corpse_manage` | create, loot, search, decay, get, list | Corpse/loot system |
| `theft_manage` | steal, fence, investigate, heat, get, list | Theft economy with heat tracking |

#### World & Spatial

| Tool | Actions | Purpose |
|------|---------|---------|
| `world_manage` | create, get, update, list, delete, set_time, set_weather | World state management |
| `world_map` | generate, get, patch, query_tile, add_structure, list_structures | Procedural worldgen + terrain |
| `spatial_manage` | look, generate_room, exits, move, list_rooms | Room-based dungeon navigation |
| `travel_manage` | move, get_location, list_pois, enter_poi, rest_at_poi | Overworld travel system |

#### NPCs & Social

| Tool | Actions | Purpose |
|------|---------|---------|
| `npc_manage` | create, get, update, delete, list, add_memory, get_memories, relationship | NPC lifecycle + memory |
| `quest_manage` | create, get, update, list, add_objective, update_objective, complete, fail, abandon | Quest tracking |
| `narrative_manage` | add, get, list, search | Story/narrative log |
| `secret_manage` | create, get, list, reveal, update | Hidden information management |

#### Strategy & Nations

| Tool | Actions | Purpose |
|------|---------|---------|
| `strategy_manage` | create_nation, get_nation, list_nations, update_nation, diplomatic_action, get_diplomacy | Grand strategy layer |
| `turn_manage` | process, get_state, advance_phase | Turn-based strategy processing |

#### Utility & Session

| Tool | Actions | Purpose |
|------|---------|---------|
| `math_manage` | roll, algebra, physics, probability, skill_check | Dice, math, skill checks |
| `improvisation_manage` | stunt, synthesize_spell, custom_effect, wild_surge | Rule of Cool mechanics |
| `spawn_manage` | character, encounter, equipped_character, preset_encounter | Quick entity creation |
| `session_manage` | save, load, get_summary, list | Session state management |
| `batch_manage` | create_characters, create_npcs, distribute_items, multi_step | Batch operations |

### Configuration

No environment variables required for basic operation. The server uses sensible defaults.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RPG_MCP_DB_PATH` | string | `./rpg-mcp.db` | SQLite database file path |
| `RPG_MCP_TRANSPORT` | string | `stdio` | Transport mode (stdio, tcp, unix, websocket) |
| `RPG_MCP_PORT` | number | `3000` | Port for TCP/WebSocket transport |

## Usage Examples

### Basic Usage

```typescript
// Example: Starting a new game with character creation
// (These are the MCP tool calls an LLM would make)

// 1. Create a world
const world = await world_map({
  action: "generate",
  projectId: "my-game",
  worldId: "world-1",
  width: 100,
  height: 100,
  seed: "adventure-42"
});

// 2. Create a character using preset
const character = await spawn_manage({
  action: "equipped_character",
  projectId: "my-game",
  worldId: "world-1",
  preset: "fighter",
  name: "Thorgrim Ironheart"
});

// 3. Start combat encounter
const encounter = await combat_manage({
  action: "create",
  projectId: "my-game",
  worldId: "world-1",
  participants: [
    { id: "thorgrim", name: "Thorgrim", hp: 45, maxHp: 45, initiativeBonus: 2 },
    { id: "goblin-1", name: "Goblin", hp: 7, maxHp: 7, initiativeBonus: 2 }
  ]
});

// 4. Execute attack
const attackResult = await combat_action({
  action: "attack",
  actorId: "thorgrim",
  targetId: "goblin-1"
});
// Returns: hit/miss, damage rolled, new HP, embedded JSON with full state
```

### Advanced Patterns

```typescript
// Example: Spellcasting with concentration tracking

// 1. Cast a concentration spell
const spellResult = await combat_action({
  action: "cast_spell",
  actorId: "wizard-1",
  spellName: "hold_person",
  targetId: "bandit-1"
});
// Engine validates: spell known? slot available? already concentrating?

// 2. Check concentration after taking damage
const concCheck = await concentration_manage({
  action: "check",
  characterId: "wizard-1",
  damageAmount: 12
});
// DC = max(10, damage/2) = 10
// Returns: { success: false, concentration_broken: true }
// hold_person ends automatically

// 3. Fuzzy matching handles typos gracefully
const typoResult = await combat_action({
  action: "atack",  // typo!
  actorId: "wizard-1",
  targetId: "bandit-1"
});
// Action router matches "atack" -> "attack" via fuzzy matching
```

```typescript
// Example: Batch operations for efficient world building

// Spawn multiple NPCs in one call
const npcs = await batch_manage({
  action: "create_npcs",
  projectId: "my-game",
  worldId: "world-1",
  npcs: [
    { name: "Barkeep", role: "merchant", location: "tavern" },
    { name: "Guard Captain", role: "guard", location: "gate" },
    { name: "Mysterious Stranger", role: "quest_giver", location: "corner" }
  ]
});

// Create a preset encounter scaled to party level
const encounter = await spawn_manage({
  action: "preset_encounter",
  projectId: "my-game",
  worldId: "world-1",
  preset: "goblin_ambush",
  partyLevel: 5
});
```

## Dependencies

### Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @modelcontextprotocol/sdk | ^1.23.0 | MCP server implementation and transport layers |
| better-sqlite3 | ^12.4.6 | SQLite database with WAL mode and sync API |
| zod | ^3.25.76 | Schema validation for all tool inputs and data |
| uuid | ^13.0.0 | Unique identifier generation for entities |
| seedrandom | ^3.0.5 | Seeded random number generation for deterministic worlds |
| simplex-noise | ^4.0.3 | Perlin/simplex noise for procedural terrain generation |
| mathjs | ^15.1.0 | Algebra solver and mathematical operations |
| nerdamer | ^1.1.13 | Symbolic algebra solver for physics calculations |
| ws | ^8.16.0 | WebSocket transport support |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.9.3 | TypeScript compiler with strict mode enabled |
| vitest | ^1.6.1 | Test framework (1889 passing tests, 6 skipped) |
| @types/node | ^24.10.1 | Node.js type definitions |
| @types/better-sqlite3 | ^7.6.13 | SQLite type definitions |
| @types/ws | ^8.5.10 | WebSocket type definitions |
| ts-node | ^10.9.2 | TypeScript execution for development |
| esbuild | ^0.27.0 | Fast bundler for binary compilation |
| @yao-pkg/pkg | ^6.10.1 | Standalone binary packager |

## Integration Points

### Works With

| Project | Integration Type | Description |
|---------|-----------------|-------------|
| Claude Desktop | MCP Client | Primary integration target for AI-driven gameplay |
| Any MCP-compatible client | MCP Client | Works with any client supporting MCP protocol |
| mnehmos.quest-keeper.game | Peer | Desktop AI dungeon master app using this engine |

This is a standalone MCP server with no direct dependencies on other Mnehmos projects. However, it is designed to be the backend engine for AI-driven RPG experiences.

### External Services

No external services required. The server is fully self-contained with local SQLite persistence.

## Development Guide

### Prerequisites

- Node.js 20 or higher
- npm or pnpm package manager
- SQLite3 (bundled with better-sqlite3)

### Setup

```bash
# Clone the repository
git clone https://github.com/Mnehmos/mnehmos.rpg.mcp
cd mnehmos.rpg.mcp

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests (1889 tests should pass)
npm test
```

### Running Locally

```bash
# Development mode with TypeScript
npm run dev

# Production build and run
npm run build
npm start

# Run with specific transport
node dist/server/index.js --tcp --port 3000
node dist/server/index.js --websocket --port 3001
node dist/server/index.js --unix /tmp/rpg-mcp.sock
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui

# Run specific test file
npx vitest tests/engine/combat/engine.test.ts
```

**Note:** Vitest is configured with `globals: true`. Do NOT add `import { describe, it, expect } from 'vitest'` to test files - this causes silent test collection failure on Windows with vitest 1.6.1.

### Building

```bash
# Build TypeScript to JavaScript
npm run build
# Output: dist/

# Build standalone binaries for all platforms
npm run build:binaries
# Output: dist-bundle/rpg-mcp-win.exe, rpg-mcp-macos, rpg-mcp-macos-arm64, rpg-mcp-linux
```

### MCP Client Integration

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "rpg-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/mnehmos.rpg.mcp/dist/server/index.js"]
    }
  }
}
```

Or using standalone binary:

```json
{
  "mcpServers": {
    "rpg-mcp": {
      "command": "/absolute/path/to/rpg-mcp-macos"
    }
  }
}
```

## Maintenance Notes

### Known Issues

1. Binary builds for Windows may show false positive antivirus warnings due to pkg packaging (this is a known issue with standalone Node binaries)
2. WebSocket transport does not yet support authentication - should only be used on localhost
3. Large worlds (>200x200 tiles) may experience slower generation times due to Perlin noise calculations
4. Vitest 1.6.1 on Windows silently fails test collection when files have explicit vitest imports with `globals: true`

### Active TODOs

| Location | Severity | Description |
|----------|----------|-------------|
| `src/engine/magic/spell-resolver.ts:170` | high | Add target's save modifier to spell saves |
| `src/engine/magic/spell-resolver.ts:282` | high | Implement summoning spell effects |
| `src/engine/magic/scroll.ts:97` | medium | Add proficiency tracking to character schema |
| `src/engine/combat/engine.ts:585` | medium | Implement proper crit rules (double dice) |
| `src/engine/strategy/diplomacy-engine.ts:107` | low | Get turn from TurnProcessor instead of hardcoded |
| `src/engine/strategy/turn-processor.ts:32` | low | Persist GDP update to database |

### Skipped Tests

| Location | Severity | Reason |
|----------|----------|--------|
| `tests/server/consolidated/batch-manage.test.ts:230,245` | medium | distribute_items needs items in items table first |
| `tests/mcp/streaming.test.ts:21` | low | Windows process spawn timeout at MCP init |
| `tests/server/spellcasting.test.ts:1262` | high | Needs save modifier implementation (TODO above) |
| `tests/server/spellcasting.test.ts:1408,1422` | high | Counterspell not yet implemented |

### Future Considerations

1. Implement save modifiers for spell saves (high priority TODO)
2. Implement summoning spell type (high priority TODO)
3. Add cover mechanics to tactical combat (half cover, three-quarters cover)
4. Add authentication layer for networked transports (TCP/WebSocket)
5. Build visual debugger / world inspector UI for development
6. Optimize world generation for larger maps using chunked loading

### Code Quality

| Metric | Status |
|--------|--------|
| Tests | 1889 passing, 6 skipped across 85+ test files |
| Type Safety | TypeScript strict mode, near-zero `any` in consolidated tools |
| Validation | Zod runtime validation on all tool inputs |
| Documentation | JSDoc on public APIs, white paper, ADR docs |

## Appendix: File Structure

```
mnehmos.rpg.mcp/
├── src/
│   ├── server/
│   │   ├── index.ts                    # MCP server entry point and transport setup
│   │   ├── consolidated-registry.ts    # Registers all 28 consolidated tools
│   │   ├── tools.ts                    # Tool registration helpers
│   │   ├── types.ts                    # SessionContext and shared types
│   │   ├── meta-tools.ts              # search_tools, load_tool_schema
│   │   ├── events.ts                   # PubSub + MCP notification streaming
│   │   ├── audit.ts                    # Audit logging
│   │   ├── tool-metadata.ts           # Tool descriptions and categories
│   │   ├── terrain-patterns.ts        # Terrain generation patterns
│   │   ├── consolidated/              # 28 action-routed tool handlers
│   │   │   ├── index.ts              # Barrel export + ConsolidatedTools array
│   │   │   ├── character-manage.ts   # Character CRUD + progression
│   │   │   ├── party-manage.ts       # Party management
│   │   │   ├── combat-manage.ts      # Encounter lifecycle
│   │   │   ├── combat-action.ts      # In-combat action resolution
│   │   │   ├── combat-map.ts         # Tactical map operations
│   │   │   ├── world-manage.ts       # World state management
│   │   │   ├── world-map.ts          # Procedural worldgen + terrain
│   │   │   ├── spatial-manage.ts     # Room-based navigation
│   │   │   ├── inventory-manage.ts   # Inventory operations
│   │   │   ├── item-manage.ts        # Item template CRUD
│   │   │   ├── quest-manage.ts       # Quest tracking
│   │   │   ├── npc-manage.ts         # NPC lifecycle + memory
│   │   │   ├── rest-manage.ts        # Short/long rest
│   │   │   ├── concentration-manage.ts # Concentration tracking
│   │   │   ├── scroll-manage.ts      # Spell scrolls
│   │   │   ├── aura-manage.ts        # Persistent aura effects
│   │   │   ├── corpse-manage.ts      # Corpse/loot system
│   │   │   ├── theft-manage.ts       # Theft economy
│   │   │   ├── narrative-manage.ts   # Story logging
│   │   │   ├── secret-manage.ts      # Hidden information
│   │   │   ├── improvisation-manage.ts # Rule of Cool
│   │   │   ├── math-manage.ts        # Dice and calculations
│   │   │   ├── strategy-manage.ts    # Grand strategy
│   │   │   ├── turn-manage.ts        # Strategy turn processing
│   │   │   ├── spawn-manage.ts       # Quick entity creation
│   │   │   ├── session-manage.ts     # Session state
│   │   │   ├── travel-manage.ts      # Overworld travel
│   │   │   └── batch-manage.ts       # Batch operations
│   │   └── handlers/                  # Extracted handler implementations
│   │       ├── combat-handlers.ts    # Combat engine handler functions
│   │       └── spatial-handlers.ts   # Spatial/room handler functions
│   ├── engine/
│   │   ├── combat/
│   │   │   ├── engine.ts             # Combat state machine and action resolution
│   │   │   ├── conditions.ts         # Status effect system
│   │   │   └── rng.ts                # Seeded random number generation
│   │   ├── magic/
│   │   │   ├── spell-database.ts     # 15+ SRD spells with validation
│   │   │   ├── spell-resolver.ts     # Spell effect execution
│   │   │   ├── spell-validator.ts    # Anti-hallucination spell checks
│   │   │   ├── concentration.ts      # Concentration tracking
│   │   │   ├── scroll.ts             # Spell scroll mechanics
│   │   │   └── aura.ts               # Persistent aura effects
│   │   ├── spatial/
│   │   │   ├── engine.ts             # Grid-based spatial combat
│   │   │   └── heap.ts               # Pathfinding priority queue
│   │   ├── worldgen/
│   │   │   ├── biome.ts              # 28+ biome type definitions
│   │   │   ├── heightmap.ts          # Perlin noise terrain generation
│   │   │   ├── regions.ts            # Region clustering algorithm
│   │   │   └── validation.ts         # World generation validation
│   │   ├── strategy/
│   │   │   ├── nation-manager.ts     # Grand strategy nation state
│   │   │   ├── diplomacy-engine.ts   # Alliance and treaty system
│   │   │   ├── turn-processor.ts     # Turn-based action resolution
│   │   │   └── fog-of-war.ts         # Strategic visibility system
│   │   ├── social/
│   │   │   └── hearing.ts            # Conversation awareness radius
│   │   ├── dsl/
│   │   │   ├── parser.ts             # Map patch DSL parser
│   │   │   └── engine.ts             # DSL command execution
│   │   ├── pubsub.ts                 # Event emission system
│   │   └── replay.ts                 # Deterministic replay system
│   ├── storage/
│   │   ├── db.ts                     # SQLite initialization and integrity checks
│   │   ├── migrations.ts             # Database schema definitions
│   │   ├── index.ts                  # Database access layer
│   │   └── repos/                    # 27 repository implementations
│   │       ├── character.repo.ts     # Character persistence
│   │       ├── encounter.repo.ts     # Encounter state persistence
│   │       ├── inventory.repo.ts     # Inventory persistence
│   │       ├── world.repo.ts         # World state persistence
│   │       ├── quest.repo.ts         # Quest tracking persistence
│   │       ├── npc-memory.repo.ts    # NPC memory persistence
│   │       ├── spatial.repo.ts       # Room/spatial persistence
│   │       └── [20 more repos]       # Full coverage of all domain entities
│   ├── schema/                        # 29 Zod validation schemas
│   │   ├── character.ts              # Character stat block schema
│   │   ├── encounter.ts              # Encounter state schema
│   │   ├── spell.ts                  # Spell definition schema
│   │   ├── world.ts                  # World state schema
│   │   ├── inventory.ts              # Item and equipment schemas
│   │   ├── base-schemas.ts           # Shared base schemas
│   │   ├── index.ts                  # Schema barrel export
│   │   └── [22 more schemas]         # Full coverage of all data structures
│   ├── data/
│   │   ├── creature-presets.ts       # 1100+ creature stat blocks
│   │   ├── encounter-presets.ts      # 50+ balanced encounter templates
│   │   ├── location-presets.ts       # 30+ location templates
│   │   ├── item-presets.ts           # Item preset definitions
│   │   ├── class-starting-data.ts    # D&D class starting equipment/spells
│   │   └── items/                    # PHB weapons, armor, magic items
│   ├── math/
│   │   ├── index.ts                  # Dice rolling with D&D notation
│   │   ├── algebra.ts                # Equation solver
│   │   ├── physics.ts                # Projectile calculations
│   │   └── probability.ts            # Probability calculations
│   └── utils/
│       ├── action-router.ts          # Fuzzy enum matching for action routing
│       ├── fuzzy-enum.ts             # Levenshtein distance fuzzy matching
│       ├── schema-shorthand.ts       # Zod schema construction helpers
│       └── logger.ts                 # Logging utility
├── tests/                            # 85+ test files, 1889 tests
│   ├── setup.ts                      # Test setup (crypto polyfill)
│   ├── helpers/                      # Test utilities and legacy wrappers
│   ├── combat/                       # Combat engine tests
│   ├── engine/                       # Engine subsystem tests
│   ├── math/                         # Math utility tests
│   ├── schema/                       # Schema validation tests
│   ├── server/                       # Tool handler tests
│   │   ├── consolidated/             # Consolidated tool tests (28 files)
│   │   └── [legacy handler tests]    # Combat, spatial, integration tests
│   ├── spatial/                      # Spatial engine tests
│   ├── storage/                      # Repository tests
│   ├── worldgen/                     # World generation tests
│   └── mcp/                          # MCP protocol integration tests
├── docs/
│   ├── WHITE_PAPER.md                # Architecture philosophy and design
│   ├── LLMSpatialGuide.md            # Guide for LLMs on spatial reasoning
│   ├── ADR-005-*.md                  # Architecture Decision Records
│   └── RPG-MCP-LITE-*.md             # Design documentation
├── dist/                             # TypeScript build output
├── package.json                      # Dependencies and build scripts
├── tsconfig.json                     # TypeScript strict mode configuration
├── vitest.config.ts                  # Test configuration (globals: true)
├── esbuild.config.mjs                # Binary bundler configuration
├── README.md                         # User-facing documentation
├── CONTRIBUTING.md                   # Contribution guidelines
├── CLAUDE.md                         # Agent instructions
└── PROJECT_KNOWLEDGE.md              # This document
```

---

*Last updated: 2026-02-07 | Post-consolidation cleanup*
*Source: https://github.com/Mnehmos/mnehmos.rpg.mcp*
