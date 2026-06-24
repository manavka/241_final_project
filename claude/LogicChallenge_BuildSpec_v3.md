# Logic Pattern Challenge App
## Full Build Specification — Field Experiment
**Version 3.1 | Updated June 2026**

---

## 1. Experiment Overview

A web-based, 5-round pattern-recognition game built for a Field Experiment class. The independent variable is **difficulty label priming** — users are randomly assigned to one of three groups that differ only in how each puzzle is labeled. Everything else (puzzles, timer, UI) is identical across groups.

**Research question:** Does priming users with an inaccurate difficulty label (easy vs. hard vs. none) affect persistence, performance, and rage-click behavior on objectively hard logic puzzles?

---

## 1.1 Treatment Groups (Independent Variable)

At session start, the user is randomly assigned to one of three groups using `Math.random()`. Assignment is saved to Firestore and persists for all 5 rounds.

| Group ID | Label shown | Where shown | Research intent |
|---|---|---|---|
| `no_label` | Nothing | N/A — all label UI hidden | Control. Baseline with no priming. |
| `hard_label` | **DIFFICULTY: HARD** | Label card + centered header throughout round | Accurate priming. Does truthful labeling affect persistence? |
| `easy_label` | **DIFFICULTY: EASY** | Label card + centered header throughout round | Understated priming. Does false confidence change effort and rage-click rates? |

**Label display mechanics:**

- **Label card** (shown before each puzzle): animated background, glowing countdown ring counting down from **5 seconds**. Shows "ROUND N of 5," difficulty text if applicable, no-AI reminder, and a **Pause / Take a Break** button. Tapping anywhere skips the countdown. The card auto-advances at 0. Timer does not start during the card — it starts the moment the puzzle loads.
- **In-round header** (`hard_label` / `easy_label` only): difficulty text displayed as **large bold centered text** ("DIFFICULTY: HARD" in red glow, "DIFFICULTY: EASY" in green glow) using Bricolage Grotesque 800 at 18px. This is the primary treatment exposure and must be visually prominent — it is the independent variable.
- **`no_label` group**: no label text anywhere. The center slot of the header is empty.

**No-AI reminder:** shown in two places for all groups — on the instructions screen and on every label card: *"🚫 No AI or outside help — it affects our data."*

---

## 2. Onboarding & Intro Screen

### 2.1 Landing Screen

- Headline: **"Brain rot"** (slimy green gradient: `#4ade80 → #86efac → #bbf7d0 → #65a30d → #a3e635`) **🫠 or big brain 🧠?** ("or" and "big brain?" use the standard purple-pink gradient)
- Lines: "It's giving... genius." / "Prove you've got the logic to match in 5 rapid-fire rounds."
- CTA: "Start" — narrow pill button, pulsing animation. Leads to consent screen.
- Background: animated number tiles, SVG polygons, alphabet wheel, sequence rows in top strip, bottom strip, and corners. Center kept clear.
- Easter eggs: large pink "67" tile top-right (~30% opacity); barely-visible 🐊✈️ and ☕💀 emoji pairs at ~7% opacity.
- `prefers-reduced-motion`: all animations frozen.
- No data collected on this screen.

### 2.2 Consent Screen

Shown after "Start." Separate screen, not a modal.

| Element | Copy |
|---|---|
| Headline | "Before we get started 👋" |
| Body | "Help us understand puzzle game players like you. We have a quick survey… All data is anonymized and used for academic research purposes only." |
| Fine print | "You can opt out at any point before the game begins. No data is saved until you confirm you're ready to play." |
| Primary CTA | "I understand — let's go" → survey |
| Secondary CTA | "I'd rather not participate" → landing screen |

No data collected. Opting out returns directly to landing. The "I'd rather not participate" button is styled in solid white so it is always clearly visible.

### 2.3 Pre-Game Survey

8 questions, one per screen, forward-only. All required before proceeding.

