import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import createPopeye from '../src/lib/popeye/py.js';
import { buildPopeyeInput, parsePopeyeOutput, parseStipulation } from '../src/lib/popeyeSolver.js';
import { allWhitePiecesParticipate, countKeyMoves, getBlackNonKingSquares, hasSameSolutionSet, isGeneratedCandidate, removeFenPiece } from '../src/lib/helpMateGenerator.js';
import entries from './fixtures/tournamentEntries.json' with { type: 'json' };

const fen = '5b1N/nr1p1B1q/pPR2pp1/Rnp1k1p1/KP2p1P1/4Q3/4Nr2/6B1 w - - 0 1';
const normalized = (lines) => lines.map((line) => line.trim().replace(/\s+/g, ' ')).sort();

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
  assert.equal(isGeneratedCandidate(groups, { solutionCount: 1, theme: 'any' }), true);
});

test('the corrected eight-corner twin position has exactly one h#2 solution in every variant', async () => {
  globalThis.self = { location: { href: 'http://localhost/popeyeWorker.js' } };
  const wasmBinary = fs.readFileSync(new URL('../public/popeye/py.wasm', import.meta.url));
  const output = [];
  const popeye = await createPopeye({ noInitialRun: true, wasmBinary, print: (line) => output.push(line), printErr: (line) => output.push(line) });
  const base = '8/3p1q2/3np1b1/1pR5/4k1p1/1P4p1/n2K2p1/7N';
  const expected = {
    'N@h1': '1.g2-g1=B Rc5-f5 2.Bg1-d4 Sh1*g3 #',
    'N@a1': '1.Ke4-d4 b3-b4 2.Bg6-e4 Sa1-b3 #',
    'N@a8': '1.e6-e5 Rc5-c4 + 2.Ke4-d5 Sa8-c7 #',
    'N@h8': '1.Qf7-f3 Rc5-e5 + 2.Ke4-f4 Sh8*g6 #',
    'B@h1': '1.Ke4-f3 Rc5-c1 2.Bg6-e4 Rc1-f1 #',
    'B@a1': '1.Sa2-c3 Rc5-e5 + 2.Ke4-d4 Ba1*c3 #',
    'B@a8': '1.Ke4-f4 Rc5-d5 2.Kf4-f3 Rd5-f5 #',
    'B@h8': '1.Qf7-f3 Rc5-d5 2.Bg6-f5 Rd5-d4 #',
  };

  function placeCornerPiece(piece, square) {
    const board = base.split('/').map((rank) => {
      const expanded = [];
      for (const char of rank) {
        if (/\d/.test(char)) expanded.push(...Array(Number(char)).fill(''));
        else expanded.push(char);
      }
      return expanded;
    });
    board[7][7] = '';
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    board[7 - rank][file] = piece;
    return board.map((row) => {
      let empty = 0;
      let result = '';
      for (const cell of row) {
        if (!cell) empty += 1;
        else {
          if (empty) result += empty;
          result += cell;
          empty = 0;
        }
      }
      if (empty) result += empty;
      return result;
    }).join('/') + ' w - - 0 1';
  }

  for (const [variant, solution] of Object.entries(expected)) {
    output.length = 0;
    const [piece, square] = variant.split('@');
    const position = placeCornerPiece(piece, square);
    popeye.FS.writeFile('/test-corner-twin.inp', `BeginProblem\n${buildPopeyeInput(position, 'h2')}\nEndProblem`);
    popeye.callMain(['-maxmem', '512M', '-maxtime', '3', '/test-corner-twin.inp']);
    const groups = parsePopeyeOutput(output.join('\n'), 'h2');

    assert.equal(countKeyMoves(groups), 1, `${variant} (${position}) should have exactly one solution`);
    assert.deepEqual(groups.play.map((line) => line.trim().replace(/\s+/g, ' ')), [solution], `${variant} should retain its expected solution`);
  }
});

