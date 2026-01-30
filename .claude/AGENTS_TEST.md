# Testing & Invoking Custom Sub-Agents

This guide shows how to test and invoke the 4 custom sub-agents for autonomous execution.

## Quick Test: Verify Agents Are Discoverable

In Claude Code CLI, agents should appear when listed:

```bash
/agents
```

You should see your 4 custom agents listed:
- ✅ agent-creator
- ✅ supabase-migrator
- ✅ vercel-fastapi
- ✅ monolith-restructure

## Autonomous Invocation via Task Tool

### Test 1: Agent-Creator Agent

**Purpose**: Test the meta-agent for creating agents

**Invocation**:
```
task: agent-creator
prompt: "Design a new sub-agent for GraphQL API development with expertise in schema design, resolver patterns, and common pitfalls"
```

**Expected Output**:
- Agent structure with YAML frontmatter
- Core expertise areas (3-5 domains)
- Workflows with 4-6 steps
- Troubleshooting guide
- Real-world examples

**Success Criteria**:
- ✅ Agent runs autonomously without errors
- ✅ Documentation is 300-800 lines
- ✅ Output is immediately usable
- ✅ YAML frontmatter is valid

---

### Test 2: Supabase-Migrator Agent

**Purpose**: Test database migration specialist

**Invocation**:
```
task: supabase-migrator
prompt: "Create a detailed migration plan to move our Malo Recipe Master SQLite database (D:\Claude\Product Manager\product_master\backend\data\malo_recipes.db) to Supabase PostgreSQL. Include pre-migration checklist, migration script, and verification steps."
```

**Expected Output**:
- Pre-migration checklist
- Connection string configuration
- Migration script template
- Data integrity verification steps
- Sequence reset commands
- Troubleshooting guide

**Success Criteria**:
- ✅ Agent understands SQLite schema
- ✅ Provides PostgreSQL-compatible SQL
- ✅ Includes NullPool configuration for Vercel
- ✅ All steps are actionable

---

### Test 3: Vercel-FastAPI Agent

**Purpose**: Test Vercel deployment specialist

**Invocation**:
```
task: vercel-fastapi
prompt: "Configure our Malo Recipe Master FastAPI backend for deployment to Vercel. Create the vercel.json config with /api rewrites, Mangum adapter setup, and environment variable requirements for Supabase PostgreSQL."
```

**Expected Output**:
- Complete vercel.json configuration
- api/index.py Mangum wrapper
- Environment variable setup guide
- CORS configuration
- Local development setup with `vercel dev`
- Deployment troubleshooting

**Success Criteria**:
- ✅ Agent creates valid vercel.json
- ✅ Includes proper rewrite rules
- ✅ Mangum integration is correct
- ✅ CORS headers configured

---

### Test 4: Monolith-Restructure Agent

**Purpose**: Test project restructuring specialist

**Invocation**:
```
task: monolith-restructure
prompt: "Create a detailed step-by-step plan to restructure our Malo Recipe Master project from separate backend/ and frontend/ folders to a monolithic layout with api/ and src/ at the root. Include git-safe commands that preserve history, import path updates, and verification steps."
```

**Expected Output**:
- Phase-by-phase restructuring plan
- Git-safe move commands (git mv)
- Python import path updates (if needed)
- TypeScript configuration updates
- vite.config.ts proxy configuration
- Validation checklist
- Rollback procedures if needed

**Success Criteria**:
- ✅ All moves use `git mv` (preserves history)
- ✅ Import paths are systematically updated
- ✅ Configuration files are correctly updated
- ✅ Build process is verified

---

## Sequential Workflow: Full Vercel Migration

Run these agents in sequence for a complete migration workflow:

### Step 1: Plan Restructure
```
task: monolith-restructure
prompt: "Create the restructuring plan for converting backend/frontend to api/src monolithic layout"
```

### Step 2: Plan Database Migration
```
task: supabase-migrator
prompt: "Create the migration plan from SQLite to Supabase PostgreSQL"
```

### Step 3: Configure Vercel Deployment
```
task: vercel-fastapi
prompt: "Create the vercel.json and Mangum configuration for deployment"
```

### Step 4: Implement Everything
Execute the steps provided by each agent sequentially.

---

## Testing Checklist

### Pre-Test Verification
- [ ] Claude Code CLI is open and working
- [ ] Project is on main branch with latest changes
- [ ] `.claude/agents/` directory contains 4 agents
- [ ] All agent `.md` files have valid YAML frontmatter

### Agent Discovery Test
- [ ] Run `/agents` command in Claude Code
- [ ] Verify all 4 agents are listed
- [ ] Check agent descriptions are visible
- [ ] Confirm color assignments are showing

### Individual Agent Tests
- [ ] agent-creator produces valid agent output
- [ ] supabase-migrator understands the Malo schema
- [ ] vercel-fastapi generates valid vercel.json
- [ ] monolith-restructure provides safe git commands

