# Logic Pattern Challenge — Field Experiment

A web-based 5-round pattern-recognition game built for a Field Experiments class. The app is a research instrument studying whether **difficulty label priming** affects persistence, performance, and frustration on objectively hard logic puzzles.

------------------------------------------------------------------------

## Research Design

**Independent variable:** Difficulty label shown before and during each puzzle round.

| Group        | Label shown        |
|--------------|--------------------|
| `no_label`   | No label (control) |
| `hard_label` | DIFFICULTY: HARD   |
| `easy_label` | DIFFICULTY: EASY   |

Participants are randomly assigned at session start. All other aspects of the experience are identical across groups. The label appears prominently in the round header throughout each puzzle — it is the treatment.

**Dependent variables measured per round:** - Time engaged (active seconds, paused time excluded) - Solve rate and first-attempt accuracy - Attempt count and time to first attempt - Skip/quit rate - Rage-click events and rapid-guess events - Tab-switch count and duration

See `Power_Analysis.Rmd` / `Power_Analysis.pdf` for sample size calculations.

------------------------------------------------------------------------

## Data Quality Checks (for analysis)

Before running regressions, verify the following in Firestore:

**Session completeness**
- Each `userId` with `sessionComplete: true` rounds should have exactly 5 `gameLogs` docs
- Any `sessionComplete: false` log = dropout → exclude from primary analysis
- Every `userId` in `gameLogs` must have a matching doc in `users`
- `treatment` in each `gameLog` must match the `treatment` in the corresponding `users` doc

**Treatment balance**
- Confirm roughly equal N across `no_label` / `hard_label` / `easy_label`
- Check balance holds **within** `deviceType` — mobile concentration in one group is a confound

**Survey fields**
- All 8 fields present and non-null: `age`, `gender`, `educationLevel`, `quantitativeExposure`, `energyLevel`, `puzzleFrequency`, `puzzleSkill`, `puzzleEnjoyment`
- `age` in range 13–99; Likert fields integers 1–5
- Card-select fields (`gender`, `educationLevel`, `puzzleFrequency`) contain only the expected option strings.

**Round-level logic**
- `roundNumber` is 1–5 with no duplicates per user
- `puzzleId` is one of the 5 expected IDs; must match `puzzleOrder` in the `users` doc
- `isSolved` and `didSkip` are never both `true`
- `rawSubmissionTimestamps` array length should equal `attemptCount`

**Exclusion flags**
- `isReplay: true` → exclude from primary analysis (return visitor)
- Multiple `userId`s sharing the same `ipAddress` → likely same person replaying
- `rapidGuesses > 0` → flag for low-effort / bot behavior
- `timeEngaged < 10` on a solved puzzle → flag as suspicious
- `userId` starting with `local_` → Firebase Auth failed; data is localStorage-only and not in Firestore
- `deviceType: 'Mobile'` → include but add as covariate; mobile users may have higher `rageClicks` and `tabSwitchCount` due to screen size and OS interruptions

**Known issues**
- `honestyCheck` may be `null` for all users — the Firestore update call is not yet wired up (TODO in `dataHandler.js`)
- Failed Firestore writes fall back to `localStorage` as `failedLog_{userId}_{roundNumber}` — these are not recoverable from Firestore
- `deviceType` detection was updated to use `navigator.userAgent` in addition to viewport width — sessions collected before this fix may misclassify landscape-mode phones as `'Desktop'`

------------------------------------------------------------------------

## App Overview (`/claude`)

The game app is a vanilla JS single-page app with no build step. It runs directly in any modern browser.

```
/claude
├── index.html            HTML shell — loads fonts, mounts #app
├── 404.html              Firebase Hosting 404 page
├── style.css             All styles — mobile-first, CSS custom properties
├── gameEngine.js         All game logic, state machine, and rendering (~2200 lines)
├── dataHandler.js        Firestore reads/writes with localStorage fallback
├── firebase-config.js    Firebase project config (live — connected to puzzle-project-dd8e0)
└── LogicChallenge_BuildSpec_v3.md   Full product specification
```

The app is deployed via **Firebase Hosting** at **https://anotherpuzzle.io** and mirrored on **GitHub Pages** at **https://manavka.github.io/241_final_project/** (for use on networks that block the primary domain).

### Running locally

``` bash
cd claude
python3 -m http.server 8080
# open http://localhost:8080
```

No npm, no bundler, no dependencies to install. Firebase is loaded via CDN at runtime.

### Checking local data

Open DevTools → Application → Local Storage → `http://localhost:8080`

Keys written during a session:
- `userData_{userId}` — user doc (survey answers, treatment, etc.)
- `gameLog_{userId}_{roundNumber}` — one entry per completed round
- `partialLog_{userId}_{roundNumber}` — written on tab close mid-round
- `lpc_played` / `lpc_played_{ip}` — replay detection flags

------------------------------------------------------------------------

## The 5 Puzzles

| \# | Type | Rule | Answer | Regenerates on wrong? |
|----|----|----|----|----|
| 1 | Number sequence | `n = (prev + prev2) × 2` | 196 | No |
| 2 | Alphabet wheel | +1, +3, +6, +10, +15 triangular shift | Varies | Yes — new starting letter |
| 3 | Shape builder | Sides/rotation/color each cycle independently | Varies | Yes — new start positions |
| 4 | Hybrid (shapes + numbers) | `value = sides × 4` (fixed) | 20 | No |
| 5 | Tile sequence | `n = (prev × 3) − prev2` | 89 | No |

Order is randomized per session (Fisher-Yates shuffle).

------------------------------------------------------------------------

## Firebase Setup

Firebase is **live and connected**. The app writes to Firestore project `puzzle-project-dd8e0` and is hosted at `anotherpuzzle.io`.

| Resource | Value |
|---|---|
| Project ID | `puzzle-project-dd8e0` |
| Auth domain | `puzzle-project-dd8e0.firebaseapp.com` |
| Primary URL | `https://anotherpuzzle.io` |
| Mirror URL | `https://manavka.github.io/241_final_project/` |

Both URLs are authorized domains in Firebase Auth and write to the same Firestore database.

**To deploy updates:**

``` bash
firebase deploy        # deploys to anotherpuzzle.io
git push               # triggers GitHub Actions → deploys to GitHub Pages
```

**To set up a fresh Firebase project** (if forking):

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Firestore** and **Anonymous Authentication**
3. Replace the config object in `firebase-config.js` with your project's credentials
4. Set Firestore rules to allow anonymous writes to `users` and `gameLogs` collections

### Non-blocking session start

On "Start Challenge", the app immediately shows the first label card and writes the user doc to Firestore in the background. IP capture uses `api.ipify.org` with a 3-second timeout — if it fails, `ipAddress` is stored as `null` and replay detection falls back to the generic `lpc_played` localStorage flag.

------------------------------------------------------------------------

## Admin Mode

To troubleshoot without anti-cheat restrictions getting in the way:

**Press `Shift + Ctrl + A`** anywhere in the app.

An amber **ADMIN** badge appears in the bottom-left corner. In admin mode:
- Copy, paste, right-click, and text selection all work normally
- A **Skip** button appears on each puzzle round to advance without solving
- The alphabet wheel never places the answer in the first position (so even skipping reveals the correct answer visually)

Press the same shortcut again to re-enable protections. The setting persists across page refreshes.

------------------------------------------------------------------------

## Power Analysis

`Power_Analysis.Rmd` contains the sample size calculations for the 3-group design. Rendered output is in `Power_Analysis.pdf`. The scenario files (`Power_Analysis-scenario-1-and-2.Rmd`) cover alternative effect size assumptions.
