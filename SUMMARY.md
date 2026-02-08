# Konstruct — Project Summary

## What it is

Konstruct is an MVP package manager for AI agent skills. It manages the lifecycle of
skill directories — discovery, installation, updating, and removal — across one or more
AI agent tool directories (e.g. `.claude/skills/`, `.cursor/skills/`).

Skills are installed by **direct copy** into agent directories. There is no cache layer,
no symlinks, no lock file. The manifest (`skills.json`) is the single source of truth for
what is declared; the agent directories are the single source of truth for what is actually
on disk.

---

## Directory layout

```
konstruct/
├── bin/cli.js                  # ESM entry — imports dist/index.js, falls back to tsx in dev
├── dist/index.js               # tsup bundle (produced by `npm run build`)
├── package.json                # ESM, dependencies below
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── types/index.ts          # All shared interfaces
│   ├── core/
│   │   ├── source-parser.ts    # "github:owner/repo/path#ref" → SkillSource
│   │   ├── config.ts           # konstruct.config.json read/write, agent dir resolution
│   │   │                       # KONSTRUCT_DIR (~/.konstruct) for global state
│   │   ├── manifest.ts         # skills.json read/write/validate
│   │   ├── git.ts              # shallow clone via simple-git, GitCloneError
│   │   ├── discover.ts         # recursive SKILL.md finder + frontmatter parser
│   │   │                       # with YAML fallback for malformed frontmatter
│   │   └── installer.ts        # install, update-check, discover-from-source
│   ├── cli/
│   │   ├── index.ts            # commander wiring — 6 commands
│   │   ├── utils.ts            # coloured output (picocolors), spinner
│   │   └── commands/
│   │       ├── init.ts         # bootstrap skills.json + config
│   │       ├── add.ts          # add a skill (git or local), with interactive pick
│   │       ├── install.ts      # full bootstrap from manifest
│   │       ├── update.ts       # git-only, diff-checked update
│   │       ├── remove.ts       # remove from manifest + disk
│   │       └── list.ts         # list installed/user/untracked skills
│   └── utils/
│       └── fs.ts               # exists, hashDirectory, diffHashes
└── tests/
    ├── unit/                   # source-parser, config, manifest, discover (36 cases)
    └── integration/            # local-skill install round-trip (4 cases)
```

**Dependencies:** `commander`, `simple-git`, `gray-matter`, `picocolors`
**Dev:** `tsx`, `tsup`, `vitest`, `typescript`

## Global State Directory

All global konstruct state is stored in `~/.konstruct/`:
- `~/.konstruct/konstruct.config.json` — global configuration
- `~/.konstruct/skills.json` — global skill manifest

Project-local files remain in the project root:
- `./konstruct.config.json` — project configuration
- `./skills.json` — project skill manifest

### Setting up global defaults

To configure which agents to use globally:

```bash
konstruct init -g
# Prompts: Which AI agents do you want as global defaults?
# Select: claude, cursor, etc.
```

This creates `~/.konstruct/konstruct.config.json` with your default agents. Skills added with `-g` will install to all these agent directories (e.g., `~/.claude/skills/`, `~/.cursor/skills/`).

If you skip `konstruct init -g`, the first `konstruct add -g` will auto-create the global config and prompt for agents.

---

## Running

### Development (no build step, picks up source changes instantly)

```bash
cd konstruct
npm install                          # first time only
node bin/cli.js --help               # uses tsx shim automatically when dist/ is missing
npx tsx src/cli/index.ts --help      # same thing, explicit
npm test                             # vitest — 40 tests, no network
```

### Production / global install (build once, run anywhere)

```bash
cd konstruct
npm run build                        # tsup bundles src/ → dist/index.js
npm link                             # symlinks `konstruct` into your global bin

# now usable from any directory:
konstruct --version                  # 0.1.0
konstruct --help

cd ~/some-project
konstruct init
konstruct add github:anthropics/skills#main
konstruct list
konstruct install
konstruct update
```

`bin/cli.js` tries `dist/index.js` first; if it doesn't exist it falls back to the tsx
shim automatically. So `node bin/cli.js` works in both modes without any flag.

---

## The 6 commands