| Field | Input type | Options |
|---|---|---|
| Age | Number input | Integer, 13–99 |
| Education Level | Tap-to-select cards | High school → PhD + Prefer not to say |
| Field of study/work | Tap-to-select cards | STEM / Social Sciences / Humanities / Business / Arts / Healthcare / Other |
| Quantitative exposure | Likert 1–5 | 1 = Never → 5 = All the time |
| Energy Level | Likert 1–5 | 1 = Exhausted → 5 = Fully energized |
| Puzzle frequency | Tap-to-select cards | Never / A few times a year / Monthly / Weekly / Daily |
| Puzzle skill | Likert 1–5 | 1 = Total beginner → 5 = Expert |
| Puzzle enjoyment | Likert 1–5 | 1 = Hate them → 5 = Love them |

Progress indicator shows "N of 8." "I'd rather not participate" link (white text) visible on every page. Answers held in memory only until "Start the Challenge."

### 2.4 Opt-Out Flow

- From consent screen → returns to landing (no exit screen).
- From survey pages → renders exit screen with warm copy, then redirects to landing after 4 seconds or on "Take me back" click.
- Nothing written to Firestore on opt-out.

### 2.5 Instructions Screen

Shown after survey, before first round. Single screen.

| Element | Copy |
|---|---|
| Headline | "Here's how it works 🧠" |
| Body | "You'll get 5 logic puzzles, one at a time. Each one has a hidden pattern — your job is to figure out the rule and find the missing piece." |
| Example 1 | "For example: 2 · 4 · 8 · __ → the rule is ×2, so the answer is 16." |
| Example 2 | "Or: A · C · E · __ → the rule is +2 letters, so the answer is G." |
| Real puzzles note | "The real puzzles are harder than these — but the idea is the same. Find the rule, trust it." |
| Pro tip | "📝 Pro tip: grab a pen and paper before you start. These will make your brain work." |
| No-AI note | "🚫 No AI or outside help please — it affects our research data." |
| CTA | "Start the Challenge 🚀" — triggers treatment assignment, puzzle shuffle, IP capture, first round load |

Do NOT mention timer, skip option, or time pressure. This screen does not count toward `timeEngaged`.

---

## 3. Data Capture & Treatment Assignment

Triggered by "Start the Challenge" on the instructions screen.

### 3.1 Auto-captured fields (users collection)

| Field | How captured |
|---|---|
| `userId` | Firebase Anonymous Auth uid (or `local_` + random string as fallback) |
| `treatment` | `Math.random()` → one of three groups |
| `ipAddress` | `https://api.ipify.org?format=json` (best-effort, VPN limitations noted in code) |
| `isReplay` | `localStorage` keyed by IP — `true` if this browser/IP has completed a session before |
| `timestamp` | `new Date().toISOString()` |
| `deviceType` | `window.innerWidth < 768 ? 'Mobile' : 'Desktop'` |
| `puzzleOrder` | Fisher-Yates shuffled array of puzzle IDs |
| `breaksTaken` | Int, updated incrementally |
| `totalBreakTime` | Float (seconds), updated incrementally |
| `honestyCheck` | `null` until closing check answered |
| Survey fields | `age`, `educationLevel`, `fieldOfStudy`, `quantitativeExposure`, `energyLevel`, `puzzleFrequency`, `puzzleSkill`, `puzzleEnjoyment` |

### 3.2 Assignment logic

```js
const r = Math.random();
const treatment = r < 0.333 ? 'no_label' : r < 0.666 ? 'hard_label' : 'easy_label';
```

### 3.3 Replay detection

```js
const replayKey = 'lpc_played_' + (ipAddress || 'local');
const isReplay = !!localStorage.getItem(replayKey) || !!localStorage.getItem('lpc_played');
```

After session completion: `localStorage.setItem(replayKey, '1')` and `localStorage.setItem('lpc_played', '1')`. On return to landing, full state is reset and a new `userId` is issued so replays are tracked as separate sessions.

---

## 4. Puzzle Bank (All 5 Rounds)

Order randomized per session via Fisher-Yates shuffle.

### Wrong Answer UX — All Puzzles

