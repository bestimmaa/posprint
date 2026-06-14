# Release Workflow

This guide is for maintainers publishing `@bestimmaa/posprint`.

## Release Steps

Before running the release helper, update `CHANGELOG.md` with the next heading, for example `## [0.2.4]`. The helper requires the exact upcoming version heading format `## [next-version]`.

```bash
npm test
npm run release -- patch
git push origin main:main --follow-tags
npm publish --access public
```

## What The Release Helper Enforces

- current branch must be `main`
- worktree must be clean
- `CHANGELOG.md` must contain the next version heading
- test suite runs before packing
- release commit and tag are created before publish guidance is printed
