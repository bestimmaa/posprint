"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { existsSync, readFileSync } = require("node:fs");
const pkg = require("../package.json");
const readmePath = path.resolve(__dirname, "..", "README.md");
const readme = readFileSync(readmePath, "utf8");
const normalizedReadme = readme.replace(/\r\n/g, "\n");

function getPublicReadmeContent() {
  const developmentHeading = "\n## Development\n";
  const developmentIndex = normalizedReadme.indexOf(developmentHeading);

  assert.notEqual(developmentIndex, -1);

  return normalizedReadme.slice(0, developmentIndex + 1);
}

function getWorkflowJobsBlock(workflow) {
  const normalizedWorkflow = workflow.replace(/\r\n/g, "\n");
  const jobsHeading = "\njobs:\n";
  const jobsIndex = normalizedWorkflow.indexOf(jobsHeading);

  assert.notEqual(jobsIndex, -1);

  return normalizedWorkflow.slice(jobsIndex + 1);
}

function getMarkdownSection(markdown, heading) {
  const normalizedMarkdown = markdown.replace(/\r\n/g, "\n");
  const headingMarker = `\n## ${heading}\n`;
  const headingIndex = normalizedMarkdown.indexOf(headingMarker);

  assert.notEqual(headingIndex, -1);

  const nextHeadingIndex = normalizedMarkdown.indexOf("\n## ", headingIndex + headingMarker.length);

  if (nextHeadingIndex === -1) {
    return normalizedMarkdown.slice(headingIndex + 1);
  }

  return normalizedMarkdown.slice(headingIndex + 1, nextHeadingIndex + 1);
}

function assertHeadingOrder(content, headings) {
  for (let index = 0; index < headings.length - 1; index += 1) {
    const currentIndex = content.indexOf(`\n## ${headings[index]}\n`);
    const nextIndex = content.indexOf(`\n## ${headings[index + 1]}\n`);

    assert.notEqual(currentIndex, -1);
    assert.notEqual(nextIndex, -1);
    assert.equal(currentIndex < nextIndex, true);
  }
}

test("package metadata points to public GitHub repo", () => {
  assert.equal(pkg.private, false);
  assert.equal(pkg.name, "@bestimmaa/posprint");
  assert.equal(pkg.author, "bestimmaa");
  assert.equal(pkg.license, "MIT");
  assert.equal(typeof pkg.bin, "object");
  assert.notEqual(pkg.bin, null);
  assert.equal(pkg.bin.posprint, "src/print-cli.js");
  assert.equal(typeof pkg.repository, "object");
  assert.notEqual(pkg.repository, null);
  assert.equal(pkg.repository.type, "git");
  assert.equal(pkg.repository.url, "git+https://github.com/bestimmaa/posprint.git");
  assert.equal(pkg.homepage, "https://github.com/bestimmaa/posprint#readme");
  assert.equal(typeof pkg.bugs, "object");
  assert.notEqual(pkg.bugs, null);
  assert.equal(pkg.bugs.url, "https://github.com/bestimmaa/posprint/issues");
});

test("package exposes public release scripts", () => {
  assert.equal(typeof pkg.scripts, "object");
  assert.notEqual(pkg.scripts, null);
  assert.equal(typeof pkg.scripts.release, "string");
  assert.equal(pkg.scripts.release, "node scripts/release.js");
  assert.equal(Object.hasOwn(pkg.scripts, "release:commit-tag"), false);
});