On wrong answer, the **Check Answer / Submit Answer button** itself shows the feedback inline — no separate error message div:

- Button text changes to **"✗ Incorrect"**, background turns red, button shakes with CSS animation and pulses a red glow.
- After 1.4 seconds the button reverts to its original label and becomes clickable again.
- On correct answer: button text changes to **"✓ Correct!"**, background turns green, stays until screen transitions (1.2s).

Puzzle-specific behavior (regeneration, chips) is layered on top of this shared feedback.

---

### Puzzle 1 — Number Sequence (Free-text input)

| | |
|---|---|
| **ID** | `puzzle_01` |
| **Type** | Number sequence |
| **Rule** | `n_x = (n_{x-1} + n_{x-2}) × 2` |
| **Shown sequence** | 2, 3, 10, 26, 72, __ |
| **Answer** | 196 |
| **Wrong answer UX** | Button shakes red. Struck-through chip added to scrollable history. No regeneration — same sequence stays visible. |

---

### Puzzle 2 — Alphabet Sequence (Vertical Slot-Machine Wheel)

| | |
|---|---|
| **ID** | `puzzle_02` |
| **Type** | Alphabet / triangular shift |
| **Rule** | Each letter shifts forward by triangular numbers: +1, +3, +6, +10, +15. Constant across all regenerations. |
| **Example** | C → D → G → M → W → ? (answer: L) |
| **Interaction** | Vertical slot-machine drum showing A–Z. User scrolls/drags/touch-swipes the drum to select a letter. Wraps in both directions. Starts at a random letter each generation. |
| **Wrong answer UX** | Button shakes red. After 1.4s button reverts and sequence regenerates with new starting letter (same +1/+3/+6/+10/+15 rule, new answer). No chips — past guesses irrelevant after regeneration. |

---

### Puzzle 3 — Shape Sequence (Paint Builder)

| | |
|---|---|
| **ID** | `puzzle_03` |
| **Type** | Visual pattern — simultaneous multi-attribute |
| **Rule** | Three properties cycle independently each step: **Sides** cycle `[3,4,5,6]` (triangle→square→pentagon→hexagon→triangle…); **Rotation** advances +45° each step (0°→45°→90°…→315°→0°); **Color** advances +1 through `[Red, Blue, Green, Yellow, Purple, Orange]`. Each puzzle starts at a random position in each cycle independently. |
| **Interaction** | Single "paint builder" panel below the sequence preview: **Left toolbar** — 4 shape buttons (triangle/square/pentagon/hexagon) stacked vertically. **Center canvas** — 190px live preview of currently selected shape+color+rotation, updates in real time. **Right toolbar** — 6 color swatches stacked vertically. **Rotation strip** — 6 rotation option buttons below the canvas, each showing the current shape+color at that angle. User picks all three simultaneously, then clicks **Submit Answer**. |
| **Rotation indicator** | A white dot is drawn on the first vertex of every polygon SVG so rotation angle is visually unambiguous even on symmetric shapes. Dot omitted on shape-type selector toolbar buttons (rotation irrelevant there). |
| **Wrong answer UX** | Button shakes red. After 1.4s: entire puzzle regenerates (new start positions, same cycling rule), builder resets to default selections. |
| **Telemetry** | `attemptCount` increments on each wrong submission. `stepsCompleted` = 3 on solve (reflects old 3-step model; kept for schema compatibility). |

---

### Puzzle 4 — Hybrid (Free-text input)

| | |
|---|---|
| **ID** | `puzzle_04` |
| **Type** | Hybrid — numeric + shape |
| **Rule** | `value = sides × m` where `m = 4` (fixed). Triangle=3 sides, Square=4, Pentagon=5, Hexagon=6. |
| **Fixed puzzle** | Triangle=12, Square=16, Hexagon=24, Pentagon=**?** → answer: **20** |
| **Interaction** | 4 shapes displayed in a row with `→` arrows. Three shapes show their `sides × 4` value; Pentagon shows `?`. User types the missing number. Each shape type has a fixed color: triangle=red, square=blue, pentagon=green, hexagon=purple. |
| **Generation** | **Fixed — same puzzle every session.** No regeneration on wrong answer. |
| **Wrong answer UX** | Button shakes red. Struck-through chip added to scrollable history. Puzzle stays the same. |

