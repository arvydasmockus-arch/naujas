const BATCH_SIZE = 8;
const MAX_BATCHES = 16;

export function sprintDrawQuery(count) {
  return `SELECT r.slot,c.id,c.position_hash,c.puzzle FROM sprint_draw_pool r
    JOIN sprint_candidates c ON c.id=r.puzzle_id
    WHERE r.slot IN (${Array(count).fill('?').join(',')}) AND c.pieces>=15 AND c.publication_date<=?
    AND NOT EXISTS(SELECT 1 FROM sprint_puzzles s WHERE s.puzzle_id=c.id)
    AND NOT EXISTS(SELECT 1 FROM sprint_puzzles s WHERE s.position_hash=c.position_hash)
    AND NOT EXISTS(SELECT 1 FROM sprint_retired_positions s WHERE s.puzzle_id=c.id)
    AND NOT EXISTS(SELECT 1 FROM sprint_retired_positions s WHERE s.position_hash=c.position_hash)
    AND NOT EXISTS(SELECT 1 FROM daily_puzzles d WHERE d.puzzle_id=c.id)
    AND NOT EXISTS(SELECT 1 FROM tournament_problems t WHERE CAST(json_extract(t.puzzle,'$.id') AS TEXT)=c.id)`;
}

// Floyd's algorithm samples distinct numbers without reading a candidate list.
function randomSlots(max, random) {
  const slots = new Set();
  for (let j = Math.max(0, max - BATCH_SIZE); j < max; j++) {
    const value = Math.floor(random() * (j + 1));
    slots.add(slots.has(value) ? j : value);
  }
  return [...slots].map((slot) => slot + 1);
}

export async function drawSprintRows(db, date, random = Math.random) {
  const max = (await db.prepare('SELECT slot FROM sprint_draw_pool ORDER BY slot DESC LIMIT 1').first())?.slot ?? 0;
  const cutoff = new Date(date + 'T12:00:00Z');
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
  const selected = [];
  const positions = new Set();
  const tried = new Set();
  for (let batch = 0; max > 0 && batch < MAX_BATCHES && selected.length < 3; batch++) {
    const slots = randomSlots(max, random).filter((slot) => !tried.has(slot));
    slots.forEach((slot) => tried.add(slot));
    if (!slots.length) continue;
    const result = await db.prepare(sprintDrawQuery(slots.length)).bind(...slots, cutoff.toISOString().slice(0, 10)).all();
    const rows = result.results ?? [];
    // SQL returns rows in index order; shuffle so lower slot numbers have no advantage.
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    for (const row of rows) {
      if (positions.has(row.position_hash)) continue;
      selected.push(row); positions.add(row.position_hash);
      if (selected.length === 3) break;
    }
    if (tried.size >= max) break;
  }
  if (selected.length !== 3) throw new Error('The checked 3x#2 reserve needs replenishing. Import more checked candidates.');
  return selected;
}
