# Agent System Usage Protocol

## Default Rule

Always use the Universal Production AI Agent Orchestrator for any software-related task. The orchestrator handles discovery, classification, agent selection, safety gates, and challenge phases automatically. Do not bypass it unless the task falls under the explicit exclusions below.

---

## Standard Command Format

```
Use the Universal Production AI Agent Orchestrator.
Task:
<your request here>
```

The orchestrator will:
1. Discover project context
2. Classify the task
3. Select the minimum necessary agents
4. Run safety gates
5. Challenge weak conclusions
6. Return one consolidated, production-grade answer

---

## Quick Commands

These shorthand commands trigger the orchestrator with pre-mapped task types and agent groups.

| Command | Task Types | Primary Agents | Safety Gates |
|---|---|---|---|
| `architecture review` | ARCHITECTURE | System Architect, Tech Lead | Architecture Gate |
| `security review` | SECURITY_REVIEW | Security Auditor, Threat Model Agent, DevSecOps, RLS Specialist | Security Gate |
| `production readiness` | PRODUCTION_READINESS | Tech Lead, QA Engineer, E2E Tester, Security Auditor, Observability Engineer, Infrastructure Engineer, Documentation Engineer | Security Gate, Architecture Gate, Testing Gate |
| `fix this safely` | BUGFIX | Tech Lead, Senior Developer, QA Engineer, Edge Case Hunter | Testing Gate |
| `analyze this bug` | BUGFIX | Tech Lead, Senior Developer, Edge Case Hunter, Observability Engineer | — |
| `review this SQL` | DATABASE, RLS_SECURITY | RLS Specialist, Data Engineer, Performance Engineer | Security Gate (if access control involved) |
| `create implementation plan` | IMPLEMENTATION, ARCHITECTURE | System Architect, Tech Lead, Senior Developer, Project Manager | Architecture Gate |
| `test this flow` | TESTING | Test Strategy Architect, QA Engineer, E2E Tester, Edge Case Hunter | Testing Gate |

Quick commands still run through full orchestrator phases. They pre-seed classification — the orchestrator may add agents or gates based on discovery.

### Quick Command Format

```
Use the Universal Production AI Agent Orchestrator.
Quick: <command>
Context: <relevant details>
```

---

## Slash Commands (Claude Code Integration)

For projects using Claude Code, a local slash command system is available under `.claude/commands/`. These commands route through the orchestrator — they do not bypass it.

**Squads** — grouped review modes for broad domain analysis:
`/squads/architecture-squad`, `/squads/security-squad`, `/squads/quality-squad`, `/squads/product-squad`, `/squads/platform-squad`, `/squads/data-squad`, `/squads/incident-squad`, `/squads/delivery-squad`

**Tasks** — concrete day-to-day operations:
`/tasks/feature`, `/tasks/bug`, `/tasks/security`, `/tasks/sql-review`, `/tasks/architecture-review`, `/tasks/production-readiness`, `/tasks/test-flow`, `/tasks/incident`, `/tasks/migration-review`, `/tasks/project-discovery`

See `.claude/commands/README.md` for full documentation.

---

## When NOT to Use the Orchestrator

Skip the orchestrator for:

- **Trivial questions** — "What does this error message mean?", "What is a foreign key?"
- **Simple explanations** — "Explain how JWT works", "What is the difference between PUT and PATCH?"
- **Non-technical tasks** — Scheduling, general writing, project status summaries with no technical analysis
- **Single-fact lookups** — "What port does Postgres use?", "What's the default timeout?"

Rule of thumb: if the task does not require agent expertise, safety validation, or production-grade analysis, answer directly.

---

## Response Expectations

Every orchestrator response must be:

- **Structured** — follows the output format defined in the orchestrator (YAML output templates per agent)
- **Production-grade** — advice and code must be safe to deploy, not prototypes or placeholders
- **Context-specific** — derived from actual project discovery, not generic best practices
- **Consolidated** — one final answer, not raw outputs from multiple agents
- **Actionable** — clear next steps, not open-ended suggestions

Responses must never be:

- Generic recommendations that ignore project context
- Copy-pasted boilerplate with no adaptation
- Incomplete analyses that skip edge cases or risks
- Unvalidated code that hasn't been challenged

---

## Safety Expectations

### Always Prioritize Security
- Security Gate activates automatically for any task touching authentication, authorization, data access, payments, secrets, infrastructure, or multi-tenant separation
- Security agents operate in strict phase order — design → audit → fix validation → automation
- Security veto blocks deployment — cannot be overridden without documented joint risk acceptance

### Always Validate Critical Operations
- Database migrations require pre-migration and post-migration validation — no exceptions
- Schema changes require rollback strategies before execution
- Infrastructure changes require cost and reliability impact analysis
- High-risk production migrations require SRE presence

### Always Consider Production Impact
- Incident Gate has highest priority — active production issues override all other work
- No planning, refactoring, or architecture discussions proceed during active incidents
- Deployment coordination ensures migrations and code deploy in the correct sequence
- Performance impact must be assessed for schema changes, infrastructure changes, and new features

### Never Skip
- Discovery phase — context before action
- Challenge phase — question the first obvious answer
- Safety gates — security, architecture, and testing gates exist for a reason
- Rollback planning — every change must be reversible or explicitly approved as irreversible
