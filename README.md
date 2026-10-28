# Peent3D

**Peent3D** is an early-stage, GPU-based texture authoring application for **Windows**, designed for **low-poly meshes**. It runs as an Electron desktop application with a WebGL2 GPU backend, Three.js PBR preview, reusable UV-space mesh data, and a layer-based material editor.

> **Status: v0.2.6 experimental preview, validated with Windows WebGL2 GUI smoke tests.** This repository is a substantial initial implementation, **not** feature-parity with Adobe Substance 3D Painter. Test the baker on your own meshes before depending on exported data. No commercial licensing or compatibility with Adobe is implied.

## What is implemented

- Desktop project built for Windows x64 (Electron).
- Import OBJ, GLB and embedded-resource GLTF. Multiple meshes are merged into one editable texture set.
- Interactive PBR viewport with orbit, zoom, model framing, 3D painting, and 2D texture-map inspection.
- GPU raster baking of **object-space position**, **world/object-space normals**, **curvature estimate**, **mesh/material ID**, **elevation**, **flat tangent normals**, and **surface coverage**.
- GPU fragment-shader BVH ray tracing for ambient occlusion, approximate thickness and bent normals; ray samples and distance configurable.
- Procedural PBR **fill layers** (base color, roughness, metallic, relief height) with visibility, opacity, reordering and per-channel GPU compositing.
- UV and **triplanar projection** for image-based color Fill Layers and procedural noise using baked 3D position/normal data.
- **Multiple smart masks per material layer**: add, remove, enable, select and reorder masks independently. Blend via Replace, Multiply, Add, Subtract, Max or Min, with individual opacity, generator scale, noise seed and mask controls. Existing single-mask `.peent` projects are migrated when opened.
- **Angle Threshold on every mask**: edge-aware generators use minimum real mesh dihedral angle, while orientation-based generators use maximum angle from object-space up (180° means no filtering). A full-surface mask also supports angular restriction.
- **UV-seam-safe edge distances**: feature edges are identified in welded *3D geometry* (not UV borders). A spatial index selects nearby true feature segments, and GPU baking evaluates exact finite-segment distance at each surface texel. Shared corners and UV-island splits no longer truncate the distance field. Nearby disconnected meshes are excluded, and angle-specific maps are cached.
- **Topology-based hard-edge baker**: identifies signed convex and concave dihedral angles across shared mesh edges, unaffected by UV seams. Stores **physical edge distance** in normalized model-space units; independent of texture resolution.
- **Standalone Signed Mean Curvature smart mask** (generator 13): welded 3D cotangent-weighted Laplace–Beltrami estimate, robust per-vertex area normalization, signed convex/concave detection and three edge-aware smoothing scales. Smoothing/cutoff/intensity/region are independently editable per mask. This is **separate from** the legacy curvature and topology-driven edge distance maps.
- **13 GPU procedural smart-mask generators**: convex edge wear, concave crevices, AO dirt, height gradients, thin parts, grunge, gravity streaks, leaks/drips, oxidation, deposited dust, and directional natural scratches.
- **Edge wear controls**: Edge Distance, Angle Threshold, softness and AO protection plus new **Breakup intensity**, **Breakup hardness**, **Breakup position**, and **Breakup band width**. Edge grunge affects only the intermediate transition pixels; the solid 100% convex wear core remains unaltered. Breakup position and width specify which mask-strength interval can chip away.
- Other generators expose density, line width, length, gravity, top bias, and cavity influence as appropriate.
- A dedicated **smart-mask render target per layer** caches procedural effects once, reused for all four PBR channels. No more recomputing expensive multi-octave scratches four times.
- **Preset library** for base iron, paint, fine edge wear, cavity grime, rust, dust, streaks, leaks and scratches.
- All sliders also provide **direct numeric entry** and a **per-parameter ↺ reset button**. Bake ray-distance supports numeric entry and reset. The inspector fully scrolls.
- **Charcoal/grey UI with orange accent**, including tool and selection highlights, plus a selected Smart Mask preview.
- Per-layer editable **GPU paint/erase masks** using 3D position and normal maps; strokes can cross UV seams. Clear/Fill mask actions allow painted reveals and removals.
- Basic height-to-normal conversion, roughness and metallic maps.
- PNG exports of material and baked maps **and every enabled layer smart mask** in one ZIP archive.
- Editable **.peent** project saving including embedded mesh attributes, material layer configuration and painted masks. Projects are gzip-compressed JSON.
- GitHub Actions Windows workflow that creates NSIS installer and portable EXE as downloadable workflow artifacts.

