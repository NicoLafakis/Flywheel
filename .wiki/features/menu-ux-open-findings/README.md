# Open Findings: Menu & Shell UX

**Status**: OPEN (recorded 2026-08-19)
**Category**: UI / Menus
**Origin**: surfaced during the 2026-08-19 mobile menu audit (Playwright, headed,
360×640 / 390×844 / 844×390 / 1440×900). Recorded here rather than left in a
conversation so they survive the session that found them.

Each item below was **observed**, not inferred. None is fixed yet. They are
queued behind the Act I map completion work and are not blocked by it — they
touch `js/ui/screens.js`, `js/ui/help.js` and `css/main.css`, none of which the
Act I scene agents own.

---

## 1. Landscape pause menu buries RESTART and CITIES under the music picker

**Where**: pause overlay, `844×390` landscape (the common phone-in-landscape
case, which is how the game is actually played).

**Observed**: the pause menu renders the track picker inline at full height, so
the primary actions — RESTART and CITIES — are pushed below the fold. On a
390px-tall viewport the player has to scroll a pause menu to quit a level. The
music picker is a secondary, exploratory control occupying the primary slot.

**Why it matters**: pause is a panic surface. The two things a player reaches
for under time pressure are the two things not on screen.

**Shape of the fix**: primary actions pinned above the fold at every viewport;
the track picker collapses to a single row (current track + a disclosure) in
short-viewport landscape, expanding on demand. Mobile-first — verify at
844×390 before touching the desktop layout.

## 2. Help "WALKTHROUGH" tab label overflows its pill

**Where**: Help screen tab rail, narrow phone widths (worst at 360px).

**Observed**: the WALKTHROUGH label is the longest in the rail and overruns its
pill rather than shrinking the rail or wrapping.

**Shape of the fix**: same class of defect as the City Select act-rail clip
fixed on 2026-08-19 — a scroll container inside a flex column with automatic
min-size 0. Check `flex-shrink` and the label's own `min-width` before assuming
it is a font-size problem. A fluid label (`clamp()`) is the fallback, not the
first move.

## 3. `tools/pw/city-select-mobile.mjs` hangs and is untracked

**Observed**: the script blocks for the full 300 s timeout with zero output. Its
`waitForFunction(() => window.__screens)` never resolves, even though other
Playwright scripts written the same session load the same server and resolve
that exact predicate immediately — so the server is not the cause.

**Status**: never committed; sitting untracked in the working tree along with
`tools/pw/_menu-review/` and `tools/pw/_menu-review-after/`.

**Shape of the fix**: diagnose the hang (compare its context options against a
working script — the difference is the suspect), then either repair and commit
it or delete it. An untracked harness that hangs is worse than no harness: the
next person to run it reads the hang as a broken app.

---

## Rule this file exists to satisfy

A finding surfaced in conversation dies with the conversation. Anything spotted
during a review gets a durable in-repo record at the moment it is spotted, and
is then fixed — not handed back to the owner as an observation.
