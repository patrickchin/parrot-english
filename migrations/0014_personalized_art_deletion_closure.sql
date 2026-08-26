ALTER TABLE account_deletion_tombstone ADD COLUMN personalized_art_candidate_keys_json text NOT NULL DEFAULT '[]' CHECK (json_valid(personalized_art_candidate_keys_json));