test("release script file exists and validates bump types", () => {
  const releaseScriptPath = path.resolve(__dirname, "..", "scripts", "release.js");
  assert.equal(existsSync(releaseScriptPath), true);

  const releaseScript = readFileSync(releaseScriptPath, "utf8");
  assert.equal(releaseScript.includes("Usage: npm run release -- <patch|minor|major>"), true);
  assert.equal(releaseScript.includes("git diff --quiet"), true);
  assert.equal(releaseScript.includes("git ls-files --others --exclude-standard"), true);
  assert.equal(releaseScript.includes("npm test"), true);
  assert.equal(releaseScript.includes("npm pack"), true);
  assert.equal(releaseScript.includes("npm version"), true);
  assert.equal(releaseScript.indexOf("npm version") < releaseScript.indexOf("npm pack"), true);
  assert.equal(releaseScript.includes("npm version <type>"), true);
  assert.equal(releaseScript.includes("-m"), true);
  assert.equal(releaseScript.includes("chore(release): %s"), true);
  assert.equal(releaseScript.includes("npm pack --json"), true);
  assert.equal(releaseScript.includes("unlinkSync"), true);
  assert.equal(releaseScript.includes("npm version 0.0.0 --no-git-tag-version"), false);
  assert.equal(releaseScript.includes("git reset --hard HEAD~1"), false);
  assert.equal(releaseScript.includes("git tag -d"), true);
  assert.equal(releaseScript.includes("git reset --soft HEAD~1"), true);
  assert.equal(releaseScript.includes("Release requires an attached HEAD branch."), true);
  assert.equal(releaseScript.includes('process.platform === "win32" ? "npm.cmd" : "npm"'), true);
  assert.equal(releaseScript.includes("shell: process.platform === \"win32\""), true);
  assert.equal(releaseScript.includes("let versionStarted = false;"), true);
  assert.equal(releaseScript.includes("versionStarted = true;"), true);
  assert.equal(releaseScript.includes("let cleanupSucceeded = true;"), true);
  assert.equal(releaseScript.includes("cleanupSucceeded = false;"), true);
  assert.equal(releaseScript.includes("const preReleaseHead = getHeadCommit();"), true);
  assert.equal(releaseScript.includes("const hadExpectedTagBeforeRelease = hasGitRef(expectedTag);"), true);
  assert.equal(releaseScript.includes("const expectedVersion = getNextVersion"), true);
  assert.equal(releaseScript.includes("const expectedTag = `v${expectedVersion}`;"), true);
  assert.equal(releaseScript.includes("rev-parse"), true);
  assert.equal(releaseScript.includes("return hasGitRef(expectedTag)"), false);
  assert.equal(releaseScript.includes("currentHead !== preReleaseHead"), true);
  assert.equal(releaseScript.includes("restoreReleaseFiles()"), true);
  assert.equal(releaseScript.includes("shouldDeleteTag: !hadExpectedTagBeforeRelease"), true);
  assert.equal(releaseScript.includes("Release failed before creating git release state"), true);
  assert.equal(releaseScript.includes("Release failed after version bump and was rolled back:"), true);
  assert.equal(releaseScript.includes("Release failed after version bump and rollback was incomplete:"), true);
  assert.equal(releaseScript.includes("pack artifact cleanup failed"), true);
  assert.equal(releaseScript.includes("Release requires CHANGELOG.md. Update it before running npm run release."), true);
  assert.equal(releaseScript.includes("Release requires CHANGELOG.md to include an entry for"), true);
  assert.equal(releaseScript.includes("## [${version}]"), true);
  assert.equal(releaseScript.includes("Release requires the main branch."), true);
  assert.equal(releaseScript.includes("git remote get-url github"), true);
  assert.equal(releaseScript.includes("bestimmaa/posprint"), true);
  assert.equal(releaseScript.includes("remotes.includes(\"github\")"), false);
  assert.equal(releaseScript.includes("git push origin main:main --follow-tags"), true);
  assert.equal(releaseScript.includes("git push github main:main --follow-tags"), true);
  assert.equal(releaseScript.includes("git push origin --follow-tags"), false);
  assert.equal(releaseScript.includes("git push github --follow-tags"), false);
});

test("readme documents npm install for module consumers", () => {
  assert.equal(readme.includes("npm install @bestimmaa/posprint"), true);
  assert.equal(readme.includes("npm i -g @bestimmaa/posprint"), true);
  assert.equal(readme.includes("require(\"@bestimmaa/posprint\")"), true);
  assert.equal(readme.includes("posprint --help"), true);
});

