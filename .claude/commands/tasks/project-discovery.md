# Project Discovery

## Purpose

Understand a codebase before acting on it.

## When to Use

- Starting work on a new or unfamiliar project
- Onboarding to an existing codebase
- Needing a structured understanding before making recommendations
- Mapping architecture, risks, and gaps before deeper work

## What It Does

Invokes the orchestrator in discovery mode to produce a comprehensive project understanding before any implementation, architecture, or security work begins.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Perform project discovery on the following: $ARGUMENTS

Classification: PROJECT_DISCOVERY

Execution mode behavior:
- AUTO: Orchestrator decides depth based on project size and available context
- FULL: Force full discovery — complete project summary, stack detection, architecture map, all risk areas, security-sensitive areas, testing gaps, documentation gaps, and prioritized next reviews. No shortcuts.
- LIGHT: Minimal discovery — project summary, stack, and top risks only. Skip detailed gap analysis. Sufficient for quick orientation before a focused task.

Required behavior:
- Build a structured understanding of the project before any other work
- Identify: project purpose, stack, architecture, main modules, risk areas
- Map security-sensitive areas (auth, payments, data access, secrets, multi-tenant)
- Identify testing quality gaps
- Identify documentation gaps
- List open questions that need answers before deeper work
- Recommend next reviews in priority order

Expected output:
Use the orchestrator's discovery output format:
```yaml
discovery:
  project_summary: "<Summary>"
  stack_detected: "<Stack>"
  architecture_map: "<Architecture>"
  main_modules: ["<Module>"]
  risk_areas: ["<Risk>"]
  security_sensitive_areas: ["<Area>"]
  testing_quality_gaps: ["<Gap>"]
  documentation_gaps: ["<Gap>"]
  open_questions: ["<Question>"]
  recommended_next_reviews: ["<Review>"]
```

Safety:
- Discovery must complete before implementation, architecture, or security work
- Do not assume context — derive from actual project inspection
- Flag areas where context is insufficient for confident recommendations
