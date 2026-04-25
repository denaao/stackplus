# Production Readiness

## Purpose

Check whether a feature or change is ready for production deployment.

## When to Use

- Before deploying a feature to production
- Evaluating whether a release candidate meets production standards
- Reviewing operational readiness (monitoring, alerting, runbooks)
- Assessing rollout risk and rollback viability

## What It Does

Invokes the orchestrator to classify as PRODUCTION_READINESS and engage all relevant agents for a comprehensive readiness assessment across security, testing, observability, infrastructure, and delivery.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Assess production readiness of the following: $ARGUMENTS

Classification: PRODUCTION_READINESS

Execution mode behavior:
- AUTO: Orchestrator decides depth based on release scope and risk profile
- FULL: Force full analysis — all readiness agents engaged. Complete checklist across security, testing, observability, infrastructure, delivery, and rollback. No shortcuts.
- LIGHT: Minimal analysis — focus on blocking issues and critical risks only. Reduced agent set (Tech Lead + QA). Still requires rollback plan and flags security concerns.

Required behavior:
- Evaluate security posture (Security Gate active)
- Evaluate test coverage and validation completeness (Testing Gate active)
- Evaluate observability readiness (monitoring, alerting, dashboards, runbooks)
- Evaluate infrastructure readiness (deployment targets, capacity, reliability)
- Evaluate rollback plan viability
- Assess rollout risk (blast radius, feature flags, canary strategy)
- Identify blocking issues vs. acceptable risks

Expected output:
- Structured production readiness checklist with pass/fail per criterion
- Blocking issues that must be resolved before deployment
- Accepted risks with documented justification
- Rollback plan
- Rollout strategy recommendation
- Final go/no-go verdict with conditions

Safety:
- Security Gate, Architecture Gate, and Testing Gate all active
- No deployment without rollback plan
- No deployment without observability in place
- High-risk rollouts require SRE awareness