---

### Puzzle 5 — Tile Sequence (Free-text input)

| | |
|---|---|
| **ID** | `puzzle_05` |
| **Type** | Number pattern |
| **Rule** | `n_x = (n_{x-1} × 3) − n_{x-2}` |
| **Shown sequence** | 2, 5, 13, 34, __ |
| **Answer** | 89 |
| **Wrong answer UX** | Button shakes red. Struck-through chip added to scrollable history. No regeneration. |

---

## 5. Game Mechanics

### 5.1 Round Lifecycle

1. Fisher-Yates shuffle `puzzleBank` at session start. Store order in state.
2. Show **label card** (5-second animated countdown with pause button and no-AI reminder). Timer not yet running.
3. Card dismisses → puzzle loads → `timeEngaged` timer starts immediately.
4. Unlimited attempts. On correct answer: `isSolved = true`, stop timer, log telemetry, show next label card (or results if round 5).
5. On wrong answer: puzzle-specific behavior (see Section 4).
6. No hints shown at any time.

### 5.2 Label Card / Between-Round Screen

The label card serves as both the difficulty priming moment and the between-round break screen — there is **no separate between-round countdown screen**.

Label card contains (top to bottom):
1. "ROUND N of 5" — large display font
2. "of 5" in muted text
3. Difficulty badge text (hard/easy groups only)
4. No-AI reminder: "🚫 No AI or outside help — it affects our data."
5. Glowing countdown ring counting down from 5 (large number inside ring)
6. "tap anywhere to skip" hint
7. **Pause / Take a Break button** — pauses countdown indefinitely, shows "Resume →". Records `breaksTaken` and `totalBreakTime`. Break telemetry written to Firestore after each break ends.

### 5.3 Round Header Layout

The header is a fixed bar at the top of every puzzle screen. Content is constrained to `max-width: 480px` centered within the full-width backdrop bar. Three-column grid layout:

| Left (empty) | Center | Right |
|---|---|---|
| Spacer | "DIFFICULTY: HARD" or "DIFFICULTY: EASY" in Bricolage Grotesque 800 18px (red/green glow) — or empty for `no_label` | "ROUND" label + "N / 5" number + 5 pip dots |

### 5.4 Skip / Quit Mechanics

| Time | Rounds 1–4 | Round 5 |
|---|---|---|
| 0–299s | No skip visible | No quit visible |
| 300s exactly | Pause timer. Full-screen blur + modal: "Keep Going" / "Skip Round" | Same modal: "Keep Going" / "Quit Challenge" |
| After "Keep Going" | Resume timer. Skip button animates to bottom-right corner aligned with grass edge. Stays until round ends. | Same — "Quit" button to corner |

Skip/Quit: sets `didSkip = true`, logs telemetry, advances to next round or results.

### 5.5 Skip Modal UX

- Trigger: exactly 300 seconds of `timeEngaged`
- Full-screen blur (`backdrop-filter: blur(6px)`) — no dismiss except button click
- Tab-away overlay mentions skip: *"If you're stuck, hang in there — a Skip option will become available shortly."* Does not specify the 5-minute threshold.
- "Keep Going" click: dismiss modal, resume timer, skip button slides to bottom-right corner aligned to right edge of grass (computed via SVG scale math)
- No pause available once a round has started (label card is the only break point)

---

## 6. Anti-Cheat Protections

To maintain data integrity, the following protections are active for all participants:

| Protection | Implementation |
|---|---|
| **Copy/cut blocked** | `document.addEventListener('copy'/'cut', e => e.preventDefault())` |
| **Paste blocked on inputs** | `document.addEventListener('paste', e => { if (e.target.matches('input')) e.preventDefault() })` |
| **Right-click disabled** | `document.addEventListener('contextmenu', e => e.preventDefault())` |
| **Text selection disabled** | `user-select: none` on `.puzzle-content` |

