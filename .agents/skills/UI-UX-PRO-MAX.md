# UI UX Pro Max project skills

Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill, commit `7246805992a42b7bba37d4cac83b01416f0c6c44`. Generated with the upstream Codex platform installer/templates (CLI version 2.5.0). License: MIT; see `UI-UX-PRO-MAX-LICENSE.txt` and any companion license files.

Installed the main `ui-ux-pro-max` skill and six companions: `banner-design`, `brand`, `design`, `design-system`, `slides`, and `ui-styling`. Existing Ponytail and Superpowers skills are preserved.

Invoke `$ui-ux-pro-max` or ask for it by name when reviewing or improving interfaces. Start a fresh thread if Codex has not refreshed its skill catalog.

The main skill's search and design-system tools use Python 3 and its standard library. Python 3.12 is available in this cloud environment. Example from the repository root:

```sh
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "badge chip label wraps" --domain ux
```

Local UX search and design-system generation passed smoke checks. The generated smoke-check design was printed only; it was not saved or applied to SuggFeed. Companion helpers may need their own dependencies or provider credentials; they were copied with their references but were not executed or configured during installation.

Use the project's existing brand, components, Express/Eta implementation and authorization when applying recommendations. This installs project skills rather than a global plugin. No system packages, provider accounts or lifecycle hooks were installed.

To update, rerun the upstream Codex installer after comparing local edits. To uninstall, remove these seven directories, this guide/license and the UI UX Pro Max section in root `AGENTS.md`; retain the other skill packages.
