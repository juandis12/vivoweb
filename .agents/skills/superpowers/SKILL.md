---
name: superpowers
description: Superpowers agentic engineering methodology by Jesse Vincent (obra/superpowers). Enforces a disciplined, test-driven, subagent-capable software development lifecycle (brainstorming → plan writing → TDD → systematic debugging → code review → verification before completion). Use whenever the user requests superpowers, disciplined software engineering, strict TDD workflow, or asks to use the superpowers methodology.
license: MIT
compatibility: Google Antigravity, Claude Code, Cursor, Codex
metadata:
  version: "1.0"
  upstream: https://github.com/obra/superpowers
---

# Superpowers — Disciplined Agentic Engineering Methodology

Superpowers replaces ad-hoc "vibe coding" with a systematic, professional engineering lifecycle designed for AI coding agents.

---

## ⚡ Core Superpowers Workflow Pipeline

```
[Brainstorming] ➔ [Writing Plans] ➔ [Executing Plans / TDD] ➔ [Systematic Debugging] ➔ [Code Review] ➔ [Verification]
```

### 1. Requirements & Design
- [`brainstorming`](file:///d:/Proyectos/vivoweb/.agents/skills/brainstorming/SKILL.md) — Must be used before any creative work, building components, adding features, or architectural changes. Explores user needs, design constraints, and alternatives.
- [`writing-plans`](file:///d:/Proyectos/vivoweb/.agents/skills/writing-plans/SKILL.md) — Formulates detailed, step-by-step implementation plans with explicit validation criteria before touching code.

### 2. Implementation & Testing
- [`test-driven-development`](file:///d:/Proyectos/vivoweb/.agents/skills/test-driven-development/SKILL.md) — Enforces strict TDD: write the failing test first, verify failure, implement minimum code to pass, refactor.
- [`executing-plans`](file:///d:/Proyectos/vivoweb/.agents/skills/executing-plans/SKILL.md) — Systematic inline plan execution keeping human alignment at every milestone.
- [`subagent-driven-development`](file:///d:/Proyectos/vivoweb/.agents/skills/subagent-driven-development/SKILL.md) — Orchestrates subagents for independent, parallel task execution.
- [`dispatching-parallel-agents`](file:///d:/Proyectos/vivoweb/.agents/skills/dispatching-parallel-agents/SKILL.md) — Manages parallel execution when tasks have no shared state.

### 3. Investigation & Debugging
- [`systematic-debugging`](file:///d:/Proyectos/vivoweb/.agents/skills/systematic-debugging/SKILL.md) — Root-cause debugging protocol before guessing or applying hotfixes.

### 4. Review & Verification
- [`requesting-code-review`](file:///d:/Proyectos/vivoweb/.agents/skills/requesting-code-review/SKILL.md) — Request structured peer review before finalizing changes.
- [`receiving-code-review`](file:///d:/Proyectos/vivoweb/.agents/skills/receiving-code-review/SKILL.md) — Rigorous evaluation of review comments with verification rather than blind compliance.
- [`verification-before-completion`](file:///d:/Proyectos/vivoweb/.agents/skills/verification-before-completion/SKILL.md) — Demands evidence before claims: run test suites and verification commands before asserting success.
- [`finishing-a-development-branch`](file:///d:/Proyectos/vivoweb/.agents/skills/finishing-a-development-branch/SKILL.md) — Safe integration, merge, or PR packaging once tests pass.
