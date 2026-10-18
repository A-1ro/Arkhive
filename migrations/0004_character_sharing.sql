ALTER TABLE characters ADD COLUMN share_id TEXT;
CREATE UNIQUE INDEX characters_share_id ON characters(share_id) WHERE share_id IS NOT NULL;
