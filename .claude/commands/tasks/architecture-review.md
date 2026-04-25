# Architecture Review

## Purpose

Review architecture and structural changes with binding authority.

## When to Use

- Evaluating proposed structural changes to the system
- Reviewing module boundaries, data flow, or API design
- Resolving architectural ambiguity or conflicts between agents
- Assessing scalability, maintainability, or migration path

## What It Does

Invokes the orchestrator to classify as ARCHITECTURE and engage System Architect (decision authority) and Tech Lead (enforcement). Architecture Gate is always active.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Review the architecture of the following: $ARGUMENTS

Classification: ARCHITECTURE

Execution mode behavior:
- AUTO: Orchestrator decides depth based on structural impact and complexity
- FULL: Force full analysis — System Architect + Tech Lead + Infrastructure Engineer. ADR production, trade-off analysis, risk assessment, and implementation guidelines. No shortcuts.
- LIGHT: Minimal analysis — System Architect only, focus on key structural concern and immediate recommendation. Skip detailed trade-off analysis. Still validates no architecture-breaking changes.

Required behavior:
- Evaluate module boundaries, data flow, API contracts, and system structure
- Assess scalability, maintainability, and long-term viability
- Identify architectural risks, trade-offs, hidden coupling, and tech debt implications
- Check alignment with existing ADRs
- System Architect has final authority — produce a binding decision or ADR when needed
- Escalate infrastructure implications to Infrastructure / Platform Engineer if relevant

Expected output:
- Structured analysis following orchestrator output format
- Architecture assessment with strengths, weaknesses, and risks
- ADR proposal if a decision is required
- Trade-off analysis with recommended path
- Implementation guidelines for Tech Lead enforcement

Safety:
- Architecture Gate must be active
- System Architect has final authority
- No implementation of structural changes without architecture validation
- Tech Lead cannot override architectural decisions
