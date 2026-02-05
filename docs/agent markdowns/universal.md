# Universal Platform Physics: Relevance AI Agent Building

> **Status:** Production-Grade Understanding (Iteration 12)
> **Last Updated:** 2026-02-04
> **Scope:** Core platform patterns that apply to ALL agents regardless of use case

---

## First Principles: The 7 Key Lessons

> *How to explain building great agents to a high schooler.*

### 1. Start With the Problem, Not the Agent Type

All agents follow patterns, but each is ultimately **specialized** for its problem. You can build any agent—you just need to know what problem it's solving and hone in on that.

Ask these questions to define your agent:

| Dimension | Question |
|-----------|----------|
| **Problem** | What specific pain does this solve? |
| **Trigger** | How/when does it start? (Chat, schedule, webhook, event) |
| **Interaction** | Does it run alone or talk to users? |
| **Tools** | What external capabilities does it need? |
| **Output** | What does it deliver? (Report, message, action, data update) |

**Don't pick a category—define your agent's job clearly and build for that.**

### 2. Structure Beats Intelligence

The best agents aren't smarter—they're **more organized**.

Every great agent has:
- **Clear sections** with headers (not walls of text)
- **Numbered steps** (Phase 1, Phase 2...)
- **Templates** for output (so results are consistent)

### 3. Teach It What NOT to Do

Every great agent has anti-patterns:
- "Do NOT ask for clarification—just research harder"
- "Do NOT use more than 140 words"
- "Do NOT pick more than one option"

**Anti-patterns prevent failures** just as much as good patterns create success.

### 4. Tell It When to Stop

Agents can run forever if you don't set limits:
- "Stop after 5 retries"
- "Stop when you have 2 sources for each claim"
- "Stop when all fields are above 3/5 confidence"

**Great agents know when they're done.**

### 5. Make It Sound Human

For agents that talk to users:
- **Hide the machinery** ("Let me look into that" not "Calling research tool")
- **Be conversational** ("Here's what I found" not "The analysis reveals...")
- **Keep it short** (4-6 lines max per message)

### 6. Separate the Brain from the Configuration

| Component | Purpose |
|-----------|---------|
| **Prompt** | How the agent thinks and behaves |
| **Params** | Company-specific details (swappable) |
| **Knowledge** | Reference examples and data |

**Reuse the same agent for different clients** by just changing config.

### 7. Put Guardrails Everywhere

