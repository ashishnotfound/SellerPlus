export interface JobPayload {
  id: string;
  user_id?: string;
  workspace_id: string;
  event_type: string;
  version: string;
  payload: unknown;
  correlation_id: string;
  causation_id?: string;
}

export interface Worker {
  name: string;
  processJob: (payload: JobPayload) => Promise<void>;
}
