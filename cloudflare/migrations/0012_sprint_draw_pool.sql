-- Assign a compact indexed number once; daily draws use exact numbered lookups.
CREATE TABLE IF NOT EXISTS sprint_draw_pool (
  slot INTEGER PRIMARY KEY,
  puzzle_id TEXT NOT NULL UNIQUE REFERENCES sprint_candidates(id) ON DELETE CASCADE
);
INSERT OR IGNORE INTO sprint_draw_pool(puzzle_id)
  SELECT id FROM sprint_candidates WHERE pieces>=15 ORDER BY id;

CREATE TRIGGER IF NOT EXISTS sprint_draw_pool_insert
AFTER INSERT ON sprint_candidates WHEN NEW.pieces>=15
BEGIN
  INSERT OR IGNORE INTO sprint_draw_pool(puzzle_id) VALUES(NEW.id);
END;

CREATE INDEX IF NOT EXISTS sprint_puzzles_puzzle_id ON sprint_puzzles(puzzle_id);
CREATE INDEX IF NOT EXISTS sprint_retired_puzzle_id ON sprint_retired_positions(puzzle_id);
CREATE INDEX IF NOT EXISTS daily_puzzles_puzzle_id ON daily_puzzles(puzzle_id);
CREATE INDEX IF NOT EXISTS tournament_problems_puzzle_id ON tournament_problems(CAST(json_extract(puzzle,'$.id') AS TEXT));
