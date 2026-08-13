-- T-502. `runs.stats->'best_combo'` holds a CHAIN COUNT — blocks eaten inside
-- one unbroken 1.5 s chain — not a multiplier. It is the same ambiguity T-309
-- and T-311 removed from every player-facing readout (audit B2 #16), still live
-- in the stored schema: the first surface to render this key would reproduce
-- the "it maxes out at 100x" confusion the audit traced, because a chain of 530
-- under a key called `best_combo` reads as x530 against a ladder that stops at
-- x8.
--
-- Renamed rather than annotated, because the key IS the label: nothing joins on
-- it, nothing indexes it, and `api/_verify.mjs` is its only writer with no
-- reader anywhere in the app. The multiplier that chain bought is deliberately
-- NOT stored alongside it — it is `comboMult(best_chain)`, and one number with
-- one owner is the rule the rest of this package just established.
--
-- Landed while the board holds one run and zero claimed names, which is the
-- cheapest window this rename will ever have.
--
-- Idempotent by construction: rows already carrying `best_chain` are untouched,
-- and a row holding neither key is left alone rather than given a null.
update public.runs
set stats = (stats - 'best_combo') || jsonb_build_object('best_chain', stats -> 'best_combo')
where stats ? 'best_combo';