**Note:** OS-level screenshots (e.g. Cmd+Shift+4 on Mac) cannot be blocked from a browser and remain possible.

### 6.1 Admin Mode

Researchers can toggle all protections off for troubleshooting:

- **Shortcut:** `Shift + Ctrl + A` anywhere in the app
- **Indicator:** Amber **ADMIN** badge appears in the bottom-left corner when active
- **Persistence:** Stored in `localStorage` (`lpc_admin`), survives page refresh
- **Toggle:** Same shortcut disables admin mode and removes the badge

When admin mode is on, copy, paste, right-click, and text selection all work normally.

---

## 7. Telemetry & Data Schema

### 7.1 Firestore Collections

| Collection | Document per | Key fields |
|---|---|---|
| `users` | One per session | All fields in Section 3.1 |
| `gameLogs` | One per round | All fields below |

### 7.2 gameLogs Schema

| Field | Type | Description |
|---|---|---|
| `userId` | String | Reference to users document |
| `roundNumber` | Int (1–5) | Position in shuffled order |
| `puzzleId` | String | e.g. `puzzle_03` |
| `timeEngaged` | Float | Active seconds. Excludes all paused time. |
| `isSolved` | Boolean | True if correct answer submitted |
| `didSkip` | Boolean | True if Skip/Quit clicked |
| `sessionComplete` | Boolean | False if tab closed mid-round (beforeunload) |
| `attemptCount` | Int | Total Check Answer submissions this round |
| `stepsCompleted` | Int \| null | Puzzle 3 only — 3 = solved, null for all other puzzles |
| `firstAnswerCorrect` | Boolean \| null | True if first submission was correct |
| `timeToFirstAttempt` | Float \| null | Seconds from puzzle load to first submission |
| `keptGoingAfterModal` | Boolean \| null | True=Keep Going, False=Skip/Quit, null=modal never fired |
| `rageClicks` | Int | Rage-click event count (3+ clicks same element <1s) |
| `rapidGuesses` | Int | Times 3+ submissions within 8s |
| `rawSubmissionTimestamps` | Array\<Int\> | Epoch ms of every Check Answer click |
| `tabSwitchCount` | Int | Times `document.hidden` became true |
| `tabSwitchTimePaused` | Float | Total seconds paused due to tab switches |
| `modalTimePaused` | Float \| null | Seconds paused in skip modal. null if never triggered. |
| `treatment` | String | `no_label` \| `hard_label` \| `easy_label` |
| `isReplay` | Boolean | True if this browser/IP has completed a prior session |

### 7.3 Tab-Switch Detection

- Listen: `document.addEventListener('visibilitychange', handler)` + `window blur/focus`
- On hidden: pause timer, increment `tabSwitchCount`, record pause start, show blur overlay with focus reminder and no-AI warning
- On visible: remove overlay, resume timer, add elapsed time to `tabSwitchTimePaused`
- Tab-switch detection is **disabled on the results screen** (handlers removed when results render)

### 7.4 Firestore Error Handling

On failed write: retry once after 2 seconds. If retry fails: save to `localStorage` as `failedLog_{userId}_{roundNumber}` with `{ ...telemetry, firestoreFailed: true }`. No error surfaced to user.

### 7.5 beforeunload Handling

Register `beforeunload` at round start. On tab close mid-round: write partial log with `sessionComplete: false`, all telemetry so far. Use `navigator.sendBeacon` if available.

### 7.6 Rage-Click Detection

3+ clicks on same element within 1000ms = one rage event. Increment `rageClicks`. Not used in scoring.

### 7.7 Rapid Guess Detection

3+ Check Answer submissions within 8 seconds = one rapid guess event. Increment `rapidGuesses`. Not used in scoring.

---

## 8. Scoring & Final Results Screen

### 8.1 Scoring Formula

```
roundScore = (isSolved ? 100 : 0)
           + Math.max(0, 500 - timeEngaged)
           - (didSkip ? 50 : 0)

totalScore = Math.max(0, sum of all roundScores)
```

