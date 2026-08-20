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

## 3. `tools/pw/city-select-mobile.mjs` blocks on a headed launch

**CORRECTED 2026-08-19.** This entry was wrong on all three of its original
claims. The corrections are kept in place of the original text because the way
it was wrong is the useful part.

**Originally written**: "hangs for the full 300 s timeout … its
`waitForFunction(() => window.__screens)` never resolves … never committed;
sitting untracked along with `tools/pw/_menu-review/`."

**What is actually true**, established by experiment rather than argument:

- It is **tracked**, committed at `7dde434` by a parallel session.
- `tools/pw/_menu-review/` and `_menu-review-after/` are matched by
  `.gitignore:17` (`tools/pw/_*/`). They are deliberately ignored, not stray.
- It does **not** hang: 16 s headless, 17 s headed, full run.
- The blocking call was `chromium.launch({ headless: false })`, not the
  `waitForFunction`. Two competing theories were falsified rather than
  dismissed: `7e3ea01`'s broken `screens.js` still exposes `window.__screens` in
  223 ms, and a frozen `requestAnimationFrame` does not stall Playwright's
  default rAF polling.

**The lesson, which is why this stays on the page**: the original observation
was real — the script was run headed while another headed browser was already
up — but it was attributed to *the last line that had been read* rather than to
*the first line that could block*. `chromium.launch()` is called before the
first `console.log` in that file, so "zero output for the entire timeout" points
at the launch and can never point at anything after it. Symptom timing bounds
which lines are candidates; that bound was available and unused.

**Fixed**: headless by default (`FW_HEADED=1` to watch), a log line before the
launch, `polling: 200`, and a diagnostic dump instead of a bare `TimeoutError`.
Repaired rather than deleted — it is the only City Select browser contract.

## 4. City Select PLAY button falls below the fold (found 2026-08-19)

**Observed** by the browser contract in item 3 once it was repaired: the City
Select card is taller than the viewport, so `.city-launch-btn` sits below the
fold at 844×390 (bottom 509 of 390), 320×568 (634 of 568), **380×820 (839 of
820)** and 1440×900 (922 of 900). Pre-existing — present in a clean
`git archive HEAD` arm as well as the working tree.

**Why 380×820 is the entry that matters**: the wayfinding work earlier the same
day verified this screen at 360×640 and 390×844 and correctly reported PLAY
above the fold at both. 380×820 lies *between* those two samples and fails. A
defect found at N sample points must be re-verified at well more than N — the
original N is where the fix was aimed, so passing it is selection, not evidence.

**Constraint on the fix**: a legibility pass (dossier 11→12px, metric and record
labels 9px/8.5px→10px, act tabs 40→44px) made this already-failing check 8–24px
worse. Those bumps are **not** to be reverted — 9px labels on a phone are the
worse defect, and this game is mobile-first by standing rule. The card layout
has to fit the CTA *with* the larger type. Reverting to protect a red check
optimises the metric instead of the screen.

---

## Rule this file exists to satisfy

A finding surfaced in conversation dies with the conversation. Anything spotted
during a review gets a durable in-repo record at the moment it is spotted, and
is then fixed — not handed back to the owner as an observation.