### Not implemented (yet)

- No high-to-low poly projection, cages or skew correction (intentionally excluded).
- No high-poly-derived tangent-space normal or displacement details. **The geometry normal baker returns flat tangent normals**; painted height generates an approximate tangent-space normal texture.
- No UDIM/multiple texture sets, complete multichannel PBR texture imports (color image only), layer folders, shader graphs, clone/stencil/decals, symmetry, sophisticated brush dynamics, layer undo, paint-stroke undo, or layer-to-layer anchor references.
- Curvature is a **vertex-neighborhood approximation**, not a high-resolution multi-scale curvature baker. Accurate convex/concave hard-edge masks now use **topology-based angle/distance baking**, not this approximate curvature field.
- AO/bent normal and thickness are GPU mesh-ray queries calculated at half map resolution, then sampled smoothly. The limited sample count and ray distance make them **local approximations**.
- Weathering, scratches and leaking are **procedural approximations** informed by normal, edge and AO maps, rather than a physical exposure/erosion simulation. Review real-world assets and tune parameters for each model.
- Overlapping UV layouts are detected on import and flagged because shared UVs cannot store distinct geometric maps for multiple surfaces. Missing UVs use a unique triangle atlas fallback. **Use properly authored UVs** for real assets; triangle-atlas padding and texel density are poor.
- Final PBR channels now receive four GPU padding/dilation passes along UV island borders. Dedicated seam adjacency and mipmap generation are still future work.
- Project files currently embed nonindexed triangle arrays; large scenes may produce large save files.

## Run it

Requirements: Windows 10/11 x64, recent GPU and drivers with WebGL2 support, and Node.js 22+ for development.

