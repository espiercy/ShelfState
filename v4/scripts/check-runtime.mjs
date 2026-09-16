const expectedNodeMajor = 24;
const minimumNodeMinor = 11;
const expectedNpmVersion = "11.6.2";

const [nodeMajor, nodeMinor] = process.versions.node
  .split(".")
  .map((part) => Number.parseInt(part, 10));

if (nodeMajor !== expectedNodeMajor || nodeMinor < minimumNodeMinor) {
  throw new Error(
    `ShelfState V4 requires Node.js >=24.11.0 <25; received ${process.versions.node}.`,
  );
}

const npmUserAgent = process.env.npm_config_user_agent ?? "";
const npmMatch = /^npm\/([^ ]+)/.exec(npmUserAgent);

if (!npmMatch) {
  throw new Error(
    "Run ShelfState V4 commands through npm so the pinned npm version can be verified.",
  );
}

if (npmMatch[1] !== expectedNpmVersion) {
  throw new Error(
    `ShelfState V4 requires npm ${expectedNpmVersion}; received ${npmMatch[1]}.`,
  );
}

console.log(
  `Verified ShelfState V4 runtime: Node.js ${process.versions.node}, npm ${npmMatch[1]}.`,
);
