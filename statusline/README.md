# Claude Code usage status line

One-line status bar for Claude Code: model, git branch, context bar,
5-hour and 7-day quota bars with TokenEater-style smart color and pacing tick,
session cost, and lines changed.

## Install (tell the agent this)

1. Needs `jq` (`brew install jq`) and Claude Code >= 2.1.x.
2. Run `./install.sh`. It copies `usage-bar.sh` to `~/.claude/statusline/`
   and sets `statusLine` in `~/.claude/settings.json` (backup is made).
3. If a project has its own `statusLine` in `.claude/settings.json`, that
   overrides the global one. Pass those project paths to the installer:
   `./install.sh ~/work/repo-a ~/work/repo-b`
   It writes a chained command into each repo's `.claude/settings.local.json`
   (untracked), so both status lines show.
   Find such repos with:
   `grep -l '"statusLine"' ~/work/*/.claude/settings.json`
4. Restart Claude Code.

## Notes

- 5h/7d bars appear after the first API reply. They need a Pro/Max/Team login.
- Colors: green→amber→red, muted. Edit anchors at `usage-bar.sh` lines ~39-42.
- Git glyph `` needs a Nerd Font. Replace with `git:` if it shows a box.
- Debug: `touch ~/.claude/statusline/.debug` dumps input JSON to
  `~/.claude/statusline/last-input.json`.
