import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BOUNDARY_ARTIFACT = "toolchain-boundary.json";

function assertPathInside(rootDirectory, candidate) {
  const relative = path.relative(rootDirectory, candidate);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Refusing to write outside the V4 package: ${candidate}`);
  }
}

export async function buildV4BoundaryArtifact(rootDirectory) {
  const outputDirectory = path.join(rootDirectory, "dist");
  const outputFile = path.join(outputDirectory, BOUNDARY_ARTIFACT);

  assertPathInside(rootDirectory, outputDirectory);
  assertPathInside(rootDirectory, outputFile);

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    outputFile,
    `${JSON.stringify(
      {
        boundary: "v4",
        containsApplicationCode: false,
        package: "@shelfstate/v4",
        workPackage: "WP-002",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const entries = await readdir(outputDirectory);
  if (entries.length !== 1 || entries[0] !== BOUNDARY_ARTIFACT) {
    throw new Error("V4 boundary build produced an unexpected output set.");
  }

  return { outputDirectory, outputFile };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  const packageRoot = path.resolve(path.dirname(currentFile), "..");
  const result = await buildV4BoundaryArtifact(packageRoot);
  console.log(`Prepared deterministic V4 boundary artifact: ${result.outputFile}`);
}
