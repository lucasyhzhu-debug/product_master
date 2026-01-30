# Custom Sub-Agents for Malo Recipe Master

This document describes all custom sub-agents available for autonomous task execution in this project.

## Available Agents

### 1. **agent-creator** 🟣
**Color**: Purple
**Model**: Sonnet
**Location**: `.claude/agents/agent-creator.md`

Expert sub-agent architect specializing in designing and implementing highly specialized sub-agents.

**Use for:**
- Creating new specialized sub-agents for your projects
- Designing domain-specific expertise agents
- Building reusable agent templates
- Improving documentation for existing agents
- Planning agent architecture for complex projects

**Example Usage:**
```
task: agent-creator
prompt: "Design a new sub-agent for GraphQL API code generation"
```

### 2. **supabase-migrator** 🔵
**Color**: Blue
**Model**: Sonnet
**Location**: `.claude/agents/supabase-migrator.md`

Database migration specialist for Supabase/PostgreSQL conversions.

**Core Expertise:**
- SQLite → PostgreSQL schema conversion
- Data migration with integrity validation
- Connection pooling for serverless
- Sequence management and verification

**Use for:**
- Planning SQLite to PostgreSQL migrations
- Updating database.py for PostgreSQL
- Creating data migration scripts
- Configuring Supabase connection strings
- Troubleshooting data integrity issues

**Example Usage:**
```
task: supabase-migrator
prompt: "Create a migration script to move our SQLite database to Supabase PostgreSQL"
```

### 3. **vercel-fastapi** 🟢
**Color**: Green
**Model**: Sonnet
**Location**: `.claude/agents/vercel-fastapi.md`

Vercel deployment specialist for FastAPI applications on serverless.

**Core Expertise:**
- Mangum ASGI adapter configuration
- vercel.json setup and optimization
- CORS configuration for production
- Environment variable management
- Cold start optimization

**Use for:**
- Setting up Mangum ASGI adapter
- Creating vercel.json configuration
- Configuring CORS for production
- Optimizing Vercel deployment
- Debugging deployment issues

**Example Usage:**
```
task: vercel-fastapi
prompt: "Create a vercel.json config for our FastAPI backend deployed to /api"
```

### 4. **monolith-restructure** 🟡
**Color**: Yellow
**Model**: Sonnet
**Location**: `.claude/agents/monolith-restructure.md`

Project restructuring specialist for monolithic deployments.

**Core Expertise:**
- Safe folder reorganization (git-safe moves)
- Python and TypeScript import path updates
- Configuration file consolidation
- Vite proxy configuration
- Build script unification

**Use for:**
- Converting separate frontend/backend to monolithic layout
- Safely moving folders while preserving git history
- Updating import paths systematically
- Consolidating configuration files
- Verifying no broken imports after restructure

**Example Usage:**
```
task: monolith-restructure
prompt: "Restructure our separate backend/ and frontend/ folders into monolithic api/ and src/ layout"
```

## How to Use Custom Agents

### Method 1: Using the Task Tool (Autonomous Execution)

Invoke agents directly with the Task tool for fully autonomous execution:

```python
Task(
    subagent_type: "supabase-migrator",
    description: "Create database migration script",
    prompt: "Create a migration script to transfer data from SQLite to PostgreSQL including all relationships"
)
```

### Method 2: Using Slash Commands

Request Claude to use an agent by mentioning it:

```
"Use the agent-creator agent to design a new sub-agent for API testing"
```

### Method 3: When Task Tool Would Work

The Task tool invokes agents when:
- You need complex, multi-step work done autonomously
- An agent has deep expertise in a specific domain
- The task benefits from specialized knowledge
- Work should happen without constant back-and-forth

## Agent Specifications

### YAML Frontmatter Format

All agents follow this YAML format for proper discovery:

```yaml
---
name: agent-name
description: "Clear description of agent's purpose and use cases."
model: sonnet        # sonnet, haiku, or opus
color: blue          # For UI identification
---
```

