import SVGtoPDF from 'svg-to-pdfkit';
import { existsSync, readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { solutionDraft } from './solutionDraft.mjs';
function solutionLines(doc, text, width, fontSize) {
  doc.fontSize(fontSize);
  const lines = [[]]; let used = 0;
  for (const part of text.split(/(\[\d+(?:[.,]\d+)?\]|\r?\n|[^\S\r\n]+)/g).filter(Boolean)) {
    if (/^\r?\n$/.test(part)) { lines.push([]); used = 0; continue; }
    const red = /^\[\d+(?:[.,]\d+)?\]$/.test(part);
    const fragments = doc.widthOfString(part) > width ? [...part] : [part];
    for (const fragment of fragments) {
      const length = doc.widthOfString(fragment);
      if (used + length > width && used > 0) { lines.push([]); used = 0; }
      if (!used && /^\s+$/.test(fragment)) continue;
      lines.at(-1).push({ text: fragment, red, width: length }); used += length;
    }
  }
  return lines;
}
function scoredText(doc, text, x, y, width, height, number) {
  let size = 10, lines;
  while (size >= 6) {
    lines = solutionLines(doc, text, width, size);
    if (lines.length * (size * 1.2 + 1) <= height) break;
    size -= .25;
  }
  if (size < 6) throw new Error(`Solution ${number} is too long for the two-page layout. Shorten the draft or scoring notes.`);
  doc.fontSize(size);
  lines.forEach((line, index) => {
    let left = x;
    for (const run of line) {
      doc.fillColor(run.red ? '#bd2424' : '#111111').text(run.text, left, y + index * (size * 1.2 + 1), { lineBreak: false });
      left += run.width;
    }
  });
}

function fonts(doc) {
  const paths = ['C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'];
  const regular = paths.find(existsSync);
  if (regular) doc.registerFont('ML', regular).font('ML');
}
function board(doc, fen, x, y, size, pieceAssets) {
  const square = size / 8;
  for (const [index, piece] of new Chess(fen).board().flat().entries()) {
    const col = index % 8, row = Math.floor(index / 8);
    doc.rect(x + col * square, y + row * square, square, square).fill((col + row) % 2 ? '#d0d0d0' : '#ffffff');
    if (piece) {
      const key = `${piece.color}${piece.type.toUpperCase()}`;
      const svg = pieceAssets?.[key] ?? readFileSync(new URL(`../src/assets/chess/${key}.svg`, import.meta.url), 'utf8');
      // These assets mix intrinsic 45px sizes and viewBox-only roots. Render all
      // in the same 45-point viewport before fitting them inside the square.
      doc.save().translate(x + col * square + square * .025, y + row * square + square * .025).scale(square * .95 / 45);
      SVGtoPDF(doc, svg, 0, 0, { width: 45, height: 45, assumePt: true });
      doc.restore();
    }
  }
  doc.rect(x, y, size, size).lineWidth(0.7).stroke('#111111');
}
function heading(doc, event, subtitle, centered = false, logoAsset) {
  const logo = logoAsset ?? new URL('../src/assets/ml-academy-logo.jpg', import.meta.url);
  if (centered) {
    doc.image(logo, (doc.page.width - 96) / 2, 5, { fit: [96, 49], align: 'center', valign: 'center' });
    doc.fillColor('#111111').fontSize(15).text(event.title, 20, 53, { width: doc.page.width - 40, height: 20, align: 'center', ellipsis: true });
    doc.fontSize(10).text(`No. ${event.number} · ${event.date.replaceAll('-', '.')} · ${subtitle} · 120 minutes`, 20, 76, { width: doc.page.width - 40, align: 'center' });
    return;
  }
  doc.image(logo, 28, 16, { fit: [82, 49], align: 'center', valign: 'center' });
  const width = doc.page.width - 156;
  doc.fillColor('#111111').fontSize(12).text(event.displayTitle ?? event.title, 124, 19, { width, height: 31, align: 'center', ellipsis: true });
  doc.fontSize(9).text(`${subtitle} · 120 minutes`, 124, 54, { width, align: 'center' });
}
function caption(doc, puzzle, x, y, width) {
  doc.fillColor('#111111').fontSize(10).text(puzzle.stipulation, x, y, { width });
  doc.text(`(${puzzle.whiteCount} + ${puzzle.blackCount})`, x, y, { width, align: 'right' });
  if (puzzle.solutions) doc.fontSize(9).text(`${puzzle.solutions} solution${puzzle.solutions === 1 ? '' : 's'}`, x, y + 13, { width, align: 'center' });
}
export async function tournamentPdf(event, kind, assets = {}, PDFDocumentType) {
  const PDFDocument = PDFDocumentType ?? (await import('pdfkit')).default;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: kind === 'results' ? 'landscape' : 'portrait', margin: kind === 'problems' ? 14 : 28,
      info: { Title: `${event.displayTitle ?? event.title} — ${kind}`, Author: 'ML Academy' } });
    const chunks = []; doc.on('data', (chunk) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    try {
      fonts(doc);
      if (kind === 'problems') {
        heading(doc, event, 'Problems', true, assets.logo);
        event.puzzles.forEach((puzzle, index) => {
          const size = 206, gap = 24, left = (doc.page.width - size * 2 - gap) / 2;
          const x = left + (index % 2) * (size + gap), y = 104 + Math.floor(index / 2) * 238;
          doc.fillColor('#111111').fontSize(12).text(`${index + 1}.`, x, y - 16, { width: size, align: 'center' });
          board(doc, puzzle.fen, x, y, size, assets.pieces);
          caption(doc, puzzle, x, y + size + 3, size);
        });
        doc.fontSize(8).fillColor('#555555').text('Send written solutions to arvydas.mockus@gmail.com.', 20, 818, { width: doc.page.width - 40, align: 'center' });
      } else if (kind === 'solutions') {
        event.puzzles.forEach((puzzle, index) => {
          if (index % 3 === 0) {
            if (index) doc.addPage();
            heading(doc, event, 'Solutions', true, assets.logo);
          }
          const top = 104 + index % 3 * 232, size = 166, textX = 214;
          const textWidth = doc.page.width - textX - 28;
          doc.fillColor('#111111').fontSize(12).text(`${index + 1}.`, 28, top, { width: size, align: 'center' });
          board(doc, puzzle.fen, 28, top + 20, size, assets.pieces);
          caption(doc, puzzle, 28, top + 190, size);
          const attribution = `${puzzle.authors.join(' · ')}\n${puzzle.source} ${puzzle.year} · YACPDB ${puzzle.id}`;
          doc.fillColor('#555555').fontSize(8.5).text(attribution, textX, top + 20, { width: textWidth, height: 29, ellipsis: true });
          const text = [puzzle.solutionDraft || solutionDraft(puzzle).text, puzzle.scoringNotes].filter(Boolean).join('\n\n');
          scoredText(doc, text, textX, top + 54, textWidth, 172, index + 1);
          if (index % 3 !== 2) doc.moveTo(28, top + 228).lineTo(doc.page.width - 28, top + 228).lineWidth(.4).stroke('#dddddd');
        });
      } else if (kind === 'results') {
        const columns = [28, 52, 245, 288, 322, 374, 415, 451, 487, 523, 559, 595, 631, 695, 753, 814];
        let y;
        function tableHeader() {
          heading(doc, event, 'Individual results', false, assets.logo);
          y = 84;
          const labels = ['Rank', 'Name', 'Cat.', 'Country', 'Rating', 'Title', ...event.puzzles.map((puzzle, i) => `${i + 1}. ${puzzle.stipulation}`), 'Total /30', 'Min.', ''];
          labels.slice(0, 14).forEach((label, i) => {
            const width = columns[i + 1] - columns[i];
            doc.rect(columns[i], y, width, 30).fillAndStroke('#edf4e9', '#bbbbbb');
            doc.fillColor('#111111').fontSize(8).text(label, columns[i] + 3, y + 8, { width: width - 6, align: i === 1 ? 'left' : 'center' });
          });
          y += 30;
        }
        tableHeader();
        for (const row of event.results) {
          if (y + 24 > 535) { doc.addPage(); tableHeader(); }
          const values = [row.rank, row.name, row.category, row.country, row.rating, row.title, ...row.scores.map((score) => score ?? '—'), row.total, row.minutes];
          values.forEach((value, i) => {
            const width = columns[i + 1] - columns[i];
            doc.rect(columns[i], y, width, 24).stroke('#bbbbbb');
            doc.fillColor('#111111').fontSize(8).text(String(value), columns[i] + 3, y + 7, { width: width - 6, height: 17, align: i === 1 ? 'left' : 'center', ellipsis: true });
          });
          y += 24;
        }
        doc.fontSize(8).text('Rank: points descending, then time ascending. Scores entered manually by the judge. This is not an official rating calculation.', 28, 554, { width: 780 });
      } else throw new Error('Unknown PDF type.');
      doc.end();
    } catch (error) { reject(error); }
  });
}
