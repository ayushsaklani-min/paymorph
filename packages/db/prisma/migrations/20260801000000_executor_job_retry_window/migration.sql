-- Keep external chain-evidence jobs retryable across the documented ten-minute
-- reconciliation window. Existing jobs retain their stored retry budgets.
ALTER TABLE "ExecutorJob" ALTER COLUMN "maxAttempts" SET DEFAULT 60;
