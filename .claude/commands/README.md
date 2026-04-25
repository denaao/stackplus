# Agent Command System

This project uses a Universal Production AI Agent Orchestrator with specialist agents. The command system provides quick access to common workflows without bypassing the orchestrator.

**Core rule:** The orchestrator is always the brain. Every command routes through it for discovery, classification, agent selection, safety gates, and challenge phases.

---

## Squads

Squads activate a group of related agents for broad review. Use squads when the task spans multiple concerns within a domain.

| Command | Domain | Primary Agents |
|---|---|---|
| `/squads/architecture-squad` | System design, APIs, scalability | System Architect, Tech Lead, Infrastructure Engineer |
| `/squads/security-squad` | Auth, vulnerabilities, data access | Threat Model, Security Auditor, RLS Specialist, DevSecOps, Secure Code Reviewer |
| `/squads/quality-squad` | Testing, QA, edge cases | Test Strategy Architect, QA Engineer, E2E Tester, Edge Case Hunter |
| `/squads/product-squad` | Features, UX, growth | Product Manager, UX Researcher, Growth Analyst |
| `/squads/platform-squad` | Infrastructure, environments, cloud | Infrastructure Engineer, DevSecOps, Observability Engineer, SRE |
| `/squads/data-squad` | Migrations, schema, data integrity | Data Engineer, RLS Specialist, Security Auditor, SRE |
| `/squads/incident-squad` | Outages, degradation, postmortems | SRE, Observability Engineer, Tech Lead, Security Auditor |
| `/squads/delivery-squad` | Release readiness, rollout risk | Project Manager, Tech Lead, QA Engineer, Observability Engineer, SRE |

## Tasks

Tasks handle specific day-to-day operations. Use tasks when the work has a clear type.

| Command | Operation |
|---|---|
| `/tasks/feature` | New feature requests — design through implementation |
| `/tasks/bug` | Bug investigation and root-cause fixing |
| `/tasks/security` | Focused security review by lifecycle phase |
| `/tasks/sql-review` | SQL, schema, RLS policy, and migration safety |
| `/tasks/architecture-review` | Architecture and structural change review |
| `/tasks/production-readiness` | Pre-deployment readiness check |
| `/tasks/test-flow` | User flow and workflow validation |
| `/tasks/incident` | Production incident handling |
| `/tasks/migration-review` | Database migration safety review |
| `/tasks/project-discovery` | Codebase understanding before acting |

## Squads vs. Tasks

- **Squads** = broad domain review (multiple concerns, strategic perspective)
- **Tasks** = specific operation (focused goal, tactical execution)

Example: Use `/squads/security-squad` for a comprehensive security posture review of a module. Use `/tasks/security` for a focused security review of a specific feature or code change.

## Execution Modes

All commands support three execution modes. If no mode is specified, AUTO is used.

| Mode | Behavior | When to Use |
|---|---|---|
| **AUTO** | Orchestrator decides depth based on task complexity, risk, and context | Default for all commands — the orchestrator adapts automatically |
| **FULL** | Forces maximum analysis depth — all relevant agents, all gates, comprehensive output | High-risk changes, pre-production reviews, security-critical work, architecture decisions |
| **LIGHT** | Minimal analysis with reduced agent count — faster response, still safe | Quick sanity checks, low-risk changes, minor bugs, orientation tasks |

**Safety guarantee:** LIGHT mode reduces depth but never disables safety. Security Gate still fires for auth/data/payments. Incident Gate still activates for production issues. Zero data loss still applies to migrations. Critical findings still block regardless of mode.

### Mode Examples

```
/tasks/feature Mode: FULL Build auth system with OAuth2 and MFA
```

```
/tasks/bug Mode: LIGHT Fix small UI alignment bug on settings page
```

```
/squads/security-squad Mode: FULL Review the entire payment module
```

```
/tasks/project-discovery Mode: LIGHT Quick orientation on this repo before fixing a bug
```

```
/tasks/migration-review Mode: FULL Add tenant_id column to orders table in production
```

When in doubt, use AUTO. The orchestrator is calibrated to match depth to risk.

---

## Usage

Every command accepts context as arguments:

```
/tasks/bug The login endpoint returns 500 when email contains a plus sign
```

```
/squads/data-squad We need to add a tenant_id column to the orders table in production
```

```
/tasks/production-readiness The new billing module — all tests pass, need final review
```

## Design Principles

- Commands do not bypass the orchestrator — they route through it
- The orchestrator handles discovery, classification, agent selection, gates, and challenges
- Commands pre-seed the task type to accelerate routing
- The orchestrator may add agents or gates beyond what the command suggests based on discovery
- Safety gates activate automatically based on task content
