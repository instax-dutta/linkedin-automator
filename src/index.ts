/**
 * Public library surface. Everything a consumer may import is re-exported here.
 *
 * The engine port is the seam: import `LinkedInClient` to supply your own, or
 * `createApiAnythingClient` to use the real one.
 */

export {
  createApiAnythingClient,
  type ApiAnythingCallResult,
  type ApiAnythingClientDeps,
  type Caller,
  type CliResult,
  type CliRunner,
} from "./engine/api-anything.js";

export {
  isFailure,
  isSuccess,
  type CallFailure,
  type CallOutcome,
  type CallSuccess,
  type EngineCallOptions,
  type FailureClass,
  type LinkedInClient,
  type OperationCall,
  type RequestPreview,
} from "./engine/client.js";

export {
  OperationInputError,
  OPERATIONS,
  READ_OPERATIONS,
  WRITE_OPERATIONS,
  findOperation,
  listOperations,
  operationNames,
  validateArgs,
  type OperationDescriptor,
  type OperationKind,
  type OperationParam,
  type ParamType,
} from "./ops/index.js";

export {
  DEFAULT_PACING,
  decide as decidePacing,
  emptyUsage,
  record as recordUsage,
  rollForward as rollUsageForward,
  type PacingConfig,
  type PacingDecision,
  type Surface,
  type SurfaceBudget,
  type Usage,
} from "./automation/pacing.js";

export {
  createFileStore,
  createMemoryStore,
  type ActionOutcome,
  type ActionRecord,
  type AutomationStore,
} from "./automation/store.js";

export {
  LINKEDIN_SITE,
  planCampaign,
  renderArgs,
  surfaceOf,
  usageFromRecords,
  type Campaign,
  type CampaignStep,
  type Lead,
  type Plan,
  type PlanEntry,
  type PlanOptions,
} from "./automation/campaign.js";

export {
  executePlan,
  previewPlan,
  type ExecutionContext,
  type ExecutionOutcome,
  type ExecutionStatus,
  type PreviewOutcome,
} from "./automation/runner.js";

export {
  candidateName,
  discoverCandidates,
  toDraftSite,
  trafficFromHar,
  type BundleEndpoint,
  type CandidateOperation,
  type CandidateProvenance,
  type DiscoveryInput,
  type DraftSiteOptions,
  type TrafficRecord,
} from "./ree/candidates.js";

export {
  createReaClient,
  DEFAULT_REA_COMMAND,
  type ReaClient,
  type ReaResult,
  type ReaRunner,
} from "./ree/rea.js";

export {
  loadCampaign,
  loadConfig,
  loadLeads,
  type Config,
} from "./config.js";
