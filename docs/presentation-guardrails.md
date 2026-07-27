# Guardrails for LLM Development

## WORKSPACE-CI / workspaceguardrails.com

---

## 1. The Experiment - 2.5 Years In

- **Core question:** can LLMs do enterprise-grade, compliance-gated development?
- **Sub-question:** what is the *most cost-effective* way to do it?
- Not a lab exercise - the project has been live in production the whole time.
- This codebase *is* the experiment.

---

## 2. Open Source / Self-Hosted First

- **Secondary question:** can local, open-source LLMs serve as the *primary* code generation tools - not just fallbacks?
- **Why it matters:**
  - Cost control
  - Data sovereignty
  - Compliance requirements

---

## 3. The Hard Lesson: Instructions Don't Work

- AGENTS.md, skills, system prompts - **hopelessly ineffective on their own.**
- Models ignore rules, then confidently misreport what they did.
- Failure modes observed in practice:
  - Nuked dirty worktrees
  - `--no-verify` hook bypasses
  - Amended history, force-pushes
  - Poor development and writing practices
  - Silent error swallowing, model deceit
- Every uncorrected mistake compounds: **time + token cost of correction grows to benefit-negating values.**

---

## 4. The Answer: Enforcement, Not Instruction

Guardrails must live in **tooling**, not prose. We attack the problem on two fronts:

### Code Quality & CI Automation
- Generated native git hooks from a single config (pre-commit / commit-msg / pre-push)
- No framework runtime - plain shell, enforced locally and in CI

### Runtime Policy Enforcement
- **WORKSPACE-GUARD binary** - blocks `--no-verify`, force-push, amend, reset at the boundary
- LLM gateway features - policy enforcement at the model ingress point
- Sanitized, auditable execution environments

---

## Punchline

> The agent cannot cheat - because the environment won't let it.

---

*workspaceguardrails.com*
