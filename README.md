# Konstruct

Package manager for AI agent skills. Manages the lifecycle of skill directories — discovery, installation, updating, and removal — across one or more AI agent tool directories.

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

### Global mode

All commands support `-g, --global` to operate on `~/.konstruct/` instead of the current directory.

```bash
konstruct init -g          # Set up global config
konstruct add -g <source>  # Install globally
konstruct list -g          # List global skills
```

### Options

- `-g, --global` — Use global `~/.konstruct/` directory
- `-s, --ssh` — Use SSH for git cloning (default: HTTPS with auto-retry)
- `--user` — Add as a userSkill (local, never auto-updated)
- `--path <path>` — Custom installation path

## Source formats

| Format | Example |
|---|---|
| GitHub | `github:owner/repo/path#ref` |
| GitLab | `gitlab:owner/repo#ref` |
| Generic git | `git:https://host/repo.git#ref` |
| Local file | `file:./relative/path` |
| Bare shorthand | `owner/repo` (defaults to GitHub) |

## Supported agents

Konstruct installs skills into the appropriate directory for each agent:

claude, cursor, windsurf, continue, copilot, gemini, augment, cline, goose, junie, kiro, opencode, openhands, roo, trae, kode, qwen-code, codex, amp, kilo, pochi, neovate, mux, zencoder, adal

## License

MIT
