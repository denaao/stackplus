# Platform Squad

## Purpose

Grouped platform review covering infrastructure provisioning, environment management, deployment readiness, cloud reliability, and platform cost optimization.

## When to Use

- Reviewing or planning infrastructure changes
- Evaluating environment setup, parity, or promotion strategy
- Assessing deployment readiness from an infrastructure perspective
- Analyzing cloud costs or infrastructure reliability
- Planning capacity, scaling, or disaster recovery

## What It Does

Routes through the orchestrator to activate the platform-focused agent group: Infrastructure / Platform Engineer (primary), DevSecOps (infrastructure security), Observability Engineer (monitoring infrastructure), and Incident Response / SRE Engineer (reliability risk).

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Perform a platform review of the following: $ARGUMENTS

Classification: INFRASTRUCTURE

Execution mode behavior:
- AUTO: Orchestrator decides depth based on infrastructure scope and risk
- FULL: Force full analysis — engage Infrastructure Engineer, DevSecOps, Observability Engineer, and SRE. Produce infrastructure plan, cost analysis, reliability assessment, and security review. No shortcuts.
- LIGHT: Minimal analysis — Infrastructure Engineer only, focus on immediate provisioning or configuration concern. Skip cost optimization and DR assessment. Still validates security controls.

Review depth:
- Evaluate infrastructure provisioning, IaC quality, and configuration management
- Assess environment parity and promotion strategy
- Review networking, security groups, and access controls
- Analyze deployment targets and readiness for CI/CD
- Assess reliability posture (redundancy, failover, auto-scaling, disaster recovery)
- Include cost analysis when relevant
- Include DevSecOps when infrastructure security is involved
- Include Observability Engineer when monitoring infrastructure is involved

Expected output:
- Structured analysis following orchestrator output format
- Infrastructure plan or assessment with specific resources and configurations
- Cost implications for all provisioning decisions
- Reliability assessment with single points of failure and recommendations
- Environment readiness verdict

Safety:
- Infrastructure changes must be defined as code
- Production infrastructure changes require explicit approval
- Security controls follow DevSecOps requirements
- Architectural decisions come from System Architect — Infrastructure implements