Production agents have safety nets:
- **Retry limits** (don't try forever)
- **Cost caps** (don't spend infinite credits)
- **Validation checks** (verify before delivering)
- **Error playbooks** (what to do when things break)

---

### The Simple Formula

> **A great agent = Clear job + Structured steps + Smart limits + Human voice + Safety nets**

---

## 1. Prompt Engineering

*The internal workflow of the Agent.*

### Core Philosophy
"Engineer intelligence" via text. Output is documentation, prompts, and JSON schemas that configure a sovereign AI entity.

### The Process Loop
1. **Ingest & Analysis:** Read the agent repository to understand the *current* agent state.
2. **Implementation Planning:** Never touch a prompt without a plan.
3. **Artifact Generation:**
    * **System Prompts:** Markdown files acting as the "Brain".
    * **Tool Definitions:** JSON Schemas acting as the "Hands".
    * **Node Prompts:** Instructions for Multi-Agent communication.
    * **Documentation:** SOPs and Architecture decision logs.
4. **Changelog Management:** Maintain a simple changelog to track edits.

---

## 2. Relevance AI Agent Architecture

### Agent Archetypes

| Archetype | Trigger | Interaction | Prompt Style | Example |
|-----------|---------|-------------|--------------|---------|
| **Autonomous Orchestrator** | Calendar, Webhook, Schedule | Minimal user input; runs to completion | Large, self-contained | Presley |
| **Conversational Assistant** | Chat message | Back-and-forth dialogue; confirms before acting | Interactive UX focus | Anny |
| **API Interface Agent** | Chat message | Translates NL to API calls | Documentation-driven | Apollo MRP |
| **Task-Specific Pipeline** | Webhook, Chat, Trigger | Single-purpose workflow; execute and report | Focused, procedural | Enrichment Agent |
| **Research Deep-Dive** | Trigger, Chat | Full autonomy; iterative rounds until complete | Self-validating loops | Reece |
| **Structured Reporter** | Trigger, Schedule | Gather data; format rich output; deliver | Output format focus | Vera Nox |
| **Configurable Research Agent** | Chat, Trigger | Reusable agent with swappable params | Multi-param templates | Galileo |
| **Content Generator (No-Tools)** | Chat | Pure generation from knowledge + input | Knowledge-driven | Bella, Leonardo |
| **Synthesis / Intelligence** | Chat, Trigger, Workforce | Multi-source gathering → executive briefing | Two-phase (gather→synthesize) | Customer All-Knower |

Choose the archetype based on the use case.

#### Synthesis Agent Deep Dive

Synthesis agents gather from multiple sources and deliver executive-ready briefings. They use a **two-phase cognitive pattern**:

**Phase 1: Comprehensive Discovery**
- Query broadly: "Tell me everything about {X}"
- Go multiple rounds (2-3+ per source)
- Follow interesting threads with targeted follow-ups
- Cross-reference between sources
- **Stopping condition:** "I have a complete picture" (not "I queried each source once")

**Phase 2: Executive Synthesis (CEO Elevator Test)**
- Lead with **opinionated headline** (not neutral summary)
- **3-5 bullets max** of what matters most
- Flag **risks and concerns** worth noting
- End with **specific recommended action**
- Note sources and gaps

**Why Separation Matters:**
| Mixed Approach | Separated Phases |
|----------------|------------------|
| Synthesizes too early → incomplete data | Gathers exhaustively first |
| Gathers while synthesizing → verbose output | Synthesizes ruthlessly after |
| Unclear stopping point | Clear phase transition |

**Prompt Structure:**
```markdown
## Phase 1: Discovery
- Start broad, go multiple rounds
- "Let me know what else you think may be useful"
- Keep querying until confident

## Phase 2: Synthesis
Imagine being stopped by the CEO: "Quick - what's going on with {X}?"
- Opinionated headline
- 3-5 prioritized bullets
- Risk/opportunity
- Specific next action
```

> **Note:** See `archetypes/` folder for detailed templates: enrichment-agent.md, research-agent.md, outreach-agent.md, synthesis-agent.md

---

### System Prompt (The Brain)

A single monolithic text block, but **internally structured using Markdown headers** as semantic boundaries.

**Two Design Patterns:**

| Pattern | When to Use | Prompt Size | Knowledge Location |
|---------|-------------|-------------|--------------------|
| **Self-Contained** | Complex orchestration, many sub-agents | Large (3,000-5,000 words) | Embedded in prompt |
| **Documentation-Driven** | API wrappers, reference-heavy tasks | Small (~400 words) | Injected via params |

**Tiered Structure Pattern (for complex prompts):**

| Tier | Purpose | Contents |
|------|---------|----------|
| **TIER 1: Operational Core** | What the agent DOES | Identity, rules, schemas, phase definitions |
| **TIER 2: Reference Modules** | HOW it does things | Lanes, tool patterns, verification protocols, playbooks |
| **TIER 3: Calibration Principles** | Behavioral guidelines | Autonomy rules, quality standards, UX principles |

**Production-Grade Section Order:**
```markdown
# Identity & Mission
# CONVERSATIONAL STYLE & TONE (if interactive)
## Rules & Exclusions
## Tools Available
## Phased Workflow
### Phase 0-N with Gates
## Reference Modules (Tier 2)
## Output Templates
## Calibration Principles (Tier 3)
```

---

### Params & Variables

#### Basic Usage
Static configuration values:
```json
"params": {
  "Hubspot account hubID": "21427964"
}
```
Referenced as `{{Hubspot account hubID}}` in the prompt.

#### Advanced: Documentation Injection
Use params to inject **large reference documents** into the prompt:
```json
"params": {
  "API_Documentation": "# A Practical Guide to Apollo's API\n\n## Authentication...\n\n## Endpoints..."
}
```
Referenced as `{{API_Documentation}}` in the prompt.

**Why this pattern works:**
- **Separation of concerns:** System Prompt = behavior; Param = domain knowledge
- **Maintainability:** Update the docs without touching prompt logic
- **Reusability:** Same prompt structure works with different API docs

#### Params as Structured Tables
Use params to store **lookup tables** (arrays of objects):
```json
"params": {
  "implementation_manager_details": [
    { "IM_Name": "Mai", "IM_slack_id": "U08M04U5C1L", "IM_email": "mai@example.com" },
    { "IM_Name": "Ishika", "IM_slack_id": "U08LFGYNYJ2", "IM_email": "ishika@example.com" }
  ]
}
```

#### Comment Syntax
Use inline comments for maintainer notes (not rendered in final prompt):
```
{{_comment.This agent minimises credit spend by working in phases}}
{{_comment.Phase 2 requires user confirmation before bulk operations}}
```

---

### Knowledge References in Prompts

Reference knowledge sets directly in the system prompt using `{{_knowledge.XXX}}` syntax:

```markdown
# Sample Examples
{{_knowledge.activated_vitamin_d_spf_technology_email_txt_4}}
{{_knowledge.bottom_line_improvement_sustainable_innovation_txt_4}}
```

Combine with `usage_type: "instructions"` in the knowledge config:
```json
"knowledge": [
  { "knowledge_set": "sample_email_1", "usage_type": "instructions" },
  { "knowledge_set": "sample_email_2", "usage_type": "instructions" }
]
```

---

### Knowledge Sets

**Usage Types:**
| Type | Behavior |
|------|----------|
| `"instructions"` | Auto-injected into system prompt context |
| `"tool"` | Explicitly invoked when needed |

Use `"instructions"` for always-relevant context (e.g., product info).
Use `"tool"` for on-demand lookups (e.g., case studies).

---

### Agent Metadata Fields

| Field | Purpose | Example |
|-------|---------|---------|
| `user_instructions` | User-facing documentation on how to use the agent | "Start by providing: Prospect Name, Company Name, LinkedIn URL" |
| `title_prompt` | Controls conversation title generation | "Name the task after the prospect's name" |
| `description` | Brief agent description | "Researches companies for sales outreach" |

---

### Tools (The Hands)

#### Tool Types
| Type | Purpose | Example |
|------|---------|---------|
| **Action Tools** | Execute a specific task | Google Search, LinkedIn Scraper |
| **Router/Planning Tools** | Generate execution plans | Research Router |
| **Memory Tools** | Persist/retrieve user context | add_agent_memory |
| **API Tools** | Dynamic API calls | Apollo API Tool |

#### Router Tool Pattern
A **meta-tool** that takes high-level inputs and returns an execution plan:
```json
{
  "research_goal": "<string>",
  "stage": "Prospecting | Active deal | Post-sale",
  "depth": "Minimal | Lite | Standard | Deep",
  "primary_need": "Stakeholders | Triggers | Tech stack | ...",
  "secondary_need": "<optional>"
}
```
Returns: `lane`, `methods_to_run`, `must_have_fields`, `stop_criteria`, `output_pack`, `fallbacks`

**Rule:** Agent MUST call the Router before proceeding to execution.

#### Tool Simplicity Principle (YAGNI)

Before adding defensive/validation steps to tools:

1. **Verify the problem exists** - Test the simple path first
2. **Ensure the fix doesn't create new problems** - Defensive code can introduce new failure modes
3. **Prefer pass-through over transformation** - Direct `{{params.field}}` often works

**Anti-Pattern:** Adding normalization/validation steps based on hypothesis without testing:
```
❌ Hypothesis: "UUIDs might be malformed"
   → Add normalize step
   → Normalize step errors on edge cases
   → More complex debugging

✅ Reality: "UUIDs are fine, direct pass-through works"
   → Simple {{params.page_id}}
   → Fewer failure points
```

**When validation IS needed:**
- External/untrusted input (user input, webhooks)
- API contracts that explicitly require format transformation
- Proven failure cases (not hypothetical ones)

---

### Phased Workflows with Gates

#### The Pattern
Production agents use **numbered phases** with **explicit gates** that block progression.

```
PHASE 0: [Setup/Context] ← Gate: "Don't proceed until X is confirmed"
PHASE 1: [Gather inputs]
PHASE 2: [Route/Plan] ← MANDATORY tool call
PHASE 3: [Present plan, wait for approval]
PHASE 4: [Execute]
PHASE 5: [Synthesize & deliver]
```

#### Gates
A **gate** is a condition that must be met before the agent proceeds:
- "Do not begin researching until I give you the green light."
- "You MUST call the Router before executing research."

#### Checkpoints
For long-running execution, define **checkpoint cadence**:
```markdown
**CHECKPOINT {N} — {Method}**
• Finding (Source, Date, Conf X/5)
• Finding (Source, Conf X/5)
**Next:** {next method / 2–3 calls}
```

---

### Error Handling

#### Error Playbook Pattern
Include a structured **error → action** table in the documentation:

| Status | Likely Cause | Action |
|--------|--------------|--------|
| **400** | Malformed body/params | Validate JSON, required fields, array formats |
| **401** | Invalid/missing API key | Confirm header `X-Api-Key`; check role/plan |
| **403** | Feature not in plan | Upgrade plan or use master key |
| **422** | Invalid value (domain, date, enums) | Fix formatting per docs |
| **429** | Rate limit | Exponential backoff + jitter; reduce concurrency |
| **5xx** | Transient server issue | Retry with backoff; stop after bounded attempts |

#### Graceful Error Handling
```markdown
If an API call fails:
1. Analyze the error
2. Consult the documentation
3. Retry if safe to do so
4. If issue persists, summarize the problem and propose a new course of action
```

#### Escalation (External Relay)
Production agents configure alerts for error states:
```json
"trigger_conditions": {
  "task_statuses": ["errored-pending-approval", "timed-out", "escalated"]
},
"external_service_config": {
  "type": "slack",
  "channel_id": "..."
}
```

#### Debugging Error Chains

When errors occur in multi-step workflows, **work backwards from symptoms to root cause**:

```
ERROR LOCATION          ACTUAL CAUSE
─────────────────       ─────────────────
Step N: API call        Step 0: Agent/Trigger
(parameter missing) ←   (value never passed)
        ↑
    Step N-1: Transform
    (received empty)
        ↑
    Step N-2: Validate
    (received empty)
```

**Debugging Process:**
1. **Identify symptom location** - Where does the error message point?
2. **Trace the bad value** - What input caused the error?
3. **Follow upstream** - Where does that value come from?
4. **Find the origin** - Keep tracing until you find where it went wrong

**Common Root Causes:**
| Symptom | Often Actually Caused By |
|---------|--------------------------|
| API parameter missing | Agent didn't pass it in tool call |
| `KeyError: 'transformed'` | Previous Python step errored or returned wrong type |
| Empty string in API call | Upstream step received empty input |
| `required property` error | params_schema mismatch in workforce edge |

**Rule:** Don't fix symptoms—fix root causes. If Step 3 fails because Step 1 passed empty data, fix Step 1.

---

### Bounded Retry Logic

Specify **exact retry counts** with escalation paths:

```markdown
### Retry Logic for Invalid Fields
1. Automatically replace the invalid value using normalization rules
2. Log/track the change internally
3. Retry the operation, correcting **only one field per retry** (for debugging)
4. Retry up to a maximum of **5 times**
5. If, after 5 retries, the values still cannot be validated:
   * Stop further retries
   * Return a concise error with invalid values and suggested replacements

### Handling "No Data Found"
* Retry up to **2 more times** with **broader or adjusted** parameters
* If there are still no results after 3 total attempts:
  * Stop retrying
  * Inform the user that no matches were found
  * Suggest specific ways to broaden the search
```

---

### Multi-Agent Systems (Sub-Agents)

#### Philosophy
Use Sub-Agents for complex, specialized tasks.

#### Orchestration in the Manager's System Prompt
The Manager's System Prompt carries **detailed orchestration rules**:

| Element | Description |
|---------|-------------|
| **Persona** | Human-readable identity ("Harry is your indispensable first mate") |
| **Capabilities** | What the sub-agent can do |
| **Iterative Workflow** | "Broad Sweep" first, then "Surgical Strikes" |
| **Priority Rules** | When to use one resource over another |
| **Justification** | When explicit reasoning is required |

#### Node Prompts
* **Definition:** Separate configuration.
* **Purpose:** Lightweight prompt at the connection point.

---

### Workforce Architecture Patterns

> **Key Principle:** Workforces are proactive systems that act on behalf of the user, not reactive query engines.

#### The Thin Orchestrator / Fat Capabilities Pattern

| Component | Responsibility | What It Knows |
|-----------|---------------|---------------|
| **Orchestrator** | Coordination, routing, synthesis | WHEN to use capabilities |
| **Capabilities** (Sub-agents) | Domain expertise, execution | HOW to execute in their domain |

**Rule:** Never put domain logic in the orchestrator. If you're adding HubSpot-specific logic to the manager, it belongs in the HubSpot agent.

**Why it works:** Allows swapping, upgrading, or adding capabilities without rewriting orchestration logic.

#### Edge Types

| Type | Use When | Behavior |
|------|----------|----------|
| `forced-handover` | Deterministic routing (trigger → agent) | Always executes, no decision |
| `tool-call` | Agent decides when to invoke | Appears as callable tool to source agent |

#### Edge Configuration

| Field | Purpose | Example |
|-------|---------|---------|
| `threading_behavior` | Context persistence | `always-same` (memory) vs `always-create-new` (stateless) |
| `action_behaviour` | Approval requirements | `never-ask` (auto-approve) vs `always-ask` (human approval) |
| `params_schema` | Input contract | Defines required parameters like `message` |
| `prompt_for_when_to_use` | Routing guidance | Injected into orchestrator's system prompt |

**Critical:** If `params_schema` is empty, the orchestrator won't know required parameters, causing first-call failures.

**params_schema Example (Required):**
```json
{
  "params_schema": {
    "properties": {
      "message": {
        "type": "string",
        "description": "The query to send to this agent"
      }
    },
    "required": ["message"]
  },
  "prompt_for_when_to_use": "Use for CRM data, deals, contacts, activity history"
}
```

**Common First-Call Failure Pattern:**
```
ERROR: "must have required property 'message'"
CAUSE: Edge has empty params_schema: {}
FIX: Add params_schema matching what the sub-agent expects
```

#### Proactive Discovery Pattern

Sub-agents behave more usefully when given agency:

```markdown
❌ "Get the deal information for Acme"
✅ "Tell me everything about Acme. What stands out? Any risks or opportunities?
   Let me know what else you think may be useful."
```

**Rule:** End sub-agent queries with "Let me know what else you think may be useful."

**Why it works:** Activates sub-agent agency rather than constraining to literal interpretation.

#### Iterative Multi-Round Pattern

The orchestrator should keep querying until confident, not stop at first response:

```markdown
ROUND 1: Broad discovery ("Tell me everything about X")
ROUND 2: Follow-up on interesting threads ("You mentioned IT blockers - details?")
ROUND 3: Cross-reference ("HubSpot shows renewal in 6 months - what does Account Plan say?")
ROUND 4: Gap-filling ("Any recent escalations or support tickets?")
```

**Stopping condition:** "I'm confident I have a complete picture" — NOT "I've queried each source once."

#### Capability Decomposition Guidelines

| Complexity | Implementation |
|------------|----------------|
| Simple, stateless, single-step | Direct Tool |
| Async, polling, retries needed | Sub-Agent |
| Multi-step, decision logic | Sub-Agent |
| Domain expertise required | Sub-Agent |

#### Locked Agents

Some agents are well-optimized and should never be edited:
- Mark as **LOCKED** in documentation
- Route changes through the agent owner
- Orchestrator adapts to their interface, not vice versa

---

### Triggers & Inputs
* **Abstraction:** All Triggers (Schedule, Webhook, Form, Chat) are treated as **Incoming Messages**.
* **Responsibility:** Define the **Expected Input Schema** the System Prompt must handle.

---

### Memory (When Used)

> **Caution:** Memory should be used **very selectively**. Only for items that must persist across task runs.

#### Structured Memory with Tags
When memory IS needed, use a **tagging system**:

```markdown
**Allowed Tags:**
[My Company] - Company name, one-liner, website
[My Product] - Product name and category
[Product Knowledge] - Capabilities, integrations, differentiators
[ICP] - Ideal Customer Profile
[Process] - User-defined workflows
[Data Sources] - Preferred sources
```

**Format:** `[TAG] <concise statement>` (max 120 chars per memory)

**What NOT to Remember:**
- Single-deal facts, transient details
- Meeting links, dates/times
- Generic facts you can re-derive
- Anything sensitive/personal
