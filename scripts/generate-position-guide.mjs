import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const root = process.cwd();
const output = path.join(root, 'public', 'position-analysis-guide-en.pdf');
const regularFont = process.platform === 'win32'
  ? 'C:/Windows/Fonts/arial.ttf'
  : process.platform === 'darwin'
    ? '/System/Library/Fonts/Supplemental/Arial.ttf'
    : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const boldFont = process.platform === 'win32'
  ? 'C:/Windows/Fonts/arialbd.ttf'
  : process.platform === 'darwin'
    ? '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
    : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

if (!fs.existsSync(regularFont) || !fs.existsSync(boldFont)) {
  throw new Error(`A Unicode font is required to generate the guide. Checked: ${regularFont}`);
}
fs.mkdirSync(path.dirname(output), { recursive: true });

const doc = new PDFDocument({ size: 'A4', margins: { top: 48, right: 48, bottom: 48, left: 48 }, info: {
  Title: 'ML Academy Position Analysis User Guide',
  Author: 'ML Academy',
  Subject: 'How to set up, analyze, solve and save chess positions',
} });
doc.pipe(fs.createWriteStream(output));
doc.registerFont('Guide', regularFont).registerFont('Guide-Bold', boldFont);

const pageWidth = doc.page.width;
const margin = 48;
const contentWidth = pageWidth - margin * 2;
const ink = '#252932';
const muted = '#69716a';
const green = '#426c47';
const pale = '#eef3eb';
const line = '#dce3da';
let y = 0;
let pageNumber = 0;

function addPage(section, title, subtitle = '') {
  if (pageNumber) doc.addPage();
  pageNumber += 1;
  doc.rect(0, 0, pageWidth, 11).fill(green);
  doc.font('Guide-Bold').fontSize(8).fillColor(green).text(`ML ACADEMY  /  ${section.toUpperCase()}`, margin, 39, { characterSpacing: 1 });
  y = 66;
  doc.font('Guide-Bold').fontSize(pageNumber === 1 ? 29 : 23).fillColor(ink).text(title, margin, y, { width: contentWidth });
  y = doc.y + 7;
  if (subtitle) {
    doc.font('Guide').fontSize(11).fillColor(muted).text(subtitle, margin, y, { width: contentWidth, lineGap: 3 });
    y = doc.y + 12;
  } else y += 7;
  doc.moveTo(margin, 770).lineTo(pageWidth - margin, 770).lineWidth(0.6).strokeColor(line).stroke();
  doc.font('Guide').fontSize(8).fillColor(muted).text('Position Analysis · ML Academy', margin, 778, { lineBreak: false });
  doc.text(String(pageNumber), pageWidth - margin - 20, 778, { width: 20, align: 'right', lineBreak: false });
}

function paragraph(text, options = {}) {
  const fontSize = options.fontSize || 10;
  doc.font(options.bold ? 'Guide-Bold' : 'Guide').fontSize(fontSize).fillColor(options.color || ink);
  doc.text(text, options.x ?? margin, options.y ?? y, {
    width: options.width ?? contentWidth,
    lineGap: options.lineGap ?? 3,
    align: options.align || 'left',
  });
  y = doc.y + (options.gap ?? 7);
  return y;
}

function heading(text, options = {}) {
  doc.font('Guide-Bold').fontSize(options.size || 13).fillColor(options.color || green).text(text, options.x ?? margin, options.y ?? y, { width: options.width ?? contentWidth });
  y = doc.y + (options.gap ?? 4);
}

function callout(label, text, tone = 'green') {
  const fill = tone === 'amber' ? '#fbf3e6' : pale;
  const accent = tone === 'amber' ? '#bc8540' : green;
  doc.font('Guide-Bold').fontSize(10).fillColor(ink);
  const labelHeight = doc.heightOfString(label, { width: contentWidth - 32 });
  doc.font('Guide').fontSize(9.5);
  const textHeight = doc.heightOfString(text, { width: contentWidth - 32, lineGap: 2 });
  const height = labelHeight + textHeight + 25;
  doc.roundedRect(margin, y, contentWidth, height, 7).fill(fill);
  doc.rect(margin, y, 4, height).fill(accent);
  doc.font('Guide-Bold').fontSize(10).fillColor(ink).text(label, margin + 16, y + 10, { width: contentWidth - 32 });
  doc.font('Guide').fontSize(9.5).fillColor(ink).text(text, margin + 16, doc.y + 3, { width: contentWidth - 32, lineGap: 2 });
  y += height + 11;
}