| Command | What it does | Options |
|---|---|---|
| `konstruct init` | Creates `skills.json` + `konstruct.config.json` | `-g, --global` Initialize in `~/.konstruct/` instead of current directory |
| `konstruct add <source>` | Clone (or resolve locally), discover, optionally prompt, install, persist to manifest | `-g, --global` Install globally<br>`--user` Add as userSkill (local, never auto-updated)<br>`--path <path>` Custom installation path<br>`-s, --ssh` Use SSH for cloning |
| `konstruct install` | Read manifest, install everything (git + user skills). Full bootstrap. | `-g, --global` Install globally<br>`-s, --ssh` Use SSH for cloning |
| `konstruct update` | Git skills only. Hash-diff local vs remote; only re-copy on actual changes. Prints `+ added`, `~ changed`, `- removed`. | `-g, --global` Update in global directories<br>`-s, --ssh` Use SSH for cloning |
| `konstruct remove <names...>` | Delete from manifest + best-effort rm from all agent dirs | `-g, --global` Remove from global directories |
| `konstruct list` | List installed skills, user skills, and untracked skills (on disk but not in manifest) | `-g, --global` List from global manifest |

### install vs update

- **`install`** is the "I just cloned the repo" command. It blindly copies every skill in the
  manifest (git and user) into the agent directories. Idempotent.
- **`update`** is the "pull latest" command. It only touches git skills. For each one it:
  1. Clones the remote at the manifest ref
  2. Hashes every file in the remote skill dir and in the local install dir
  3. Diffs the two hash maps
  4. Skips if identical; prints the diff and re-copies if not

---

## Source URL format

All source references are prefix-based strings:

| Prefix | Example | Resolves to |
|---|---|---|
| `github:` | `github:anthropics/skills/skills/canvas-design#main` | `https://github.com/anthropics/skills.git`, branch `main`, subpath `skills/canvas-design` |
| `gitlab:` | `gitlab:org/repo#v1` | `https://gitlab.com/org/repo.git`, tag `v1` |
| `git:` | `git:https://host/repo.git#main` | arbitrary git URL |
| `file:` | `file:./my-skills/debugger` | local directory, never cloned |

The `#ref` portion is split on the **last** `#` so URLs that happen to contain `#` elsewhere
still parse correctly.

### repoPath vs skill name

A skill's `name` comes from the `name` field in its SKILL.md frontmatter. The directory it
lives in can be anything. When `add` discovers a skill in a multi-skill repo it records the
**actual directory path relative to the repo root** (`repoPath`) as the subpath in the
manifest, not the skill name. This is what `install` and `update` use to narrow the search
on subsequent runs.

Example: skill name is `canvas-design`, but it lives at `skills/canvas-design` in the repo.
The manifest stores `github:anthropics/skills/skills/canvas-design#main`.

---

## Key design decisions

1. **No cache, no symlinks, no lock file.** Skills are plain directories copied into place.
   The manifest is the declaration; the agent dir is the install.

2. **Two skill categories.**
   - `skills` — git-sourced. Versioned by ref. Updated by `update`.
   - `userSkills` — `file:` paths only. Installed by `install`. Never auto-updated.

3. **SKILL.md is the marker.** The directory containing it is the skill. Frontmatter
   (`name`, `description`) is the only required metadata. Everything else in the directory
   is copied as-is.

4. **Content-addressed diffing for updates.** Every file in both the local and remote skill
   directories is sha256-hashed. Only when the hash maps differ does a re-copy happen.
   This means `update` is a no-op when nothing has changed — no unnecessary writes.

5. **resolveInstallDirs short-circuit.** When `customPath` is provided (tests always do
   this), config reads and interactive prompts are skipped entirely. This keeps the install
   functions unit-testable without mocking stdin.

6. **Shallow clones only.** `--depth 1` + optional `--branch <ref>`. 60 s timeout.
   `cleanupTempDir` validates the path is under `os.tmpdir()` before deleting.

---

## Manifest example (`skills.json`)

