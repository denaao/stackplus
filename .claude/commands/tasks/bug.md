# Bug

## Purpose

Investigate and fix bugs safely with root-cause analysis and validation.

## When to Use

- A bug has been reported and needs investigation
- A bug needs a fix with proper validation
- A regression has been detected and needs analysis

## What It Does

Invokes the orchestrator to classify as BUGFIX, perform root-cause analysis, and ensure the fix is validated through QA and security review when appropriate.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Investigate and fix the following bug: $ARGUMENTS

Classification: BUGFIX

Execution mode behavior:
- AUTO: Orchestrator decides depth based on bug severity and affected area
- FULL: Force full analysis — root cause, scope of impact, fix with full test coverage, regression analysis, and security review if relevant. No shortcuts.
- LIGHT: Minimal analysis — focus on root cause and fix only. Skip broad regression analysis. Still triggers Security Gate if bug touches auth/data/payments.

Required behavior:
- Perform root-cause analysis — do not patch symptoms
- Identify the scope of impact (what else could be affected)
- Include QA validation for the fix (test cases that verify the fix and prevent regression)
- If the bug touches authentication, authorization, data access, payments, file uploads, infrastructure, or secrets management — trigger Security Gate
- Consider edge cases that may be related to this bug
- Verify the fix does not introduce new issues

Expected output:
- Root cause identification with evidence
- Fix proposal with rationale
- Test cases to validate the fix
- Regression risk assessment
- Security implications if applicable

Safety:
- Security Gate if bug touches auth, access, data, payments, uploads, or secrets
- Testing Gate for all behavior-changing fixes
- Prefer root-cause solutions over patches
- Validate fix does not break adjacent functionality
