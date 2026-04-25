# Data Squad

## Purpose

Grouped data review covering migrations, schema evolution, backfills, data integrity, ETL pipelines, and migration risk assessment.

## When to Use

- Planning or reviewing database migrations
- Evaluating schema changes for safety and rollback viability
- Designing backfill or data transformation operations
- Assessing data integrity before or after changes
- Reviewing ETL pipelines or large-scale data operations
- Evaluating migration risk for production execution

## What It Does

Routes through the orchestrator to activate the data-focused agent group: Data Engineer / Migration Specialist (primary), RLS & Data Access Specialist (when access policies are affected), Security Auditor (when sensitive data is involved), and Incident Response / SRE Engineer (when production migration risk is high).

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Perform a data review of the following: $ARGUMENTS

Classification: DATA_MIGRATION, DATABASE

Execution mode behavior:
- AUTO: Orchestrator decides depth based on migration risk and data sensitivity
- FULL: Force full analysis — engage Data Engineer, RLS Specialist, Security Auditor, Performance Engineer, and SRE. Produce migration plan, rollback strategy, risk assessment, integrity checks, and access policy review. No shortcuts.
- LIGHT: Minimal analysis — Data Engineer only, focus on migration safety and rollback viability. Skip detailed performance analysis and access policy review. Still enforces zero data loss and rollback requirement.

Review depth:
- Evaluate migration safety: forward plan, rollback plan, validation steps
- Assess schema change backward compatibility
- Analyze data integrity implications (referential integrity, constraints, business rules)
- Review access policy impact with RLS Specialist if relevant
- Assess production execution risk (lock contention, replication lag, downtime)
- Include Security Auditor review if PII, financial data, or credentials are involved
- Determine whether SRE presence is required for production execution

Expected output:
- Structured analysis following orchestrator output format
- Migration plan with execution order and rollback strategy
- Risk assessment with severity, failure modes, and mitigations
- Data integrity check definitions (pre and post migration)
- Go/no-go recommendation for production execution

Safety:
- Zero data loss is the default standard
- Every migration must have a tested rollback path
- Pre and post migration validation are mandatory
- Sensitive data migrations require security review
- High/critical risk migrations require SRE presence
