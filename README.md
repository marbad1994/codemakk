# codemakk

A controlled coding workbench for local OpenAI-compatible model routers.

codemakk is designed to be simpler and more predictable than heavy autonomous coding agents.

## Goals

- Interactive session shell with slash commands
- Explicit file/context selection
- `SKILL.md`-compatible skills
- Router-backed model access
- Token preflight estimates
- Per-session stats
- Full-file and unified-diff edit flows
- Diff preview before apply
- Checkpoints and undo

## Planned usage

```bash
codemakk
```

Inside the shell:

```text
/session new fix-streaming
/skill use full-file-edit
/model auto-cline-deep
/profile deep
/add src/router/executeChain.ts
/ask fix the streaming idle timeout
/diff
/apply
/stats
```

## Repo structure

```text
packages/core    reusable engine
packages/cli     interactive terminal shell
packages/vscode  future VS Code extension
skills/          SKILL.md-compatible skills
```
