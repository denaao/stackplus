# Delivery Squad

## Purpose

Grouped delivery review covering implementation planning, release readiness, delivery coordination, and rollout risk assessment.

## When to Use

- Planning implementation of a feature or change
- Assessing release readiness before deployment
- Coordinating delivery across multiple agents or teams
- Evaluating rollout risk and defining mitigation strategies
- Reviewing sprint scope, delivery timelines, or dependency chains

## What It Does

Routes through the orchestrator to activate the delivery-focused agent group: Project Manager (coordination), Tech Lead (implementation oversight), QA Engineer (validation readiness), Observability Engineer (operational readiness), and Incident Response / SRE Engineer (production rollout risk).

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Perform a delivery review of the following: $ARGUMENTS

Classification: DELIVERY_PLANNING, PRODUCTION_READINESS

Execution mode behavior:
- AUTO: Orchestrator decides depth based on release scope and risk
- FULL: Force full analysis — engage Project Manager, Tech Lead, QA Engineer, Observability Engineer, and SRE. Full readiness checklist, risk assessment, rollback plan, and rollout strategy. No shortcuts.
- LIGHT: Minimal analysis — Project Manager + Tech Lead only, focus on blocking issues and critical risks. Skip detailed observability and SRE review. Still validates rollback plan exists.

Review depth:
- Evaluate implementation plan completeness and sequencing
- Assess delivery dependencies and critical path
- Review validation readiness (test coverage, QA sign-off)
- Evaluate operational readiness (monitoring, alerting, runbooks)
- Assess rollout risk (blast radius, rollback plan, feature flags)
- Include SRE when production rollout carries reliability risk
- Include Observability Engineer when operational readiness needs verification

Expected output:
- Structured analysis following orchestrator output format
- Implementation plan with sequencing and dependencies
- Release readiness checklist with pass/fail per criterion
- Risk assessment with rollout-specific failure modes
- Rollback plan and mitigation strategies
- Go/no-go recommendation with conditions

Safety:
- No release without adequate test coverage and validation
- Rollback plan must be defined before deployment
- High-risk rollouts require SRE awareness
- Observability must be in place before production deployment
