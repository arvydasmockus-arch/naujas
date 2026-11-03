import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import createPopeye from '../src/lib/popeye/py.js';
import { buildPopeyeInput, parsePopeyeOutput, parseStipulation } from '../src/lib/popeyeSolver.js';
import entries from './fixtures/tournamentEntries.json' with { type: 'json' };

const fen = '5b1N/nr1p1B1q/pPR2pp1/Rnp1k1p1/KP2p1P1/4Q3/4Nr2/6B1 w - - 0 1';
const normalized = (lines) => lines.map((line) => line.trim()).sort();

function fenFromEntry(entry) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(''));
  for (const color of ['white', 'black']) {
    for (const piece of entry.algebraic[color]) {
      const square = piece.slice(-2);
      let name = piece.slice(0, -2)[0];
      if (name === 'S') name = 'N';
      board[8 - Number(square[1])][square.charCodeAt(0) - 97] = color === 'white' ? name : name.toLowerCase();
    }
  }
  const rows = board.map((row) => {
    let empty = 0;
    let text = '';
    for (const piece of row) {
      if (!piece) empty += 1;
      else { if (empty) text += empty; text += piece; empty = 0; }
    }
    if (empty) text += empty;
    return text;
  });
  return rows.join('/') + ' w - - 0 1';
}

