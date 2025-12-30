# mnehmos.rpg.mcp - Knowledge Base Document

## Quick Reference

| Property | Value |
|----------|-------|
| **Repository** | https://github.com/Mnehmos/mnehmos.rpg.mcp |
| **Primary Language** | TypeScript |
| **Project Type** | MCP Server |
| **Status** | Active |
| **Last Updated** | 2025-12-29 |

## Overview

mnehmos.rpg.mcp is a rules-enforced RPG backend MCP server that transforms any LLM into a game master with mechanical integrity. It provides a complete D&D 5e-compatible simulation kernel where LLMs propose narrative intentions but the engine validates and executes all game mechanics, preventing AI hallucination of dice rolls, spell slots, or hit points. Players interact through natural language with an AI dungeon master while the server handles all combat, spellcasting, inventory, quests, and world state with full SQLite persistence.

## Architecture

### System Design

The project implements an Event-Driven Agentic AI Architecture based on the OODA loop pattern (Observe-Orient-Decide-Act). LLMs act as the "brain" proposing intentions, while the engine serves as the "nervous system" validating constraints and executing actions. The system uses the Model Context Protocol (MCP) to expose 145+ tools that LLMs can call to interact with the game world. All world state is persisted in SQLite with WAL mode, supporting multi-tenant projects, parallel worlds, and deterministic replay. The server can run via stdio, TCP, Unix sockets, or WebSockets for integration with various MCP clients.

The architecture enforces a key invariant: LLMs never directly mutate world state. All changes flow through validated tool calls, creating an anti-hallucination design where the AI cannot invent game outcomes.

### Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| MCP Server Entry | Server initialization, transport setup, tool registration | `src/server/index.ts` |
| Tool Registry | Aggregates 145+ tools with metadata for dynamic loading | `src/server/tool-registry.ts` |
| Combat Engine | Initiative, damage calculation, death saves, spatial combat | `src/engine/combat/` |
| Magic System | Spell validation, slot tracking, concentration, scrolls | `src/engine/magic/` |
| Spatial Engine | Grid movement, collision detection, pathfinding | `src/engine/spatial/` |
| World Generator | Procedural generation with Perlin noise, 28+ biomes | `src/engine/worldgen/` |
| Storage Layer | SQLite repositories with migration system | `src/storage/` |
| Schema Definitions | Zod validation schemas for all data structures | `src/schema/` |
| Preset Data | 1100+ creature presets, 50+ encounter presets, 30+ locations | `src/data/` |
| Tool Handlers | 35+ tool modules organized by domain (combat, inventory, etc.) | `src/server/*-tools.ts` |
| Math Utilities | Dice rolling, algebra solver, physics calculations | `src/math/` |

### Data Flow

```
Player Intent (Natural Language)
    ↓
LLM Interpretation → MCP Tool Call
    ↓
Tool Handler → Schema Validation (Zod)
    ↓
Engine Logic → Constraint Checking
    ↓
Database Update (SQLite) → Event Emission (PubSub)
    ↓
Response + World State → LLM Narration → Player
```

For combat specifically:
```
Player: "I attack the goblin"
    ↓
LLM → execute_combat_action({ action: "attack", targetId: "goblin-1" })
    ↓
Combat Engine: Roll initiative, check AC, calculate damage
    ↓
Update HP in database → Emit combat_state_changed event
    ↓
Return combat result (hit/miss, damage rolled, new HP)
    ↓
LLM narrates outcome based on mechanical result
```

## API Surface

### Public Interfaces

The server exposes 145+ MCP tools organized into categories. All tools accept a sessionId parameter for multi-session support.

#### Meta-Tools (Discovery)

##### Tool: `search_tools`
- **Purpose**: Search for tools by keyword, category, or capability
- **Parameters**:
  - `query` (string): Search keywords (e.g., "combat", "spell", "inventory")
  - `category` (string, optional): Filter by category (world, combat, character, inventory, magic, quest, math, strategy, social, meta)
- **Returns**: Array of tool names with descriptions and metadata

##### Tool: `load_tool_schema`
- **Purpose**: Load the full Zod schema for a specific tool on-demand
- **Parameters**:
  - `toolName` (string): Name of the tool to load schema for
