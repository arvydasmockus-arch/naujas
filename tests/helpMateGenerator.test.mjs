import test from 'node:test';
import assert from 'node:assert/strict';
import { allWhitePiecesParticipate, countKeyMoves, getBlackNonKingSquares, getBlackPieceCountRange, getIdealHelpmateTwinLevel, hasHelpmateDual, hasInitialChessMaterial, hasRepeatedMatingPieceOnSameSquare, hasSameCompleteSolution, hasSameSolutionSet, hasIdealHelpmateTwinTheme, isGeneratedCandidate, removeFenPiece } from '../src/lib/helpMateGenerator.js';

test('help-mate solution counting counts distinct complete lines', () => {
  const groups = { play: ['1.Sf3-d4 Rh2-d2 2.Sd4-b5 Bf8-h6 #', '1.Sf3-d4 Rh2-h2 2.Sd4-c2 Bf8-h6 #', '1.Sf3-c5 Rh2-d2 2.Sc5-b3 Bf8-h6 #'] };
  assert.equal(countKeyMoves(groups), 3);
});

test('help-mate dual detection rejects repeated white play with different black moves', () => {
  const groups = { play: ['1.Sf3-d4 Rh2-d2 2.Sd4-b5 Bf8-h6 #', '1.Sf3-d4 Rh2-h2 2.Sd4-b5 Bf8-h6 #'] };
  assert.equal(hasHelpmateDual(groups), true);
  assert.equal(isGeneratedCandidate(groups, { solutionCount: 2, filters: ['exact-solutions', 'no-duals'] }), false);
});

test('different white mating play under distinct black moves is not a dual', () => {
  const groups = { play: ['1.Sf3-d4 Rh2-d2 2.Sd4-b5 Bf8-h6 #', '1.Sf3-d4 Rh2-h2 2.Sd4-c2 Bf8-h6 #'] };
  assert.equal(hasHelpmateDual(groups), false);
  assert.equal(isGeneratedCandidate(groups, { solutionCount: 2, filters: ['exact-solutions', 'no-duals'] }), true);
});

test('distinct key moves without duplicated replies pass the no-dual filter', () => {
  const groups = { play: ['1.Sf3-d4 Rh2-d2 2.Sd4-b5 Bf8-h6 #', '1.Sf3-c5 Rh2-h2 2.Sc5-b3 Bf8-h6 #'] };
  assert.equal(hasHelpmateDual(groups), false);
  assert.equal(isGeneratedCandidate(groups, { solutionCount: 2, theme: 'any' }), true);
});

test('allows several mates on the same square when different pieces deliver them', () => {
  const groups = { play: [
    '1...Bf8-h6 #',
    '1...Qd8-h6 #',
    '1...Rh8-h6 #'
  ] };
  const fen = 'k2q1b1r/8/8/8/8/8/8/K7';
  assert.equal(hasRepeatedMatingPieceOnSameSquare(fen, groups), false);
  assert.equal(isGeneratedCandidate(groups, { solutionCount: 3, filters: ['exact-solutions'] }, fen), true);
});

test('same-square mates by the same piece remain visible for judge review', () => {
  const groups = { play: [
    '1...Qd8-d7 2.Qd7-h6 #',
    '1...Qd8-e7 2.Qe7-h6 #'
  ] };
  const fen = 'k2q4/8/8/8/8/8/8/K7';
  assert.equal(countKeyMoves(groups), 2);
  assert.equal(hasRepeatedMatingPieceOnSameSquare(fen, groups), true);
  assert.equal(isGeneratedCandidate(groups, { solutionCount: 2, filters: ['exact-solutions'] }, fen), true);
});

test('sample-like repeated f8 mates remain visible independently of dual detection', () => {
  const groups = { play: [
    '1.Ke8-f7 Qa2-a3 2.Sg6-e5 Qa3-f8 #',
    '1.Ke8-f7 Qa2-a3 2.Sg6-f4 Qa3-f8 #',
    '1.Ke8-f7 Qa2-a3 2.Sg6-h8 Qa3-f8 #',
    '1.Ke8-f7 Qa2-a3 2.Sg6-f8 Qa3*f8 #',
    '1.Ke8-e7 Qa2-f2 2.Sg6-e5 Qf2-f8 #',
    '1.Ke8-e7 Qa2-f2 2.Sg6*h4 Qf2-f8 #',
    '1.Ke8-e7 Qa2-f2 2.Sg6-h8 Qf2-f8 #',
    '1.Ke8-e7 Qa2-f2 2.Sg6-f8 Qf2*f8 #'
  ] };
  assert.equal(hasHelpmateDual(groups), false);
  assert.equal(hasRepeatedMatingPieceOnSameSquare('4K3/8/6N1/8/8/8/q7/7k', groups), true);
  assert.equal(isGeneratedCandidate(groups, { solutionCount: 8, filters: ['exact-solutions'] }), true);
});

test('generated material stays within one original chess set per side', () => {
  assert.equal(hasInitialChessMaterial('k7/8/8/8/8/8/8/4K3'), true);
  assert.equal(hasInitialChessMaterial('k7/8/8/2B5/8/8/8/2B4K'), false);
  assert.equal(hasInitialChessMaterial('k7/8/8/8/8/8/8/QQ2K3'), false);
});