function step(number, title, text) {
  doc.circle(margin + 11, y + 9, 10).fill(green);
  doc.font('Guide-Bold').fontSize(9).fillColor('#ffffff').text(String(number), margin + 6, y + 3, { width: 10, align: 'center' });
  doc.font('Guide-Bold').fontSize(10.5).fillColor(ink).text(title, margin + 31, y, { width: contentWidth - 31 });
  const titleBottom = doc.y;
  doc.font('Guide').fontSize(9.5).fillColor(ink).text(text, margin + 31, titleBottom + 3, { width: contentWidth - 31, lineGap: 2 });
  y = doc.y + 9;
}

function card(title, text, x, top, width) {
  doc.font('Guide-Bold').fontSize(10.5);
  const titleHeight = doc.heightOfString(title, { width: width - 24 });
  doc.font('Guide').fontSize(9.2);
  const textHeight = doc.heightOfString(text, { width: width - 24, lineGap: 2 });
  const height = titleHeight + textHeight + 25;
  doc.roundedRect(x, top, width, height, 6).fillAndStroke('#ffffff', line);
  doc.font('Guide-Bold').fontSize(10.5).fillColor(green).text(title, x + 12, top + 10, { width: width - 24 });
  doc.font('Guide').fontSize(9.2).fillColor(ink).text(text, x + 12, doc.y + 4, { width: width - 24, lineGap: 2 });
  return height;
}

addPage('Quick user guide', 'Position Analysis', 'How to set up or import a chess position, analyze it with an engine, find a problem solution, and save your work.');
callout('Quick workflow', 'Set up the pieces or import a position → choose whose turn it is → review Stockfish analysis or enter a stipulation and click “Show answers” → save the position if you want to return to it later.');
heading('Two separate tools');
paragraph('Best lines uses Stockfish to evaluate a chess position. Show answers uses Popeye to solve a chess problem using the selected stipulation. An engine evaluation does not confirm a problem solution.', { gap: 15 });
heading('What this guide covers');
paragraph('1. Board and pieces   ·   2. FEN and image import   ·   3. Stockfish analysis   ·   4. Popeye answers   ·   5. Saving and exporting positions.', { color: muted, gap: 15 });
const boardX = margin;
const boardY = y + 3;
const boardSize = 148;
const squareSize = boardSize / 8;
for (let rank = 0; rank < 8; rank += 1) {
  for (let file = 0; file < 8; file += 1) {
    doc.rect(boardX + file * squareSize, boardY + rank * squareSize, squareSize, squareSize)
      .fill((rank + file) % 2 ? '#b58863' : '#f0d9b5');
  }
}
doc.roundedRect(boardX, boardY, boardSize, boardSize, 2).lineWidth(1.5).strokeColor('#70563e').stroke();
const bx = boardX + boardSize + 24;
const bw = contentWidth - boardSize - 24;
let boardTextY = boardY + 5;
for (const [title, text] of [
  ['Build a diagram', 'Place, drag, or remove pieces, then set the side to move.'],
  ['Analyze a position', 'Read evaluations and click moves to inspect engine lines.'],
  ['Solve a problem', 'Enter a stipulation and review Key, Try, and Set variations.'],
]) {
  doc.font('Guide-Bold').fontSize(11).fillColor(green).text(title, bx, boardTextY, { width: bw });
  doc.font('Guide').fontSize(9.5).fillColor(ink).text(text, bx, doc.y + 3, { width: bw, lineGap: 2 });
  boardTextY = doc.y + 12;
}
y = boardY + boardSize + 16;
callout('First check', 'Confirm the diagram and side to move before you compare analysis or problem solutions.', 'amber');