- **Returns**: Complete tool schema with all parameter definitions

#### World Management (12 tools)

##### Tool: `generate_world`
- **Purpose**: Procedurally generate a complete world with terrain, biomes, rivers
- **Parameters**:
  - `projectId` (string): Project identifier
  - `worldId` (string): Unique world identifier
  - `width` (number): World width in tiles
  - `height` (number): World height in tiles
  - `seed` (string, optional): Random seed for reproducible generation
  - `biomeConfig` (object, optional): Custom biome distribution settings
- **Returns**: Generated world with tiles, regions, rivers, and biome statistics

##### Tool: `get_world_state`
- **Purpose**: Retrieve complete world state including environment and time
- **Parameters**:
  - `projectId` (string): Project identifier
  - `worldId` (string): World identifier
- **Returns**: Full world state with tiles, structures, characters, time, weather

##### Tool: `apply_map_patch`
- **Purpose**: Modify terrain using DSL commands (set_tile, add_structure, etc.)
- **Parameters**:
  - `projectId` (string): Project identifier
  - `worldId` (string): World identifier
  - `patch` (string): DSL patch commands
- **Returns**: Applied changes and updated map state

#### Combat System (7 tools)

##### Tool: `create_encounter`
- **Purpose**: Initialize combat encounter with participants and initiative
- **Parameters**:
  - `projectId` (string): Project identifier
  - `worldId` (string): World identifier
  - `participants` (array): Array of character IDs to include in combat
  - `terrain` (object, optional): Spatial terrain configuration
- **Returns**: Encounter ID, initiative order, starting combat state

##### Tool: `execute_combat_action`
- **Purpose**: Execute combat actions (attack, cast_spell, move, dodge, etc.)
- **Parameters**:
  - `encounterId` (string): Active encounter identifier
  - `action` (string): Action type (attack, cast_spell, move, dodge, disengage, hide)
  - `actorId` (string): Character performing action
  - `targetId` (string, optional): Target character for attack/spell
  - `spellName` (string, optional): Spell name if action is cast_spell
  - `position` (object, optional): Target position for movement
- **Returns**: Action result with rolls, damage, status changes, narrative description

##### Tool: `roll_death_save`
- **Purpose**: Roll death saving throw for unconscious character (D&D 5e rules)
- **Parameters**:
  - `encounterId` (string): Encounter identifier
  - `characterId` (string): Unconscious character ID
  - `advantage` (boolean, optional): Roll with advantage
  - `disadvantage` (boolean, optional): Roll with disadvantage
- **Returns**: Death save result (success/failure/stabilize/death) with roll details

#### Magic System (Integrated with combat + dedicated tools)

##### Tool: `take_long_rest`
- **Purpose**: Restore all HP and spell slots after long rest
- **Parameters**:
  - `projectId` (string): Project identifier
  - `worldId` (string): World identifier
  - `characterId` (string): Character taking rest
- **Returns**: Restored HP, spell slots, removed conditions

##### Tool: `use_spell_scroll`
- **Purpose**: Use a spell scroll from inventory
- **Parameters**:
  - `characterId` (string): Character using scroll
  - `itemId` (string): Scroll item ID
  - `targetId` (string, optional): Spell target
- **Returns**: Spell resolution result, scroll consumed, ability check if needed

##### Tool: `check_concentration_save`
- **Purpose**: Roll concentration save when taking damage
- **Parameters**:
  - `characterId` (string): Concentrating character
  - `damageAmount` (number): Damage taken
  - `advantage` (boolean, optional): Roll with advantage
- **Returns**: Save result (success/failure), concentration maintained or broken

#### Inventory & Items (15 tools)

##### Tool: `create_item_template`
- **Purpose**: Define a new item type with properties
- **Parameters**:
  - `name` (string): Item name
  - `type` (string): Item type (weapon, armor, consumable, quest_item, etc.)
  - `value` (number): Gold piece value
  - `weight` (number): Weight in pounds
  - `properties` (object, optional): Item-specific properties (damage, AC, effects)
- **Returns**: Created item template with generated ID

