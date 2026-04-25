# Test Flow

## Purpose

Validate a user flow or critical workflow through comprehensive testing analysis.

## When to Use

- Validating a critical user journey end-to-end
- Reviewing test coverage for a specific workflow
- Identifying edge cases and failure modes in a flow
- Assessing permission paths and access control within a flow
- Evaluating behavioral simulation scenarios

## What It Does

Invokes the orchestrator to classify as TESTING and engage the quality agent group for thorough flow validation including happy path, edge cases, regression, permissions, and E2E considerations.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Validate the following flow: $ARGUMENTS

Classification: TESTING

Execution mode behavior:
- AUTO: Orchestrator decides depth based on flow criticality and complexity
- FULL: Force full analysis — all quality agents. Complete flow map, edge case catalog, permission path analysis, behavioral simulation, and regression risk. No shortcuts.
- LIGHT: Minimal analysis — focus on happy path and critical failure modes only. Skip behavioral simulation and detailed permission matrix. Still validates auth paths if present.

Required behavior:
- Map the complete flow: entry points, steps, decision points, exit points
- Validate happy path execution
- Identify edge cases: boundary values, empty states, concurrent access, interrupted flows
- Assess permission paths: what happens with different roles, unauthorized access, expired sessions
- Evaluate regression risk from recent changes
- Include behavioral simulation for realistic user patterns (impatient users, adversarial input, multi-device)

Expected output:
- Structured analysis following orchestrator output format
- Flow map with all paths identified
- Test case catalog: happy path, edge cases, permission paths, behavioral scenarios
- Gap analysis: untested paths and missing coverage
- Priority ranking of test cases by risk and impact

Safety:
- Testing Gate must be active
- Auth and permission paths require explicit validation
- Payment and data flows require edge case coverage
- No flow is validated without considering failure modes