\`\`\`powershell
git clone https://github.com/joramvanloenen/Peent3D.git
cd Peent3D
npm install
npm run dev
\`\`\`

To build a Windows installer and standalone portable build on a Windows PC:

\`\`\`powershell
npm run dist:win
\`\`\`

Generated executables appear under \`release/\`. For normal Windows downloads use the [Peent3D Releases page](https://github.com/joramvanloenen/Peent3D/releases), with separate portable and setup EXEs. The GitHub Actions artifacts are intended primarily for automated build testing.

For quick browser testing:

\`\`\`powershell
npm run web
\`\`\`

The browser build can download ZIP/project files. The Electron build opens a native Save dialog.

## Quick start

1. Import a model with sensible non-overlapping UVs (OBJ or GLB), or start with the built-in torus knot.
2. Choose a 256–2048 map resolution and AO sample count, then click **Bake mesh maps**.
3. Choose a material preset using the **New layer preset** selector, then press **＋**. You can also select, reorder or edit existing layers. Drag any slider, type an exact number, or press **↺** to reset one value.
4. On one material layer use **＋ Mask** to stack multiple geometry-driven generators (edge wear + grunge + leaks, for example). Select a mask to adjust its unique Angle Threshold, scale, seed, opacity and blending. For edge wear, **Edge Distance** sets width in model-space units, unaffected by UV seams. Use **Paint (B)** / **Erase (E)** for edits. **V** orbits; **F** frames.
5. Switch to **UV / Map view**, inspect individual channels, including **Signed mean curvature (RGB scales)**, or select **Selected smart mask** to see the mask stack. For the new **Signed mean curvature** generator, choose Convex, Concave, Both or Signed and adjust smoothing, cutoff and intensity.
6. **Export maps** saves a ZIP of PNG textures. **Save project** keeps your layers, embedded mesh and paint-mask edits.

**Important:** Changing bake resolution regenerates all masks and clears previous paint strokes. Save a project before changing resolution if you need to preserve them. Reimporting a mesh also resets paint mask textures.

## Architecture

\`\`\`text
src/geometry.js                 UV/geometry preparation, vertex curvature, BVH
src/edge.js                     Welded 3D topology, signed dihedral features and local segment spatial index
src/curvature.js                Cotangent discrete signed mean curvature, robust normalization and edge-aware multi-scale smoothing
src/gpu.js                      GPU raster passes, ray baking, layer cache, painting, export
src/shaders/uv.*                UV-space raster maps
src/shaders/ray.frag.glsl       GPU BVH traversal for AO, bent normals, thickness
src/shaders/smart.frag.glsl     Per-effect GPU procedural masks: edge wear, drips, leaks, rust, dust, scratches
src/shaders/mask-blend.frag.glsl Composites multiple mask effects with independent blending
src/shaders/layer.frag.glsl     Cached-mask PBR channel compositor
src/shaders/brush.frag.glsl     Seam-aware 3D-position mask painting
src/shaders/normal.frag.glsl    Height-to-tangent-normal approximation
src/shaders/copy.frag.glsl      Linear-to-sRGB export / channel conversion
src/main.js                     UI, layer editing, import, save/load, ZIP export
electron/                       Sandboxed Electron shell / Save dialog IPC
\`\`\`

The model is converted to an **object-space, centered/scaled preview mesh** for consistent local ray distances. Its UV geometry is rasterized into floating-point position/normal buffers. A CPU-built BVH is uploaded as packed floating-point textures; GPU ray shaders traverse it. Layers are composed into render targets and changed layers invalidate downstream caches. Brush stamps are evaluated against the 3D position buffer, not just planar UV distance.

### Performance decisions

- BVH reduces triangle traversal work compared with testing all triangles per ray.
- AO, bent normal and thickness share the same packed BVH and position/normal buffers.
- Expensive geometric maps are computed on demand, not every frame.
- Surface data and layer material results use GPU render targets.
- Final materials are padded in a reusable GPU scratch target to reduce UV-seam bleeding.
- Live parameter editing skips full-resolution UV dilation and normal-map regeneration until the slider is released (or numeric entry settles).
- Material channels are invalidated independently; editing roughness will not regenerate edge masks, color, or metallic.
- A changed smart mask renders at at most 512px during interaction, then returns to the full selected bake resolution.
- Compiled shader programs are reused instead of reconstructed for every slider event.
- Incremental layer composition caches previously evaluated lower layers.
- Geometry-aware smart masks are evaluated **once per dirty layer** instead of redundantly on each material channel.
- Device-pixel-ratio is capped at 2 for viewport performance.
- Model data is non-indexed deliberately; for extremely large assets, indexed/interleaved geometry and sparse texture tiling would be better.

## Map interpretation

| Exported map | Meaning |
| --- | --- |
| BaseColor | Procedural layered color, converted to sRGB for PNG |
| Roughness / Metallic | Layer-composited scalar channels |
| Normal | Tangent-space height-derived **approximation** |
| Height | Layer-composited painted relief field (neutral 0.5) |
| AO | Local, distance-limited ray visibility |
| Curvature | Vertex-neighborhood convexity estimate (0.5 neutral) |
| Position | Object-space position; raw authoring buffer uses float. The exported PNG is normalized to the preview mesh bounding box (0–1 per axis). |
| WorldNormal | Object-space normal direction encoded 0..1 |
| Thickness | Approximate inward hit distance |
| BentNormal | Averaged unoccluded ray direction |
| ID | Stable per-mesh/per-material-group colors for visualization |
| Elevation | Normalized Y-position |
| Opacity | Mesh coverage |

## Technical references

- [Three.js WebGLRenderTarget](https://threejs.org/docs/pages/WebGLRenderTarget.html)
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Substance 3D Bakers documentation](https://experienceleague.adobe.com/en/docs/substance-3d/bakers/home)
- [MikkTSpace](https://github.com/mmikk/MikkTSpace)
- [Ben Golus: Triplanar normal mapping](https://bgolus.medium.com/normal-mapping-for-a-triplanar-shader-10bf39dca05a)
- [Intel Embree](https://www.embree.org/) (option for an additional native CPU backend)

## License

No license has been selected; reuse permissions are not granted by this README.

## Signed mean curvature (independent smart mask)

Choose **＋ Mask → Signed mean curvature** on any material layer. This generator uses signed discrete mean curvature, not edge-wear distance or the older curvature heuristic. For a consistently outward-oriented mesh, positive values are convex and negative values concave. **Curvature region** chooses Convex, Concave, Both or Signed (50% grey is flat). **Curvature smoothing** blends the raw, two-iteration and six-iteration edge-aware fields without recalculating geometry when the slider moves. **Curvature cutoff** suppresses weak convex/concave curvature; **Curvature intensity** scales the response. Existing mask-specific Angle Threshold (object-space surface tilt for this generator), Contrast and optional Grunge remain available.

The geometry is welded by 3D position within each submesh before computing cotangent weights, regardless of UV seams and rendering-normal splits. Vertex areas use barycentric area weights; boundary, degenerate and highly obtuse triangles are handled defensively. Values are normalized by a robust 95th percentile and encoded symmetrically into the GPU map (0=concave, 0.5=flat, 1=convex). The baked signed map uses **R/G/B for fine/medium/broad curvature**. The old curvature map is retained for backward compatibility.
