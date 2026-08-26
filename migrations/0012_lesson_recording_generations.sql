ALTER TABLE learner_profile ADD COLUMN lesson_recording_generation integer NOT NULL DEFAULT 0;
ALTER TABLE learner_profile ADD COLUMN lesson_recording_cleanup_before_generation integer;
ALTER TABLE learner_lesson ADD COLUMN recording_generation integer NOT NULL DEFAULT 0;
ALTER TABLE learner_lesson ADD COLUMN recording_cleanup_before_generation integer;
