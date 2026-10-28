# Peent3D

**Peent3D** is an early-stage, GPU-based texture authoring application for **Windows**, designed for **low-poly meshes**. It runs as an Electron desktop application with a WebGL2 GPU backend, Three.js PBR preview, reusable UV-space mesh data, and a layer-based material editor.

> **Status: v0.1 experimental / unverified preview.** This repository is a substantial initial implementation, **not** feature-parity with Adobe Substance 3D Painter. Test the baker on your own meshes before depending on exported data. No commercial licensing or compatibility with Adobe is implied.

## What is implemented

- Desktop project built for Windows x64 (Electron).
- Import OBJ, GLB and embedded-resource GLTF. Multiple meshes are merged into one editable texture set.
- Interactive PBR viewport with orbit, zoom, model framing, 3D painting, and 2D texture-map inspection.
- GPU raster baking of **object-space position**, **world/object-space normals**, **curvature estimate**, **mesh/material ID**, **elevation**, **flat tangent normals**, and **surface coverage**.
- GPU fragment-shader BVH ray tracing for ambient occlusion, approximate thickness and bent normals; ray samples and distance configurable.
- Procedural PBR **fill layers** (base color, roughness, metallic, relief height) with visibility, opacity, reordering and per-channel GPU compositing.
- UV and **triplanar procedural noise** sampled from baked 3D position/normal data.
- Smart masks: convex edge wear, concave regions, AO dirt, upper/lower gradient, thin areas, and 3D noise.
- Per-layer editable **GPU paint/erase masks** using 3D position and normal maps; strokes can cross UV seams.
- Basic height-to-normal conversion, roughness and metallic maps.
- PNG exports of material and baked maps in one ZIP archive.
- Editable **.peent** project saving including embedded mesh attributes, material layer configuration and painted masks. Projects are gzip-compressed JSON.
- GitHub Actions Windows workflow that creates NSIS installer and portable EXE as downloadable workflow artifacts.

### Not implemented (yet)

- No high-to-low poly projection, cages or skew correction (intentionally excluded).
- No high-poly-derived tangent-space normal or displacement details. **The geometry normal baker returns flat tangent normals**; painted height generates an approximate tangent-space normal texture.
- No UDIM/multiple texture sets, PBR material texture imports, layer folders, shader graphs, clone/stencil/decals, symmetry, sophisticated brush dynamics, layer undo, paint-stroke undo, or layer-to-layer anchor references.
- Curvature is a **vertex-neighborhood approximation**, not a high-resolution multi-scale curvature baker.
- AO/bent normal and thickness are GPU mesh-ray queries calculated at half map resolution, then sampled smoothly. The limited sample count and ray distance make them **local approximations**.
- Missing UVs use a unique triangle atlas fallback. **Use properly authored UVs** for real assets; triangle-atlas padding and texel density are poor.
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

Generated executables appear under \`release/\`. Alternatively open GitHub **Actions → Windows installer** and download the latest successful **Peent3D-Windows** artifact.

For quick browser testing:

\`\`\`powershell
npm run web
\`\`\`

The browser build can download ZIP/project files. The Electron build opens a native Save dialog.

## Quick start

1. Import a model with sensible non-overlapping UVs (OBJ or GLB), or start with the built-in torus knot.
2. Choose a 256–2048 map resolution and AO sample count, then click **Bake mesh maps**.
3. Use the right-hand panel to add, select, reorder and modify material layers.
4. Choose a procedural smart-mask generator, or use **Paint (B)** / **Erase (E)** to modify the selected layer mask directly on the model. **V** returns to orbit; **F** frames.
5. Switch the preview to **UV / Map view** or inspect a specific channel.
6. **Export maps** saves a ZIP of PNG textures. **Save project** keeps your layers, embedded mesh and paint-mask edits.

**Important:** Changing bake resolution regenerates all masks and clears previous paint strokes. Save a project before changing resolution if you need to preserve them. Reimporting a mesh also resets paint mask textures.

## Architecture

\`\`\`text
src/geometry.js                 UV/geometry preparation, vertex curvature, BVH
src/gpu.js                      GPU raster passes, ray baking, layer cache, painting, export
src/shaders/uv.*                UV-space raster maps
src/shaders/ray.frag.glsl       GPU BVH traversal for AO, bent normals, thickness
src/shaders/layer.frag.glsl     Multi-channel procedural fill and masks
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
- Incremental layer composition caches previously evaluated lower layers.
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