```json
{
  "name": "playground",
  "version": "1.0.0",
  "skills": {
    "canvas-design": {
      "source": "github:anthropics/skills/skills/canvas-design#main"
    },
    "custom-skill": {
      "source": "github:org/repo/skill#v1.0.0",
      "path": "/custom/install/path"
    }
  },
  "userSkills": {
    "debugger": {
      "source": "file:./my-skills/debugger"
    }
  }
}
```

**Skill entry format:**
- `source` (required): The skill source URL (github:, gitlab:, git:, or file:)
- `path` (optional): Custom installation path. When specified, the skill installs to this path instead of the default agent directories.

---

## Config example (`konstruct.config.json`)

```json
{
  "version": 1,
  "agents": ["claude"],
  "customInstallPath": null,
  "global": {
    "defaultAgents": ["claude"]
  }
}
```

**Locations:**
- Global: `~/.konstruct/konstruct.config.json`
- Project: `./konstruct.config.json`

**Known agents:** `claude`, `cursor`, `windsurf`, `continue`, `copilot`, `gemini`.

Each agent gets a `.<agent>/skills/` directory:
- Global: `~/.claude/skills/`, `~/.cursor/skills/`, etc.
- Project: `./.claude/skills/`, `./.cursor/skills/`, etc.

If `customInstallPath` is set, all skills install to that path instead of per-agent directories.

---

## Bugs that were hit and fixed

### 1. `tsx: command not found`
`bin/cli.js` originally called `tsx` as a bare command. Fixed by resolving it from the
project's own `node_modules/.bin/tsx` using `path.resolve(__dirname, '..', 'node_modules', '.bin', 'tsx')`.

### 2. Integration tests hanging on stdin
`installUserSkill` → `getEffectiveConfig` → `ensureGlobalConfig` opened a readline prompt
when no config existed. Tests with no config on disk would hang forever. Fixed by extracting
`resolveInstallDirs(options)` which returns `[customPath]` immediately when provided,
never reaching config logic.

### 3. `install` failing after manual skill deletion — "No SKILL.md files discovered"
`serializeSource` was using the skill **name** as the subpath (`canvas-design`). The actual
directory in the repo is `skills/canvas-design`. `install` searched `<clone>/canvas-design/`
which doesn't exist. Fixed by having `discoverSkillsFromSource` return `repoPath` via
`path.relative(tempDir, skill.path)` and threading that through to `serializeSource`.

### 4. `update` blindly re-copying without checking for changes
`update` was calling `installGitSkill` unconditionally on every run — no diff, no feedback.
Added `hashDirectory` + `diffHashes` to `fs.ts`, added `checkSkillForUpdates` to
`installer.ts`, and rewrote `update.ts` to: check → print diff if any → only copy on
actual changes.

### 5. `tsup --outdir` flag not recognised
The installed version of tsup (8.5.x) uses `--out-dir` (hyphenated). The build script had
`--outdir`. Also dropped `--dts` — declaration files aren't needed for a CLI binary and the
generator choked on `.ts` import extensions anyway.

### 6. `konstruct --version` printed `0.0.0` after build + link
`getVersion()` in `index.ts` resolved `package.json` relative to `__dirname` using
`../../package.json` — correct when running from `src/cli/` via tsx, wrong when running
from `dist/`. Fixed by trying both paths (`../../` then `../`) and returning the first one
that has a `version` field.

### 7. Global manifest/config written to cwd instead of home directory
`addSkillToManifest` defaulted `cwd` to `process.cwd()`, causing `konstruct add -g` to
create `~/skills.json` instead of in a konstruct directory. Fixed by:
- Created `KONSTRUCT_DIR` constant (`~/.konstruct/`) in `config.ts`
- All `-g` commands now pass `KONSTRUCT_DIR` to manifest/config functions
- `writeConfig` creates the directory automatically with `mkdir({ recursive: true })`

### 8. Missing `-g` flag on `list` and `update` commands
`list` command had no `-g` option at all. `update` had the flag but didn't pass it to
`readManifest`. Fixed by adding the option to both commands and wiring through to manifest
operations.

### 9. YAML parsing crash on malformed frontmatter
`gray-matter` threw `YAMLException` when parsing SKILL.md files with unquoted quotes in
YAML values (e.g., `argument-hint: "[topic]"`). Fixed by:
- Wrapped `matter()` call in try/catch in `discover.ts`
- Added `extractFrontmatterFields()` regex fallback that extracts just `name` and `description`
- Skills with malformed but parseable frontmatter now work correctly

