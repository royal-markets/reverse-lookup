-- Add blake3_hash column to songs table if it doesn't exist
ALTER TABLE songs ADD COLUMN blake3_hash TEXT; 