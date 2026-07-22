//! Rich-text facet helpers for shouts (mentions), mirroring `@atproto/api`'s
//! `RichText.detectFacets`.
//!
//! **Scaffold:** the planned surface:
//!
//! ```ignore
//! let mentions = rocksky_sdk::facets::detect_mentions(&agent, text).await?;
//! agent.shout_with_facets(uri, cid, text, mentions).await?;
//! ```
//!
//! Detection resolves `@handle` spans to DIDs (via the agent's resolver) and
//! computes grapheme-aware byte ranges, reusing the `unicode_segmentation`
//! dependency the generated code already pulls in.
