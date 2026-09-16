import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDirectory, "../..");
const outputRoot = path.join(packageRoot, "cdk.out");

function assertInsideOutputRoot(candidate) {
  const relative = path.relative(outputRoot, candidate);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Refusing to read a CDK artifact outside ${outputRoot}.`);
  }
}

async function environmentPreview(environmentName) {
  const environmentRoot = path.join(outputRoot, environmentName);
  const manifestPath = path.join(environmentRoot, "manifest.json");
  assertInsideOutputRoot(environmentRoot);
  assertInsideOutputRoot(manifestPath);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const stacks = [];

  for (const [artifactId, artifact] of Object.entries(manifest.artifacts ?? {})) {
    if (artifact.type !== "aws:cloudformation:stack") continue;
    const templatePath = path.join(
      environmentRoot,
      artifact.properties.templateFile,
    );
    assertInsideOutputRoot(templatePath);
    const templateBytes = await readFile(templatePath);
    const template = JSON.parse(templateBytes.toString("utf8"));

    stacks.push({
      artifactId,
      dependencies: [...(artifact.dependencies ?? [])].sort(),
      environment: artifact.environment,
      resourceCount: Object.keys(template.Resources ?? {}).length,
      stackName: artifact.properties.stackName,
      tags: artifact.properties.tags ?? {},
      template: path.relative(packageRoot, templatePath).replaceAll("\\", "/"),
      templateSha256: createHash("sha256").update(templateBytes).digest("hex"),
    });
  }

  stacks.sort((left, right) => left.stackName.localeCompare(right.stackName));
  return { environmentName, stacks };
}

const preview = [];
for (const environmentName of ["dev", "prod"]) {
  preview.push(await environmentPreview(environmentName));
}

console.log(JSON.stringify({ workPackage: "WP-003", preview }, null, 2));
