# Superpowers project skills

Source: https://github.com/obra/superpowers, version 7.0.0, commit `bb92a77741419a4ab5f06e711a283343f1ada0c3`. License: MIT; see `SUPERPOWERS-LICENSE.txt`.

All 15 skill directories, reference documents and bundled helpers are copied into `.agents/skills`, alongside Ponytail. Their relative paths and executable permissions are preserved.

Request skills by name, for example `$systematic-debugging`, `$writing-plans`, `$test-driven-development`, `$verification-before-completion`, or `$requesting-code-review`. These project skills do not use the `superpowers:` plugin namespace. Start a fresh Codex thread if its skill catalog has not refreshed.

Ponytail supplies guidance for keeping changes small. Superpowers supplies structured workflows where appropriate. Follow the user's task, existing authorization and the host's tool/permission requirements when applying either.

This installs project skills, not global plugin registration or lifecycle hooks: this cloud environment's Codex configuration directory is read-only. Skill files were verified against upstream; helper scripts were not executed during installation. Installing these files does not establish that every optional workflow or helper is supported by this host.

To update, compare upstream changes and preserve project edits. To uninstall, remove the 15 directories listed below, this guide/license and the Superpowers section in `AGENTS.md`; keep Ponytail's files.

- `brainstorming`
- `diagnosing-superpowers`
- `dispatching-parallel-agents`
- `executing-plans`
- `finishing-a-development-branch`
- `receiving-code-review`
- `requesting-code-review`
- `subagent-driven-development`
- `systematic-debugging`
- `test-driven-development`
- `using-git-worktrees`
- `using-superpowers`
- `verification-before-completion`
- `writing-plans`
- `writing-skills`