Rage clicks are logged for research but do not affect score.

### 8.2 Percentile Calculation

Query `gameLogs` for `sessionComplete: true`. Only include users with exactly 5 completed rounds. Sum scores per user. Calculate percentile rank. If fewer than 10 qualifying users: show "You're one of our first players — check back soon for your percentile!"

### 8.3 Results Screen Layout

- Headline: "Final Stats: You're in the Top [X]%!"
- Score card: total score + per-round breakdown
- Progress bar showing percentile position
- Closing honesty check below score

### 8.4 Results Screen — No Tab-Away Modal

Tab-switch detection is disabled on the results screen. Switching away does not trigger a blur overlay or modal.

---

## 9. Closing Honesty Check

Shown below score card on results screen. Not gated.

**Question:** "Before you go, one last thing: Did you use any outside help or AI tools to solve these? Seriously — you can be totally honest, we won't get mad!"

| Value | Label |
|---|---|
| `solo` | 💯 Solo — all me |
| `assisted` | I used a little help / AI |

On click: save `honestyCheck` to Firestore, replace buttons with "Thank you! 🙏" message, then after 2.2 seconds reset session state (new `userId`, cleared `S`) and return to landing screen. Next play session will have `isReplay: true`.

---

## 10. Visual Design System

### 10.1 Typography

| Role | Font | Weight |
|---|---|---|
| Display / Headlines | Bricolage Grotesque | 800 |
| Body / UI | Space Grotesk | 400 / 500 / 600 / 700 |

### 10.2 Color Palette

| Token | Hex | Usage |
|---|---|---|
| Background primary | `#0f0720` | All screens |
| Background card | `#1e0a3c` / `#160830` gradient | Card surfaces |
| Background deep | `#0a0015` | Offset shadows |
| Accent purple | `#7c3aed` | Borders, focus states |
| Accent purple light | `#c084fc` | Highlights, selected states |
| Accent pink | `#f9a8d4` | Gradient end, error flash |
| Accent lavender | `#a78bfa` | Labels, secondary text |
| Text primary | `#e2d9f3` | Headlines, input text |
| Text secondary | `#c4b5fd` | Body copy, labels |
| Text muted | `rgba(196,181,253,0.55)` | Secondary hints, placeholder text |
| HARD label | `#f87171` with red glow | Difficulty text — hard group |
| EASY label | `#86efac` with green glow | Difficulty text — easy group |
| "Brain rot" slime | `#4ade80 → #a3e635` gradient | Landing headline accent |

### 10.3 Component Styles

**Primary CTA button:** Gradient `linear-gradient(135deg, #c084fc, #f0abfc, #f9a8d4)`, border-radius 100px, offset shadow div at `translate(4px, 5px)`, inner highlight `::before`.

**Check Answer / Submit Answer button (`.btn-check`):** Purple-pink gradient, dark text, offset shadow. On wrong answer: class `btn-wrong` applied — red background, shake + red glow animation, `pointer-events: none` for 1.4s. On correct: class `btn-correct` — green background. Classes reset automatically.

**Ghost button (`.btn-ghost`):** No background, white border, white text. Used for "I'd rather not participate" and "← Back" on survey. Always full opacity and white.

**Shape SVGs:** All polygon SVGs include a **white dot at the first vertex** (scaled to ~7% of shape size) as a rotation orientation indicator. The dot is omitted on the shape-type selector in Puzzle 3's left toolbar (where rotation is irrelevant) and on Puzzle 4 shapes (rotation irrelevant). The dot IS shown on sequence preview shapes, the live canvas, and rotation picker options.

**Puzzle 3 paint builder layout:**
- Left vertical bar: 4 shape tool buttons (shape type selector, no rotation indicator dot)
- Center: large canvas (max 190px square) showing live shape+color+rotation preview
- Right vertical bar: 6 color swatches
- Rotation strip below canvas: 6 buttons showing current shape+color at each candidate angle (with rotation indicator dot)

### 10.4 Pixel Scene (Puzzle Screens)

