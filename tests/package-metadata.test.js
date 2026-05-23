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

test("package metadata points to public GitHub repo", () => {
  assert.equal(pkg.private, false);
  assert.equal(pkg.name, "posprint");
  assert.equal(pkg.author, "bestimmaa");
  assert.equal(pkg.license, "MIT");
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
  assert.equal(readme.includes("npm install posprint"), true);
  assert.equal(readme.includes("npm i -g posprint"), true);
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

test("readme documents the new local release workflow", () => {
  assert.equal(readme.includes("npm run release -- patch"), true);
  assert.equal(readme.includes("npm publish --access public"), true);
  assert.equal(readme.includes("git remote add github https://github.com/bestimmaa/posprint.git"), true);
  assert.equal(readme.includes("git branch -M main"), true);
  assert.equal(readme.includes("git remote -v"), true);
  assert.equal(readme.includes("git push origin main:main --follow-tags"), true);
  assert.equal(readme.includes("git push github main:main --follow-tags"), true);
  assert.equal(readme.includes("update the GitHub repository default branch to `main`"), true);
  assert.equal(readme.includes("## [next-version]"), true);
  assert.equal(readme.indexOf("git remote add github https://github.com/bestimmaa/posprint.git") < readme.indexOf("git push github main:main --follow-tags"), true);
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
