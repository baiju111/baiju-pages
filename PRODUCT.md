# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: static HTML, CSS, and JavaScript; Canvas 2D for the real block animation; no framework or backend.

## Users

Brand, cultural-institution, and digital-art collaborators evaluating a pixel-visual creative studio. They need to understand the studio's point of view quickly, inspect the real block artwork, and find a way into the work.

## Product Purpose

A one-page promotional site for **PIXEL STUDIO** whose central proof is a real, verifiable block-pixel artwork. The artwork deconstructs, converges, and returns exactly to its source grid. Success means the final image is indistinguishable from file B, the motion reads as a system rather than a filter, and the page remains usable throughout.

## Positioning

The studio treats an approved block-pixel artwork as geometry, not decoration: every square has a fixed, image-derived target, and the motion always resolves back to that target. The site demonstrates the method by using the method.

## Operating Context

The site is viewed on desktop and mobile browsers. It must work offline from a local static server, respect reduced-motion preferences, and remain legible while the hero animation plays.

## Capabilities and Constraints

- Source file B is a 1672 × 941 JPEG with a baked white background; it has no original alpha channel.
- The artwork's visible bounds are approximately x 445–1231, y 24–917. The mark is black on white and uses a regular square-block grid with narrow gaps.
- Transparent output is reconstructed from the white matte; this must be disclosed, never described as original alpha.
- File A was not provided. It is not used on the site; it was only intended as a cross-check reference and is marked not applicable.
- The final resting surface must show B's complete mark, never a re-generated approximation.
- Interactions may disturb cells locally but may not mutate targets, colors, shapes, or gaps.
- The primary CTA is **探索项目**, which scrolls to the works section.
- The hero deliberately has no visible playback console: the artwork is focusable, click/Enter replays, Space pauses, and strength is fixed at medium in the page (the engine API remains available).
- The six works are presented in a native 3D cylinder carousel with auto-rotation, drag/snap, direct index access, and a flip face for title/subtitle. No React or third-party carousel dependency is used.
- Carousel cards use `object-fit: cover`; some portrait/landscape studies lose edges. This is a stated visual tradeoff, not a claim of full-image preservation.
- There are six works. No real client work, testimonials, contact details, or performance claims are available; exhibit placeholders must be labeled as concept studies.
- Site language is Simplified Chinese, with English display accents.

## Brand Commitments

- Working name: **PIXEL STUDIO**.
- Voice: concise, precise, quietly playful; no inflated agency copy.
- Palette: warm white `#F7F5EF`, ink `#191919`, orange `#F26A35`.
- Visual character: independent square cells, visible transparent gaps, restrained retro-digital detail, modern editorial asymmetry.
- The source artwork's pixels and colors are not to be restyled for the site.

## Evidence on Hand

- `assets/source/logo-b.jpg`: the approved block-pixel artwork.
- No file A, no original transparent PNG, no real project photography, no verified contact address.

## Product Principles

1. Accuracy outranks spectacle: B is the authority.
2. The grid is the story; every other visual choice supports it.
3. Motion must always resolve, never strand the viewer in an unfinished state.
4. The page stays readable and operable during the animation.
5. Label what is invented. Never fake proof, clients, or feedback.

## Accessibility & Inclusion

Keyboard-operable controls with clear accessible names; reduced-motion visitors receive the complete static artwork and no carousel auto-rotation; no essential information depends on hover; mobile touch interactions must not require precision. The hidden hero controls remain operable by keyboard, with an invisible live phase status.
