import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const platformNames = {
  darwin: "macOS",
  linux: "Linux",
  win32: "Windows",
};
const architectureNames = {
  arm64: "ARM64",
  x64: "X64",
};

const runtimePlatform = process.env.SUNSETPR_ACTION_PLATFORM ?? "linux";
const runtimeArchitecture = process.env.SUNSETPR_ACTION_ARCHITECTURE ?? "x64";
const platformName = platformNames[runtimePlatform];
const architectureName = architectureNames[runtimeArchitecture];
if (!platformName || !architectureName) {
  throw new Error(`Unsupported Action runtime: ${runtimePlatform}-${runtimeArchitecture}`);
}

const source = path.resolve(
  "node_modules/@ast-grep/lang-python/prebuilds",
  `prebuild-${platformName}-${architectureName}`,
  "parser.so",
);
const destination = path.resolve("dist/action/python-parser/parser.so");
await mkdir(path.dirname(destination), { recursive: true });
await copyFile(source, destination);
await copyFile("scripts/action-runner.mjs", "dist/action/runner.js");

const assets = [
  path.resolve("dist/action/index.js"),
  path.resolve("dist/action/runner.js"),
  destination,
  ...(await import("node:fs/promises").then(({ readdir }) => readdir("dist/action")))
    .filter((name) => name.endsWith(".node"))
    .map((name) => path.resolve("dist/action", name)),
];
for (const asset of assets) {
  const metadata = await stat(asset);
  if (!metadata.isFile() || metadata.size === 0) {
    throw new Error(`Invalid packaged Action asset: ${asset}`);
  }
}

process.stdout.write(
  `Packaged SunsetPR Action for ${runtimePlatform}-${runtimeArchitecture} with ${assets.length} runtime assets.\n`,
);
