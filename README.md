# Resonance Reef

A WebXR world that breathes with you.

Resonance Reef is a calm immersive underwater breathing experience built for Meta IWSDK, WebXR, Three.js, and TypeScript. A jellyfish guide, spatial ocean audio, spoken breathing cues, reef life, and responsive fish move through an eight-breath session that ends with a manta-ray finale.

## Features

- Guided 5-second inhale and 5-second exhale breathing cycle.
- Spoken breathing instructions and underwater ambient audio.
- Desktop controls for Start, Pause, Resume, Restart, and Mute.
- In-world XR controls and breathing instructions.
- Jellyfish breathing guide, plankton, reef lighting, coral, seaweed, and water-current response.
- Moorish Idol hero fish and Cardinal Fish support school enabled by default.
- Optional tracked-hand fish interaction with curiosity, gentle avoidance, and smooth return.
- Optional desktop simulated hand target for testing without a headset.
- Legacy fish fallback with `?fishVisual=legacy`.

## Technology

- Meta IWSDK `1.0.1`
- WebXR hand tracking
- Three.js through `super-three`
- TypeScript
- Vite
- GitHub Pages compatible static build with `base: './'`

## Run Locally

```sh
npm install
npm run dev
```

The IWSDK dev server normally runs at:

- `https://localhost:8081/`
- `https://<your-lan-ip>:8081/`

For a production-style local check:

```sh
npm run build
npm run preview
```

## Desktop Use

Open the app URL in a browser and press **Start Experience**. Desktop visitors can run the full breathing session without an XR headset. Use **Pause**, **Resume**, **Restart**, and **Mute** from the overlay controls.

Desktop has two interaction modes:

- **Look Around**: drag in the scene to rotate in place through the reef. The camera turns 360 degrees horizontally and limits vertical look angle for comfort.
- **Interact With Fish**: the mouse becomes a small virtual hand target. Move the mouse near Cardinal Fish, use the wheel to adjust depth, hold the mouse button to simulate a pinch, and release to open the hand again.

## Meta Quest Use

1. Start the local dev server or publish the production build.
2. Open the HTTPS URL in the Meta Quest browser.
3. Enter immersive VR when prompted.
4. Use the in-world **START**, **RESUME**, **RESTART**, **BREATHE AGAIN**, and **MUTE** controls.
5. If hand tracking is available, slowly bring a hand near the Cardinal Fish to test gentle curiosity and pinch avoidance.

Physical Meta Quest validation is pending. Current validation has been performed on desktop and with IWER/emulated XR input.

## Hand Interaction

Tracked hands are sampled through WebXR hand joints when available. The app prefers `index-finger-tip` and `thumb-tip` positions, computes pinch strength from their distance, and falls back to IWSDK index-tip and pinch adapter data when needed.

Interaction is intentionally calm:

- A few Cardinal Fish may approach a nearby hand.
- Fish keep a safe distance from the hand.
- Pinching or moving too close makes fish turn away smoothly.
- Lost tracking blends fish back into ordinary schooling.
- A strong head-exclusion zone keeps fish away from the viewer's face.

Desktop interaction works at the normal URL. Diagnostic hand visualization is available only with:

```text
?handDemo=1
```

Controls:

- Move mouse: simulated hand X/Y.
- Mouse wheel: target depth.
- `[` or `q`: farther from viewer.
- `]` or `e`: nearer to viewer.
- Hold mouse button: simulated pinch.

The debug `SIMULATED HAND` label is hidden in normal production use.

## Demonstration URLs

Published GitHub Pages URL, once Pages is enabled for this repository:

- `https://kavishanthan-07.github.io/resonance-reef-webxr/`

Mode paths:

- Default release experience: `/`
- Legacy fish fallback: `/?fishVisual=legacy`
- Desktop diagnostic hand demo: `/?handDemo=1`

## Asset Credits And Licenses

Fish asset details are tracked in `public/licenses/FISH_ASSETS.md`.

- Legacy fish and manta-ray assets: Quaternius Animated Fish Pack, CC0 1.0 Universal, with local license evidence in `public/licenses/License.txt`.
- Default Moorish Idol and Cardinal Fish assets: Quaternius Animated Fish Bundle via Poly Pizza GLTF distribution, Public Domain / CC0. The source page lists both `Moorish Idol` and `Cardinal Fish` by Quaternius as CC0.
- Additional small fish license note: `public/licenses/fish/scardinius-license.txt`.

Attribution is not required for CC0 assets, but the project keeps credits for clarity and auditability.

## Known Limitations

- Physical Meta Quest testing is still pending.
- IWER may try to fetch its own WebXR input-profile controller or hand visual assets from a CDN; that is emulator UI behavior, not a runtime dependency added by Resonance Reef fish interaction.
- Hand tracking availability depends on browser, runtime, device support, and user permission.
- The experience is designed for calm interaction, not grabbing, locomotion, or physics-based fish contact.

## Release Build

```sh
npm run typecheck
npm run build
git diff --check
```

The root GitHub Pages workflow builds `resonance-reef-webxr/dist` and uploads it as a Pages artifact. For a manual subtree publish from the Git root:

```sh
cd resonance-reef-webxr
npm run typecheck
npm run build
cd ..
git subtree push --prefix resonance-reef-webxr/dist resonance-origin gh-pages
```
