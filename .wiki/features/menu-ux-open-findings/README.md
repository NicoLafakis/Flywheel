# Open Findings: Menu & Shell UX

**Status**: items 1–5 resolved; item 6 open, owner decision (recorded 2026-08-19)
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

**RESOLVED** 2026-08-19, commit `411f4aa`. **419 of 692** swept viewports had
PLAY below the fold; now **0 of 692**, with every type bump intact. Proven RED
rather than assumed: the fix's parent, served with its byte count verified
against disk, swept with the same harness reads 419/692 against 0/692. Both
new static tests were proven by mutation — deleting the two-column block, and
moving it above the 520px landscape block, so the ordering assertion is armed
rather than decorative. `mobile-ui.test.mjs` 18/18, `menu-mobile.mjs` 144/144,
`city-select-mobile.mjs` 75/75.

**The fix**: the card body became a bounded scroller with the action row docked
*outside* it, and in short landscape the card goes two-column (title across the
top, body left, action stack right) — taking the card body from 0px to 118–127px
at 320px of height with every target still ≥44px.

**The instructive failure**: the first attempt put `min-height: 0` on
`.city-card-host` alone and made the problem *worse*. `.city-carousel-wrapper`
sits between the host and the screen and was still content-sized, and being a
row flex with `align-items: center` it content-sizes its children and overflows
them symmetrically. **A min-height:0 chain has to be unbroken from the flex
child all the way up** — fixing one link while an ancestor stays content-sized
inverts the result, and the symptom is indistinguishable from the fix simply not
working.

**Withdrawn before shipping**: a measure-and-collapse pass (`fitCard`) that shut
the dossier drawer when the body overflowed. Once the body is a bounded
scroller, "content taller than the body" is a scroller's *normal* state, so it
fired at 390×844 and 1440×900 and closed a drawer the design deliberately opens
there. `city-select-mobile.mjs` caught it at 72/75. Removed entirely; the
docking does the job alone and the shipped drawer behaviour is byte-for-byte
unchanged.

**One existing test was widened, not pinned**: check `3e` pinned the desktop
media-query text verbatim and broke on the new `min-height` clause. Its pattern
was widened to tolerate extra clauses rather than re-pinned to the new text —
verbatim pinning is what made it brittle, so re-pinning would reload the same
trap for the next author.

> **Correction — the original figure was 347/692 and it was wrong.** A stale
> `python -m http.server` was squatting the baseline port, serving an older
> directory: Content-Length 226883 against a 234584-byte file on disk, with
> **two PIDs listening**, so killing one left the other alive. It returned a
> well-formed, entirely plausible number on the one arm nobody re-checks — the
> baseline. Re-measured against the fix's real parent with served bytes verified
> against disk: **419/692**, which also matches the very first pre-fix reading,
> so 419 has two independent arrivals and 347 has one from an unverified server.
> The commit message was amended rather than leaving a wrong number in the
> permanent record, which is why the sha moved `4749a72` → `411f4aa` (same tree
> `4e742b62`, same 4 files, attestation still valid).
>
> **The lesson is about which arm gets checked.** Effort concentrates on the arm
> being changed; the control arm is assumed. A baseline served from the wrong
> bytes is invisible precisely because a baseline is *supposed* to differ from
> the fixed tree — the discrepancy it produces looks like the fix working.
> Verify the served byte count against disk before trusting any A/B, and check
> for more than one listener on the port.

---

## 5. `#boot-splash.fade-out` overflows the viewport horizontally

**Found** 2026-08-19 while falsifying item 4; **pre-existing and unrelated to
City Select**, which is why it is recorded separately rather than folded in.

The `#boot-splash.fade-out` rule scales the splash to `1.03`. On a full-viewport
element that puts ~1.5% of it outside the viewport for the 0.45s fade **on every
single load** — **5px at 320 wide, 5px at 360, 6px at 390**. Note 390×844 is the
*worst* of the three sampled and the most common phone width, so this is not an
exotic narrow-device edge case. (Cite the selector, not a line number — several
agents are editing `css/main.css` and the line has already moved once.)

**Why it has never been seen**: `html`/`body` are `overflow: hidden`, so nothing
pans and there is no scrollbar. The defect is real and permanently masked. It
cost two falsification rounds during item 4 because it presents exactly like a
City Select overflow leak.

**RESOLVED** 2026-08-19, commit `eafbfc5` (2 files). The fix is
`position: absolute` → `position: fixed`: fixed-position boxes are excluded from
the document's scrollable overflow region, and with `inset: 0` on a body that is
already the viewport box, the splash occupies the identical rect. **Transform,
timing and easing untouched.** Overflow across the whole boot goes 5/5/6px → 0.

**The visual identity was proven, not eyeballed.** Both arms were shot from *one
page* with animations paused and the fade frozen at opacity .5 / `scale(1.03)`,
toggling only the `position` property — and the run carried a control arm, with
`absolute` shot twice around the `fixed` shot. `absolute`-vs-`fixed` differs by
825 pixels at 360×640; `absolute`-vs-`absolute` differs by **the same 825 pixels
in the same bounding box** — the boot progress bar advancing between shots. None
of the difference belongs to the change. That is how you assert "looks
identical" with evidence instead of an opinion.

**Gated**: `city-select-fold.mjs` now samples `document.scrollWidth` every frame
from before the first script runs, across three widths, names the phase an
overflow occurred in, and **fails loudly if the splash was never observed at
all** — an arm that measured nothing must not report PASS. Proven RED by a
single-element mutation (`fixed` → `absolute`, verified by diff as the only
change): exactly the three boot lines fail and all ten sweep guards stay green.

**The generalisable point**: a defect masked by an ancestor's `overflow: hidden`
is invisible to users *and* to every visual check, but still corrupts any
measurement that asks "does anything overflow the viewport". A masked defect is
not a harmless one; it is one that will be misattributed to whatever is being
investigated nearby.

The masking cuts the other way too, and it is why this stayed a one-declaration
fix: because nothing ever panned, **no layout could have come to depend on the
overflow existing**, so removing it cannot break anything downstream. A masked
defect is rarely harmless, but it is usually safe to remove.

## 6. Short-landscape chrome consumes 45% of the screen — OPEN, owner decision

At 568×320 the chrome above the City Select card is header 47 + act rail 52 +
progress strip 44 = **143px of a 320px screen (45%)**, leaving 167px for the
card. Item 4's two-column layout makes this *liveable* rather than fixing it,
and no guard is currently blocked by it.

The only remaining lever is compressing the act rail and progress strip in short
landscape. **Not built** — it changes navigation chrome the player relies on, to
buy breathing room rather than to clear a failing check, so it is an owner
decision rather than a completer of item 4. A spec can be written before any
build.

---

## Rule this file exists to satisfy

A finding surfaced in conversation dies with the conversation. Anything spotted
during a review gets a durable in-repo record at the moment it is spotted, and
is then fixed — not handed back to the owner as an observation.
