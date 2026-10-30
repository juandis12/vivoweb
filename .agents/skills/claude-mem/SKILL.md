---
name: claude-mem
description: Persistent cross-session memory and observation retrieval engine tailored for Google Antigravity IDE and multi-agent workflows. Captures architectural decisions, queries past session observations, searches project history across ~/.claude-mem and Antigravity conversation transcripts/knowledge items, and injects relevant prior context to eliminate context amnesia. Use whenever the user asks "what did we do last session?", "search memory", "did we already solve this?", "remember this decision", or needs cross-session recall in Antigravity.
license: MIT
compatibility: Google Antigravity, Claude Code, Gemini CLI
metadata:
  version: "1.0"
  system: Antigravity-Optimized Memory
---

# claude-mem — Persistent Cross-Session Memory for Antigravity

`claude-mem` gives Antigravity durable, cross-session memory. Instead of re-explaining architecture, re-discovering decisions, or forgetting bug investigations across separate chat sessions, `claude-mem` indexes previous actions and provides a layered, token-efficient search interface.

---

## 🏗️ Architecture in Antigravity

Antigravity operates with a dual-layer memory model:

1. **Local Persistent DB (`~/.claude-mem/`):**
   - SQLite database containing compressed observations (file reads, edits, command outputs, decisions).
   - Local vector embeddings for semantic search.
   - CLI interface available via `npx claude-mem`.

2. **Antigravity Brain & Knowledge Items:**
   - Conversation transcripts located at `<appDataDir>\brain\<conversation-id>\.system_generated\logs\transcript.jsonl`.
   - Curated Knowledge Items (KIs) located in `<appDataDir>\knowledge\`.
   - Brain artifacts stored in `<appDataDir>\brain\<conversation-id>\`.

---

## 🔍 Layered Memory Search Workflow (Token-Efficient)

**Rule:** NEVER dump raw full session logs into the prompt. Always follow the 3-step retrieval ladder:

```
[1. Search Index] ➔ [2. Timeline / Context] ➔ [3. Target Specific Observation]
```

### Step 1: Search the Memory Index
Query the memory database for matching keywords, topics, or file references.

* Via `npx claude-mem`:
  ```bash
  npx claude-mem search "<query>" --limit 10
  ```
* Or check recent conversation transcripts in Antigravity:
  ```powershell
  # Search recent user inputs and decisions in transcript logs
  Select-String -Path "$env:USERPROFILE\.gemini\antigravity-ide\brain\*\.system_generated\logs\transcript.jsonl" -Pattern "<query>" | Select-Object -First 10
  ```

### Step 2: Check Timeline Context
Once candidate observation IDs or session timestamps are found, inspect the surrounding context to understand what led to the decision:
```bash
npx claude-mem timeline --id <observation-id>
```

### Step 3: Retrieve Focused Observation
Only pull full observation text for the exact IDs needed:
```bash
npx claude-mem get <observation-id>
```

---

## 💾 Recording New Decisions & Memories

When the user asks to "remember this", "save this decision", or when a major architectural pattern is established:

1. **Log to Knowledge Items (Antigravity native):**
   - Save project patterns to `docs/` or an artifact in the workspace.
   - Use the `remember` skill if installed (`.agents/skills/remember`).
2. **Sync to Claude-Mem:**
   ```bash
   npx claude-mem record --title "<Decision Title>" --content "<Key Rationale & Solution>"
   ```
3. **Session Handoffs:**
   - Use `/handoff` to write a structured `HANDOFF.md` capturing the current goal, files touched, next steps, and known pitfalls before ending the session.

---

## 🛠️ Associated Skills

The complete `claude-mem` suite in this workspace includes:
- [`mem-search`](file:///d:/Proyectos/vivoweb/.agents/skills/mem-search/SKILL.md) — 3-step search for past observations.
- [`how-it-works`](file:///d:/Proyectos/vivoweb/.agents/skills/how-it-works/SKILL.md) — Deep dive into observation lifecycle and compression.
- [`handoff`](file:///d:/Proyectos/vivoweb/.agents/skills/handoff/SKILL.md) — Generates session handoff documents.
- [`learn-codebase`](file:///d:/Proyectos/vivoweb/.agents/skills/learn-codebase/SKILL.md) — Rapidly primes whole repo context into memory.
- [`smart-explore`](file:///d:/Proyectos/vivoweb/.agents/skills/smart-explore/SKILL.md) — AST-based structural code exploration.
- [`knowledge-agent`](file:///d:/Proyectos/vivoweb/.agents/skills/knowledge-agent/SKILL.md) — Builds focused knowledge graphs from memories.
- [`timeline-report`](file:///d:/Proyectos/vivoweb/.agents/skills/timeline-report/SKILL.md) — Full narrative timeline of project evolution.