test('both supplied reciprocal ideal-mate examples pass the participation and black-piece necessity checks', async () => {
  globalThis.self = { location: { href: 'http://localhost/popeyeWorker.js' } };
  let activeOutput = null;
  const wasmBinary = fs.readFileSync(new URL('../public/popeye/py.wasm', import.meta.url));
  const popeye = await createPopeye({ noInitialRun: true, wasmBinary, print: (line) => activeOutput?.push(line), printErr: (line) => activeOutput?.push(line) });
  const examples = [
    {
      fen: '8/8/8/6n1/8/3K1k2/6b1/5NB1 w - - 0 1',
      solutions: ['1.Kf3-f4 Sf1-e3 2.Bg2-f3 Bg1-h2 #', '1.Sg5-e4 Bg1-e3 2.Se4-g3 Sf1-h2 #'],
    },
    {
      fen: '8/8/2pp4/3k1r2/2b1p1q1/4K3/N2B4/8 w - - 0 1',
      solutions: ['1.Kd5-e5 Sa2-b4 2.Bc4-e6 Bd2-c3 #', '1.Rf5-e5 Bd2-b4 2.Qg4-e6 Sa2-c3 #'],
    },
  ];
  const solve = (fen) => {
    activeOutput = [];
    popeye.FS.writeFile('/test-ideal-twin.inp', `BeginProblem\n${buildPopeyeInput(fen, 'h2')}\nEndProblem`);
    popeye.callMain(['-maxmem', '512M', '/test-ideal-twin.inp']);
    const groups = parsePopeyeOutput(activeOutput.join('\n'), 'h2');
    activeOutput = null;
    return groups;
  };

  for (const { fen: position, solutions } of examples) {
    const groups = solve(position);
    assert.deepEqual(normalized(groups.play), normalized(solutions));
    assert.equal(allWhitePiecesParticipate(position, groups), true);
    for (const square of getBlackNonKingSquares(position)) {
      assert.equal(hasSameSolutionSet(groups, solve(removeFenPiece(position, square))), false, `${position}: removing ${square} must change the complete solution set`);
    }
  }
});

test('Popeye output preserves both complete queen-versus-king h#2 lines', async () => {
  globalThis.self = { location: { href: 'http://localhost/popeyeWorker.js' } };
  const output = [];
  const wasmBinary = fs.readFileSync(new URL('../public/popeye/py.wasm', import.meta.url));
  const popeye = await createPopeye({ noInitialRun: true, wasmBinary, print: (line) => output.push(line), printErr: (line) => output.push(line) });
  const position = '8/8/8/7k/4K3/Q7/8/8 w - - 0 1';
  popeye.FS.writeFile('/test-h2-two-keys.inp', `BeginProblem\n${buildPopeyeInput(position, 'h2')}\nEndProblem`);
  popeye.callMain(['-maxmem', '512M', '/test-h2-two-keys.inp']);
  const groups = parsePopeyeOutput(output.join('\n'), 'h2');

  assert.equal(countKeyMoves(groups), 2);
});

test('Popeye output counts complete lines for minimal queen-versus-king material', async () => {
  globalThis.self = { location: { href: 'http://localhost/popeyeWorker.js' } };
  const output = [];
  const wasmBinary = fs.readFileSync(new URL('../public/popeye/py.wasm', import.meta.url));
  const popeye = await createPopeye({ noInitialRun: true, wasmBinary, print: (line) => output.push(line), printErr: (line) => output.push(line) });
  const position = '8/8/4Q3/8/8/7K/8/7k w - - 0 1';
  popeye.FS.writeFile('/test-h2-one-key.inp', `BeginProblem\n${buildPopeyeInput(position, 'h2')}\nEndProblem`);
  popeye.callMain(['-maxmem', '512M', '/test-h2-one-key.inp']);
  const groups = parsePopeyeOutput(output.join('\n'), 'h2');

  assert.equal(countKeyMoves(groups), 40);
});

test('Popeye worker output callback can route results from repeated calls to the active search', async () => {
  globalThis.self = { location: { href: 'http://localhost/popeyeWorker.js' } };
  let activeOutput = null;
  const wasmBinary = fs.readFileSync(new URL('../public/popeye/py.wasm', import.meta.url));
  const popeye = await createPopeye({ noInitialRun: true, wasmBinary, print: (line) => activeOutput?.push(line), printErr: (line) => activeOutput?.push(line) });
  const position = '8/8/4Q3/8/8/7K/8/7k w - - 0 1';
  const outputs = [];
  activeOutput = outputs;
  popeye.FS.writeFile('/test-h2-routed-output.inp', `BeginProblem\n${buildPopeyeInput(position, 'h2')}\nEndProblem`);
  popeye.callMain(['-maxmem', '512M', '/test-h2-routed-output.inp']);
  activeOutput = null;

  assert.ok(outputs.length > 0);
  assert.equal(countKeyMoves(parsePopeyeOutput(outputs.join('\n'), 'h2')), 40);
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
