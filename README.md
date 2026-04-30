# codemakk

**codemakk** is a terminal-based AI coding workbench built around a local model router.

It is designed for people who want a structured workflow for planning, designing, building, reviewing, and applying code changes without manually choosing which AI model should handle each task.

The short version:

```text
idea → plan → design → build → review → apply
```

codemakk is the workflow layer.  
The router is the model-selection layer.

---

## What codemakk does

codemakk is not just a chat prompt in a terminal. It is a project workflow tool.

It can:

- chat with your local OpenAI-compatible router
- select files into context with `@`
- use skills for specialized behavior
- plan projects before building them
- generate browser-openable HTML/CSS mockups
- build projects from approved plans and designs
- review generated file proposals before writing them
- apply only accepted file changes
- back up overwritten files automatically
- manage router models from the CLI
- keep project artifacts under `.codemakk/`

---

## How it works

codemakk talks to a local router endpoint, usually:

```text
http://localhost:8787/v1
```

Instead of codemakk deciding which model to use directly, it sends routing hints such as mode/profile, speed, task type, and the requested model name.

The router then decides which actual model should handle the request.

This means the user can focus on the workflow:

```text
/plan
/design
/build
/review
/apply
```

while the router handles model selection.

---

## Relationship to the router

codemakk expects an OpenAI-compatible router running locally.

Example router request flow:

```text
codemakk CLI
  ↓
local model router
  ↓
chosen provider/model
  ↓
response back to codemakk
```

The router can choose models based on attributes like:

- routing profile
- speed preference
- cost preference
- local/free preference
- task type
- model availability
- enabled/disabled registry entries

codemakk does not need to know whether the best model for a task is a planning model, coding model, local model, or paid model. That is the router’s job.

---

## Core workflow

### 1. Planning

Start a new project plan:

```text
/plan new
```

Planning mode is a discussion mode. You describe what you want to build, revise the idea, and when ready, finish with:

```text
/done
```

codemakk saves structured planning artifacts under:

```text
.codemakk/projects/<project-id>/
```

The plan becomes reusable later for design and build steps.

---

### 2. Design

Start design mode for a project:

```text
/design <project-id>
```

Design mode is also a discussion mode. It is used to work out UX, screens, flows, layout, and visual direction.

When approved, codemakk saves standalone HTML mockups.

Mockups are stored under:

```text
.codemakk/projects/<project-id>/mockups/current/
```

They are standalone HTML files with embedded class-based CSS.

No inline `style=""`, no CDNs, and no external assets are required.

Open a mockup:

```text
/open <project-id>
```

or:

```text
/open <project-id> 1
```

Approve the design with:

```text
/approve
```

---

### 3. Build

Build from an approved project:

```text
/build <project-id>
```

or with a slice:

```text
/build <project-id> scaffold
/build <project-id> core
/build <project-id> tests
```

The build step loads the project plan, approved design, and mockups, then asks the router/model to generate file proposals.

Build does not write files directly.

Instead, it creates proposals for review.

---

### 4. Review

Open the review UI:

```text
/review
```

The review screen lets you inspect generated files before writing anything.

Controls:

```text
1 = diff
2 = original
3 = proposal
4 = side-by-side
v = cycle views

↑/↓ or k/j = scroll
PgUp/PgDn = page
g/G = top/bottom

a = accept
d = discard
c = mark needs revision
r = dry-run
n/p = next/previous
q = quit
```

Only accepted proposals are written by `/apply`.

---

### 5. Apply

Apply accepted proposals:

```text
/apply
```

Existing files are backed up automatically:

```text
file.ts.old
file.ts.old.1
file.ts.old.2
```

codemakk does not delete files by default.

---

## File context

Use `@` to add files to context:

```text
@src/index.ts explain this file
```

or:

```text
@src/router.ts rewrite this to be cleaner
```

Selected context files are included in the next prompt.

Useful commands:

```text
/context
/count
/clear
/remove <file>
```

---

## Create mode

Use create mode when you want the next response to produce files:

```text
/create
make a small CLI app with package.json and src/index.ts
```

The response becomes file proposals and can be reviewed with:

```text
/review
```

Then accepted changes can be written with:

