import { assert, sha, environment, REPOSITORY, parseEvidenceJson, hash } from "./schema.mjs";
import { TRANSFER_LIMIT } from "./payload-transfer.mjs";

const prefix = `/repos/${REPOSITORY}`;
export const CHECKS = Object.freeze(["V3 and repository boundary", "V4 install and verification"]);
const id = v => { assert.match(String(v), /^[1-9][0-9]*$/); return String(v); };
function nextPage(link, expected) {
  const matches = [...(link ?? "").matchAll(/<([^>]+)>;\s*rel="next"/g)];
  assert.equal(matches.length, 1, "Missing/ambiguous next page");
  const actual = new URL(matches[0][1]), wanted = new URL(expected);
  assert.equal(actual.origin, wanted.origin); assert.equal(actual.pathname, wanted.pathname);
  assert.equal(actual.hash + actual.username + actual.password, "");
  assert.deepEqual([...actual.searchParams].sort(), [...wanted.searchParams].sort(), "Foreign next-page query");
}
export function dispatchContext(e) {
  assert.equal(e.GITHUB_ACTIONS, "true", "Hosted context required");
  assert.equal(e.GITHUB_REPOSITORY, REPOSITORY); assert.equal(e.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(e.GITHUB_REF, "refs/heads/main"); assert.equal(e.GITHUB_REF_TYPE, "branch");
  environment(e.RELEASE_ENVIRONMENT); sha(e.CANDIDATE_SHA); sha(e.GITHUB_WORKFLOW_SHA); sha(e.GITHUB_SHA);
  assert.equal(e.GITHUB_SHA, e.GITHUB_WORKFLOW_SHA, "Controller/ref revision mismatch");
  const workflowPath = `.github/workflows/v4-${e.RELEASE_ENVIRONMENT}-release.yml`;
  assert.equal(e.GITHUB_WORKFLOW_REF, `${REPOSITORY}/${workflowPath}@refs/heads/main`);
  id(e.GITHUB_RUN_ID); id(e.GITHUB_RUN_ATTEMPT);
  const runAttempt = Number(e.GITHUB_RUN_ATTEMPT); assert.ok(Number.isSafeInteger(runAttempt));
  return { repository: REPOSITORY, candidateSha: e.CANDIDATE_SHA, controllerSha: e.GITHUB_WORKFLOW_SHA,
    environment: e.RELEASE_ENVIRONMENT, workflowPath, runId: e.GITHUB_RUN_ID, runAttempt };
}

async function bytes(response, limit) {
  assert.ok(response.body, "Missing HTTP body"); let length = 0; const chunks = [];
  for await (const part of response.body) { length += part.length; assert.ok(length <= limit, "HTTP response too large"); chunks.push(part); }
  return Buffer.concat(chunks);
}
// Transport has only GET. Tokens never follow signed storage redirects. A
// caller supplies the job's own Actions token only in the proof job, never PAT.
export function githubClient({ token, transport = globalThis.fetch } = {}) {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers.Authorization = `Bearer ${token}`;
  function allowed(relative) {
    const suffix = relative.slice(prefix.length);
    assert.ok(relative.startsWith(prefix) && /^(?:$|\/git\/ref\/heads\/main|\/actions\/workflows\/[1-9][0-9]*|\/actions\/runs\/[1-9][0-9]*(?:\/attempts\/[1-9][0-9]*(?:\/jobs\?per_page=100&page=[1-9][0-9]*)?)?|\/actions\/runs\?head_sha=[a-f0-9]{40}&event=push&per_page=100&page=[1-9][0-9]*|\/commits\/[a-f0-9]{40}\/check-runs\?filter=latest&per_page=100&page=[1-9][0-9]*|\/actions\/artifacts\/[1-9][0-9]*(?:\/zip)?)$/.test(suffix), "Unapproved GitHub GET endpoint");
  }
  async function request(relative) {
    allowed(relative);
    return transport(`https://api.github.com${relative}`, { method: "GET", headers, redirect: "manual", signal: AbortSignal.timeout(30000) });
  }
  async function get(relative) {
    const response = await request(relative); assert.equal(response.status, 200, `GitHub evidence unavailable (${response.status})`);
    return { value: parseEvidenceJson(await bytes(response, 16 * 1024 * 1024)), link: response.headers.get("link") };
  }
  async function pages(base, key) {
    const all = []; let total;
    for (let page = 1; page <= 10; page++) {
      const { value, link } = await get(`${base}&per_page=100&page=${page}`);
      assert.ok(Number.isSafeInteger(value.total_count) && value.total_count >= 0 && value.total_count <= 1000, "Unbounded/incomplete pagination");
      total ??= value.total_count; assert.equal(value.total_count, total, "Pagination changed");
      assert.ok(Array.isArray(value[key]) && value[key].length <= 100);
      all.push(...value[key]); assert.ok(all.length <= total);
      if (all.length === total) {
        assert.ok(!/rel="next"/.test(link ?? ""), "Incomplete pagination");
        assert.equal(new Set(all.map(x => id(x.id))).size, all.length, "Duplicate page entries"); return all;
      }
      assert.equal(value[key].length, 100, "Truncated evidence page");
      nextPage(link, `https://api.github.com${base}&per_page=100&page=${page + 1}`);
    }
    assert.fail("Pagination limit");
  }
  // jobs endpoint has no initial filter query; build its approved path separately.
  async function jobs(run, attempt) {
    const all = []; let total;
    for (let page = 1; page <= 10; page++) {
      const base = `${prefix}/actions/runs/${id(run)}/attempts/${id(attempt)}/jobs`;
      const { value, link } = await get(`${base}?per_page=100&page=${page}`);
      assert.ok(Number.isSafeInteger(value.total_count) && value.total_count >= 0 && value.total_count <= 1000);
      total ??= value.total_count; assert.equal(value.total_count, total);
      assert.ok(Array.isArray(value.jobs) && value.jobs.length <= 100); all.push(...value.jobs);
      assert.ok(all.length <= total);
      if (all.length === total) { assert.ok(!/rel="next"/.test(link ?? "")); assert.equal(new Set(all.map(x => id(x.id))).size, all.length); return all; }
      assert.equal(value.jobs.length, 100); nextPage(link, `https://api.github.com${base}?per_page=100&page=${page + 1}`);
    }
    assert.fail("Incomplete jobs pagination");
  }
  async function download(artifact) {
    assert.ok(token, "Proof Actions token required for download");
    const response = await request(`${prefix}/actions/artifacts/${id(artifact.id)}/zip`);
    assert.equal(response.status, 302, "Artifact redirect required");
    const location = new URL(response.headers.get("location"));
    assert.equal(location.protocol, "https:"); assert.equal(location.username + location.password + location.port, "");
    assert.ok(location.hostname.endsWith(".blob.core.windows.net") || location.hostname.endsWith(".actions.githubusercontent.com"), "Unapproved artifact storage host");
    const storage = await transport(location.href, { method: "GET", redirect: "error", signal: AbortSignal.timeout(30000) });
    assert.equal(storage.status, 200, "Artifact unavailable"); const data = await bytes(storage, TRANSFER_LIMIT);
    assert.equal(`sha256:${hash(data)}`, artifact.digest, "GitHub artifact digest mismatch"); return data;
  }
  return { get: async p => (await get(p)).value, pages, jobs, download };
}

export async function authenticateDispatch(api, c) {
  const repo = await api.get(prefix); assert.equal(repo.full_name, REPOSITORY); assert.equal(repo.default_branch, "main"); assert.equal(repo.private, false);
  const latest = await api.get(`${prefix}/actions/runs/${c.runId}`);
  assert.equal(latest.run_attempt, c.runAttempt, "Stale workflow attempt");
  const run = await api.get(`${prefix}/actions/runs/${c.runId}/attempts/${c.runAttempt}`);
  assert.equal(id(run.id), c.runId); assert.equal(run.run_attempt, c.runAttempt);
  assert.equal(run.repository?.full_name, REPOSITORY); assert.equal(run.head_repository?.full_name, REPOSITORY);
  assert.equal(run.event, "workflow_dispatch"); assert.equal(run.head_branch, "main"); assert.equal(run.head_sha, c.controllerSha);
  assert.equal(run.path, c.workflowPath); assert.ok(["queued", "in_progress", "waiting", "pending"].includes(run.status));
  const workflow = await api.get(`${prefix}/actions/workflows/${id(run.workflow_id)}`);
  assert.equal(workflow.path, c.workflowPath); assert.equal(workflow.state, "active");
  const main = await api.get(`${prefix}/git/ref/heads/main`); assert.equal(main.ref, "refs/heads/main"); assert.equal(main.object.type, "commit"); sha(main.object.sha);
  assert.ok(Number.isFinite(Date.parse(run.run_started_at)), "Missing attempt start");
  return { mainSha: main.object.sha, attemptStartedAt: new Date(run.run_started_at).toISOString(), workflowId: id(run.workflow_id) };
}
export async function requiredChecks(api, candidateSha) {
  sha(candidateSha);
  const runs = await api.pages(`${prefix}/actions/runs?head_sha=${candidateSha}&event=push`, "workflow_runs");
  const matching = runs.filter(r => r.path === ".github/workflows/validation.yml" && r.head_branch === "main");
  assert.ok(matching.length > 0, "No validation run for candidate on main");
  matching.sort((a, b) => b.id - a.id); const run = matching[0];
  assert.equal(run.repository?.full_name, REPOSITORY); assert.equal(run.head_repository?.full_name, REPOSITORY);
  assert.equal(run.head_sha, candidateSha); assert.equal(run.event, "push"); assert.equal(run.status, "completed"); assert.equal(run.conclusion, "success", "Required validation not successful");
  const current = await api.get(`${prefix}/actions/runs/${id(run.id)}`);
  assert.equal(current.run_attempt, run.run_attempt); assert.equal(current.conclusion, "success");
  const jobs = await api.jobs(run.id, run.run_attempt);
  const checks = await api.pages(`${prefix}/commits/${candidateSha}/check-runs?filter=latest`, "check_runs");
  return { validationRunId: id(run.id), validationRunAttempt: run.run_attempt, checks: CHECKS.map(name => {
    const selected = checks.filter(c => c.name === name); assert.equal(selected.length, 1, "Missing/ambiguous required check");
    const c = selected[0]; assert.equal(c.app?.id, 15368); assert.equal(c.head_sha, candidateSha);
    assert.equal(c.check_suite?.id, run.check_suite_id); assert.equal(c.status, "completed"); assert.equal(c.conclusion, "success");
    const j = jobs.filter(j => j.check_run_url === `https://api.github.com${prefix}/check-runs/${id(c.id)}`);
    assert.equal(j.length, 1, "Check not in current validation attempt"); assert.equal(j[0].name, name);
    assert.equal(j[0].run_attempt, run.run_attempt); assert.equal(j[0].head_sha, candidateSha); assert.equal(j[0].conclusion, "success");
    return { name, id: id(c.id), producer: 15368, headSha: candidateSha, conclusion: "success" };
  }) };
}
export async function artifactEvidence(api, c, kind, artifactId, attemptStartedAt) {
  assert.ok(["candidate", "evidence"].includes(kind));
  const a = await api.get(`${prefix}/actions/artifacts/${id(artifactId)}`);
  assert.equal(id(a.id), artifactId); assert.equal(a.name, `${kind}-${c.runId}-${c.runAttempt}`); assert.equal(a.expired, false);
  assert.equal(id(a.workflow_run?.id), c.runId); assert.equal(a.workflow_run?.head_sha, c.controllerSha); assert.equal(a.workflow_run?.head_branch, "main");
  assert.match(a.digest, /^sha256:[a-f0-9]{64}$/); assert.ok(a.size_in_bytes > 0 && a.size_in_bytes <= TRANSFER_LIMIT);
  assert.ok(Date.parse(a.created_at) >= Date.parse(attemptStartedAt), "Artifact from prior attempt");
  assert.ok(Date.parse(a.expires_at) > Date.now(), "Expired artifact");
  const prepare = (await api.jobs(c.runId, c.runAttempt)).filter(j => j.name === "prepare");
  assert.equal(prepare.length, 1); assert.equal(prepare[0].run_attempt, c.runAttempt); assert.equal(prepare[0].head_sha, c.controllerSha);
  assert.equal(prepare[0].conclusion, "success", "Prepare gate did not succeed");
  assert.ok(Date.parse(a.created_at) >= Date.parse(prepare[0].started_at) && Date.parse(a.created_at) <= Date.parse(prepare[0].completed_at), "Artifact outside prepare attempt");
  return a;
}
