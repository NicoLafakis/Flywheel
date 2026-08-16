# Flywheel Diagnostics Report
**Generated**: 2026-08-16T07:35:09.110Z  
**Duration**: 731.2s  
**Result**: ❌ 1 FAILURE(S)

## Summary

| Phase | Name | Tests | Passed | Failed | Time |
|:---:|:---|:---:|:---:|:---:|:---:|
| ✅ 1 | SYNTAX | 1 | 1 | 0 | 29.1s |
| ✅ 2 | UNIT TESTS | 9 | 9 | 0 | 7.7s |
| ✅ 3 | SELFTESTS | 6 | 6 | 0 | 60.0s |
| ✅ 4 | PHYSICS | 3 | 3 | 0 | 34.4s |
| ❌ 5 | FULL SUITE | 1 | 0 | 1 | 600.0s |
| ⏭️ 6 | LIVE | 2 | 0 | 0 | 0.0s |

## Failures Requiring Remediation

### ❌ validate.mjs
- **Phase**: 5 — FULL SUITE
- **File**: `tools/validate.mjs`
- **Duration**: 600.0s

**Full Output (last 30 lines):**
```

```

**Suggested Remediation:**
- Run `node tools/validate.mjs` standalone for detailed section-by-section output. Check `STATUS.md` for known issues.

---

## Detailed Results

### Phase 1: SYNTAX

| Test | Status | Time |
|:---|:---:|:---:|
| All syntax checks | ✅ Pass | 29.1s |

### Phase 2: UNIT TESTS

| Test | Status | Time |
|:---|:---:|:---:|
| Audio Engine | ✅ Pass | 0.5s |
| Game Audio | ✅ Pass | 0.5s |
| Music Director | ✅ Pass | 0.5s |
| Multiplayer Config | ✅ Pass | 0.5s |
| Multiplayer Protocol | ✅ Pass | 0.5s |
| Multiplayer Lobby | ✅ Pass | 0.5s |
| Multiplayer Sim | ✅ Pass | 1.1s |
| Multiplayer Session | ✅ Pass | 1.2s |
| Multiplayer E2E | ✅ Pass | 2.6s |

### Phase 3: SELFTESTS

| Test | Status | Time |
|:---|:---:|:---:|
| Board Replay | ✅ Pass | 36.0s |
| Cinematic VFX | ✅ Pass | 0.5s |
| Earthquake Cinematic | ✅ Pass | 0.5s |
| Music Assets | ✅ Pass | 0.5s |
| Train Derail Physics | ✅ Pass | 22.0s |
| Import Graph | ✅ Pass | 0.5s |

### Phase 4: PHYSICS

| Test | Status | Time |
|:---|:---:|:---:|
| Voxel Drain | ✅ Pass | 11.1s |
| Voxel Gravity | ✅ Pass | 11.7s |
| Voxel Multi-Hole | ✅ Pass | 11.6s |

### Phase 5: FULL SUITE

| Test | Status | Time |
|:---|:---:|:---:|
| validate.mjs | ❌ Fail | 600.0s |

### Phase 6: LIVE

| Test | Status | Time |
|:---|:---:|:---:|
| Board Live API | ⏭️ Skip | 0.0s |
| Live Profile Auth | ⏭️ Skip | 0.0s |
