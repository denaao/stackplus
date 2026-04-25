# Project Guidelines


## Core Principles

### 1. Safety First
- NEVER break existing functionality
- ALWAYS prefer minimal and safe changes
- DO NOT refactor unrelated parts of the code
- DO NOT introduce breaking changes unless explicitly requested

---

### 2. Root Cause First
- ALWAYS explain the root cause before suggesting a fix
- DO NOT jump directly to code changes
- Provide reasoning clearly and concisely

---

### 3. Database Rules (Supabase)
- Prefer fixing issues at the **SQL level first**
- Respect existing schema, constraints, and relationships
- Be careful with:
  - RLS (Row Level Security)
  - foreign keys
  - unique indexes
- NEVER suggest destructive changes without warning

---

### 4. Code Style & Architecture
- Follow existing project patterns
- Maintain TypeScript strictness
- Do not introduce `any` unless absolutely necessary
- Reuse existing utilities and components

---

### 5. Scope Control
- Only change what is explicitly requested
- If something else is wrong, mention it but do NOT fix automatically

---

### 6. File Awareness
When making suggestions:
- Always mention affected files
- Prefer small, targeted edits
- Avoid rewriting entire files

---

### 7. Error Handling
- Always handle errors explicitly
- Avoid silent failures
- Prefer defensive programming

---

### 8. Logging
- Keep logs clean and useful
- Avoid noisy or unnecessary logs

---

## How to Respond

When solving a problem, always follow this structure:

1. Root cause explanation
2. Affected files
3. Minimal fix
4. Why this fix is safe
5. Optional improvements (separated clearly)

---

## Forbidden Actions

- ❌ No large refactors without request
- ❌ No schema changes without explanation
- ❌ No assumptions about business rules
- ❌ No hidden side effects

---

## Preferred Behavior

- Be precise
- Be conservative
- Be production-safe
- Optimize for maintainability

---

## Special Notes

- This project evolves iteratively
- Stability is more important than speed
- Always respect the current architecture


---

## Developer Environment

### Shell

- The developer's shell is **PowerShell (Windows)**.
- All shell commands suggested in answers must be PowerShell-compatible.
- Do NOT suggest bash, cmd, sh, or zsh commands — even as alternatives.
- Working directory: `C:\dev\StackPlus\`.

### PowerShell Path Rule (mandatory)

PowerShell treats `[`, `]`, `*`, `?` in paths as **wildcards**. For any path
containing these characters (like Next.js dynamic routes `[tournamentId]`,
`[id]`, `[sessionId]`), commands that take a `Path` parameter can fail
silently, return wrong results, or match unintended files.

Always use `-LiteralPath` with these cmdlets when the path may contain
wildcards:

- `Get-Item`, `Get-ChildItem`
- `Get-Content`, `Set-Content`, `Add-Content`
- `Copy-Item`, `Move-Item`, `Remove-Item`, `Rename-Item`
- `Test-Path`, `Resolve-Path`
- `Select-String` (use `-LiteralPath` parameter)

Example (correct):
```powershell
(Get-Item -LiteralPath "C:\dev\StackPlus\stackplus-web\app\tournament\[tournamentId]\edit\page.tsx").Length
```

Example (broken — returns 0 or silently fails):
```powershell
(Get-Item "C:\dev\StackPlus\stackplus-web\app\tournament\[tournamentId]\edit\page.tsx").Length
```

### PowerShell Text Read/Write (encoding-safe)

For reading/writing files with non-ASCII content (accents, emoji) or when
encoding matters for git diff:

- Prefer `[System.IO.File]::ReadAllText($path, [System.Text.UTF8Encoding]::new($false))`
- Prefer `[System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))`
- Avoid `Get-Content -Raw` on PowerShell 2.x environments — use the .NET method above as a universal fallback.
- Never use `Set-Content` without `-Encoding UTF8` — default encoding varies by PS version.

### Git in PowerShell

- `git` handles its own path parsing. Quote paths with double quotes and use `--` to separate refs from paths:
  ```powershell
  git checkout HEAD -- "stackplus-web/app/tournament/[tournamentId]/edit/page.tsx"
  ```
- For multi-line commit messages, use a here-string:
  ```powershell
  git commit -m @"
  first line
  
  body paragraph
  "@
  ```

---

## Agent Orchestration System

This repository includes a custom agent orchestration system located at:

- `.claude/commands/`
- `.claude/commands/tasks/`
- `.claude/commands/squads/`
- `.claude/state/`

### Operational Rule
Treat the files in `.claude/commands/` as the primary operational command system for this repository.

### Command Interpretation
When the user refers to commands such as:
- `/menu`
- `/start`
- `/help`
- `/status`
- `/run`
- `/smart-run`
- `/bootstrap`
- `/doctor`
- `/onboard`

you must interpret them according to the corresponding files in `.claude/commands/`.

### Task and Squad Routing
When the user refers to:
- `/tasks/...`
- `/squads/...`

use the matching command file under:
- `.claude/commands/tasks/`
- `.claude/commands/squads/`

and follow its role, routing logic, and constraints.

### Onboarding Rule
If the repository has not been onboarded yet, prefer the onboarding flow before executing broader implementation or review work.

Use the onboarding-related command definitions and state files under `.claude/state/` when applicable.

### Governance Rule
Respect the execution gates and safety rules defined by the agent system before proposing or executing risky work.

This includes:
- security-sensitive changes
- SQL or schema changes
- production-impacting actions
- structural or architecture-wide changes

### Priority Rule
Use both layers together:
1. project rules from this `CLAUDE.md`
2. operational behavior from `.claude/commands/`

Project safety and architecture constraints remain mandatory.
The agent system defines how to route and execute work within those constraints.

---

## Model Routing & Execution Control

Before executing any task, the system MUST:

1. Classify the task:
   - Type (bug, feature, architecture, security, database, etc.)
   - Complexity (LOW, MEDIUM, HIGH)
   - Risk (LOW, MEDIUM, HIGH)

2. Determine required execution level:
   - LOW → fast model + LIGHT mode
   - MEDIUM → balanced model + AUTO mode
   - HIGH → powerful model + FULL mode

### Mandatory Escalation

If the task involves ANY of the following:

- authentication
- authorization
- database schema or migrations
- RLS or multi-tenant logic
- payments or financial calculations
- production systems
- security

THEN:
- Required Model: POWERFUL
- Required Mode: FULL

### Execution Blocking Rule

If the current model is insufficient:

- STOP execution immediately
- DO NOT partially execute
- DO NOT attempt a simplified solution

Return: 🚫 **Model Upgrade Required**

Include:
- Required model
- Required mode
- Clear explanation

### Execution Rule

If the model is sufficient:

- Use the Universal Production AI Agent Orchestrator
- Follow the correct mode (AUTO / FULL / LIGHT)
- Apply all safety, architecture, and validation rules already defined in this file

### Priority Rule

Safety > correctness > performance

Never bypass model requirements under any circumstance.