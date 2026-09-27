# Adaptive Run Coach — V1 Final

A mobile-first installable PWA for an adaptive running coach.

## Core loop

**Check in → Get prescription → Run with Nike Run Club → Report back → Tomorrow adapts.**

The app is intentionally local-first. Training history is stored on the device. Use **Settings → Export my training data** for a JSON backup.

## Features

- First-launch athlete setup
- Daily energy, legs, pain, time and cross-training check-in
- Minimum / target / optional mileage
- Recent 3/7/30-day training context
- Training-load status and guardrails
- Consistency, HYROX, Marathon, Mountain / Hybrid and General Fitness modes
- Goal/race date countdown
- Post-run distance, effort and post-run leg feedback
- Editable/deletable run history
- Streaks and recent mileage
- Conversational coach
- Coach philosophy / structured memory notes
- Local JSON export/import backup
- Offline service worker
- Installable Home Screen PWA
- NRC handoff for recording on Apple Watch

## Important V1 limitation

A Safari PWA cannot directly read Apple Health/HealthKit in the same way a native iOS app can. V1 therefore treats Nike Run Club on Apple Watch as the recorder and asks you to confirm the completed run. A future native bridge can automate HealthKit import without changing the coaching model.

## GitHub Pages

1. Create a GitHub repository named `adaptive-run-coach`.
2. Upload the **contents** of this folder to the repository root.
3. Go to **Settings → Pages**.
4. Select **Deploy from a branch**, branch `main`, folder `/ (root)`.
5. Open the resulting Pages URL in Safari on your iPhone.
6. Use **Share → Add to Home Screen**.

No API keys or secrets are required.
