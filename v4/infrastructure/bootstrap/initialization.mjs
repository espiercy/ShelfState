// Local proposal only: no SDK, credential discovery, network, or deployment path.
import assert from "node:assert/strict";
import { deploymentPolicy, REGIONS, QUALIFIER, westExecutionPolicy, eastExecutionPolicy } from "./model.mjs";
import { equal, object } from "../../scripts/release/schema.mjs";

export const PHASES = Object.freeze({
  edge: { region: "us-west-2", capability: "edge-delivery" },
  "edge-static": { region: "us-west-2", capability: "edge-delivery" },
  "edge-routing": { region: "us-west-2", capability: "edge-delivery" },
  "api-parent": { region: "us-west-2", capability: "library-api" },
  "api-children": { region: "us-west-2", capability: "library-api" },
  certificate: { region: "us-east-1", capability: "edge-certificate" },
});
const doc = Statement => ({ Version: "2012-10-17", Statement });
const allow = (Sid, Action, Resource, Condition) => ({ Sid, Effect: "Allow", Action, Resource, ...(Condition ? { Condition } : {}) });
const ownership = { "aws:RequestTag/Project": "ShelfState", "aws:RequestTag/Environment": "dev", "aws:RequestTag/ManagedBy": "AWS-CDK" };
const owned = { StringEquals: Object.fromEntries(Object.entries(ownership).map(([k, v]) => [k.replace("RequestTag", "ResourceTag"), v])) };

// Required service-level classes, NOT a claim of a fully observed handler trace.
// Unknown handler requirements are proof obligations, never speculative grants.
export const ACTION_INVENTORY = Object.freeze([
  { kind: "distribution", phase: "edge", type: "distribution", id: "distributionId",
    create: ["cloudfront:CreateDistribution", "cloudfront:TagResource"],
    read: ["cloudfront:GetDistribution", "cloudfront:GetDistributionConfig", "cloudfront:ListTagsForResource"],
    rollback: ["cloudfront:UpdateDistribution", "cloudfront:DeleteDistribution"],
    update: ["cloudfront:UpdateDistribution", "cloudfront:TagResource", "cloudfront:UntagResource"],
    proof: "Creation tagging authorization and stabilization calls; disable/wait/delete rollback. Initial tagging may reach unrelated distributions: tags are not ownership isolation." },
  ...[["OriginAccessControl", "origin-access-control", "oacId"], ["CachePolicy", "cache-policy", "cachePolicyId"],
    ["OriginRequestPolicy", "origin-request-policy", "originRequestPolicyId"], ["ResponseHeadersPolicy", "response-headers-policy", "responseHeadersPolicyId"]]
    .map(([name, type, id]) => ({ kind: type, phase: "edge", type, id,
      create: [`cloudfront:Create${name}`], read: [`cloudfront:Get${name}`, `cloudfront:Get${name}Config`],
      rollback: [`cloudfront:Delete${name}`], update: [`cloudfront:Update${name}`],
      proof: "Provider Get versus GetConfig sequence; ETag and dependency teardown. No speculative List, Update, or tag grant during initialization." })),
  { kind: "http-api", phase: "api-parent", id: "apiId", create: ["apigateway:POST"], read: ["apigateway:GET"],
    rollback: ["apigateway:DELETE"], update: ["apigateway:PATCH"],
    proof: "Handler-specific tag endpoints and any create-time PATCH require separate evidence before adding. No REST tag inheritance premise." },
  { kind: "http-children", phase: "api-children", create: ["apigateway:POST"], read: ["apigateway:GET"],
    rollback: ["apigateway:DELETE"], update: ["apigateway:PATCH"],
    proof: "Fixed stage name, integration/route IDs; stage tags and any create-time PATCH remain ungranted pending handler evidence." },
  { kind: "certificate", phase: "certificate", id: "certificateId", create: ["acm:RequestCertificate", "acm:AddTagsToCertificate"],
    read: ["acm:DescribeCertificate", "acm:ListTagsForCertificate"], rollback: ["acm:DeleteCertificate"],
    update: ["acm:UpdateCertificateOptions", "acm:AddTagsToCertificate", "acm:RemoveTagsFromCertificate"],
    proof: "Pending physical ARN availability, CNAME readback, tag authorization, handler timeout and rollback. No Route53 publication by certificate stack." },
].map(row => Object.freeze({ ...row, replacement: "Separately authorized initialization; keep old exact IDs until terminal cleanup." })));