### Output Validation
- [ ] All agent output includes proper documentation
- [ ] Code examples are syntactically correct
- [ ] File paths are accurate for the project
- [ ] Commands are copy-paste ready

### Integration Test
- [ ] Sequential agent workflow completes without errors
- [ ] Each agent builds on previous agent's output
- [ ] No conflicts between agent recommendations
- [ ] Final output is production-ready

---

## Expected Agent Behavior

### Input Handling
- Agents accept complex, detailed prompts
- Agents break down multi-part requests
- Agents handle ambiguous requirements by asking clarifying questions

### Processing
- Agents autonomously gather context from project files
- Agents reference CLAUDE.md for project conventions
- Agents apply specialized domain knowledge
- Agents make intelligent recommendations

### Output Format
- Structured documentation with clear sections
- Code examples are formatted and complete
- Commands are ready to copy and execute
- Workflows include validation steps

### Error Recovery
- Agents suggest alternatives if direct approach fails
- Agents provide rollback procedures
- Agents warn about common pitfalls
- Agents recommend verification steps

---

## Common Test Scenarios

### Scenario 1: Quick Agent Verification
**Goal**: Verify agent is properly configured
**Task**: Ask agent to describe its own expertise and capabilities

```
task: agent-creator
prompt: "Describe your core competencies and the agent creation workflow you follow"
```

### Scenario 2: Domain-Specific Knowledge
**Goal**: Verify agent has deep expertise
**Task**: Ask agent a detailed technical question

```
task: supabase-migrator
prompt: "Explain how to handle foreign key constraints when migrating from SQLite to PostgreSQL, including edge cases with self-referential keys"
```

### Scenario 3: Real-World Application
**Goal**: Test agent on actual project need
**Task**: Ask agent to solve a concrete problem

```
task: vercel-fastapi
prompt: "Our FastAPI app uses WebSockets for real-time updates. How should we configure this in vercel.json for Vercel deployment?"
```

### Scenario 4: Complex Multi-Step Task
**Goal**: Test agent's workflow generation
**Task**: Ask agent for complete implementation plan

```
task: monolith-restructure
prompt: "We have existing tests in backend/tests/ and frontend/src/__tests__/. How should these be reorganized in the monolithic layout? Create a testing structure that works for both backend and frontend."
```

---

## Verification Commands

### Check Agent Files Exist
```bash
ls -la .claude/agents/
```

Expected:
```
agent-creator.md
monolith-restructure.md
supabase-migrator.md
vercel-fastapi.md
```

### Validate YAML Frontmatter
```bash
head -10 .claude/agents/agent-creator.md
```

Expected:
```yaml
---
name: agent-creator
description: "Expert sub-agent creator..."
model: sonnet
color: purple
---
```

### Confirm Git History
```bash
git log --oneline | grep -i agent | head -5
```

Expected:
```
66d3c23 docs: add comprehensive AGENTS_README
b92c7c4 fix: normalize agent YAML frontmatter
a06fbbf feat: add agent-creator sub-agent
6b5edd5 feat: add custom sub-agents
```

---

## Success Criteria

All agents are working correctly when:

1. ✅ **Discoverable**: Show up in `/agents` list
2. ✅ **Invokable**: Can be launched via Task tool
3. ✅ **Autonomous**: Run without requiring constant input
4. ✅ **Knowledgeable**: Provide expert-level domain knowledge
5. ✅ **Actionable**: Output can be directly applied
6. ✅ **Documented**: Clear guidance on when to use
7. ✅ **Integrated**: Can chain workflows together
8. ✅ **Production-Ready**: No errors or warnings

---

## Troubleshooting

### Issue: Agents don't appear in `/agents` list

**Cause**: YAML frontmatter is invalid
**Solution**: Check `name:` and `model:` fields are present and valid

```yaml
---
name: agent-name      # Required
description: "..."    # Required
model: sonnet         # Required (sonnet, haiku, or opus)
color: blue           # Optional but recommended
---
```

### Issue: Task tool says "Agent type not found"

**Cause**: Agent file missing or in wrong location
**Solution**: Verify `.claude/agents/` directory and file exists

```bash
test -f ".claude/agents/agent-name.md" && echo "File exists" || echo "File missing"
```

### Issue: Agent runs but produces incomplete output

**Cause**: Prompt is too vague or agent needs more context
**Solution**: Provide detailed, specific prompts with context

```
VAGUE:    "Migrate the database"
BETTER:   "Create a migration script to move SQLite (at backend/data/malo_recipes.db)
           to Supabase PostgreSQL including all 19 tables with relationships intact"
```

---

## Next Steps After Testing

Once agents are verified working:

1. **Document your workflow** - Record which agents solve your problems
2. **Create agent chains** - Link agents for complex migrations
3. **Build templates** - Use agent-creator to design project-specific agents
4. **Share with team** - Distribute .claude/AGENTS_README.md to team members
5. **Iterate** - Improve agents based on usage patterns

---

**Status**: ✅ Ready for autonomous testing and deployment
**Last Updated**: January 30, 2026
