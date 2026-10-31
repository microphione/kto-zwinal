// Generates random cases off the main thread: an expert board can take over a second on a phone.
import { generatePuzzle } from '../src/generator.js';

onmessage = e => postMessage(generatePuzzle(e.data.seed, e.data.difficulty));
