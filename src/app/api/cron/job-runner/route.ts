/**
 * Backwards-compatible cron entrypoint. The implementation lives in the unified
 * job processor so cron and manually-invoked workers share identical locking,
 * retry, authentication, and audit behavior.
 */
export { GET, maxDuration } from "@/app/api/workers/job-processor/route";
