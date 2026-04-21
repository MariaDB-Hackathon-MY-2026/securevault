# SecureVault Docs Source

This directory now powers the GitHub Pages documentation site for SecureVault.

## Local docs commands

Run these commands from the repository root:

```powershell
npm install
npm run docs:dev
```

The production build command is:

```powershell
npm run docs:build
```

## Structure

- `index.md`: documentation homepage
- `getting-started/`: onboarding and local setup
- `architecture/`: product and internal system design
- `operations/`: runtime and deployment notes
- `reference/`: API and contract-heavy documentation
- `testing/`: automated coverage documentation
- `product/`: screenshots and reviewer-facing product visuals
- `.vitepress/`: theme and site configuration
- `public/`: static assets copied into the built GitHub Pages site
