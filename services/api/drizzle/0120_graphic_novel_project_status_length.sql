-- Allow terminal statuses such as completed_with_errors.

ALTER TABLE graphic_novel_projects
  ALTER COLUMN status TYPE varchar(40);
