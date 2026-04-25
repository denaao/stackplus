# Incident Squad

## Purpose

Grouped incident response covering production outages, service degradation, incident triage, containment, escalation, restoration, and postmortem coordination.

## When to Use

- Production is down or degraded
- Users are reporting errors or service issues
- On-call alert has fired
- Security breach is suspected during a live incident
- Post-incident review or postmortem is needed
- Reliability risk patterns need analysis

## What It Does

Routes through the orchestrator with Incident Gate priority. Activates: Incident Response / SRE Engineer (command authority), Observability Engineer (signal support), Tech Lead (emergency engineering), Security Auditor (if security-related), and System Architect (post-resolution if architectural weakness is exposed). Incident Gate overrides all other work.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Handle the following incident scenario: $ARGUMENTS

Classification: INCIDENT_RESPONSE

Execution mode behavior:
- AUTO: Orchestrator decides depth based on severity and blast radius
- FULL: Force full analysis — engage SRE, Observability Engineer, Tech Lead, Security Auditor, and System Architect. Full severity assessment, containment plan, escalation chain, restoration steps, and postmortem coordination. No shortcuts.
- LIGHT: Minimal analysis — SRE + Observability Engineer only, focus on rapid triage and containment. Skip postmortem coordination until later. Still activates Incident Gate and enforces containment-first.

Review depth:
- Activate Incident Gate immediately — this takes priority over all other work
- Classify severity (SEV1-SEV4) and determine blast radius
- Triage and identify containment options
- Coordinate with Observability Engineer for signal interpretation
- Escalate to Tech Lead for emergency code changes if needed
- Escalate to Security Auditor only if security-related AND either active attack or post-containment
- Do NOT begin planning, refactoring, or architecture work until service is restored

Expected output:
- Severity assessment with blast radius
- Containment plan with immediate actions
- Escalation decisions with rationale
- Restoration steps in priority order
- Post-resolution: postmortem summary with action items

Safety:
- Incident Gate has highest priority — overrides all other gates
- SRE has command authority during active incidents
- No planning or refactoring until service is restored
- Contain first, investigate after