Every puzzle screen has a persistent pixel-art SVG behind the puzzle content (viewBox `0 0 580 520`, `preserveAspectRatio="xMidYMid meet"`):

- Moon and stars (top-left), drifting clouds, dense grass wall at bottom (grass tops at SVG y≈472)
- Tiny pixel flowers scattered along the grass
- **Two walking pixel llamas** — driven by `requestAnimationFrame` loop, bounce within SVG x=10–538 (grass bounds), never leave screen:
  - **Llama 1**: purple/pink saddle, starts at left, speed 7 SVG units/sec
  - **Llama 2**: teal/pink saddle, starts at right
  - Both flip horizontally to face their direction of travel
  - Both pause randomly (3–13 seconds) at each wall and after random mid-walk intervals (every 8–20 seconds of walking)
  - Persistent `window._llamaRaf` handle; cancelled and replaced on each new scene render

z-index: 0, pointer-events: none. `prefers-reduced-motion`: all animations frozen, llamas placed statically.

---

## 11. Technical Architecture

### 11.1 File Structure

```
/claude
├── index.html                      Single HTML shell
├── style.css                       Global styles — mobile-first
├── firebase-config.js              Firebase config (db = null until configured)
├── gameEngine.js                   All game logic, rendering, state machine
├── dataHandler.js                  All Firestore reads/writes
└── LogicChallenge_BuildSpec_v3.md  This document
```

### 11.2 State Object (`S`)

```js
{
  userId,         // string — Firebase uid or local fallback
  treatment,      // 'no_label' | 'hard_label' | 'easy_label'
  surveyAnswers,  // object keyed by question id
  surveyPage,     // int
  puzzleOrder,    // shuffled array of puzzle ids
  currentRound,   // int 0–4
  breaksTaken,    // int
  totalBreakTime, // float seconds
  completedLogs,  // array of round log objects
  ipAddress,      // string | null
  isReplay,       // bool — true if prior session detected in localStorage
  r,              // per-round state object (reset each round via makeRound())
}
```

`resetSession()` clears all fields, removes `sessionStorage.localUserId`, and is called after honesty check before returning to landing.

### 11.3 Key Functions

| Function | Responsibility |
|---|---|
| `go(renderFn)` | Screen transition — clears `#app`, calls render |
| `addAnimBg(app)` | Animated background for consent/survey/instructions/countdown |
| `makePixelScene()` | Returns SVG pixel diorama for puzzle screens |
| `showLabelCard(roundIdx)` | Renders round countdown with pause button and no-AI reminder |
| `showPuzzle(roundIdx)` | Renders puzzle screen with header, pixel scene, puzzle content |
| `makeSVGPolygon(sides, color, size, rotDeg, showDot)` | Returns polygon SVG; `showDot` adds rotation indicator |
| `genP3Sequence()` | Generates shape sequence using cycling rules |
| `genP4Puzzle()` | Returns fixed hybrid puzzle (Triangle=12, Square=16, Hexagon=24, Pentagon=?) |
| `btnFeedback(btn, correct, label)` | Animates button to red/shake or green, reverts after 1.4s |
| `logRound(sessionComplete)` | Builds and saves round telemetry to Firestore/localStorage |
| `resetSession()` | Clears `S`, removes session storage userId |
| `onStartChallenge()` | Treatment assignment, IP fetch, replay detection, user doc creation |
| `isAdminMode()` | Returns true if `lpc_admin` is set in localStorage |
| `setAdminBadge(on)` | Shows/hides the amber ADMIN indicator badge |

### 11.4 Auth Strategy

Firebase Anonymous Authentication for `userId`. Falls back to `local_` + random string stored in `sessionStorage`. `resetSession()` clears the sessionStorage key so each new play issues a fresh ID.

### 11.5 UI Requirements

- Mobile-first, works on 375px wide screens
- No browser-native alerts — all modals are custom
- Tab-switch blur covers 100% viewport
- All puzzle content horizontally centered
- Header constrained to `max-width: 480px` centered within full-width backdrop