test('Popeye input translates FEN knights to Popeye knight notation and accepts arbitrary directmate lengths', () => {
  const input = buildPopeyeInput(fen, '#6');
  assert.match(input, /Stipulation #6/);
  assert.match(input, /Forsyth 5b1S\/sr1p1B1q\/pPR2pp1\/Rsp1k1p1\/KP2p1P1\/4Q3\/4Sr2\/6B1/);
  assert.match(input, /Option MoveNumbers Try Set Variation/);
  assert.match(buildPopeyeInput(fen, 'h3'), /Stipulation h#3/);
  assert.match(buildPopeyeInput(fen, 's#3'), /Stipulation s#3/);
  assert.deepEqual(parseStipulation('h#3'), { type: 'h#', moves: 3, normalized: 'h#3' });
  assert.throws(() => buildPopeyeInput(fen, 'h#n'), /such as/);
  assert.throws(() => buildPopeyeInput(fen, '#0'), /between 1 and 99/);
});

test('selfmate refutations stay with their try and helpmate set lines stay separate from white keys', () => {
  const selfmate = parsePopeyeOutput([
    '1...a2-a3',
    '  2.b2-b3',
    '1 (Set play Time = 0.00 sec)',
    '1.a2-a4 !',
    '  1...b2-b4',
    '    2.c2-c4',
    '1.c2-c3 ?',
    '  1...d2-d4 !',
    '    2.e2-e4',
  ].join('\n'), 's3');

  assert.deepEqual(normalized(selfmate.play), normalized(['1.a2-a4 !', '1...b2-b4', '2.c2-c4']));
  assert.deepEqual(normalized(selfmate.tries), normalized(['1.c2-c3 ?', '1...d2-d4 !', '2.e2-e4']));
  assert.deepEqual(normalized(selfmate.setPlay), normalized(['1...a2-a3', '2.b2-b3']));

  const helpmate = parsePopeyeOutput([
    '  1.a2-a3 !',
    '    1...b2-b3',
    '      2.c2-c3 #',
    '2 (Black set line Time = 0.01 sec)',
    '  1...d2-d3 !',
    '    2.e2-e3 #',
    '3 (White key move Time = 0.02 sec)',
    '  1.Sf1-g3 !',
    '    1...Re1-f1 +',
  ].join('\n'), 'h3');
  assert.deepEqual(normalized(helpmate.play), normalized(['1.Sf1-g3 !', '1...Re1-f1 +']));
  assert.deepEqual(normalized(helpmate.setPlay), normalized(['1.a2-a3 !', '1...b2-b3', '2.c2-c3 #', '1...d2-d3 !', '2.e2-e3 #']));
});

test('the supplied h#2 position puts six black-started set lines before its white-started key', async () => {
  globalThis.self = { location: { href: 'http://localhost/popeyeWorker.js' } };
  const output = [];
  const wasmBinary = fs.readFileSync(new URL('../public/popeye/py.wasm', import.meta.url));
  const popeye = await createPopeye({ noInitialRun: true, wasmBinary, print: (line) => output.push(line), printErr: (line) => output.push(line) });
  popeye.FS.writeFile('/test-h2-set.inp', `BeginProblem\n${buildPopeyeInput('B4B1b/8/8/4P3/8/4kn2/7R/K7 w - - 0 1', 'h2')}\nEndProblem`);
  popeye.callMain(['-maxmem', '512M', '/test-h2-set.inp']);
  const groups = parsePopeyeOutput(output.join('\n'), 'h2');

  assert.equal(groups.setPlay.length, 6);
  assert.ok(groups.setPlay.every((line) => /^\s*1\.\.\.Rh2-d2/.test(line)));
  assert.ok(groups.setPlay.some((line) => line.includes('2.Sf3-e1 Bf8-h6 #')));
  assert.deepEqual(groups.play.map((line) => line.trim()), ['1.Sf3-d4 Rh2-d2   2.Sd4-b5 Bf8-h6 #']);
});

test('Popeye WASM returns the Olive Key, Try and Set for the supplied #2 position', async () => {
  globalThis.self = { location: { href: 'http://localhost/popeyeWorker.js' } };
  const output = [];
  const wasmBinary = fs.readFileSync(new URL('../public/popeye/py.wasm', import.meta.url));
  const popeye = await createPopeye({ noInitialRun: true, wasmBinary, print: (line) => output.push(line), printErr: (line) => output.push(line) });
  popeye.FS.writeFile('/test.inp', `BeginProblem\n${buildPopeyeInput(fen, '#2')}\nEndProblem`);
  popeye.callMain(['-maxmem', '512M', '/test.inp']);
  const groups = parsePopeyeOutput(output.join('\n'), '#2');

  assert.deepEqual(normalized(groups.play), normalized([
    '1.Qe3-b3 ! threat:', '2.Qb3-d5 #',
    '1...Rf2*e2', '2.Qb3-g3 #',
    '1...Sb5-c3 +', '2.Qb3*c3 #',
    '1...Sb5-c7', '2.Qb3-b2 #', '2.Qb3-c3 #',
    '1...c5-c4', '2.Qb3-c3 #',
    '1...d7*c6', '2.Qb3-e6 #',
    '1...Qh7*f7', '2.Sh8*f7 #',
  ]));
  assert.deepEqual(normalized(groups.tries), normalized([
    '1.Bg1-h2 + ?', '1...Rf2*h2', '2.Qe3-g3 #', '1...Qh7*h2', '2.Sh8*g6 #', 'but', '1...Rf2-f4 !',
    '1.Qe3*c5 + ?', '1...d7-d5', '2.Rc6-e6 #', '2.Qc5*d5 #', 'but', '1...Bf8*c5 !',
    '1.Qe3-c3 + ?', '1...Sb5-d4', '2.Qc3*d4 #', 'but', '1...Sb5*c3 + !',
    '1.Qe3*e4 + ?', 'but', '1...Ke5*e4 !',
    '1.Qe3-g3 + ?', 'but', '1...Rf2-f4 !',
    '1.Rc6-e6 + ?', '1...Ke5-d5', '2.Qe3*e4 #', 'but', '1...d7*e6 !',
    '1.Sh8*g6 + ?', 'but', '1...Qh7*g6 !',
  ]));
  assert.deepEqual(normalized(groups.setPlay), normalized([
    '1...Rf2*e2', '2.Qe3-g3 #',
    '1...Rf2-h2', '2.Qe3-g3 #',
    '1...Sb5-a3', '2.Qe3-d4 #', '2.Qe3-c3 #',
    '1...Sb5-c3 +', '2.Qe3*c3 #',
    '1...Sb5-c7', '2.Qe3-d4 #', '2.Qe3-c3 #',
    '1...Sb5-d4', '2.Qe3*d4 #',
    '1...Sb5-d6', '2.Rc6*c5 #', '2.Ra5*c5 #', '2.Qe3*c5 #', '2.Qe3-d4 #', '2.Qe3-c3 #',
    '1...c5*b4', '2.Qe3-d4 #',
    '1...c5-c4', '2.Qe3-d4 #', '2.Qe3-c3 #',
    '1...d7-d5', '2.Rc6-e6 #',
    '1...Qh7-h1', '2.Sh8*g6 #',
    '1...Qh7-h2', '2.Sh8*g6 #',
    '1...Qh7-h3', '2.Sh8*g6 #',
    '1...Qh7-h4', '2.Sh8*g6 #',
  ]));
  assert.ok(![...groups.play, ...groups.tries, ...groups.setPlay].some((line) => line.includes('Ne2-c1')));
});

test('Popeye solves published #3 and #4 positions with their expected keys', async () => {
  globalThis.self = { location: { href: 'http://localhost/popeyeWorker.js' } };
  const wasmBinary = fs.readFileSync(new URL('../public/popeye/py.wasm', import.meta.url));
  for (const stipulation of ['#3', '#4']) {
    const entry = entries.find((item) => item.stipulation === stipulation && /^\s*1\.(?!\.)/.test(item.solution));
    const output = [];
    const popeye = await createPopeye({ noInitialRun: true, wasmBinary, print: (line) => output.push(line), printErr: (line) => output.push(line) });
    popeye.FS.writeFile('/test.inp', `BeginProblem\n${buildPopeyeInput(fenFromEntry(entry), stipulation)}\nEndProblem`);
    popeye.callMain(['-maxmem', '512M', '/test.inp']);
    const groups = parsePopeyeOutput(output.join('\n'), stipulation);
    const expectedKey = entry.solution.match(/1\.[^\n]+/)?.[0].trim();
    assert.ok(groups.play.some((line) => line.trim() === expectedKey), `${stipulation}: missing expected key ${expectedKey}`);
  }
});
