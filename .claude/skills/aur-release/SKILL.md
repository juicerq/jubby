---
name: aur-release
description: "Release a new version to AUR. Use when asked to: launch, release, create a new version, update version, bump version, publish to AUR, update AUR package."
---

# AUR Release

Automates the full release process: version bump, build, GitHub release, and AUR update.

---

## Prerequisites

- Must be on the `main` branch with a clean working tree
- GitHub CLI (`gh`) authenticated
- SSH access to AUR configured

---

## The Job

### 1. Ask for the new version

Ask the user what version to release (e.g., 0.2.1, 0.3.0, 1.0.0).

### 2. Update version numbers everywhere

Update all these files to the new version:

| File | Field |
|------|-------|
| `package.json` | `"version"` |
| `src-tauri/tauri.conf.json` | `"version"` |
| `src-tauri/Cargo.toml` | `version` |
| `aur/PKGBUILD` | `pkgver` |
| `aur-repo/PKGBUILD` | `pkgver` |

### 3. Build the Tauri app

```bash
cd /home/jui/projects/jubby && bun tauri build
```

The `.deb` file will be at:
`src-tauri/target/release/bundle/deb/jubby_<version>_amd64.deb`

Note: AppImage build may fail - that's OK, we only need the `.deb`.

### 4. Calculate SHA256 checksum

```bash
sha256sum src-tauri/target/release/bundle/deb/jubby_<version>_amd64.deb
```

### 5. Update PKGBUILD checksums

Update `sha256sums` in both:
- `aur/PKGBUILD`
- `aur-repo/PKGBUILD`

### 6. Create GitHub release

```bash
gh release create v<version> \
  --title "v<version>" \
  --notes "Release v<version>" \
  src-tauri/target/release/bundle/deb/jubby_<version>_amd64.deb
```

### 7. Update AUR

```bash
cd /home/jui/projects/jubby/aur-repo
makepkg --printsrcinfo > .SRCINFO
git add PKGBUILD .SRCINFO
git commit -m "Update to <version>"
git push
```

---

## Important Notes

- **Never force push to AUR** - it doesn't allow it
- If checksum is wrong, create a new commit (don't amend)
- The `aur-repo/` directory is a separate git repo pointing to AUR
- Cargo.lock updates automatically on build
