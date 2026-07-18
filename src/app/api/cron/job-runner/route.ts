import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { WorkerRegistry } from "@/lib/automation/workers/registry";

// Ensure this runs securely using the service role key to bypass RLS and access the jobs table
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
  // 1. Claim up to 10 pending (or stale) jobs using the SKIP LOCKED mechanism
  const { data: claimedJobs, error: claimError } = await supabase.rpc("claim_jobs", {
    batch_size: 10,
    lock_timeout_minutes: 5 // Default lock timeout is 5 minutes
  });

  if (claimError) {
    console.error("Failed to claim jobs:", claimError);
    return NextResponse.json({ success: false, error: claimError.message }, { status: 500 });
  }

  if (!claimedJobs || claimedJobs.length === 0) {
    return NextResponse.json({ success: true, processed: 0, message: "No pending jobs." });
  }

  const results = [];

  // 2. Process each claimed job
  for (const job of claimedJobs) {
    const worker = WorkerRegistry[job.queue_name];

    if (!worker) {
      await markJobFailed(job, new Error(`No worker registered for queue: ${job.queue_name}`));
      results.push({ id: job.id, status: "failed", reason: "no_worker" });
      continue;
    }

    // 3. Create execution audit record
    const executionData = {
      trigger_event_id: job.payload?.id || null, // Best effort to extract event ID
      worker: job.queue_name,
      status: "running",
      input_snapshot: job.payload || {},
      started_at: new Date().toISOString()
    };

    const { data: executionRecord, error: executionError } = await supabase
      .from("automation_executions")
      .insert(executionData)
      .select("id")
      .single();

    if (executionError) {
      console.error("Failed to create automation execution record:", executionError);
      // We will still try to process the job to prevent complete blockage, but audit is missing.
    }

    const executionId = executionRecord?.id;

    try {
      // Execute the job payload
      await worker.processJob(job.payload);
      
      // Mark job as completed
      await supabase
        .from("jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          locked_until: null, // Clear the lock
        })
        .eq("id", job.id);

      // Update audit record
      if (executionId) {
        await supabase
          .from("automation_executions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            output_snapshot: { success: true }
          })
          .eq("id", executionId);
      }

      results.push({ id: job.id, status: "completed" });
    } catch (error: any) {
      await markJobFailed(job, error);
      
      if (executionId) {
        await supabase
          .from("automation_executions")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            output_snapshot: { error: error.message, stack: error.stack }
          })
          .eq("id", executionId);
      }

      results.push({ id: job.id, status: "failed", reason: error.message });
    }
  }

  return NextResponse.json({ success: true, processed: claimedJobs.length, results });
}

async function markJobFailed(job: any, error: Error) {
  const attempts = job.attempts + 1;
  const maxAttempts = job.max_attempts || 3;
  
  const errorEntry = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  };

  let newStatus = "pending";
  let nextRunAt = job.run_at;

  if (attempts >= maxAttempts) {
    newStatus = "failed"; // Acts as Dead Letter Queue
  } else {
    // Exponential backoff: 2^attempts * 10 seconds (10s, 20s, 40s...)
    const delayMs = Math.pow(2, attempts) * 10000;
    nextRunAt = new Date(Date.now() + delayMs).toISOString();
  }

  await supabase
    .from("jobs")
    .update({
      status: newStatus,
      attempts: attempts,
      run_at: nextRunAt,
      locked_until: null, // Clear the lock so it can be picked up later or stay failed
      error_log: [...(job.error_log || []), errorEntry],
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
}