##### Tool: `give_item`
- **Purpose**: Add item to character inventory
- **Parameters**:
  - `characterId` (string): Character receiving item
  - `itemTemplateId` (string): Item template to instantiate
  - `quantity` (number, optional): Number of items (default 1)
- **Returns**: Inventory updated with new item instance

##### Tool: `equip_item`
- **Purpose**: Equip item to character equipment slot
- **Parameters**:
  - `characterId` (string): Character equipping item
  - `itemId` (string): Item instance ID
  - `slot` (string): Equipment slot (mainHand, offHand, armor, etc.)
- **Returns**: Item equipped, AC/damage recalculated

#### Quest System (8 tools)

##### Tool: `create_quest`
- **Purpose**: Define quest with objectives and rewards
- **Parameters**:
  - `projectId` (string): Project identifier
  - `worldId` (string): World identifier
  - `name` (string): Quest name
  - `description` (string): Quest description
  - `objectives` (array): Array of objective definitions with completion criteria
  - `rewards` (object, optional): XP, gold, items awarded on completion
- **Returns**: Created quest with generated ID

##### Tool: `update_objective`
- **Purpose**: Increment objective progress (e.g., killed 3/5 goblins)
- **Parameters**:
  - `questId` (string): Quest identifier
  - `objectiveId` (string): Objective identifier
  - `progress` (number): New progress value
- **Returns**: Updated objective status

#### NPC Memory & Social System (7 tools)

##### Tool: `update_npc_relationship`
- **Purpose**: Create or update relationship between character and NPC
- **Parameters**:
  - `characterId` (string): Player character ID
  - `npcId` (string): NPC character ID
  - `familiarity` (number): Familiarity level (0-100)
  - `disposition` (number): Disposition level (-100 to 100)
- **Returns**: Updated relationship data

##### Tool: `record_conversation_memory`
- **Purpose**: Store conversation summary for NPC memory
- **Parameters**:
  - `characterId` (string): Player character ID
  - `npcId` (string): NPC character ID
  - `summary` (string): Conversation summary
  - `importance` (number): Importance level (1-10)
  - `topics` (array, optional): Topics discussed
- **Returns**: Stored memory with timestamp

##### Tool: `get_npc_context`
- **Purpose**: Retrieve full NPC context for LLM injection
- **Parameters**:
  - `characterId` (string): Player character ID
  - `npcId` (string): NPC character ID
- **Returns**: Relationship status, conversation history, formatted for LLM prompting

#### Theft & Economy (10 tools)

##### Tool: `steal_item`
- **Purpose**: Record theft of item with heat tracking
- **Parameters**:
  - `itemId` (string): Stolen item ID
  - `originalOwnerId` (string): Original owner character ID
  - `thiefId` (string): Thief character ID
  - `witnessIds` (array, optional): Witness character IDs
- **Returns**: Stolen item record with initial heat level

##### Tool: `sell_to_fence`
- **Purpose**: Sell stolen goods to fence NPC
- **Parameters**:
  - `itemId` (string): Stolen item to sell
  - `fenceId` (string): Fence NPC ID
- **Returns**: Sale price (reduced based on heat), heat transferred to fence

#### Corpse & Loot System (14 tools)

##### Tool: `create_corpse`
- **Purpose**: Create lootable corpse from dead character
- **Parameters**:
  - `characterId` (string): Dead character ID
  - `encounterId` (string, optional): Encounter where death occurred
  - `position` (object, optional): Corpse position
- **Returns**: Corpse entity with inventory transferred

##### Tool: `loot_corpse`
- **Purpose**: Transfer item from corpse to character
- **Parameters**:
  - `corpseId` (string): Corpse identifier
  - `itemId` (string): Item to loot
  - `targetCharacterId` (string): Character looting
- **Returns**: Item transferred to looter's inventory

#### Improvisation Engine (8 tools)

##### Tool: `resolve_improvised_stunt`
- **Purpose**: Resolve "Rule of Cool" stunts (e.g., "I kick the brazier into zombies")
- **Parameters**:
  - `characterId` (string): Character attempting stunt
  - `description` (string): Stunt description
  - `difficulty` (string): Difficulty (easy, medium, hard, extreme)
  - `saveDC` (number, optional): DC for enemy saves
  - `effects` (object): Damage, conditions, terrain changes
