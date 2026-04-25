# Security Squad

## Purpose

Grouped security review covering threat analysis, vulnerability discovery, auth/authz review, data access policies, fix validation, and security automation.

## When to Use

- Reviewing security posture of a feature, module, or system
- Analyzing authentication, authorization, or tenant isolation
- Performing threat modeling before implementation
- Auditing existing code for vulnerabilities
- Validating security fixes or reviewing security automation

## What It Does

Routes through the orchestrator to activate the security cluster in the correct phase order: Threat Model Agent (design), Security Auditor (post-implementation), Secure Code Fix Reviewer (fix validation), DevSecOps (automation), and RLS & Data Access Specialist (data access). The Security Gate is always active.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Perform a security review of the following: $ARGUMENTS

Classification: SECURITY_REVIEW

Execution mode behavior:
- AUTO: Orchestrator decides depth based on security sensitivity and phase
- FULL: Force full analysis — activate Security Gate, engage all phase-relevant security agents, produce comprehensive findings with proof of concept, remediation, and automation recommendations. No shortcuts.
- LIGHT: Minimal analysis — route to single phase-appropriate agent, focus on critical and high severity only, skip low-risk areas. Still enforces security veto on critical findings.

Review depth:
- Determine the current phase (design, post-implementation, fix validation, automation)
- Route to the correct security agent based on phase — never invoke two agents for the same phase
- Cover authentication, authorization, tenant isolation, secrets management, injection vectors, upload safety, and unsafe trust assumptions
- Include RLS & Data Access Specialist if data access policies are involved
- Include DevSecOps if automation or pipeline security is relevant

Expected output:
- Structured findings following orchestrator output format
- Each finding with severity, proof of concept or risk scenario, and remediation
- Phase-appropriate output (threat model, audit findings, fix verdict, or automation plan)
- Clear next steps for each finding

Safety:
- Security Gate must be active
- Security agents operate in strict phase order — do not skip phases
- Security veto blocks deployment — cannot be overridden without documented joint risk acceptance
