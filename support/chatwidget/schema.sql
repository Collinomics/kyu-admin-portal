-- Run once. Adjust the vector dimension to match whatever NVIDIA embedding
-- model you use (llama-nemotron-embed-vl-1b-v2 = 2048; nv-embedqa-e5-v5
-- retired 2026-08-25 was 1024). Check your model's docs before changing
-- NVIDIA_EMBED_MODEL later, since dimension changes require rebuilding
-- this column and the index.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS programme_chunks (
    id              TEXT PRIMARY KEY,        -- deterministic: programme_id + chunk index
    programme_id    TEXT NOT NULL,
    programme_name  TEXT NOT NULL,
    section         TEXT NOT NULL,            -- 'overview' | 'structure' | 'admission_requirements' | 'career_prospects'
    chunk_text      TEXT NOT NULL,
    embedding       VECTOR(2048) NOT NULL,
    published       BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programme_chunks_programme_id
    ON programme_chunks (programme_id);

-- No similarity index on embedding: pgvector's HNSW/IVFFlat cap at 2000
-- dimensions and the current model (llama-nemotron-embed-vl-1b-v2) emits
-- 2048. For a catalogue of a few hundred programmes this table is small,
-- so exact cosine search (ORDER BY embedding <=> query in chat_api.php)
-- is fast enough without an index. If the catalogue grows to many
-- thousands of rows, revisit with dimension reduction or a reduced-dim
-- indexed column.
-- (Cosine distance pairs naturally with normalized embedding models.)