export function target(account, phase) {
  assert.match(account, /^\d{12}$/); assert.ok(Object.hasOwn(PHASES, phase), "Unknown initialization phase");
  const { region, capability } = PHASES[phase];
  const name = `shelfstate-v4-dev-${capability}`;
  return { account, phase, region, name, stackArn: `arn:aws:cloudformation:${region}:${account}:stack/${name}/*`,
    executionRole: `arn:aws:iam::${account}:role/cdk-${QUALIFIER}-cfn-exec-role-${account}-${region}` };
}
function id(value) { assert.equal(typeof value, "string"); assert.match(value, /^[A-Za-z0-9-]{1,64}$/, "Exact physical ID required"); return value; }

// Generated-resource fragment only; never union with the legacy generated-ID
// statements. Named S3/Lambda/IAM/log and support permissions remain separately
// reviewed. No artifact here is an installable complete-role authorization.
export function generatedAuthority(account, phase, mode, bindings = {}) {
  const t = target(account, phase); assert.ok(["initialization", "steady"].includes(mode));
  const initial = mode === "initialization", statements = [];
  const add = (sid, actions, resources, conditions) => statements.push(allow(sid, [...new Set(actions)], resources, conditions));
  const inventory = ACTION_INVENTORY.filter(r => ["edge-static", "edge-routing"].includes(phase)
    ? r.phase === "edge" && ["distribution", "origin-access-control", "response-headers-policy"].includes(r.kind)
    : r.phase === phase);
  for (const row of inventory) {
    if (["edge", "edge-static", "edge-routing"].includes(phase)) {
      const resource = `arn:aws:cloudfront::${account}:${row.type}/${initial ? "*" : id(bindings[row.id])}`;
      if (initial) {
        add(`Create${row.id}`, row.create.filter(a => a !== "cloudfront:TagResource"), ["*"], row.kind === "distribution" ? { StringEquals: ownership } : undefined);
        if (row.kind === "distribution") add("CreationTaggingResidual", ["cloudfront:TagResource"], [resource], { StringEquals: ownership });
      }
      add(`Lifecycle${row.id}`, [...row.read, ...row.rollback, ...(initial ? [] : row.update)], [resource], initial && row.kind === "distribution" ? owned : undefined);
    } else if (phase === "api-parent") {
      const api = `arn:aws:apigateway:us-west-2::/apis/${initial ? "*" : id(bindings.apiId)}`;
      if (initial) add("CreateExactNamedApi", row.create, ["arn:aws:apigateway:us-west-2::/apis"], { StringEquals: { "apigateway:Request/ApiName": "shelfstate-v4-dev-health", ...ownership } });
      add("ApiLifecycle", [...row.read, ...row.rollback, ...(initial ? [] : row.update)], [api]);
    } else if (phase === "api-children") {
      const api = `arn:aws:apigateway:us-west-2::/apis/${id(bindings.apiId)}`;
      if (initial) add("CreateChildrenWithinExactApi", row.create, ["integrations", "routes", "stages"].map(p => `${api}/${p}`));
      add("ChildLifecycle", [...row.read, ...row.rollback, ...(initial ? [] : row.update)], [
        `${api}/integrations/${initial ? "*" : id(bindings.integrationId)}`,
        `${api}/routes/${initial ? "*" : id(bindings.routeId)}`, `${api}/stages/$default`,
      ]);
    } else {
      const cert = `arn:aws:acm:us-east-1:${account}:certificate/${initial ? "*" : id(bindings.certificateId)}`;
      if (initial) {
        add("RequestExactCertificate", ["acm:RequestCertificate"], ["*"], {
          StringEquals: { ...ownership, "aws:RequestedRegion": t.region, "acm:ValidationMethod": "DNS", "acm:Export": "DISABLED" },
          "ForAllValues:StringEquals": { "acm:DomainNames": ["dev.shelfstate.codecorax.com"] },
          Null: { "acm:DomainNames": "false", "acm:CertificateAuthority": "true" },
        });
        add("CertificateCreationTaggingResidual", ["acm:AddTagsToCertificate"], [cert], { StringEquals: ownership });
      }
      add("CertificateLifecycle", [...row.read, ...row.rollback, ...(initial ? [] : row.update)], [cert], initial ? owned : undefined);
    }
  }
  return doc(statements);
}

