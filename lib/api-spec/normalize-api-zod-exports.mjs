import { readFile, writeFile } from "node:fs/promises";

const barrelPath = new URL("../api-zod/src/index.ts", import.meta.url);
const source = await readFile(barrelPath, "utf8");
const normalized = source
  .split(/\r?\n/)
  .filter((line) => !/^export \* from ['"]\.\/generated\/types['"];?$/.test(line.trim()))
  .join("\n");

if (normalized !== source) {
  await writeFile(barrelPath, normalized);
}
