# Releasing EasyPOS

The Windows installer uses electron-builder's NSIS target. The release workflow runs on a `v*` tag, verifies that the tag matches `package.json`, runs tests, then publishes the installer and update metadata to GitHub Releases. Do not upload an installer or `latest.yml` from a different build into the same release.

1. Make and test the desired changes on `main`.
2. Set the next semantic version with `npm version <major.minor.patch> --no-git-tag-version`. Commit `package.json`, `package-lock.json`, and application changes.
3. Run `npm test` and `npm run electron-build` locally on Windows. Inspect the generated `dist/` installer. The local build never publishes.
4. Push the commit to `main`. Create and push the matching tag, for example `git tag v1.6.0` and `git push easypos v1.6.0`.
5. Wait for the **Windows release** GitHub Action and confirm that the public release includes `EasyPOS-Setup-<version>-x64.exe` and `latest.yml`. Only then is that version available to the in-app updater and the website download link.

The first NSIS release requires a manual installation for people using older Forge/Squirrel builds. Their data is under Electron's app data path plus the unchanged `PharmaSpot` package name. Keep that name until a tested data migration exists. A code-signing certificate should be configured before broad distribution to reduce Windows SmartScreen warnings.

Use a clean build for every version. Do not create a new release by editing an old `latest.yml` or reusing an installer from a previous version.
