# context/

Source material for the Strong Standard Testimonial Dashboard build.

Files dropped here are **inputs**, not code. They describe what to build and
what the real data looks like. Nothing in this folder is loaded by the
dashboard at runtime.

Expected contents:

- `testimonial-dashboard-spec.md` — the build spec. **Source of truth.**
  Behavior not described here does not get built.
- Any sample event-log rows, roster shapes, or settings-tab snapshots used to
  validate assumptions against real data.

Rule: validate against this spec and the real event log. Do not infer live
process behavior from legacy sheet columns.
