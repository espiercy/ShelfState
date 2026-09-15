# ShelfState V4 boundary

This directory is reserved for the independently built and deployed ShelfState
V4 project. Its future application, backend, infrastructure, tests, and build
outputs are not ShelfState V3 runtime or Netlify publish inputs.

WP-001 establishes only this ownership marker. It does not create the V4
package, toolchain, source tree, AWS infrastructure, or deployment origin.

ShelfState V4 must use a distinct future hostname/origin so the root-scoped V3
service worker at the Netlify production origin cannot control V4 resources.
