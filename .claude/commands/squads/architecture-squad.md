# Architecture Squad

## Purpose

Grouped architecture review covering system design, module boundaries, API design, scalability, and long-term technical direction.

## When to Use

- Reviewing or proposing system architecture changes
- Evaluating module boundaries, data flow, or service decomposition
- Assessing API design, schema design, or integration patterns
- Analyzing scalability strategy or migration paths
- Resolving architectural trade-offs or ambiguity

## What It Does

Routes through the orchestrator to activate the architecture-focused agent group: System Architect (decision authority), Tech Lead (enforcement), and Infrastructure / Platform Engineer when infrastructure implications exist. The Architecture Gate is always active.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Perform an architecture review of the following: $ARGUMENTS

Classification: ARCHITECTURE

Execution mode behavior:
- AUTO: Orchestrator decides depth based on task complexity and project context
- FULL: Force full analysis — activate Architecture Gate, engage all relevant agents (System Architect, Tech Lead, Infrastructure Engineer), produce ADR, risk assessment, and trade-off analysis. No shortcuts.
- LIGHT: Minimal analysis — System Architect only, focus on key structural concerns, skip detailed trade-off analysis. Still validates safety but reduces depth. Use for minor changes or quick sanity checks.

Review depth:
- Evaluate module boundaries, data flow, API contracts, and system structure
- Assess scalability implications and long-term maintainability
- Identify architectural risks, trade-offs, and hidden coupling
- Check alignment with existing ADRs and architectural patterns
- Escalate to System Architect for any binding decisions

Expected output:
- Structured analysis following orchestrator output format
- Architecture decision or recommendation with rationale
- Risk assessment with severity and mitigation
- ADR proposal if a new architectural decision is required

Safety:
- Architecture Gate must be active
- System Architect has final authority on all architectural decisions
- No implementation begins until architecture is validated
