-- Allow employee file creation and actual join-date events in employment_history.
-- "created" records when the employee file is created in the system.
-- "joined" records the employee's actual first working date when provided.

ALTER TABLE "employment_history"
  DROP CONSTRAINT IF EXISTS "employment_history_event_type_check";

ALTER TABLE "employment_history"
  ADD CONSTRAINT "employment_history_event_type_check"
  CHECK ("event_type" IN ('created', 'joined', 'termination', 'reinstatement'));
