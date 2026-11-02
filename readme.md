# Kto zwinął?

Original grid-deduction puzzle game for the browser (mobile-first). Someone robbed a hidden safe in a house
(sometimes with a garden) or in a park — place every hero on the map (one per row and column) using the
statements about furniture, rooms and each other; the safe appears on the last free crossing and the thief
reveals themselves.

- Play: https://microphione.github.io/kto-zwinal/
- Rules (normative spec): [RULES.md](RULES.md) · Plan and status: [PLAN.md](PLAN.md)
- Tests: `npm test` (Node 22)
- Works offline after the first visit (PWA); tutorial, daily case, hints from the step solver (`src/steps.js`),
  drone hints on medium and harder cases.