test('black non-king pieces can be removed one at a time and complete solutions compared', () => {
  const fen = 'k2q4/8/8/8/8/8/8/r3K3 w - - 0 1';
  const groups = { play: ['1...Qd8-d7 2.Ke1-f2 Ra1-a2 #'] };
  assert.deepEqual(getBlackNonKingSquares(fen), ['d8', 'a1']);
  assert.equal(removeFenPiece(fen, 'd8'), 'k7/8/8/8/8/8/8/r3K3 w - - 0 1');
  assert.equal(removeFenPiece(fen, 'a1'), 'k2q4/8/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(removeFenPiece(fen, 'a8'), null);
  assert.equal(hasSameCompleteSolution(groups, { play: ['1...Qd8-d7 2.Ke1-f2 Ra1-a2 #'] }), true);
  assert.equal(hasSameCompleteSolution(groups, { play: ['1...Qd8-d7 2.Ke1-f2 Ra1-a3 #'] }), false);
  assert.equal(hasSameCompleteSolution(groups, { play: [] }), false);
  assert.equal(hasSameSolutionSet(groups, { play: ['1...Qd8-d7 2.Ke1-f2 Ra1-a2 #'] }), true);
  assert.equal(hasSameSolutionSet(groups, { play: ['1...Qd8-d7 2.Ke1-f2 Ra1-a3 #'] }), false);
  assert.equal(hasSameSolutionSet(groups, { play: [] }), false);
});

test('white piece count stays exact while the selected black count is a minimum', () => {
  assert.deepEqual(getBlackPieceCountRange(2, 7, ['Q']), { minimum: 2, maximum: 2 });
  assert.deepEqual(getBlackPieceCountRange(2, 7, ['R', 'N']), { minimum: 2, maximum: 5 });
  assert.equal(getBlackPieceCountRange(4, 7, ['Q']), null);
});

test('ideal helpmate twin filter recognizes reciprocal White play and the stronger four-square example', () => {
  const firstFen = '8/8/8/6n1/8/3K1k2/6b1/5NB1 w - - 0 1';
  const first = { play: [
    '1.Kf3-f4 Sf1-e3 2.Bg2-f3 Bg1-h2 #',
    '1.Sg5-e4 Bg1-e3 2.Se4-g3 Sf1-h2 #',
  ] };
  const fourSquareFen = '8/8/2pp4/3k1r2/2b1p1q1/4K3/N2B4/8 w - - 0 1';
  const fourSquare = { play: [
    '1.Kd5-e5 Sa2-b4 2.Bc4-e6 Bd2-c3 #',
    '1.Rf5-e5 Bd2-b4 2.Qg4-e6 Sa2-c3 #',
  ] };
  assert.equal(getIdealHelpmateTwinLevel(first, firstFen), 1);
  assert.equal(hasIdealHelpmateTwinTheme(first, firstFen), true);
  assert.equal(getIdealHelpmateTwinLevel(fourSquare, fourSquareFen), 2);
  assert.equal(hasIdealHelpmateTwinTheme(fourSquare, fourSquareFen), true);
  assert.equal(hasIdealHelpmateTwinTheme({ play: [fourSquare.play[0]] }, fourSquareFen), false);
});

test('ideal helpmate twin distinguishes individual White pieces rather than piece types', () => {
  const twoKnightsFen = '7k/5br1/8/8/8/8/RB6/NN5K w - - 0 1';
  const differentKnights = { play: [
    '1.Na1-c2 Rg7-g6 2.Ra2-h2 Bf7-e6 #',
    '1.Nb1-c2 Bf7-e6 2.Bb2-h2 Rg7-g6 #',
  ] };
  assert.equal(getIdealHelpmateTwinLevel(differentKnights, twoKnightsFen), 1);

  const sameBishopFen = '7k/5br1/8/8/8/8/RB6/NN5K w - - 0 1';
  const sameBishop = { play: [
    '1.Bb2-c3 Rg7-g6 2.Ra2-h2 Bf7-e6 #',
    '1.Bb2-c3 Bf7-e6 2.Na1-h2 Rg7-g6 #',
  ] };
  assert.equal(getIdealHelpmateTwinLevel(sameBishop, sameBishopFen), 0);
});

test('every white non-king, non-pawn piece must control a square in the black king mating area', () => {
  const fen = '7k/8/8/8/8/8/1Q6/4K3';
  const participating = { play: ['1.Qb2-g7 Kh8-h7 2.Ke1-f2 Kh7-h8 #'] };
  const unusedKnight = { play: ['1.Qb2-g7 Kh8-h7 2.Ke1-f2 Kh7-h8 #'] };
  assert.equal(allWhitePiecesParticipate(fen, participating), true);
  assert.equal(allWhitePiecesParticipate('7k/8/8/8/8/8/1Q6/N3K3', unusedKnight), false);
});

test('the supplied three-line helpmate is accepted with exact three solutions and no duals', () => {
  const fen = '4Q3/1B6/5k2/6r1/8/8/4K3/8 w - - 0 1';
  const groups = { play: [
    '1.Kf6-g7 Bb7-e4 2.Kg7-h6 Qe8-h8 #',
    '1.Kf6-f5 Ke2-f2 2.Kf5-f4 Qe8-e4 #',
    '1.Kf6-f5 Bb7-c8 + 2.Kf5-f4 Qe8-e3 #'
  ] };
  assert.equal(countKeyMoves(groups), 3);
  assert.equal(allWhitePiecesParticipate(fen, groups), true);
  assert.equal(hasHelpmateDual(groups, fen), false);
  assert.equal(hasRepeatedMatingPieceOnSameSquare(fen, groups), false);
  assert.equal(isGeneratedCandidate(groups, { solutionCount: 3, filters: ['exact-solutions', 'no-duals'] }, fen), true);
});
