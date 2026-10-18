ALTER TABLE characters ADD COLUMN image TEXT CHECK(image IS NULL OR json_valid(image));