export function assertGeneratedAuthority(candidate, account, phase, mode, bindings = {}) {
  equal(candidate, generatedAuthority(account, phase, mode, bindings), "Generated authority differs: no stale creation grant or unrelated binding permitted");
}

// Full proposed execution-policy composition preserves the existing two-west /
// one-east attachment topology. Legacy generated-ID statements are REPLACED,
// never overlaid. Previously completed phases enter only as exact steady grants.
export function executionPolicies(account, phase, mode, bindings, retainedPhases = []) {
  const t = target(account, phase);
  const isolatedEdgePhase = ["edge-static", "edge-routing"].includes(phase);
  if (isolatedEdgePhase) assert.equal(retainedPhases.length, 0, "Edge-only window cannot retain unrelated phase authority");
  assert.equal(new Set(retainedPhases).size, retainedPhases.length);
  assert.ok(!retainedPhases.includes(phase));
  for (const retained of retainedPhases) assert.equal(target(account, retained).region, t.region);
  if (phase === "api-children") assert.ok(retainedPhases.includes("api-parent"), "Exact parent authority must survive child phase rollback");
  const base = t.region === "us-west-2" ? westExecutionPolicy() : eastExecutionPolicy();
  const original = base.Statement.filter(s => (!isolatedEdgePhase || ["CreateStaticBucket", "ConfigureStaticBucket", "ReadRegionalTemplateAssets", "ResolveBootstrapVersion"].includes(s.Sid)) &&
    !s.Action.some(a => /^(cloudfront|apigateway|acm):/.test(a)) &&
    !(t.region === "us-east-1" && s.Action.some(a => a.startsWith("route53:"))));
  // Named resource creation also ceases after initialization. Independently
  // reviewed config/update/delete permissions remain on exact named resources.
  const steadyExcluded = new Set(["s3:CreateBucket", "lambda:CreateFunction", "iam:CreateRole", "logs:CreateLogGroup"]);
  const kept = original.map(s => ({ ...s, Action: s.Action.filter(a => mode !== "steady" || !steadyExcluded.has(a)) })).filter(s => s.Action.length);
  const bound = JSON.parse(JSON.stringify(kept).replace(/\$\{([A-Z_]+)\}/g, (_, key) => {
    if (key === "ACCOUNT_ID") return account;
    assert.equal(key, "SELECTED_ZONE_ID", "Unexpected unresolved execution binding");
    assert.match(bindings.zoneId, /^Z[A-Z0-9]{1,32}$/); return bindings.zoneId;
  }));
  const generated = [generatedAuthority(account, phase, mode, bindings), ...retainedPhases.map(p => generatedAuthority(account, p, "steady", bindings))];
  // Sids identify phase as well as operation; shared regional attachments must
  // remain unambiguous even when the parent and children coexist.
  const all = [...bound, ...generated.flatMap((p, i) => p.Statement.map(s => ({ ...s, Sid: `Phase${i}${s.Sid}` })))];
  if (t.region === "us-east-1") return [doc(all)];
  const edge = [], regional = [];
  for (const s of all) (["cloudfront", "route53", "iam"].includes(s.Action[0].split(":")[0]) ? edge : regional).push(s);
  return [doc(regional), doc(edge)];
}

