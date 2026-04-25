# SQL Review

## Purpose

Review SQL, schema changes, access policies, and migration safety.

## When to Use

- Reviewing SQL queries for correctness, safety, or performance
- Evaluating schema changes or migration scripts
- Reviewing RLS policies or data access rules
- Assessing migration risk for production execution

## What It Does

Invokes the orchestrator to classify across DATABASE, DATA_MIGRATION, and RLS_SECURITY as appropriate, engaging the right specialist agents for each dimension.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Review the following SQL / schema / migration: $ARGUMENTS

Classification: DATABASE, DATA_MIGRATION, RLS_SECURITY as relevant

Execution mode behavior:
- AUTO: Orchestrator decides depth based on query complexity and data sensitivity
- FULL: Force full analysis — SQL correctness, migration risk, rollback plan, access policy review, performance impact, and security review. All relevant agents engaged. No shortcuts.
- LIGHT: Minimal analysis — focus on correctness and immediate safety only. Skip performance and access policy review unless obviously relevant. Still enforces zero data loss on migrations.

Required behavior:
- Evaluate SQL correctness, safety, and performance implications
- If schema change: assess backward compatibility, migration risk, rollback viability
- If RLS/access policy: validate tenant isolation, permission scoping, policy completeness
- If migration: include forward plan, rollback plan, pre/post validation, and production risk
- Include Performance Engineer if query performance is a concern
- Include Security Auditor if sensitive data is involved

Expected output:
- Structured analysis following orchestrator output format
- SQL review findings with severity and fix recommendations
- Migration risk assessment if applicable
- Access policy audit if applicable
- Data integrity implications

Safety:
- Zero data loss is the default standard
- Migrations must have rollback strategies
- RLS policy changes require explicit review
- Sensitive data operations require security review
