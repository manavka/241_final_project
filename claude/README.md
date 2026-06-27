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

## App Overview (`/claude`)

The game app is a vanilla JS single-page app with no build step. It runs directly in any modern browser.

```         
/claude
├── index.html            HTML shell — loads fonts, mounts #app
├── style.css             All styles — mobile-first, CSS custom properties
├── gameEngine.js         All game logic, state machine, and rendering (~2200 lines)
├── dataHandler.js        Firestore reads/writes with localStorage fallback
├── firebase-config.js    Firebase project config (db = null until wired up)
└── LogicChallenge_BuildSpec_v3.md   Full product specification
```

### Running locally

``` bash
cd claude
python3 -m http.server 8080
# open http://localhost:8080
```

No npm, no bundler, no dependencies to install. Firebase is loaded via CDN at runtime and gracefully falls back to localStorage when `db = null`.

### Checking local data (no Firebase)

Open DevTools → Application → Local Storage → `http://localhost:8080`

Keys written during a session: - `userData_{userId}` — user doc (survey answers, treatment, etc.) - `gameLog_{userId}_{roundNumber}` — one entry per completed round - `partialLog_{userId}_{roundNumber}` — written on tab close mid-round - `lpc_played` / `lpc_played_{ip}` — replay detection flags

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

The app ships with `db = null` in `firebase-config.js`. To connect a real Firestore:

1.  Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2.  Enable **Firestore** and **Anonymous Authentication**
3.  Replace the config object in `firebase-config.js` with your project's credentials
4.  Set Firestore rules to allow anonymous writes to `users` and `gameLogs` collections

Until then, all data is stored in the local browser's `localStorage` and nothing is sent anywhere.

------------------------------------------------------------------------

## Admin Mode

To troubleshoot without anti-cheat restrictions getting in the way:

**Press `Shift + Ctrl + A`** anywhere in the app.

An amber **ADMIN** badge appears in the bottom-left corner. Copy, paste, right-click, and text selection all work normally. Press the same shortcut again to re-enable protections. The setting persists across page refreshes.

------------------------------------------------------------------------

## Power Analysis

`Power_Analysis.Rmd` contains the sample size calculations for the 3-group design. Rendered output is in `Power_Analysis.pdf`. The scenario files (`Power_Analysis-scenario-1-and-2.Rmd`) cover alternative effect size assumptions.