- **Returns**: Ability check result, stunt outcome, effects applied

##### Tool: `attempt_arcane_synthesis`
- **Purpose**: Dynamically create new spells with wild surge risk
- **Parameters**:
  - `characterId` (string): Caster character ID
  - `intent` (string): Desired spell effect
  - `powerLevel` (number): Spell level equivalent (1-9)
- **Returns**: Spell created or wild surge triggered

#### Math & Dice (5 tools)

##### Tool: `dice_roll`
- **Purpose**: Roll dice with full D&D notation support
- **Parameters**:
  - `notation` (string): Dice notation (e.g., "2d6+3", "4d6dl1", "1d20 adv")
- **Returns**: Roll result with breakdown of individual dice

##### Tool: `physics_projectile`
- **Purpose**: Calculate projectile trajectory for thrown weapons
- **Parameters**:
  - `initialVelocity` (number): Launch velocity
  - `angle` (number): Launch angle in degrees
  - `gravity` (number, optional): Gravity constant
- **Returns**: Range, flight time, trajectory points

#### Grand Strategy Mode (11 tools)

##### Tool: `create_nation`
- **Purpose**: Create nation with resources for strategy layer
- **Parameters**:
  - `projectId` (string): Project identifier
  - `worldId` (string): World identifier
  - `name` (string): Nation name
  - `capital` (object): Capital region coordinates
  - `resources` (object): Starting resources (gold, food, military)
- **Returns**: Created nation with state

#### Composite Tools (High-level workflows)

##### Tool: `spawn_equipped_character`
- **Purpose**: Create character with full equipment and inventory in one call
- **Parameters**:
  - `projectId` (string): Project identifier
  - `worldId` (string): World identifier
  - `preset` (string): Creature preset name (e.g., "knight", "wizard")
  - `name` (string): Character name
  - `equipment` (array, optional): Additional equipment
- **Returns**: Character created with all items equipped

##### Tool: `spawn_preset_encounter`
- **Purpose**: Create balanced encounter from preset (e.g., "goblin_ambush")
- **Parameters**:
  - `projectId` (string): Project identifier
  - `worldId` (string): World identifier
  - `preset` (string): Encounter preset name
  - `partyLevel` (number): Party level for scaling
- **Returns**: Encounter created with all enemies spawned

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
const world = await generate_world({
  projectId: "my-game",
  worldId: "world-1",
  width: 100,
  height: 100,
  seed: "adventure-42"
});

// 2. Create a character using preset
const character = await spawn_equipped_character({
  projectId: "my-game",
  worldId: "world-1",
  preset: "fighter",
  name: "Thorgrim Ironheart",
  equipment: ["longsword", "shield", "healing_potion"]
});

// 3. Start combat encounter
const encounter = await create_encounter({
  projectId: "my-game",
  worldId: "world-1",
  participants: [character.id, "goblin-1", "goblin-2"]
});

// 4. Execute attack
const attackResult = await execute_combat_action({
  encounterId: encounter.id,
  action: "attack",
  actorId: character.id,
  targetId: "goblin-1"
});
// Returns: { hit: true, damage: 8, targetHp: 2, rolls: "1d20+5=17, 1d8+3=8" }
```

### Advanced Patterns

```typescript
// Example: Spellcasting with concentration tracking
// This demonstrates the anti-hallucination design

// 1. Character wants to cast a concentration spell
const spellResult = await execute_combat_action({
  encounterId: "enc-1",
  action: "cast_spell",
  actorId: "wizard-1",
  spellName: "hold_person",
  targetId: "bandit-1"
});
// Engine validates: Does wizard know this spell?
// Does wizard have a 2nd level slot available?
// If yes: consume slot, start concentration tracking

// 2. Wizard takes damage - must save to maintain concentration
const damageResult = await execute_combat_action({
  encounterId: "enc-1",
  action: "attack",
  actorId: "bandit-2",
  targetId: "wizard-1"
});
// Damage dealt: 12

// 3. Engine automatically triggers concentration check
const concentrationCheck = await check_concentration_save({
  characterId: "wizard-1",
  damageAmount: 12
});
// DC is max(10, damage/2) = 10
// Returns: { success: false, concentration_broken: true }
// hold_person spell ends automatically

