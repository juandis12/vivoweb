---
name: spec-kit
description: Specification-Driven Development (SDD) master skill based on GitHub Spec Kit. Enforces a structured, multi-phase feature lifecycle (Constitution → Specify → Clarify → Plan → Tasks → Analyze → Implement) before writing implementation code. Use whenever the user asks for Spec Kit, spec-driven development, writing specifications, creating feature specs, or generating task breakdowns from specs.
license: MIT
compatibility: Google Antigravity, Claude Code, GitHub Copilot CLI
metadata:
  version: "1.0"
  source: github/spec-kit
---

# Spec Kit — Specification-Driven Development (SDD)

Spec Kit enforces a specification-first methodology to eliminate ambiguity, avoid premature implementation, and keep agents aligned with project constraints.

---

## 🔄 The 7-Phase SDD Lifecycle

```
[1. Constitution] ➔ [2. Specify] ➔ [3. Clarify] ➔ [4. Plan] ➔ [5. Tasks] ➔ [6. Analyze] ➔ [7. Implement]
```

### 1. Constitution ([`speckit-constitution`](file:///d:/Proyectos/vivoweb/.agents/skills/speckit-constitution/SKILL.md))
Establishes the governing architecture principles, coding standards, and boundaries for the project (`.specify/constitution.md`).

### 2. Specify ([`speckit-specify`](file:///d:/Proyectos/vivoweb/.agents/skills/speckit-specify/SKILL.md))
Drafts the feature specification focusing exclusively on **what** and **why** (functional requirements, user scenarios, boundaries), avoiding implementation details.

### 3. Clarify ([`speckit-clarify`](file:///d:/Proyectos/vivoweb/.agents/skills/speckit-clarify/SKILL.md))
Identifies ambiguities, edge cases, and hidden assumptions by asking targeted clarification questions before planning.

### 4. Plan ([`speckit-plan`](file:///d:/Proyectos/vivoweb/.agents/skills/speckit-plan/SKILL.md))
Translates the approved spec into a technical architecture blueprint, data models, API contracts, and technology decisions.

### 5. Tasks ([`speckit-tasks`](file:///d:/Proyectos/vivoweb/.agents/skills/speckit-tasks/SKILL.md))
Breaks the plan down into a dependency-ordered, verifiable task list (`tasks.md`).

### 6. Analyze ([`speckit-analyze`](file:///d:/Proyectos/vivoweb/.agents/skills/speckit-analyze/SKILL.md))
Performs cross-artifact consistency checks between the constitution, spec, plan, and tasks.

### 7. Implement ([`speckit-implement`](file:///d:/Proyectos/vivoweb/.agents/skills/speckit-implement/SKILL.md))
Systematically implements each task with automated verification and evidence before marking done.

---

## 🛠️ CLI Setup & Management
- [`speckit-install`](file:///d:/Proyectos/vivoweb/.agents/skills/speckit-install/SKILL.md) — Install the Specify CLI tool (`uv tool install specify-cli`).
- [`speckit-initial`](file:///d:/Proyectos/vivoweb/.agents/skills/speckit-initial/SKILL.md) — Initialize Spec Kit in the repository (`specify init`).
- [`speckit-check`](file:///d:/Proyectos/vivoweb/.agents/skills/speckit-check/SKILL.md) — Verify required CLI tools and dependencies.
