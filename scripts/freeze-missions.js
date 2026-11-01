// Writes the fixed missions to puzzles/*.json so later generator changes cannot alter them.
// The JSON is the source of truth (a later generator may no longer reproduce it from the seeds) and saved
// progress is keyed by mission id, so existing files are never overwritten. Each rules version (v2 hidden safe,
// v3 rows and columns) replaced the older files on purpose: they were deleted and frozen again from the same
// seeds (PLAN.md stages 8 and 9).
import { writeFileSync, existsSync } from 'node:fs';
import { generatePuzzle } from '../src/generator.js';

export const MISSIONS = [
  { id: 'misja-1', seed: 'misja-1', difficulty: 'easy', title: 'Pierwszy skok' },
  { id: 'misja-2', seed: 'misja-2', difficulty: 'medium', title: 'Akcja w bazie' },
];

if (process.argv[1].endsWith('freeze-missions.js')) {
  for (const m of MISSIONS) {
    const file = new URL(`../puzzles/${m.id}.json`, import.meta.url);
    if (existsSync(file)) {
      console.log(m.id, 'exists, kept');
      continue;
    }
    const puzzle = { ...generatePuzzle(m.seed, m.difficulty), id: m.id, title: m.title };
    writeFileSync(file, JSON.stringify(puzzle, null, 1) + '\n');
    console.log(m.id, m.difficulty, puzzle.statements.length, 'statements, thief', puzzle.heroes[puzzle.thief].name);
  }
}