addPage('01 · Set up a position', 'Board and pieces', 'Create a diagram directly on the board or load one from FEN or an image.');
step(1, 'Place a piece', 'Select a white or black piece from the side panel, then click a square. You can also drag a piece onto the board. Dropping onto an occupied square replaces the piece there.');
step(2, 'Move or remove a piece', 'Drag a piece already on the board to another square. To remove one, click Erase and select its square, or right-click the piece.');
step(3, 'Set the side to move', 'Choose White to move or Black to move in the controls. This determines who starts the solution and engine analysis.');
heading('Board controls');
const gap = 10;
const cardWidth = (contentWidth - gap) / 2;
let rowY = y;
const h1 = card('Starting position', 'Restores the standard chess starting position with White to move.', margin, rowY, cardWidth);
const h2 = card('Clear board', 'Removes every piece. Use it to build a diagram from scratch.', margin + cardWidth + gap, rowY, cardWidth);
y = rowY + Math.max(h1, h2) + gap;
rowY = y;
const h3 = card('Flip board', 'Changes the board orientation without changing the position or side to move.', margin, rowY, cardWidth);
const h4 = card('FEN', 'Paste a FEN position and click Load or press Enter. The copy button copies the current position.', margin + cardWidth + gap, rowY, cardWidth);
y = rowY + Math.max(h3, h4) + 13;
callout('FEN tip', 'You can paste only the board layout or a full FEN string. A full FEN also sets whose turn it is. If it fails to load, check spaces, digits, and slashes.', 'amber');
heading('Import from an image');
paragraph('Click OCR. Choose an image file, drag it into the dialog, or copy an image and paste with Ctrl+V. On mobile, choose a picture from your gallery. The dialog shows both the original image and the recognized board. Click the board you want to load, then compare the pieces with the original because OCR can make mistakes.');

addPage('02 · Stockfish analysis', '“Best lines”', 'Stockfish automatically analyzes the current board. The analysis restarts when you change a piece or the side to move.');
let top = y;
const a1 = card('Evaluation', 'A number with + or − estimates the position advantage in pawns. Positive values favor White; negative values favor Black.', margin, top, cardWidth);
const a2 = card('Mate score', 'A score such as #3 means the engine found a forced mate in the indicated number of moves.', margin + cardWidth + gap, top, cardWidth);
y = top + Math.max(a1, a2) + gap;
top = y;
const a3 = card('Show lines', 'Choose between one and five variations. Each line shows a continuation found by the engine.', margin, top, cardWidth);
const a4 = card('Depth', 'Shows how many half-moves the engine has searched. Deeper analysis usually takes longer and can change the evaluation.', margin + cardWidth + gap, top, cardWidth);
y = top + Math.max(a3, a4) + 15;
step(1, 'Click a move in a line', 'The board shows the position after that move. Use this to inspect a variation. To return, rebuild the position, load its FEN, or reopen it from Saved Problems.');
step(2, 'Restart the engine', 'If the engine stops responding, click Restart engine. You can also turn the engine off and back on when analysis is not needed.');
callout('Important', '“No mate found at this depth” only means the current search did not find mate. It does not prove that no solution exists. Use the separate Popeye section to solve a chess problem.', 'amber');
heading('Check the position');
paragraph('Make sure both kings are present, pieces are on the intended squares, and the side to move is correct. The engine cannot analyze an invalid position.');

addPage('03 · Problem solving and archive', '“Show answers”', 'Use Popeye to solve a position for a selected chess-problem stipulation.');
step(1, 'Enter the stipulation', 'In Stipulation, enter the problem type, for example #2, #3, #n, h#2, or s#3. Check whose turn it is on the board.');
step(2, 'Click Show answers', 'Popeye solves the position for the selected stipulation. For h# positions, solving starts automatically when the stipulation changes; for other types, click the button again.');
step(3, 'Review the variations', 'For direct-mate problems, Key shows the key move and solution lines, Try shows attempts refuted by Black, and Set shows prepared play without the key move. The number on a tab is the count of lines found.');
step(4, 'Click a move', 'Moves in the answer are interactive. Click one to show the resulting position on the board and follow the variation.');
callout('If an answer looks unexpected', 'Check the board, side to move, and stipulation. Problem solving and Stockfish analysis are separate tools.', 'amber');
heading('Save and return later');
paragraph('Click Save to add the current position to the archive. When signed in, it is linked to your account. When signed out, it is saved only in this browser profile.', { gap: 5 });
paragraph('Open Saved Problems and select an entry to restore it to the board. Remove an entry with the × button. Download .olv from the archive panel to export positions in Olive collection format.', { gap: 5 });
paragraph('Account and browser archives are separate. Positions saved to an account are associated with that creator; guest positions are not shared with other users.', { gap: 11 });
callout('Quick final check', 'Correct diagram → correct side to move → correct stipulation → answer reviewed on the board → position saved or downloaded.');
paragraph('This guide describes the ML Academy Position Analysis page. Button labels may change as the website is updated.', { fontSize: 8, color: muted, gap: 0 });

doc.end();
await new Promise((resolve, reject) => {
  doc.on('end', resolve);
  doc.on('error', reject);
});
console.log(`Generated ${output}`);
