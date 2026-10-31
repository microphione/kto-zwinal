// The service worker precaches every shipped file (an addAll miss would block every later update).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);

test('sw.js SHELL lists exactly the files the app needs, and they all exist', () => {
  const sw = readFileSync(new URL('sw.js', root), 'utf8');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const file of shell) if (file !== './') assert.ok(existsSync(new URL(file, root)), `missing ${file}`);
  const shipped = ['src', 'ui', 'puzzles', 'icons'].flatMap(dir => readdirSync(new URL(`${dir}/`, root)).map(f => `${dir}/${f}`));
  for (const file of [...shipped, 'index.html', 'manifest.webmanifest', 'css/style.css']) assert.ok(shell.includes(file), `not precached: ${file}`);
});
