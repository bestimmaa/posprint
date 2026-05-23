# Release Workflow

This guide is for maintainers publishing `@bestimmaa/posprint`.

## One-Time Repository Setup

Before the first public release from an older clone:

```bash
git branch -M main
git remote -v
```

If the `github` remote does not exist yet:

```bash
git remote add github https://github.com/bestimmaa/posprint.git
```

- If `github` already exists but points somewhere else, update it with:

```bash
git remote set-url github https://github.com/bestimmaa/posprint.git
```

- After the first `git push github main:main --follow-tags`, update the GitHub repository default branch to `main`.

## Release Steps

Before running the release helper, update `CHANGELOG.md` with the next heading, for example `## [0.2.4]`. The helper requires the exact upcoming version heading format `## [next-version]`.

```bash
npm test
npm run release -- patch
git push origin main:main --follow-tags
git push github main:main --follow-tags
npm publish --access public
```

## What The Release Helper Enforces

- current branch must be `main`
- worktree must be clean
- `CHANGELOG.md` must contain the next version heading
- test suite runs before packing
- release commit and tag are created before publish guidance is printed

Bitbucket stays on `origin`; the public GitHub remote is expected to be named `github`.
