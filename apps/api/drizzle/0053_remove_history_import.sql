-- Remove retired history-import jobs. This deletes their stored progress and errors.
DROP TABLE IF EXISTS "import_jobs";
