import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  cp,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CERTIFICATE_ASSEMBLY_REVIEW_SCHEMA,
  CERTIFICATE_ASSEMBLY_REVIEW_STATUS,
  certificateAssemblyTarget,
  certificateSynthesisContext,
  certificateSynthesisContextBytes,
  createCertificateAssemblyReviewPackage,
  parseCertificateAssemblyReviewPackage,
} from "../infrastructure/bootstrap/certificate-assembly-adapter.mjs";
import { credentialFreeEnvironment } from "../scripts/release/offline-environment.mjs";
import { hash, hashObject } from "../scripts/release/schema.mjs";

const ACCOUNT = "123456789012";
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const appPath = fileURLToPath(new URL("../infrastructure/bin/app.mjs", import.meta.url));
const contextBytes = certificateSynthesisContextBytes();
const trustedTarget = certificateAssemblyTarget(ACCOUNT, hash(contextBytes));
const trustedTargetDigest = hashObject(trustedTarget);
let suiteRoot;
let assemblyRoot;

async function synthActualAssembly(root) {
  const context = certificateSynthesisContext();
  const result = spawnSync(process.execPath, [appPath], {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...credentialFreeEnvironment(),
      SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT,
      CDK_OUTDIR: root,
      CDK_CONTEXT_JSON: JSON.stringify(context.context),
    },
    timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
}

async function adapt(root, context = contextBytes, target = trustedTarget, pin = trustedTargetDigest) {
  return createCertificateAssemblyReviewPackage(root, context, target, pin);
}

async function withAssemblyCopy(callback) {
  const copyRoot = path.join(suiteRoot, `copy-${randomUUID()}`);
  await cp(assemblyRoot, copyRoot, { recursive: true });
  try {
    return await callback(copyRoot);
  } finally {
    await rm(copyRoot, { recursive: true, force: true });
  }
}

before(async () => {
  suiteRoot = await mkdtemp(path.join(os.tmpdir(), "shelfstate-certificate-adapter-"));
  assemblyRoot = path.join(suiteRoot, "assembly");
  await synthActualAssembly(assemblyRoot);
});

after(async () => {
  await rm(suiteRoot, { recursive: true, force: true });
});

test("actual certificate assembly becomes deterministic explicitly non-executable review material", async () => {
  const first = await adapt(assemblyRoot);
  const secondRoot = path.join(suiteRoot, "assembly-second");
  await synthActualAssembly(secondRoot);
  const second = await adapt(secondRoot);
  assert.deepEqual(first, second);
  const review = parseCertificateAssemblyReviewPackage(first, {
    ...trustedTarget,
    templateSha256: parseCertificateAssemblyReviewPackage(first).review.stacks
      .find((stack) => stack.id === "ShelfStateV4DevEdgeCertificate").sha256,
  });
  assert.equal(review.schema, CERTIFICATE_ASSEMBLY_REVIEW_SCHEMA);
  assert.equal(review.status, CERTIFICATE_ASSEMBLY_REVIEW_STATUS);
  assert.equal(review.executionAuthorized, false);
  assert.equal(review.review.stackCount, 6);
  assert.equal(review.review.resourceCount, 1);
  assert.equal(review.source.files.length, 22);
});

test("review package binds raw assembly, manifest, templates, assets, context and authority", async () => {
  const bytes = await adapt(assemblyRoot);
  const review = parseCertificateAssemblyReviewPackage(bytes, trustedTarget);
  assert.equal(review.source.assemblySha256, hashObject(review.source.files));
  assert.equal(review.source.manifest.sha256, hash(Buffer.from(review.source.manifest.raw)));
  assert.equal(review.source.synthesisContext.sha256, hash(contextBytes));
  assert.deepEqual(review.target, trustedTarget);
  assert.deepEqual(
    review.review.stacks.map((stack) => [stack.id, stack.resourceCount]),
    [
      ["ShelfStateV4DevEdgeCertificate", 1],
      ["ShelfStateV4DevEdgeDelivery", 0],
      ["ShelfStateV4DevIdentitySession", 0],
      ["ShelfStateV4DevLibraryApi", 0],
      ["ShelfStateV4DevOperationsLifecycle", 0],
      ["ShelfStateV4DevRecoveryObservability", 0],
    ],
  );
  assert.equal(review.review.assetManifests.length, 6);
});

test("unexpected assembly members and candidate-supplied trust material fail closed", async () => {
  for (const name of ["unexpected.json", "trusted-target.json", "review-pin.json"]) {
    await withAssemblyCopy(async (root) => {
      await writeFile(path.join(root, name), "{}");
      await assert.rejects(adapt(root), /Unexpected or missing CDK assembly member/);
    });
  }
  await assert.rejects(
    adapt(assemblyRoot, contextBytes, trustedTarget, "0".repeat(64)),
    /Independent certificate target pin mismatch/,
  );
});

test("template substitution and resources outside the certificate stack reject", async () => {
  await withAssemblyCopy(async (root) => {
    const file = path.join(root, "ShelfStateV4DevEdgeCertificate.template.json");
    await writeFile(file, `${await readFile(file, "utf8")}\n`);
    await assert.rejects(adapt(root), /template asset|template publication|target\/execution|mismatch|substitution/i);
  });
  await withAssemblyCopy(async (root) => {
    const file = path.join(root, "ShelfStateV4DevLibraryApi.template.json");
    const template = JSON.parse(await readFile(file, "utf8"));
    template.Resources = { Unexpected: { Type: "AWS::S3::Bucket", Properties: {} } };
    await writeFile(file, JSON.stringify(template));
    await assert.rejects(adapt(root), /selected certificate stack|foundation template|must remain resource empty|zero resources/);
  });
});

test("manifest and asset behavior substitutions reject", async () => {
  await withAssemblyCopy(async (root) => {
    const file = path.join(root, "manifest.json");
    const manifest = JSON.parse(await readFile(file, "utf8"));
    manifest.artifacts.ShelfStateV4DevEdgeCertificate.environment = `aws://${ACCOUNT}/us-west-2`;
    await writeFile(file, JSON.stringify(manifest));
    await assert.rejects(adapt(root), /environment|target\/execution|binding mismatch/i);
  });
  await withAssemblyCopy(async (root) => {
    const file = path.join(root, "manifest.json");
    const manifest = JSON.parse(await readFile(file, "utf8"));
    manifest.artifacts["aws-cdk-lib/feature-flag-report"].properties.flags["review:unexpected"] = {
      recommendedValue: true,
      explanation: "Unreviewed synthesis behavior",
    };
    await writeFile(file, JSON.stringify(manifest));
    await assert.rejects(adapt(root), /feature flag report identity mismatch/i);
  });
  await withAssemblyCopy(async (root) => {
    const file = path.join(root, "ShelfStateV4DevEdgeCertificate.assets.json");
    const asset = JSON.parse(await readFile(file, "utf8"));
    asset.dockerImages.Unexpected = { source: {}, destinations: {} };
    await writeFile(file, JSON.stringify(asset));
    await assert.rejects(adapt(root), /Docker assets not supported/);
  });
});

test("context substitution fails even with newly consistent candidate pins", async () => {
  const substituted = certificateSynthesisContext();
  substituted.context.shelfstateInitializationPhase = "api-parent";
  const substitutedBytes = Buffer.from(JSON.stringify(substituted));
  await assert.rejects(adapt(assemblyRoot, substitutedBytes), /Synthesis context substitution/);
  const repinnedTarget = certificateAssemblyTarget(ACCOUNT, hash(substitutedBytes));
  await assert.rejects(
    adapt(assemblyRoot, substitutedBytes, repinnedTarget, hashObject(repinnedTarget)),
    /Unsupported synthesis context/,
  );
});

test("incorrect phase, region, stack and execution authority fail under recomputed pins", async () => {
  for (const [key, value] of [
    ["phase", "api-parent"],
    ["region", "us-west-2"],
    ["stack", "shelfstate-v4-dev-library-api"],
    ["executionRole", `arn:aws:iam::${ACCOUNT}:role/unreviewed`],
  ]) {
    const changed = { ...trustedTarget, [key]: value };
    await assert.rejects(adapt(assemblyRoot, contextBytes, changed, hashObject(changed)), /target\/authority binding mismatch/i);
  }
});

test("serialized package substitutions fail before bounded-initialization use", async () => {
  const bytes = await adapt(assemblyRoot);
  const review = JSON.parse(bytes);
  review.executionAuthorized = true;
  assert.throws(
    () => parseCertificateAssemblyReviewPackage(Buffer.from(JSON.stringify(review))),
    /must never authorize execution/,
  );
  const changed = JSON.parse(bytes);
  changed.review.stacks[0].raw += "\n";
  assert.throws(
    () => parseCertificateAssemblyReviewPackage(Buffer.from(JSON.stringify(changed))),
    /raw byte count mismatch|raw content substitution/,
  );
});
