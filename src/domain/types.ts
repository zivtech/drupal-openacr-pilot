export type ObservationState =
  | "retrieved"
  | "unavailable"
  | "resource_gone"
  | "redirected_or_migrated"
  | "not_in_selection";

export type Freshness = "fresh" | "stale" | "unavailable";

export interface PilotConfig {
  readonly config_version: "1.0.0";
  readonly release_identity: "Drupal 11 release line / 11.x-dev";
  readonly selection_url: string;
  readonly user_agent: string;
  readonly allowed_hosts: readonly ["www.drupal.org"];
  readonly max_records: 25;
  readonly max_response_bytes: 2_097_152;
  readonly request_timeout_ms: 30_000;
  readonly max_attempts: 3;
  readonly max_redirects: 3;
  readonly base_backoff_ms: 1_000;
  readonly max_backoff_ms: 30_000;
  readonly max_jitter_ms: 250;
  readonly freshness_window_ms: 86_400_000;
  readonly minimum_live_run_interval_ms: 3_600_000;
  readonly canonicalization_version: "drupal-issue-snapshot-jcs-v1";
  readonly projection_schema_version: "1.0.0";
}

export interface DrupalSourceCreator {
  readonly id: string;
  readonly name: string;
}

export interface DrupalSourceIssue {
  readonly nid: string;
  readonly title: string;
  readonly url: string;
  readonly creator: DrupalSourceCreator;
  readonly field_project: string;
  readonly field_issue_component: string | null;
  readonly field_issue_version: string;
  readonly field_issue_status: string | null;
  readonly field_issue_category: string | null;
  readonly field_issue_priority: string | null;
  readonly taxonomy_vocabulary_9: readonly string[];
  readonly created: string;
  readonly changed: string;
  readonly [sourceField: string]: unknown;
}

export interface DrupalPage {
  readonly self: string;
  readonly first: string;
  readonly last: string;
  readonly next: string | null;
  readonly prev?: string | null;
  readonly list: readonly DrupalSourceIssue[];
}

export interface RecordProjection {
  readonly projection_schema_version: "1.0.0";
  readonly issue_id_source: string;
  readonly issue_id_numeric: number;
  readonly title: string;
  readonly canonical_url: string;
  readonly creator_credit: string;
  readonly project_id: string;
  readonly component: string | null;
  readonly version: string;
  readonly status: string | null;
  readonly category: string | null;
  readonly priority: string | null;
  readonly tag_ids: readonly string[];
  readonly source_created_at: string | null;
  readonly source_changed_at: string | null;
  readonly fetched_at: string;
  readonly observation_state: ObservationState;
  readonly license_name: string;
  readonly license_uri: string | null;
  readonly license_exception: string | null;
  readonly canonicalization_notice: string;
  readonly canonicalization_version: "drupal-issue-snapshot-jcs-v1";
  readonly source_page_representation_sha256: string;
}

export interface RetainedRecord {
  readonly schema_version: "1.0.0";
  readonly projection: RecordProjection;
  readonly canonical_sha256: string;
}

export type RetryAfterParseState =
  | "absent"
  | "valid_delta_seconds"
  | "valid_http_date"
  | "malformed"
  | "multiple";

export interface AttemptReceipt {
  readonly attempt: number;
  readonly started_at: string;
  readonly response_status: number | null;
  readonly retry_after_value: string | null;
  readonly retry_after_parse_state: RetryAfterParseState;
  readonly retry_after_ms: number | null;
  readonly retry_delay_ms: number | null;
}

export interface SelectionReceipt {
  readonly schema_version: "1.0.0";
  readonly config_digest: string;
  readonly requested_url: string;
  readonly final_url: string | null;
  readonly user_agent: string;
  readonly fetched_at: string;
  readonly observation_state: ObservationState;
  readonly http: {
    readonly status: number | null;
    readonly content_encoding: string | null;
    readonly transfer_encoding: string | null;
    readonly declared_content_length_bytes: number | null;
    readonly representation_bytes: number | null;
  };
  readonly attempts: readonly AttemptReceipt[];
  readonly pagination: {
    readonly self: string | null;
    readonly first: string | null;
    readonly last: string | null;
    readonly next: string | null;
  };
  readonly ordered_ids: readonly string[];
  readonly page_representation_sha256: string | null;
  readonly termination_reason: string;
  readonly selection_receipt_sha256: string;
}

export interface CandidateManifest {
  readonly schema_version: "1.0.0";
  readonly snapshot_id: string;
  readonly manifest_sha256: string;
  readonly config_digest: string;
  readonly selection_receipt_sha256: string;
  readonly release_identity: "Drupal 11 release line / 11.x-dev";
  readonly created_at: string;
  readonly freshness: Freshness;
  readonly fresh_until: string | null;
  readonly prior_snapshot_id: string | null;
  readonly record_count: number;
  readonly ordered_records: readonly {
    readonly issue_id: number;
    readonly canonical_sha256: string;
  }[];
}

export interface DeletionReceipt {
  readonly schema_version: "1.0.0";
  readonly record_id: string;
  readonly run_id: string;
  readonly snapshot_candidate_id: string | null;
  readonly representation_created_at: string;
  readonly deleted_at: string;
  readonly cleanup_deadline: string;
  readonly method: "unlink" | "recovery_unlink";
  readonly verification: "path_absent";
  readonly backup_cache_disposition: "not_backed_up_or_cached";
  readonly exception_status: "none" | "approved_debugging_retention";
  readonly representation_sha256: string | null;
  readonly representation_bytes: number;
  readonly recovery: boolean;
}

export interface NetworkRunStart {
  readonly schema_version: "1.0.0";
  readonly run_id: string;
  readonly started_at: string;
  readonly next_eligible_at: string;
  readonly selection_url: string;
  readonly user_agent: string;
  readonly config_digest: string;
  readonly minimum_live_run_interval_ms: 3_600_000;
}

export interface ValidationIssue {
  readonly instancePath: string;
  readonly schemaPath: string;
  readonly keyword: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly message: string | undefined;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly ValidationIssue[] };
