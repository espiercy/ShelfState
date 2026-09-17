import assert from "node:assert/strict";

// Only the YAML forms used by these two small CI files are supported. Unknown
// structure fails closed; this is not a general YAML or Actions parser.
export function parseCiYaml(source) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;

  function lineAt(position) {
    const raw = lines[position];
    if (raw.includes("\t")) throw new Error("Tabs are unsupported in CI YAML");
    const indent = raw.match(/^ */)[0].length;
    const body = raw.slice(indent);
    let quoted = "";
    let content = body;
    for (let offset = 0; offset < body.length; offset += 1) {
      const character = body[offset];
      if ((character === '"' || character === "'") && (!quoted || quoted === character)) {
        quoted = quoted ? "" : character;
      }
      if (character === "#" && !quoted && (offset === 0 || /\s/.test(body[offset - 1]))) {
        content = body.slice(0, offset);
        break;
      }
    }
    return { indent, content: content.trimEnd() };
  }

  function peek() {
    while (index < lines.length) {
      const line = lineAt(index);
      if (line.content.trim()) return line;
      index += 1;
    }
    return null;
  }

  function pair(content) {
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*))?$/.exec(content);
    if (!match) throw new Error(`Unsupported CI YAML mapping: ${content}`);
    return [match[1], match[2] ?? ""];
  }

  function scalar(value) {
    if (value === "true") return true;
    if (value === "false") return false;
    if (/^\d+$/.test(value)) return Number(value);
    if (/^\[.*\]$/.test(value)) {
      const inner = value.slice(1, -1).trim();
      return inner ? inner.split(",").map((part) => scalar(part.trim())) : [];
    }
    if (/^\{.*\}$/.test(value)) {
      const result = {};
      const inner = value.slice(1, -1).trim();
      for (const entry of inner ? inner.split(",") : []) {
        const [key, item] = pair(entry.trim());
        if (Object.hasOwn(result, key)) throw new Error(`Duplicate CI YAML key: ${key}`);
        result[key] = scalar(item);
      }
      return result;
    }
    if (/^(['"]).*\1$/.test(value)) return value.slice(1, -1);
    if (/^[&*!>|]/.test(value) || value === "---" || value === "...") {
      throw new Error(`Unsupported CI YAML scalar: ${value}`);
    }
    return value;
  }

  function literal(parentIndent) {
    const block = [];
    while (index < lines.length) {
      const raw = lines[index];
      const indent = raw.match(/^ */)[0].length;
      if (raw.trim() && indent <= parentIndent) break;
      block.push({ indent, raw });
      index += 1;
    }
    const contentIndent = Math.min(
      ...block.filter((line) => line.raw.trim()).map((line) => line.indent),
    );
    if (!Number.isFinite(contentIndent)) throw new Error("Empty CI YAML literal");
    return block.map((line) => line.raw.slice(contentIndent)).join("\n").trimEnd();
  }

  function valueFor(value, parentIndent) {
    if (value === "|") return literal(parentIndent);
    if (value) return scalar(value);
    const next = peek();
    if (!next || next.indent <= parentIndent) return null;
    if (next.indent !== parentIndent + 2) throw new Error("Unexpected CI YAML indentation");
    return node(next.indent);
  }

  function mapping(indent) {
    const result = {};
    while (true) {
      const next = peek();
      if (!next || next.indent < indent) break;
      if (next.indent !== indent || next.content.startsWith("- ")) {
        throw new Error("Unexpected CI YAML mapping structure");
      }
      const [key, value] = pair(next.content);
      if (Object.hasOwn(result, key)) throw new Error(`Duplicate CI YAML key: ${key}`);
      index += 1;
      result[key] = valueFor(value, indent);
    }
    return result;
  }

  function sequence(indent) {
    const result = [];
    while (true) {
      const next = peek();
      if (!next || next.indent < indent) break;
      if (next.indent !== indent || !next.content.startsWith("- ")) {
        throw new Error("Unexpected CI YAML sequence structure");
      }
      const content = next.content.slice(2).trim();
      index += 1;
      let item;
      if (content.startsWith("{")) {
        item = scalar(content);
      } else {
        const [key, value] = pair(content);
        item = { [key]: valueFor(value, indent + 2) };
        const continuation = peek();
        if (continuation && continuation.indent > indent) {
          if (continuation.indent !== indent + 2) {
            throw new Error("Unexpected CI YAML sequence indentation");
          }
          const remaining = mapping(indent + 2);
          for (const [otherKey, otherValue] of Object.entries(remaining)) {
            if (Object.hasOwn(item, otherKey)) {
              throw new Error(`Duplicate CI YAML key: ${otherKey}`);
            }
            item[otherKey] = otherValue;
          }
        }
      }
      result.push(item);
    }
    return result;
  }

  function node(indent) {
    const next = peek();
    if (!next || next.indent !== indent) throw new Error("Unexpected CI YAML node");
    return next.content.startsWith("- ") ? sequence(indent) : mapping(indent);
  }

  const document = node(0);
  if (peek()) throw new Error("Trailing unsupported CI YAML content");
  return document;
}

const checkout = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const setupNode = "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020";
const v3Commands = [
  "node scripts/check-ci-secrets.mjs",
  "node --test",
  "node --test test/deployment/v3-v4-isolation.test.js",
  "node scripts/v3-deployment-boundary.mjs build",
];
const v4Commands = [
  'npm install --global npm@11.6.2\ntest "$(npm --version)" = "11.6.2"',
  'test -z "${AWS_ACCESS_KEY_ID:-}"\ntest -z "${AWS_SECRET_ACCESS_KEY:-}"\ntest -z "${AWS_SESSION_TOKEN:-}"\ntest -z "${AWS_PROFILE:-}"\ntest -z "${CDK_DEFAULT_ACCOUNT:-}"',
  "npm ci",
  "npm audit --audit-level=high",
  "npm audit signatures",
  "npm run verify",
];

function exactKeys(value, keys, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be a mapping`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} has unexpected keys`);
}

function checkJob(job, label, commands) {
  if (Object.hasOwn(job, "if")) throw new Error(`Conditional required job: ${label}`);
  if (Object.hasOwn(job, "continue-on-error")) {
    throw new Error(`continue-on-error on required job: ${label}`);
  }
  exactKeys(job, label === "V4" ? ["name", "runs-on", "defaults", "steps"] : ["name", "runs-on", "steps"], label);
  assert.equal(job["runs-on"], "ubuntu-24.04");
  assert.ok(Array.isArray(job.steps), `${label} steps must be a sequence`);

  const references = [];
  const runs = [];
  for (const step of job.steps) {
    if (Object.hasOwn(step, "if")) throw new Error(`Conditional validation step in ${label}`);
    if (Object.hasOwn(step, "continue-on-error")) {
      throw new Error(`continue-on-error on validation step in ${label}`);
    }
    if (Object.hasOwn(step, "uses")) {
      if (!/^[^@\s]+@[a-f0-9]{40}$/.test(step.uses)) {
        throw new Error(`Unpinned action reference in ${label}: ${step.uses}`);
      }
      exactKeys(step, Object.hasOwn(step, "name") ? ["name", "uses", "with"] : ["uses", "with"], `${label} action step`);
      references.push(step);
    } else {
      exactKeys(step, ["name", "run"], `${label} command step`);
      runs.push(step.run.trim());
    }
  }

  for (const required of commands) {
    if (!runs.includes(required)) throw new Error(`Missing required ${label} command: ${required}`);
  }
  assert.deepEqual(runs, commands, `${label} command sequence changed`);
  return references;
}

export function validateWorkflow(source) {
  const workflow = parseCiYaml(source);
  exactKeys(workflow, ["name", "on", "permissions", "jobs"], "workflow");
  exactKeys(workflow.on, ["pull_request", "push"], "triggers");
  assert.equal(workflow.on.pull_request, null);
  exactKeys(workflow.on.push, ["branches"], "push trigger");
  assert.deepEqual(workflow.on.push.branches, ["main"]);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  exactKeys(workflow.jobs, ["repository-v3", "v4-validation"], "validation jobs");

  const v3Actions = checkJob(workflow.jobs["repository-v3"], "V3", v3Commands);
  const v4Job = workflow.jobs["v4-validation"];
  const v4Actions = checkJob(v4Job, "V4", v4Commands);
  assert.deepEqual(v4Job.defaults, { run: { "working-directory": "v4" } });

  const actions = [...v3Actions, ...v4Actions];
  assert.deepEqual(actions.map((step) => step.uses), [checkout, setupNode, checkout, setupNode]);
  for (const step of actions) {
    assert.deepEqual(
      step.with,
      step.uses === checkout
        ? { "persist-credentials": false }
        : { "node-version-file": "v4/.nvmrc", "package-manager-cache": false },
    );
  }
  return workflow;
}

export function validateDependabot(source) {
  const configuration = parseCiYaml(source);
  exactKeys(configuration, ["version", "updates"], "Dependabot configuration");
  assert.equal(configuration.version, 2);
  assert.ok(Array.isArray(configuration.updates));
  assert.equal(configuration.updates.length, 2);
  for (const update of configuration.updates) {
    exactKeys(update, ["package-ecosystem", "directory", "schedule", "open-pull-requests-limit"], "Dependabot update");
    exactKeys(update.schedule, ["interval"], "Dependabot schedule");
    assert.equal(update.schedule.interval, "weekly");
    assert.equal(update["open-pull-requests-limit"], 3);
  }
  assert.deepEqual(
    configuration.updates.map((update) => [update["package-ecosystem"], update.directory]),
    [["npm", "/v4"], ["github-actions", "/"]],
  );
  return configuration;
}