test("readme links to the expanded module api guide", () => {
  const moduleApiDocPath = path.resolve(__dirname, "..", "docs", "module-api.md");
  assert.equal(existsSync(moduleApiDocPath), true);

  const moduleApiDoc = readFileSync(moduleApiDocPath, "utf8");
  const localQueueSection = getMarkdownSection(moduleApiDoc, "CommonJS Local Queue");
  const printerUriSection = getMarkdownSection(moduleApiDoc, "CommonJS Printer URI");
  const conversionOnlySection = getMarkdownSection(moduleApiDoc, "CommonJS Conversion Only");
  const esmSection = getMarkdownSection(moduleApiDoc, "ESM Interop");

  assert.match(
    readme,
    /\[[^\]]+\]\(https:\/\/github\.com\/bestimmaa\/posprint\/blob\/main\/docs\/module-api\.md\)/
  );
  assert.equal(
    /\[[^\]]+\]\((?:\/|\.\.\/|\.\/)?docs\/module-api\.md\)/.test(readme),
    false
  );
  assert.equal(
    /^\[[^\]]+\]:\s*(?:\/|\.\.\/|\.\/)?docs\/module-api\.md\s*$/m.test(readme),
    false
  );
  assert.match(moduleApiDoc, /Package entry point:\s*`require\("@bestimmaa\/posprint"\)`/);
  assert.match(moduleApiDoc, /^Exports:\s*$/m);

  for (const exportName of [
    "markdownToEscpos",
    "listPrinters",
    "printRaw",
    "printRawToPrinterUri",
    "printRawToWindowsPrinter",
    "selectPrinterName"
  ]) {
    assert.match(moduleApiDoc, new RegExp(`^- \\x60${exportName}\\x60$`, "m"));
  }

  assert.match(localQueueSection, /require\("@bestimmaa\/posprint"\)/);
  assert.match(localQueueSection, /listPrinters/);
  assert.match(localQueueSection, /selectPrinterName/);
  assert.match(localQueueSection, /printRaw/);

  assert.match(printerUriSection, /printRawToPrinterUri/);
  assert.match(printerUriSection, /ipp:\/\/taiga\.local:631\/printers\/TM-T88V/);

  assert.match(conversionOnlySection, /markdownToEscpos/);
  assert.match(conversionOnlySection, /codePage:\s*"cp858"/);
  assert.match(conversionOnlySection, /font:\s*"B"/);

  assert.match(esmSection, /import posprint from "@bestimmaa\/posprint"/);
  assert.match(esmSection, /const \{ markdownToEscpos \} = posprint;/);
});

test("readme stays GitHub-first and avoids public Bitbucket release docs", () => {
  assert.equal(readme.includes("github.com/bestimmaa/posprint"), true);
  assert.equal(readme.includes("## Bitbucket Pipeline Artifact Build"), false);
  assert.equal(readme.includes("Bitbucket Artifacts"), false);
});

test("readme public usage sections do not require repo-only test fixtures", () => {
  const publicReadmeContent = getPublicReadmeContent();

  assert.equal(publicReadmeContent.includes("tests/fixtures/"), false);
});

test("readme links to release workflow instead of embedding it", () => {
  assert.equal(
    readme.includes("https://github.com/bestimmaa/posprint/blob/main/docs/release.md"),
    true
  );
  assert.equal(
    /\[[^\]]+\]\((?:\/|\.\.\/|\.\/)?docs\/release\.md\)/.test(readme),
    false
  );
  assert.equal(
    /^\[[^\]]+\]:\s*(?:\/|\.\.\/|\.\/)?docs\/release\.md\s*$/m.test(readme),
    false
  );
  assert.equal(readme.includes("npm run release -- patch"), false);
  assert.equal(readme.includes("npm publish --access public"), false);
  assert.equal(readme.includes("git push github main:main --follow-tags"), false);
  assert.equal(readme.includes("## [next-version]"), false);
});

