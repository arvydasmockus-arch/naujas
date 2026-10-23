CREATE TABLE IF NOT EXISTS forum_topics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  post_count INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS forum_topics_activity ON forum_topics(updated_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS forum_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id TEXT NOT NULL REFERENCES forum_topics(id),
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS forum_posts_topic ON forum_posts(topic_id,id);
