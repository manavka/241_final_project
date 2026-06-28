Data Quality Verification Checklist

1. Treatment Balance

- [x] Distribution across no_label / hard_label / easy_label is roughly 33% each (expected variance is fine for small N, flag if one group is dramatically over/underrepresented)
- [x] Every users document has a treatment field with exactly one of those three string values — no nulls, no typos

2. Session Completeness

- [x] For each userId with sessionComplete: true rounds, confirm they have exactly 5 gameLogs docs
- [x] Users with any sessionComplete: false log should be flagged as dropouts and excluded from primary analysis
- [x] Every userId in gameLogs has a matching document in the users collection
- [x] treatment value in each gameLog matches the treatment in the corresponding users doc

3. Survey Fields

- [x] All 7 survey fields are present and non-null on every users doc: age, educationLevel, quantitativeExposure, energyLevel, puzzleFrequency, puzzleSkill, puzzleEnjoyment
- [x] age is an integer in the range 13–99
- [x] All Likert fields (quantitativeExposure, energyLevel, puzzleSkill, puzzleEnjoyment) are integers 1–5
- [x] Card-select fields (educationLevel, puzzleFrequency) contain only the expected option strings — no free-text garbage
- [ ] Note: The build spec lists fieldOfStudy as a survey field, but it is not implemented in the current code — do not expect it in the data

4. Round-Level Logic

- [x] roundNumber is an integer 1–5; no round number appears twice for the same userId
- [x] puzzleId is one of: puzzle_01, puzzle_02, puzzle_03, puzzle_04, puzzle_05
- [x] The 5 puzzle IDs for a user match the puzzleOrder array stored in their users doc
- [x] isSolved and didSkip are never both true on the same log
- [x] If isSolved: true, attemptCount ≥ 1
- [x] firstAnswerCorrect: true implies attemptCount is 1 (first submission was correct)
- [ ] If timeEngaged > 300, keptGoingAfterModal should NOT be null (modal must have fired)
- [x] timeEngaged > 0 for all logs where sessionComplete: true

5. Replay Detection

- [x] Flag all sessions where isReplay: true — these are return visitors and should be excluded from the primary analysis
- [x] Check for multiple userId entries sharing the same ipAddress — these may be the same person replaying despite the replay guard

6. Suspicious / Integrity Flags

- [ ] Flag logs with rapidGuesses > 0 (3+ submissions within 8 seconds) — potential low-effort or bot behavior
- [ ] Flag any user with timeEngaged < 10 on a solved puzzle — unusually fast solves may indicate cheating
- [x] Check rawSubmissionTimestamps array length matches attemptCount on each log
    consider making this a time diff? dont see how timestamps will help if we dont know when the question began(assuming its right on the first try)
- [ ] Check for localStorage fallback data: if you see userIds starting with local_, Firebase Auth failed for those users — their data is not in Firestore and cannot be recovered
    all users are local_, dont think this is relavant as users dont sign in 

7. Honesty Check

- [x] honestyCheck should be "solo" or "assisted" on completed sessions
- [x] Known bug: updateHonestyCheck has a TODO comment and the Firestore write is unimplemented — honestyCheck may be null for all users even after they answered. Verify against the actual Firestore data; if all values are null, this field cannot be used for exclusion
    fixed this bug-Manav

8. Outcome Variable Sanity

- [x] tabSwitchCount ≥ 0 and tabSwitchTimePaused ≥ 0 on every log
- [x] rageClicks and rapidGuesses ≥ 0
- [x] modalTimePaused is null if keptGoingAfterModal is also null (modal never fired)
- [ ] Scoring formula check on a random sample: roundScore = (isSolved ? 100 : 0) + max(0, 500 − timeEngaged) − (didSkip ? 50 : 0); total should be ≥ 0
    Not implemented

9. Device & Metadata

- [ ] deviceType is either "Mobile" or "Desktop" — no other values
    desktop is working
- [x] timestamp is a valid ISO 8601 datetime string
- [ ] Verify deviceType is recorded correctly by spot-checking a few entries — the detection logic (window.innerWidth < 768) runs at session start, so a phone in landscape mode could be misclassified as desktop.
 desktop is working

10. Failed Write Recovery

- [ ] Export the Firebase Firestore data and cross-check total session count against participant count from your recruitment channel
- [ ] Any discrepancy may indicate failed Firestore writes that fell back to localStorage — those records are not recoverable from Firestore

---
Priority order for analysis: Fix session completeness first (items 2–3), then replay exclusions (item 5), then treatment balance (item 1). Items 7 (honesty check bug) and 10 (failed writes) are the two most likely data loss risks.