// Proposed explicit-deny guardrail on BOTH existing regional deployment roles,
// not a voluntarily supplied STS session policy. All narrower stack operators
// must have the same cap or be denied stack mutation before expansion. Replacing
// the role's broad allow alone is insufficient. This does not install a boundary.
export function callerWindowCap(account, phase, regionalRole, changeSetName, state) {
  const t = target(account, phase); assert.ok(REGIONS.includes(regionalRole));
  assert.match(changeSetName, /^wp007-[a-f0-9]{64}$/);
  assert.ok(["prepare", "execute", "closed"].includes(state));
  if (regionalRole !== t.region || state === "closed") return doc([
    { Sid: "NoInitializationFromThisRole", Effect: "Deny", Action: ["cloudformation:*", "iam:PassRole"], Resource: "*" },
  ]);
  const base = deploymentPolicy(t.region, account);
  const support = base.Statement.filter(s => ["ReadToolkitOutputs", "ReadBootstrapVersion", "ReadAssetBucketMetadata", "ReadRegionalAssets"].includes(s.Sid));
  const actions = ["cloudformation:DescribeChangeSet", "cloudformation:DescribeStacks", "cloudformation:DescribeStackEvents", "cloudformation:DescribeStackResources", "cloudformation:GetTemplate", "cloudformation:TagResource", "cloudformation:UntagResource", "cloudformation:UpdateTerminationProtection", ...support.flatMap(s => s.Action)];
  actions.push(state === "prepare" ? "cloudformation:CreateChangeSet" : "cloudformation:ExecuteChangeSet");
  const cap = doc([
    { Sid: "OnlyWindowOperations", Effect: "Deny", NotAction: [...actions, "iam:PassRole"], Resource: "*" },
    { Sid: "OnlyOneStack", Effect: "Deny", Action: ["cloudformation:*"], NotResource: [t.stackArn, `arn:aws:cloudformation:${t.region}:${account}:stack/CDKToolkit/*`] },
    { Sid: "ToolkitReadOnly", Effect: "Deny", Action: ["cloudformation:CreateChangeSet", "cloudformation:ExecuteChangeSet", "cloudformation:TagResource", "cloudformation:UntagResource", "cloudformation:UpdateTerminationProtection"], Resource: [`arn:aws:cloudformation:${t.region}:${account}:stack/CDKToolkit/*`] },
    { Sid: "OnlyExecutionRole", Effect: "Deny", Action: ["iam:PassRole"], NotResource: [t.executionRole] },
    { Sid: "NoOtherChangeSetName", Effect: "Deny", Action: ["cloudformation:CreateChangeSet", "cloudformation:ExecuteChangeSet"], Resource: "*",
      Condition: { StringNotEquals: { "cloudformation:ChangeSetName": changeSetName } } },
  ]);
  // Existing allow is replaced as well, to enforce exact request conditions.
  // Prepare has no execute; execute has no create/delete (prevents name reuse).
  const reads = base.Statement.filter(s => s.Sid === "ReadDevStacks").map(s => ({ ...s, Resource: [t.stackArn] }));
  const conditions = { StringEquals: { "cloudformation:ChangeSetName": changeSetName, ...(state === "prepare" ? { "cloudformation:RoleArn": t.executionRole } : {}) },
    Null: { "cloudformation:ChangeSetName": "false", ...(state === "prepare" ? { "cloudformation:RoleArn": "false" } : {}) } };
  return doc([...cap.Statement, ...reads, ...support,
    allow("OneReviewedChangeSet", [state === "prepare" ? "cloudformation:CreateChangeSet" : "cloudformation:ExecuteChangeSet"], [t.stackArn], conditions),
    allow("InspectChangeSet", ["cloudformation:DescribeChangeSet"], [t.stackArn]),
    allow("ExactStackTags", ["cloudformation:TagResource", "cloudformation:UntagResource"], [t.stackArn]),
    allow("ExactTerminationProtection", ["cloudformation:UpdateTerminationProtection"], [t.stackArn]),
    ...base.Statement.filter(s => s.Sid === "PassRegionalExecutionRole"),
  ]);
}

// Pure state projection, not an AWS status observer and never a cleanup command.
export function closureDecision(status) {
  if (["CREATE_COMPLETE", "UPDATE_COMPLETE"].includes(status)) return "VERIFY_COMPLETE_ID_MAP_THEN_NARROW_AND_READ_BACK";
  if (["ROLLBACK_COMPLETE", "UPDATE_ROLLBACK_COMPLETE"].includes(status)) return "VERIFY_ABSENCE_OR_REVIEWED_REMNANTS_THEN_CLOSE";
  if (["CREATE_IN_PROGRESS", "UPDATE_IN_PROGRESS", "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS", "ROLLBACK_IN_PROGRESS", "UPDATE_ROLLBACK_IN_PROGRESS", "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS"].includes(status)) return "KEEP_AUTHORITY_NO_NEXT_OPERATION";
  return "STOP_HUMAN_RECOVERY_REQUIRED";
}

export function assertClosure(evidence, expectedResources) {
  object(evidence, ["status", "resources", "narrowedPolicyMatches", "effectiveReadbackMatches", "otherWindowOpen"]);
  assert.equal(closureDecision(evidence.status), "VERIFY_COMPLETE_ID_MAP_THEN_NARROW_AND_READ_BACK", "Not terminal successful initialization");
  equal(evidence.resources, expectedResources, "Complete independently verified physical map required");
  assert.equal(evidence.narrowedPolicyMatches, true); assert.equal(evidence.effectiveReadbackMatches, true);
  assert.equal(evidence.otherWindowOpen, false);
  return "LOCAL_EVIDENCE_CONSISTENT_NOT_LIVE_ATTESTATION";
}
