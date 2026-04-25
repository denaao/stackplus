# Incident

## Purpose

Handle incident-like scenarios with immediate triage, containment, and structured response.

## When to Use

- Production is down or degraded
- Users are reporting errors or service issues
- An on-call alert has fired
- A security breach is suspected during a live event
- Post-incident review or postmortem coordination is needed

## What It Does

Invokes the orchestrator with Incident Gate priority. Activates Incident Response / SRE Engineer as command authority before any other work can proceed. All planning and refactoring is deferred until service is restored.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Handle the following incident: $ARGUMENTS

Classification: INCIDENT_RESPONSE

Execution mode behavior:
- AUTO: Orchestrator decides depth based on severity and blast radius
- FULL: Force full analysis — SRE, Observability, Tech Lead, Security Auditor, System Architect. Complete severity assessment, containment, escalation, restoration, and postmortem. No shortcuts.
- LIGHT: Minimal analysis — SRE + Observability only, rapid triage and containment. Defer postmortem. Still activates Incident Gate and enforces containment-first.

Required behavior:
- Activate Incident Gate immediately — highest priority, overrides all other work
- Classify severity (SEV1-SEV4) and determine blast radius
- Triage: identify root cause hypothesis and containment options
- Coordinate with Observability Engineer for signal interpretation and monitoring confirmation
- Escalate to Tech Lead for emergency code changes or rollback if needed
- Escalate to Security Auditor only if security-related (breach, unauthorized access, data leak)
- Do NOT begin planning, refactoring, or architecture work until service is restored
- After restoration: coordinate postmortem with action items and ownership

Expected output:
- Severity assessment with blast radius and affected systems
- Containment plan with immediate actions
- Escalation decisions with rationale
- Restoration steps in priority order
- Post-resolution: postmortem summary, root cause, action items with owners

Safety:
- Incident Gate overrides all other gates
- SRE has command authority during active incidents
- Contain first, investigate after
- No refactoring or redesign during active incidents
