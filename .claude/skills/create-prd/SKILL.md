---
name: create-prd
description: "Generate a Product Requirements Document (PRD) for a new feature. Use when planning a feature, starting a new project, or when asked to create a PRD. Triggers on: create prd, criar prd, write prd, plan this feature, requirements for, spec out, make a prd."
---

# PRD Generator

Create detailed Product Requirements Documents that are clear, actionable, and suitable for implementation. Read @ralph/prd.example.json for an example on how a PRD should be.

---

## The Job

1. Receive a feature description from the user
2. Generate a structured PRD based on answers
3. **Delete** the existing `prd.json` and `progress.txt` files, then create new ones from scratch
4. Save to `ralph/prd.json` and initialize `ralph/progress.txt`

**Important:**
- Do NOT start implementing. Just create the PRD.
- **NEVER push** `prd.json` or `progress.txt` to the remote repository. These are local working files.

---

## Brainstorm

Use the superpowers:brainstorming skill to help create a PRD for the feature.

---

## Frontend Design Tasks

When a PRD task involves frontend work with design/UI considerations, add a note in that task to **use the `frontend-design` skill** during implementation. This ensures distinctive, high-quality interfaces.