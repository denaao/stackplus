# Security Review

## Purpose

Run a focused security review routed by lifecycle phase.

## When to Use

- Before implementing a feature with security implications (threat modeling)
- After implementation to find vulnerabilities (security audit)
- To validate a security fix (fix validation)
- To automate security prevention (DevSecOps)
- To review data access policies (RLS review)

## What It Does

Invokes the orchestrator to classify as SECURITY_REVIEW and route to the correct security agent based on the current phase. Enforces strict phase-based routing.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Perform a security review of the following: $ARGUMENTS

Classification: SECURITY_REVIEW

Execution mode behavior:
- AUTO: Orchestrator decides depth based on security sensitivity and phase
- FULL: Force full analysis — all phase-relevant agents, comprehensive findings with severity, evidence, remediation, and automation plan. No shortcuts.
- LIGHT: Minimal analysis — single phase-appropriate agent, critical and high severity only. Still enforces security veto on critical findings.

Required behavior:
- Determine the lifecycle phase: design (pre-implementation), audit (post-implementation), fix validation, or automation
- Route to the correct security agent for that phase — never invoke two agents for the same responsibility
- Prioritize: tenant isolation, authentication, authorization, secrets management, injection vectors, file uploads, unsafe trust assumptions, and payment security
- Include RLS & Data Access Specialist if data access policies are involved
- Include DevSecOps if pipeline automation is relevant

Expected output:
- Phase-appropriate structured output (threat model, audit findings, fix verdict, or automation plan)
- Each finding with severity, evidence or risk scenario, and specific remediation
- Clear next steps and which agent handles the next phase

Safety:
- Security Gate is always active
- Phase-based routing is strict — do not skip or combine phases
- Security veto blocks deployment
- Sensitive data exposure findings are always critical severity
