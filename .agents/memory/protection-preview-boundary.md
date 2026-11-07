---
name: Protection preview boundary
description: User-required boundaries for the imported reviewed JALDO Protection app.
---

This workspace is a development-only preview import of the existing reviewed JALDO Protection app, not a redesign or a new application build. Preserve its shared kernel, design packages, behaviour, fictional-simulation labels and reviewed safeguards. Do not generate replacement screens or duplicate its engine.

**Why:** The user explicitly requires the approved application to be restored without feature changes.

**How to apply:** Limit work to the dedicated Protection preview. Leave other apps, including Sport previews, untouched. Do not merge, publish, deploy, enable real accounts, use real customer data, connect live Core services or send external communications. Use the supplied source archive rather than retrying GitHub authentication.

### High zoom and scrollable content
At 200% zoom, test page-level overflow separately from intentionally scrollable tables. A contained table can be correct while a nearby heading or fieldset legend still widens the page; scroll regions also need keyboard access.

**Why:** The Protection browser check found that horizontal overflow came from nearby text controls, not the table that was already scrollable.

**How to apply:** When changing Protection layouts, verify 200% zoom on the rendered page, keep data-table regions focusable, and give small inline navigation links a usable touch target.

### Separate refinement project
The user approved keeping the reviewed preview as a baseline and doing future vision-led code, UX and UI refinements only in a separate Protection-only Replit project.

**Why:** They want a standalone partner-ready project while preserving the reviewed preview and other apps.

**How to apply:** Start from the latest tested Protection source, retain its shared kernel and design package, keep fictional-only/no-live-service boundaries, and leave the original preview unchanged.

### Standalone source reconciliation
The standalone Protection repository has a different Git history from RTBX-Main. Reconcile only the Protection artifact and the shared packages it actually requires from a verified source revision; do not merge the unrelated histories or replace the whole workspace. Preserve the standalone artifact routing, service port, build/static-serving configuration, existing work, and governed-learning experience.

**Why:** The user explicitly requires a Protection-only reconciliation while retaining the independently configured standalone preview and deployment.

**How to apply:** Verify the requested source revision is present and contained by the supplied source ref, identify the workspace dependency closure, compare selected paths, and keep standalone/root configuration out of the import. Do not publish unless separately authorized.
