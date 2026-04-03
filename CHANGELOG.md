# Changelog

All notable changes to the URDF Studio app workspace will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Worker-assisted document import, export, and archive flows across the app workspace.
- Expanded USD stage preparation, hydration, and roundtrip-oriented export tooling.
- Reusable `@urdf-studio/react-robot-canvas` package workspace for external consumers.

### Changed
- Prepared the `dev` branch for the next major app version line at `2.0.0`.
- Centralized version management through repo scripts instead of hard-coded UI labels and manual manifest edits.
- Improved viewer orchestration, workspace synchronization, and collision editing workflows.
- Split and hardened large USD export/runtime paths to reduce release-time drift between import, viewer, and export behavior.

### Fixed
- Guarded runtime setup paths and import heuristics to reduce false-positive recovery behavior during robot loading.

## [1.0.0] - 2026-03-31

### Added
- First stable `1.0.0` release marker for the URDF Studio app workspace.
- Automated app version display and repo version bump scripts for future releases.
