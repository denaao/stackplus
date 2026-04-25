# Product Squad

## Purpose

Grouped product review covering feature evaluation, UX analysis, accessibility, user/business value, prioritization, and growth impact.

## When to Use

- Evaluating whether a feature should be built, changed, or killed
- Analyzing UX friction, accessibility compliance, or usability gaps
- Assessing business value, growth impact, or experiment design
- Making prioritization or go/no-go decisions on features
- Reviewing feature lifecycle stage (validation, iteration, deprecation)

## What It Does

Routes through the orchestrator to activate the product-focused agent group: Product Manager (decision authority), UX Researcher (accessibility and behavioral evidence), and Growth Analyst (quantitative evidence and experimentation). Product Manager makes the final decision.

---

## Prompt

Use the Universal Production AI Agent Orchestrator.

Mode: $MODE (default AUTO)
Task:
Perform a product review of the following: $ARGUMENTS

Classification: PRODUCT, UX

Execution mode behavior:
- AUTO: Orchestrator decides depth based on feature stage and impact
- FULL: Force full analysis — engage Product Manager, UX Researcher, and Growth Analyst. Produce feature evaluation, accessibility audit, growth impact assessment, and lifecycle recommendation. No shortcuts.
- LIGHT: Minimal analysis — Product Manager only, focus on value proposition and go/no-go. Skip detailed UX audit and growth metrics. Still flags accessibility blockers.

Review depth:
- Evaluate feature value proposition and user impact
- Assess UX friction, accessibility (WCAG 2.1 AA), and usability
- Analyze quantitative evidence if available (metrics, experiments, funnel data)
- Review feature lifecycle stage and validation status
- Identify kill criteria and validation milestones

Expected output:
- Structured analysis following orchestrator output format
- Product decision or recommendation with rationale
- UX findings with severity and remediation
- Accessibility audit if UI is involved
- Growth impact assessment if metrics are available
- Go/no-go recommendation with conditions

Safety:
- Product Manager has final authority on feature decisions
- Accessibility findings block release
- Growth Analyst provides evidence — PM decides
