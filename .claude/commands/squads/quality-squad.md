# Quality Squad

## Purpose

Grouped quality review covering test strategy, QA validation, end-to-end testing, behavioral simulation, and edge case analysis.

## When to Use

- Reviewing or designing test strategy for a feature or module
- Validating test coverage and identifying gaps
- Reviewing critical user flows end-to-end
- Hunting edge cases, race conditions, and boundary failures
- Assessing whether testing is sufficient for production release

## What It Does

Routes through the orchestrator to activate the quality-focused agent group: Test Strategy Architect, QA Engineer, End-to-End Tester (including behavioral simulation), and Edge Case Hunter. The Testing Gate is always active.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Perform a quality review of the following: $ARGUMENTS

Classification: TESTING

Execution mode behavior:
- AUTO: Orchestrator decides depth based on change scope and risk
- FULL: Force full analysis — activate Testing Gate, engage all quality agents (Test Strategy Architect, QA Engineer, E2E Tester, Edge Case Hunter), produce complete test coverage map, edge case catalog, and behavioral simulation. No shortcuts.
- LIGHT: Minimal analysis — focus on happy path and critical edge cases only, reduce agent count to QA Engineer + Edge Case Hunter. Still validates safety-critical paths.

Review depth:
- Evaluate test strategy completeness (unit, integration, E2E, behavioral)
- Identify coverage gaps and untested paths
- Analyze edge cases, boundary conditions, race conditions, and error handling
- Review critical user flows including interrupted flows and concurrent sessions
- Assess regression risk from recent changes

Expected output:
- Structured analysis following orchestrator output format
- Test coverage assessment with gap identification
- Edge case catalog with severity and likelihood
- Recommended test additions with priority
- Verdict on test readiness for production

Safety:
- Testing Gate must be active
- No production release without adequate test coverage
- Edge cases in auth, payments, and data access require explicit validation
