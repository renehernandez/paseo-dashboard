import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const COMPILER_PATHS = {
  darwin: "osx-bin/hermesc",
  linux: "linux64-bin/hermesc",
  win32: "win64-bin/hermesc.exe",
};

function emitForNativeParser(source, fileName) {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.System,
      target: ts.ScriptTarget.ES2016,
    },
  }).outputText;
}

function compileWithHermes(source) {
  const relativeCompiler = COMPILER_PATHS[process.platform];
  if (!relativeCompiler) throw new Error(`Hermes compilation is unsupported on ${process.platform}`);
  const compiler = resolve("node_modules/react-native/sdks/hermesc", relativeCompiler);
  const result = spawnSync(compiler, ["-dump-bytecode", "-"], {
    input: source,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

describe("native Hermes syntax", () => {
  it("compiles the production state owners", () => {
    const source = ["client/directory-store.ts", "client/timeline-preview.ts"]
      .map((fileName) => emitForNativeParser(readFileSync(fileName, "utf8"), fileName))
      .join("\n");
    const result = compileWithHermes(source);

    expect(result.status, result.stderr).toBe(0);
  });

  it("fails when the portable emission contains a class expression", () => {
    const source = emitForNativeParser("export class Unsupported {}", "unsupported.ts");
    const result = compileWithHermes(source);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Invalid expression encountered");
  });
});
