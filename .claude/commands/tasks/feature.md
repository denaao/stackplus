# Feature

## Purpose

Handle new feature requests safely through full orchestrator analysis.

## When to Use

- A new feature needs to be designed, planned, or implemented
- An existing feature needs significant changes or extension
- A feature request needs evaluation before committing to implementation

## What It Does

Invokes the orchestrator to classify the feature request, discover project context, and engage the right agents for architecture, security, testing, and product considerations.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Handle the following feature request: $ARGUMENTS

Classification: IMPLEMENTATION, ARCHITECTURE, PRODUCT as appropriate. If the feature is at the idea stage, include PRODUCT. If it involves structural changes, include ARCHITECTURE. If it is ready for implementation, include IMPLEMENTATION.

Execution mode behavior:
- AUTO: Orchestrator decides depth based on feature complexity and scope
- FULL: Force full analysis — architecture review, security assessment, testing plan, product evaluation, and implementation plan. All relevant gates active. No shortcuts.
- LIGHT: Minimal analysis — focus on implementation plan and key risks only. Reduce agent count. Still triggers Security Gate if auth/data/payments are involved.

Required behavior:
- Run project discovery if context is weak — do not assume
- Evaluate architecture impact (module boundaries, data flow, API changes)
- Assess security implications (auth, data access, secrets, tenant isolation)
- Define testing requirements (unit, integration, E2E, edge cases)
- Include product considerations (user value, validation criteria, kill criteria) when relevant
- Produce a clear implementation plan with sequencing and dependencies

Expected output:
- Structured analysis following orchestrator output format
- Architecture assessment or ADR if structural changes are needed
- Security considerations with required gates
- Testing plan with coverage expectations
- Implementation plan with clear steps and ordering

Safety:
- Architecture Gate for structural changes
- Security Gate for auth, data, payments, secrets, or multi-tenant features
- Testing Gate for behavior changes
- No implementation without validated architecture