test("readme uses a landing-page structure for public users", () => {
  assert.equal(readme.includes("## Contents"), false);
  assert.equal(readme.includes("## What it does"), true);
  assert.equal(readme.includes("## Quick Start"), true);
  assert.equal(readme.includes("## CLI"), true);
  assert.equal(readme.includes("## Module API"), true);
  assert.equal(readme.includes("## Features"), true);
  assert.equal(readme.includes("## Platform Support"), true);

  assertHeadingOrder(normalizedReadme, [
    "What it does",
    "Install",
    "Quick Start",
    "CLI",
    "Module API",
    "Features",
    "Platform Support",
    "Development",
    "License"
  ]);

  assert.equal(readme.includes("posprint --dry-run --markdown=\"# Hello\\n\\n- Espresso\\n- Croissant\""), true);
  assert.equal(readme.includes("--character-spacing-mm=<n>"), true);
  assert.equal(readme.includes("--line-spacing-mm=<n>"), true);
  assert.equal(readme.includes("--left-margin-mm=<n>"), true);
  assert.equal(readme.includes("--print-area-width-mm=<n>"), true);
  assert.equal(readme.includes("This takes precedence over `--printer`"), true);
  assert.equal(readme.includes("http://.../printers/...` and `https://.../printers/...` inputs are normalized to `ipp://` / `ipps://` with a warning"), true);
});

test("release guide documents the maintainer workflow", () => {
  const releaseDocPath = path.resolve(__dirname, "..", "docs", "release.md");
  assert.equal(existsSync(releaseDocPath), true);

  const releaseDoc = readFileSync(releaseDocPath, "utf8");

  assert.equal(releaseDoc.includes("npm run release -- patch"), true);
  assert.equal(releaseDoc.includes("npm publish --access public"), true);
  assert.equal(releaseDoc.includes("git branch -M main"), true);
  assert.equal(releaseDoc.includes("git remote add github https://github.com/bestimmaa/posprint.git"), true);
  assert.equal(releaseDoc.includes("git push origin main:main --follow-tags"), true);
  assert.equal(releaseDoc.includes("git push github main:main --follow-tags"), true);
  assert.equal(releaseDoc.includes("## [next-version]"), true);
});

test("gitignore excludes npm pack tarballs", () => {
  const gitignorePath = path.resolve(__dirname, "..", ".gitignore");
  const gitignore = readFileSync(gitignorePath, "utf8");

  assert.equal(gitignore.includes("*.tgz"), true);
});

test("license file uses bestimmaa copyright holder", () => {
  const licensePath = path.resolve(__dirname, "..", "LICENSE");
  const licenseText = readFileSync(licensePath, "utf8");
  assert.equal(licenseText.includes("Copyright (c) 2026 bestimmaa"), true);
});

test("github actions workflow exists for public CI", () => {
  const workflowPath = path.resolve(__dirname, "..", ".github", "workflows", "ci.yml");
  assert.equal(existsSync(workflowPath), true);

  const workflow = readFileSync(workflowPath, "utf8");
  const jobsBlock = getWorkflowJobsBlock(workflow);

  assert.match(workflow, /^name:\s*.+/m);
  assert.match(workflow, /^on:\s*$/m);
  assert.match(workflow, /^\s+push:\s*$/m);
  assert.match(workflow, /^\s+pull_request:\s*$/m);
  assert.match(workflow, /^jobs:\s*$/m);
  assert.match(jobsBlock, /^\s{2}[A-Za-z0-9_-]+:\s*$/m);
  assert.match(workflow, /^\s+runs-on:\s*.+/m);
  assert.match(workflow, /^\s+steps:\s*$/m);
  assert.match(workflow, /uses:\s+actions\/checkout@/);
  assert.match(workflow, /uses:\s+actions\/setup-node@/);
  assert.match(workflow, /run:\s+npm ci/);
  assert.match(workflow, /run:\s+npm test/);
  assert.match(workflow, /run:\s+npm pack/);
});

test("bitbucket pipeline pack step handles scoped tarball names safely", () => {
  const workflowPath = path.resolve(__dirname, "..", "bitbucket-pipelines.yml");
  assert.equal(existsSync(workflowPath), true);

  const workflow = readFileSync(workflowPath, "utf8");

  assert.match(workflow, /^image:\s*node:20\s*$/m);
  assert.match(workflow, /^pipelines:\s*$/m);
  assert.match(workflow, /^\s+default:\s*$/m);
  assert.match(workflow, /^\s+- step:\s*$/m);
  assert.match(workflow, /^\s+name:\s+Pack\s*$/m);
  assert.match(workflow, /RAW_TARBALL=\$\(npm pack\)/);
  assert.match(workflow, /mv "\$RAW_TARBALL" "\$FINAL_TARBALL"/);
  assert.match(workflow, /ls -1 -- \*\.tgz/);
});