### Agent Components

Each agent includes:

1. **Core Expertise Sections** (3-5 domains)
   - Deep knowledge in specific areas
   - Best practices and patterns
   - Common pitfalls to avoid

2. **Workflow Documentation** (4-6 phases)
   - Step-by-step procedures
   - Decision trees
   - Checklists for important operations

3. **Reference Materials**
   - Configuration templates
   - Code examples
   - Command templates (copy-paste ready)

4. **Troubleshooting Guide** (8+ issues)
   - Common problems and root causes
   - Specific solutions for each issue
   - When to escalate or seek alternatives

5. **Real-World Examples** (3-5 scenarios)
   - Concrete before/after comparisons
   - How agent handles edge cases
   - Output examples

6. **Clear Scope Definition**
   - ✅ Use for (specific tasks)
   - ❌ Don't use for (out-of-scope)

## Integration Guide

### Using Multiple Agents in Sequence

Agents work best when chained for complex migrations:

**Example: Full Vercel Migration Workflow**

```
1. Start with monolith-restructure
   Task: "Restructure project to api/ + src/ layout"

2. Then supabase-migrator
   Task: "Migrate SQLite database to Supabase PostgreSQL"

3. Finally vercel-fastapi
   Task: "Create vercel.json and Mangum configuration for deployment"
```

### Agent Communication

Agents communicate through:
- Detailed documentation (read by agents)
- Git history (agents understand context)
- Project files (agents modify as needed)
- Status messages (progress tracking)

## Development Notes

### Agent Quality Standards

All custom agents meet these standards:

- ✅ **300-800 lines** of comprehensive documentation
- ✅ **3+ core expertise domains** with deep knowledge
- ✅ **4-6 step workflows** with clear progression
- ✅ **8+ troubleshooting issues** and solutions
- ✅ **3-5 real-world examples** with concrete output
- ✅ **Clear scope definition** (use/don't use)
- ✅ **Professional documentation** (active voice, actionable)

### Creating New Agents

Use the **agent-creator** agent to design new specialized agents:

```
task: agent-creator
prompt: "I need a specialized agent for [your domain]. It should focus on [specific expertise]."
```

The agent-creator will:
1. Analyze your requirements
2. Design the agent structure
3. Document all expertise areas
4. Create ready-to-use agent files
5. Provide integration guidance

## File Structure

```
.claude/
├── agents/
│   ├── agent-creator.md         (422 lines) - Meta agent for creating agents
│   ├── supabase-migrator.md     (165 lines) - Database migration specialist
│   ├── vercel-fastapi.md        (323 lines) - Vercel deployment specialist
│   └── monolith-restructure.md  (446 lines) - Project restructuring specialist
└── AGENTS_README.md             (this file)
```

## Quick Reference

| Agent | Best For | Time Estimate |
|-------|----------|---------------|
| agent-creator | Designing new agents | 30-60 min |
| supabase-migrator | Database migrations | 45-90 min |
| vercel-fastapi | Vercel setup | 30-60 min |
| monolith-restructure | Project restructuring | 60-120 min |

## Troubleshooting Agent Discovery

If agents don't appear in `/agents` list:

1. **Check file location**: Verify `.claude/agents/` folder exists
2. **Check YAML format**: Ensure valid YAML frontmatter with `name:` and `model:`
3. **Check file extension**: Must be `.md` (markdown)
4. **Verify description**: Must have `description:` field (quoted)
5. **Restart Claude Code**: Close and reopen Claude Code CLI

## Support & Updates

To improve agents:
1. Use agent-creator to design improvements
2. Test improvements on small tasks first
3. Document any new patterns discovered
4. Share improvements with the team

All agents are living documents - they improve with use and feedback.

---

**Last Updated**: January 30, 2026
**Total Agent Coverage**: 1,356 lines of specialized expertise
**Status**: ✅ Ready for autonomous use via Task tool
