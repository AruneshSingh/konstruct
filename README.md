# Konstruct

Package manager for AI agent skills. Manages the lifecycle of skill directories — discovery, installation, updating, and removal — across one or more AI agent tool directories.

## Add Skills
```bash
npx konstruct add owner/repo
```

## Install

```bash
npm install -g konstruct
```

## Quick Start

```bash
# Initialize a project
konstruct init

# Add a skill from GitHub
konstruct add github:anthropics/skills/skills/canvas-design#main

# Install all skills from skills.json
konstruct install

# Check for updates
konstruct update

# List installed skills
konstruct list
```

## Features

### Declarative Manifest

Every project gets a `skills.json` that declares exactly which skills it needs and where they come from. Run `konstruct install` on any machine and get the same setup — no manual steps.

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "skills": {
    "canvas-design": {
      "source": "anthropic/skills/canvas-design#v1.0"
    },
    "data-analytics": {
      "source": "github:company/analytics-repo/skills/analytics#main"
    }
  },
  "userSkills": {
    "my-local-skill": {
      "source": "file:./local-skills/my-skill"
    }
  }
}
```


### Default Agents

Configure which agents receive skills so you don't have to specify them every time. Set defaults at the project or global level with `konstruct defaults`, or let them resolve automatically:

1. Project config (`./konstruct.config.json`) agents
2. Global config (`~/.konstruct/konstruct.config.json`) default agents
3. Fallback: `claude`

```json
{
  "version": 1,
  "agents": ["claude", "cursor"],
  "global": {
    "defaultAgents": ["claude"]
  }
}
```

### Private Skils

Konstruct can install skills from private repositories as long as your local machine is authenticated. HTTPS uses your existing git credentials (e.g. `gh auth login`), or you can use SSH:

```bash
# Private repo over HTTPS (uses your local git credentials)
konstruct add github:my-org/private-skills

# Private repo over SSH
konstruct add github:my-org/private-skills --ssh
```

### Global and Project Configuration

Konstruct operates at two scopes. Project-level config lives in your repo and tracks which agents that project uses. Global config lives at `~/.konstruct/` and provides defaults for all projects.

```bash
# Project scope (default)
konstruct init
konstruct add anthropic/skills/canvas-design#main

# Global scope
konstruct init -g
konstruct add -g anthropic/skills/canvas-design#main
```

Every command supports `-g, --global` to switch between scopes.

### Custom Install Paths

Override where a skill gets installed with `--path`. The path is saved in the manifest so subsequent `konstruct install` and `konstruct update` calls respect it.

```bash
konstruct add github:org/repo --path /opt/shared-skills
```

```json
{
  "skills": {
    "repo": {
      "source": "github:org/repo",
      "path": "/opt/shared-skills"
    }
  }
}
```

### Local Skills

Add skills from your local filesystem with `--user`. These are kept in a separate `userSkills` section of the manifest and are never auto-updated, making them ideal for private or in-development skills.

```bash
konstruct add file:./my-private-skill --user
```

Skills are separated into two categories:

|  | Installed Skills | User Skills |
|---|---|---|
| **Sources** | GitHub, GitLab, any git URL | Local filesystem only |
| **Updates** | Auto-updated via `konstruct update` | Never auto-updated |
| **Use case** | Shared, versioned skills | Private, local, or experimental |
| **Flag** | (default) | `--user` |

Both types are installed when running `konstruct install`, but `konstruct update` only touches git-based skills.

## Commands

| Command | Description |
|---|---|
| `konstruct init` | Create `skills.json` and `konstruct.config.json` |
| `konstruct add <source>` | Add a skill from a git or local source |
| `konstruct install` | Install all skills from `skills.json` |
| `konstruct update` | Re-install git skills at their manifest refs |
| `konstruct remove <names...>` | Remove one or more skills by name |
| `konstruct list` | List all skills in the current manifest |
| `konstruct defaults` | View and update default agent preferences |

### Options

- `-g, --global` — Use global `~/.konstruct/` directory
- `-s, --ssh` — Use SSH for git cloning (default: HTTPS with auto-retry)
- `--user` — Add as a user skill (local, never auto-updated)
- `--path <path>` — Custom installation path

## Source Formats

| Format | Example |
|---|---|
| GitHub | `github:owner/repo/path#ref` |
| GitLab | `gitlab:owner/repo#ref` |
| Generic git | `git:https://host/repo.git#ref` |
| Local file | `file:./relative/path` |
| Bare shorthand | `owner/repo` (defaults to GitHub) |

## Supported Agents

Konstruct installs skills into the appropriate directory for each agent:

claude, cursor, windsurf, continue, copilot, gemini, augment, cline, goose, junie, kiro, opencode, openhands, roo, trae, kode, qwen-code, codex, amp, kilo, pochi, neovate, mux, zencoder, adal

## License

MIT