// The LLM cannot hallucinate spell slots or ignore concentration rules
// The engine enforces all mechanics deterministically
```

```typescript
// Example: Using composite tools for efficient world building

// Spawn a populated tavern with NPCs
const tavern = await spawn_preset_location({
  projectId: "my-game",
  worldId: "world-1",
  preset: "tavern",
  position: { x: 50, y: 50 }
});
// Returns: Location with 5 NPCs (barkeep, patrons), furniture, inventory

// Create a balanced level-appropriate encounter
const encounter = await spawn_preset_encounter({
  projectId: "my-game",
  worldId: "world-1",
  preset: "undead_crypt",
  partyLevel: 5
});
// Returns: 3 zombies + 1 ghoul + lair terrain, auto-scaled to CR 5
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
| yaml | ^2.8.2 | YAML parsing for configuration files |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.9.3 | TypeScript compiler with strict mode enabled |
| vitest | ^1.6.1 | Test framework (800+ passing tests) |
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

# Run tests (800+ tests should pass)
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

### Building

```bash
# Build TypeScript to JavaScript
npm run build
# Output: dist/

# Build standalone binaries for all platforms
npm run build:binaries
# Output: bin/rpg-mcp-win.exe, bin/rpg-mcp-macos, bin/rpg-mcp-macos-arm64, bin/rpg-mcp-linux
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
4. Concentration tracking relies on combat system integration and may not trigger correctly for out-of-combat damage sources

### Future Considerations

1. Add WebSocket real-time subscriptions for multi-client synchronization
2. Implement dialogue tree system for complex NPC conversations
3. Add cover mechanics to tactical combat (half cover, three-quarters cover)
4. Create quest chain system with prerequisite dependencies
5. Build visual debugger / world inspector UI for development and debugging
6. Optimize world generation for larger maps using chunked loading
7. Add authentication layer for networked transports (TCP/WebSocket)

### Code Quality

| Metric | Status |
|--------|--------|
| Tests | Yes with 800+ tests passing across all systems |
| Linting | ESLint with TypeScript strict mode |
| Type Safety | TypeScript strict mode enabled, Zod runtime validation |
| Documentation | JSDoc comments on public APIs, comprehensive README, white paper |

## Appendix: File Structure

```
mnehmos.rpg.mcp/
├── src/
│   ├── server/
│   │   ├── index.ts                    # MCP server entry point and transport setup
│   │   ├── tool-registry.ts            # Aggregates all 145+ tools with metadata
│   │   ├── combat-tools.ts             # Combat encounter and action tools
│   │   ├── inventory-tools.ts          # Item and inventory management
│   │   ├── quest-tools.ts              # Quest creation and tracking
│   │   ├── npc-memory-tools.ts         # NPC relationship and conversation memory
│   │   ├── theft-tools.ts              # Theft and fence economy system
│   │   ├── corpse-tools.ts             # Corpse looting and decay
│   │   ├── improvisation-tools.ts      # Rule of Cool stunts and custom effects
│   │   ├── composite-tools.ts          # High-level workflow tools
│   │   ├── spatial-tools.ts            # Dungeon room navigation
│   │   ├── math-tools.ts               # Dice rolling and calculations
│   │   ├── strategy-tools.ts           # Grand strategy nation management
│   │   ├── meta-tools.ts               # Tool discovery (search_tools, load_tool_schema)
│   │   └── [25+ more tool modules]
│   ├── engine/
│   │   ├── combat/
│   │   │   ├── engine.ts               # Combat state machine and action resolution
│   │   │   ├── conditions.ts           # Status effect system
│   │   │   └── rng.ts                  # Seeded random number generation
│   │   ├── magic/
│   │   │   ├── spell-database.ts       # 15+ SRD spells with validation
│   │   │   ├── spell-resolver.ts       # Spell effect execution
│   │   │   ├── spell-validator.ts      # Anti-hallucination spell checks
│   │   │   ├── concentration.ts        # Concentration tracking
│   │   │   ├── scroll.ts               # Spell scroll mechanics
│   │   │   └── aura.ts                 # Persistent aura effects
│   │   ├── spatial/
│   │   │   ├── engine.ts               # Grid-based spatial combat
│   │   │   └── heap.ts                 # Pathfinding priority queue
│   │   ├── worldgen/
│   │   │   ├── biome.ts                # 28+ biome type definitions
│   │   │   ├── heightmap.ts            # Perlin noise terrain generation
│   │   │   ├── regions.ts              # Region clustering algorithm
│   │   │   └── validation.ts           # World generation validation
│   │   ├── strategy/
│   │   │   ├── nation-manager.ts       # Grand strategy nation state
│   │   │   ├── diplomacy-engine.ts     # Alliance and treaty system
│   │   │   ├── turn-processor.ts       # Turn-based action resolution
│   │   │   └── fog-of-war.ts           # Strategic visibility system
│   │   ├── social/
│   │   │   └── hearing.ts              # Conversation awareness radius
│   │   ├── dsl/
│   │   │   ├── parser.ts               # Map patch DSL parser
│   │   │   └── engine.ts               # DSL command execution
│   │   ├── pubsub.ts                   # Event emission system
│   │   └── replay.ts                   # Deterministic replay system
│   ├── storage/
│   │   ├── db.ts                       # SQLite initialization and integrity checks
│   │   ├── migrations.ts               # Database schema definitions
│   │   ├── index.ts                    # Database access layer
│   │   └── repos/                      # Repository pattern implementations
│   │       ├── world.repo.ts
│   │       ├── character.repo.ts
│   │       ├── encounter.repo.ts
│   │       ├── inventory.repo.ts
│   │       ├── quest.repo.ts
│   │       ├── npc-memory.repo.ts
│   │       ├── theft.repo.ts
│   │       ├── corpse.repo.ts
│   │       ├── concentration.repo.ts
│   │       └── [15+ more repositories]
│   ├── schema/
│   │   ├── world.ts                    # World and tile schemas
│   │   ├── character.ts                # Character stat block schema
│   │   ├── spell.ts                    # Spell definition schema
│   │   ├── quest.ts                    # Quest and objective schemas
│   │   ├── inventory.ts                # Item and equipment schemas
│   │   ├── theft.ts                    # Stolen item tracking schema
│   │   ├── corpse.ts                   # Corpse and loot schemas
│   │   ├── improvisation.ts            # Custom effect schemas
│   │   ├── spatial.ts                  # Room network schemas
│   │   ├── nation.ts                   # Strategy mode schemas
│   │   └── [10+ more schema files]
│   ├── data/
│   │   ├── creature-presets.ts         # 1100+ creature stat blocks
│   │   ├── encounter-presets.ts        # 50+ balanced encounter templates
│   │   ├── location-presets.ts         # 30+ location templates (tavern, dungeon, etc.)
│   │   └── items/                      # PHB weapons, armor, magic items
│   ├── math/
│   │   ├── index.ts                    # Dice rolling with D&D notation
│   │   ├── algebra.ts                  # Equation solver
│   │   ├── physics.ts                  # Projectile calculations
│   │   └── probability.ts              # Probability calculations
│   └── api/                            # Legacy API server (excluded from build)
├── tests/                              # 800+ tests mirroring src/ structure
│   ├── engine/
│   │   ├── combat/
│   │   ├── magic/
│   │   └── worldgen/
│   ├── storage/
│   ├── data/
│   └── mcp/
├── docs/
│   ├── WHITE_PAPER.md                  # Architecture philosophy and design
│   ├── LLMSpatialGuide.md              # Guide for LLMs on spatial reasoning
│   └── RPG-MCP-LITE-*.md               # Design documentation
├── bin/                                # Compiled standalone binaries
├── dist/                               # TypeScript build output
├── package.json                        # Dependencies and build scripts
├── tsconfig.json                       # TypeScript strict mode configuration
├── vitest.config.ts                    # Test configuration
├── esbuild.config.mjs                  # Binary bundler configuration
├── README.md                           # User-facing documentation
├── CONTRIBUTING.md                     # Contribution guidelines
└── PROJECT_KNOWLEDGE.md                # This document

```

---

*Generated by Project Review Orchestrator | 2025-12-29*
*Source: https://github.com/Mnehmos/mnehmos.rpg.mcp*