### 10. List command improvements
Enhanced `list` to show three categories:
- **Installed skills** (from `manifest.skills`)
- **User skills** (from `manifest.userSkills`)
- **Untracked skills** (on disk with SKILL.md but not in manifest)

The untracked section helps users discover skills that were manually created or installed
outside of konstruct. Output shows names only for clean readability.

### 11. gray-matter returning empty data on valid frontmatter
`gray-matter` exhibited non-deterministic behavior: sometimes throwing an error on malformed
YAML (as expected), other times succeeding but returning `{data: {}}` (empty object) for the
exact same file content. This caused root-level skills like `mvanhorn/last30days-skill` to fail
discovery during installation. Fixed by:
- Adding a second fallback: if `matter()` succeeds but returns no `name` or `description`, try
  regex extraction
- The double-fallback approach handles both error and empty-data cases
- Now successfully installs skills with malformed YAML frontmatter regardless of gray-matter's
  behavior

---

## Test coverage (40 tests, all passing)

| File | Cases | What it covers |
|---|---|---|
| `source-parser.test.ts` | 13 | All prefixes, edge cases, error paths |
| `config.test.ts` | 7 | Read/write/validation/dir mapping |
| `manifest.test.ts` | 10 | Read/write/validation/add/remove |
| `discover.test.ts` | 6 | Nested search, skip rules, frontmatter validation |
| `local-skill.test.ts` | 4 | Discover, install+verify files, manifest round-trip, missing-path error |

No network access required. Integration tests use `customPath` to skip config prompts.

---

## Recent Improvements (January 2026)

### Global State Organization
All global konstruct files now live in `~/.konstruct/`:
- `konstruct.config.json` — global configuration
- `skills.json` — global skill manifest

This keeps all konstruct-related state in one place, separate from agent directories.

### Comprehensive `-g` Flag Support
All commands that interact with manifests or configurations now support `-g, --global`:
- `konstruct add -g` — Install to global directories
- `konstruct install -g` — Install from global manifest
- `konstruct update -g` — Update global skills
- `konstruct remove -g` — Remove from global directories
- `konstruct list -g` — List global skills

### Enhanced List Command
The `list` command now shows three categories:
1. **Installed skills** — Git-based skills from manifest
2. **User skills** — Local file-based skills from manifest
3. **Untracked skills** — Skills found on disk (with SKILL.md) but not in manifest

This helps users discover manually-created or externally-installed skills.

### Robust SKILL.md Parsing
`discover.ts` now handles malformed YAML frontmatter gracefully:
- Falls back to regex extraction when `gray-matter` fails
- Extracts `name` and `description` fields even from invalid YAML
- Prevents crashes on skills with unquoted special characters

### SSH/HTTPS Authentication
Git operations support both authentication methods:
- HTTPS with automatic retry on auth failure
- SSH via `--ssh` flag for all git commands
- Helpful error messages guide users through auth setup

### Custom Path Tracking in Manifest
The manifest now tracks custom installation paths for each skill:
- Manifest entries are objects with `source` and optional `path` fields
- When `--path` is used with `konstruct add`, the path is saved in the manifest
- `install` and `update` commands respect the saved custom paths
- No more confusion about where custom-path skills are installed

### Auto-Global Installation
`konstruct add` now automatically switches to global mode when no local manifest exists:
- Running `konstruct add` outside a project installs to `~/.konstruct/skills.json`
- Displays a note: "No skills.json in current directory. Installed globally."
- Prevents accidental creation of project manifests in random directories

---

## Outstanding work (from original task plan)

**Exclusion filter (Task 8 TODO):** `copyToAll` currently uses `fs.cp` which copies
everything. The plan called for filtering out `.git/`, `README.md`, and `_`-prefixed
files/dirs during copy. Not yet implemented.

**Double-clone in `add`:** When adding a git skill from a multi-skill repo, `add` clones
once for discovery and again for installation. The temp dir from discovery could be reused.
Noted as a future optimization.