```text
/apply
```

---

## Model registry management

codemakk can manage the router model registry.

Open the model registry UI:

```text
/models
```

The registry view lets you enable or disable models.

Typical model registry entries look like:

```ts
someModel: {
  enabled: true,
  provider: "...",
  model: "..."
}
```

The registry path can be configured with:

```env
CODEMAKK_ROUTER_REGISTRY_PATH=../cline-model-router/src/router/modelRegistry.ts
```

When models are toggled, codemakk updates the registry file and creates a backup.

If the router does not hot-reload the registry, restart or reload the router after changes.

---

## Routing modes

codemakk supports routing modes such as:

```text
balanced
deep
fast
free-first
```

Set mode:

```text
/mode
```

Set speed:

```text
/speed
```

Set model request name:

```text
/model auto-cline
```

In normal use, the model usually stays as:

```text
auto-cline
```

The router decides the actual model.

---

## Skills

codemakk supports skills.

Skills are reusable instruction packs that can shape how the assistant behaves for a task.

Open skills:

```text
/skills
```

A selected skill is included in prompts until changed or cleared.

---

## Project storage

codemakk stores its own project artifacts inside the working directory:

```text
.codemakk/
  projects/
    index.json
    0001/
      project.json
      plan.md
      plan.json
      design.md
      design.json
      mockups/
        current/
          index.html
      conversations/
```

These files are codemakk metadata and design artifacts. They are separate from your actual source files.

Generated source files only reach your project when you accept them in `/review` and run `/apply`.

---

## Safety model

codemakk is designed around review and approval.

Default safety rules:

```text
read: allowed inside the working directory
write: only after explicit /apply
create files: only after explicit /apply
delete files: not allowed by default
outside working directory: blocked
```

Model output becomes proposals first.

The user decides what gets accepted.

---

## Common commands

```text
/show                         Show contextual command help
/help                         Show full help
/plan new                     Start planning a new project
/plan <id>                    Revise an existing project plan
/design <id>                  Start design mode for a project
/open <id> [mockup]           Open saved mockup in browser
/build <id> [slice]           Generate build proposals
/projects                     List saved projects
/project <id>                 Show project details

/create                       Enable create mode for next prompt
/review                       Review file proposals
/apply                        Write accepted proposals
/comment <n> <comment>        Add revision comment to proposal
/revise                       Send commented proposals back for revision

/models                       Manage router model registry
/mode                         Select routing mode
/speed                        Select routing speed
/model <model>                Set requested model name

/context                      Show context files
/count                        Estimate context token count
/clear                        Clear context files
/remove <file>                Remove file from context
/skills                       Select skill
/config                       Edit codemakk config
/exit                         Exit
```

---

## Example workflow

```text
/plan new
```

Describe the project.

```text
/done
```

Then:

```text
/design 0001
```

Discuss UX and generate mockups.

```text
/approve
/open 0001
```

Then:

```text
/build 0001 scaffold
/review
/apply
```

Then continue:

```text
/build 0001 core
/review
/apply
```

---

## Installation

Clone and install dependencies:

```bash
npm install
```

Build the CLI:

```bash
npm run build --workspace=@codemakk/cli
chmod +x packages/cli/dist/index.js
```

Link locally:

```bash
cd packages/cli
npm link
```

Run from any project directory:

```bash
codemakk
```

---

## Configuration

Common environment variables:

```env
CODEMAKK_ROUTER_BASE_URL=http://localhost:8787/v1
CODEMAKK_API_KEY=dummy
CODEMAKK_DEFAULT_MODEL=auto-cline
CODEMAKK_DEFAULT_PROFILE=balanced
CODEMAKK_DEFAULT_SPEED=5
CODEMAKK_DEFAULT_LOCAL_PREFERENCE=false
CODEMAKK_ROUTER_REGISTRY_PATH=../cline-model-router/src/router/modelRegistry.ts
```

Use:

```text
/config
```

to view or edit configuration from inside codemakk.

---

## Development status

codemakk is experimental and moving quickly.

The current goal is to become a structured local AI coding workbench:

```text
plan → design → build → review → apply
```

with a router underneath that handles model selection automatically.
