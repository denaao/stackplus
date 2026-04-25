# Migration Review

## Purpose

Review database migrations and data operations for safety and production readiness.

## When to Use

- A migration script needs review before execution
- Planning a schema change that affects production data
- Evaluating rollback viability for a migration
- Assessing risk of a large-scale data operation
- Reviewing backfill or data transformation plans

## What It Does

Invokes the orchestrator to classify as DATA_MIGRATION and engage Data Engineer / Migration Specialist with supporting agents for access policy review, security review, and production risk assessment.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Review the following migration: $ARGUMENTS

Classification: DATA_MIGRATION

Execution mode behavior:
- AUTO: Orchestrator decides depth based on migration risk level and data sensitivity
- FULL: Force full analysis — Data Engineer, RLS Specialist, Security Auditor, Performance Engineer, SRE. Complete migration plan, rollback strategy, risk assessment, integrity checks, and access policy review. No shortcuts.
- LIGHT: Minimal analysis — Data Engineer only, focus on migration safety and rollback viability. Skip access policy and performance review. Still enforces zero data loss and rollback requirement.

Required behavior:
- Evaluate forward migration plan: execution order, lock impact, estimated duration
- Evaluate rollback plan: reversibility, data preservation, time window
- Define pre-migration validation checks (schema state, row counts, constraint health)
- Define post-migration validation checks (data integrity, application health)
- Assess production risk: lock contention, replication lag, downtime potential
- Include RLS Specialist if migration affects access-controlled tables
- Include Security Auditor if migration involves sensitive data (PII, financial, credentials)
- Determine whether SRE presence is required for production execution

Expected output:
- Migration plan with execution order and rollback strategy
- Risk assessment with severity, failure modes, and mitigations
- Pre/post validation check definitions
- Deployment coordination requirements (migrate-then-deploy vs. deploy-then-migrate)
- Go/no-go recommendation for production execution

Safety:
- Zero data loss is the default standard
- Every migration must have a tested rollback path
- Pre and post validation are mandatory
- Sensitive data migrations require security review
- High/critical risk migrations require SRE presence
- Test in staging before production — no exceptions
