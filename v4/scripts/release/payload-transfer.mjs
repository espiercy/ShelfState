import { readFile, mkdir, writeFile, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { assert, canonical, hash, parseEvidenceJson, object, equal } from "./schema.mjs";
import { inventory, validateInventory, verifyInventory, artifactPath, LIMITS } from "./artifacts.mjs";

export const TRANSFER_LIMIT = 96 * 1024 * 1024;
// A data-only canonical bundle, not a tar/zip interpreted by an external tool.
export async function pack(root) {
  const files = await inventory(root), entries = [];
  for (const f of files) entries.push({ path: f.path, data: (await readFile(path.join(root, f.path))).toString("base64") });
  await verifyInventory(root, files);
  const bytes = Buffer.from(canonical({ schema: "shelfstate.payload/v1", files, entries }));
  assert.ok(bytes.length <= TRANSFER_LIMIT); return bytes;
}
export function decodeBundle(bytes, expectedFiles, expectedDigest) {
  assert.equal(hash(bytes), expectedDigest, "Payload digest mismatch");
  // JSON ingress is deliberately bounded to 16 MiB: current empty assemblies
  // are far smaller. Oversized future payloads require review, not relaxation.
  const b = parseEvidenceJson(bytes); object(b, ["schema", "files", "entries"]);
  assert.equal(b.schema, "shelfstate.payload/v1"); validateInventory(b.files);
  equal(b.files, expectedFiles, "Payload inventory mismatch");
  assert.equal(b.entries.length, b.files.length);
  const result = b.entries.map((e, i) => {
    object(e, ["path", "data"]); assert.equal(e.path, b.files[i].path);
    assert.equal(typeof e.data, "string");
    const data = Buffer.from(e.data, "base64"); assert.equal(data.toString("base64"), e.data, "Noncanonical base64");
    assert.equal(data.length, b.files[i].bytes); assert.equal(hash(data), b.files[i].sha256, "Entry digest mismatch");
    return { path: e.path, data };
  });
  return result;
}
export async function unpack(bytes, files, expectedDigest, stagingParent) {
  const entries = decodeBundle(bytes, files, expectedDigest); // validate ALL before any write
  const root = await mkdtemp(path.join(stagingParent, "verified-payload-"));
  for (const e of entries) {
    const target = path.join(root, ...e.path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, e.data, { flag: "wx", mode: 0o600 });
  }
  await verifyInventory(root, files); return root;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
// GitHub's artifact transport ZIP contains exactly ONE fixed-named data file.
// No archive entry is ever written/executed. A narrow ZIP32 store/deflate reader
// rejects links, extra entries, encryption, ZIP64, names/headers disagreement,
// trailing/overlapping data and resource bombs before returning bytes.
export function unwrapArtifact(zip, expectedName) {
  artifactPath(expectedName); assert.ok(!expectedName.includes("/"));
  assert.ok(zip.length >= 98 && zip.length <= TRANSFER_LIMIT, "Transport size");
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50, "ZIP end/comment unsupported");
  for (const n of [4, 6, 20]) assert.equal(zip.readUInt16LE(end + n), 0);
  assert.equal(zip.readUInt16LE(end + 8), 1); assert.equal(zip.readUInt16LE(end + 10), 1, "Unexpected archive entry");
  const central = zip.readUInt32LE(end + 16), size = zip.readUInt32LE(end + 12);
  assert.equal(central + size, end); assert.ok(size >= 46);
  assert.equal(zip.readUInt32LE(central), 0x02014b50);
  const flags = zip.readUInt16LE(central + 8), method = zip.readUInt16LE(central + 10);
  assert.equal(flags & ~0x808, 0, "Unsupported ZIP flags"); assert.ok([0, 8].includes(method));
  const packed = zip.readUInt32LE(central + 20), unpacked = zip.readUInt32LE(central + 24);
  assert.ok(unpacked <= LIMITS.bytesPerFile && packed <= TRANSFER_LIMIT, "Unbounded ZIP entry");
  const nameLength = zip.readUInt16LE(central + 28);
  assert.equal(zip.readUInt16LE(central + 30), 0, "ZIP extra unsupported");
  assert.equal(zip.readUInt16LE(central + 32), 0); assert.equal(zip.readUInt16LE(central + 34), 0);
  assert.equal(size, 46 + nameLength);
  const attr = zip.readUInt32LE(central + 38), mode = attr >>> 16;
  assert.ok((mode & 0xf000) === 0 || (mode & 0xf000) === 0x8000, "ZIP link/special file");
  assert.equal(attr & 0x10, 0, "ZIP directory"); assert.equal(zip.readUInt32LE(central + 42), 0);
  const name = zip.subarray(central + 46, central + 46 + nameLength);
  assert.equal(name.toString("utf8"), expectedName, "Unexpected ZIP path");
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt16LE(6), flags); assert.equal(zip.readUInt16LE(8), method);
  assert.equal(zip.readUInt16LE(26), nameLength); assert.equal(zip.readUInt16LE(28), 0);
  assert.ok(zip.subarray(30, 30 + nameLength).equals(name));
  const start = 30 + nameLength, descriptor = (flags & 8) !== 0;
  assert.equal(start + packed + (descriptor ? 16 : 0), central, "Overlapping/extra ZIP data");
  const crc = zip.readUInt32LE(central + 16);
  if (descriptor) {
    const d = start + packed; assert.equal(zip.readUInt32LE(d), 0x08074b50);
    assert.equal(zip.readUInt32LE(d + 4), crc); assert.equal(zip.readUInt32LE(d + 8), packed); assert.equal(zip.readUInt32LE(d + 12), unpacked);
    for (const offset of [14, 18, 22]) assert.equal(zip.readUInt32LE(offset), 0);
  } else {
    assert.equal(zip.readUInt32LE(14), crc); assert.equal(zip.readUInt32LE(18), packed); assert.equal(zip.readUInt32LE(22), unpacked);
  }
  const compressed = zip.subarray(start, start + packed);
  const result = method === 0 ? { buffer: compressed, engine: { bytesWritten: packed } }
    : inflateRawSync(compressed, { maxOutputLength: LIMITS.bytesPerFile, info: true });
  assert.equal(result.engine.bytesWritten, packed, "Trailing deflate data");
  assert.equal(result.buffer.length, unpacked); assert.equal(crc32(result.buffer), crc, "ZIP CRC mismatch");
  return result.buffer;
}
