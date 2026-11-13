# Night Atlas

A frontend-only, phone-first sky guide. Chart mode works without device permissions; Live Camera overlays the local star chart on the rear camera and follows the phone's orientation.

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL on the development device. Camera, location, and motion APIs require a secure origin: HTTPS in deployment, or localhost for local development. A phone opening a computer's plain HTTP LAN address is not a secure origin.

## Deploy to GitHub Pages

1. Push this project to the repository's `main` branch on GitHub.
2. On GitHub, open the repository and click **Settings** > **Pages**.
3. Under **Build and deployment**, select **GitHub Actions** as the source.
4. Open the **Actions** tab, select **Deploy to GitHub Pages**, and run the workflow with **Run workflow** if the initial push did not deploy. Later pushes to `main` deploy automatically.
5. Once the workflow succeeds, return to **Settings** > **Pages** and open the published site URL.

GitHub Actions supplies the repository name for the Vite base path automatically. A repository named `owner.github.io` is deployed at the domain root; other repositories use `https://owner.github.io/repository/`. Local builds use `/` unless `GITHUB_REPOSITORY` is set.

## Test on a phone

Use the production build for tunnel testing. It embeds the sky catalogs in the JavaScript bundle, avoiding separate catalog downloads during chart initialization. Development mode still requests individual JSON modules.

```sh
npm run build
npm run preview -- --host 0.0.0.0 --port 4173 --strictPort
```

In another terminal, run `npx localtunnel --port 4173` and open its HTTPS URL on the phone. Keep both terminals running. A tunnel outage can still prevent the app itself from loading; bundling does not make the tunnel reliable. Rebuild and reload after source changes.

## Checks

```sh
npm test
npm run build
```

## Privacy and behavior

The sky uses a wide-angle stereographic planetarium view. D3 Celestial reverses the east-west projection internally, so catalog coordinates and pointing centers must not be mirrored again. This is a canvas projection, not a Three.js sphere mesh; `BackSide` materials do not apply. Text is drawn normally and remains readable.

Compass / Live Sky enables orientation tracking independently of the camera; Manual Drag removes the sensor listeners and cancels its animation loop. The compass button (and Live Camera) requests iOS motion permission directly from the user gesture. Android absolute-orientation events take priority, with relative events used when the absolute stream is absent or stale. No readings and permission denial are reported separately.

Device Euler angles are converted to quaternions, corrected for screen rotation, and smoothed with shortest-arc SLERP in requestAnimationFrame using a 140 ms exponential time constant. Screen-up orientation also rotates the chart, including in landscape. The loop pauses while the page is hidden and waits for fresh samples when resumed.

Absolute compass headings are treated as magnetic. The bundled World Magnetic Model converts them to a true-north estimate for the location and date, without network requests. iOS uses webkitCompassHeading; Android uses the absolute alpha reference (heading 360 - alpha), with device tilt handled by the full quaternion. Relative headings are never labeled north-aligned. If the magnetic model is unavailable or the horizontal field is too weak, the UI reports an uncorrected heading. Browser/OS heading references vary: a platform already reporting true north would not need this declination correction. Sensor calibration and local magnetic interference still limit accuracy; verify outdoors against a known direction. Camera field of view is not calibrated to the chart projection.

Camera and location permissions are requested only when needed. Coordinates and sensor readings remain in the page and are not stored or sent to a server. Star and constellation catalogs are served locally. The camera view is an alignment overlay, not image recognition; compass accuracy depends on the phone's sensors and calibration.

## Third-party assets

The sky renderer and catalog data are from [d3-celestial](https://github.com/ofrohn/d3-celestial); its BSD-3-Clause and D3 notices are in [public/licenses](public/licenses). Astronomy calculations use [Astronomy Engine](https://github.com/cosinekitty/astronomy) (MIT). Controls use Lucide static icons, and typography uses Space Grotesk and IBM Plex Mono; their notices are also in [public/licenses](public/licenses). The bundled D3 geo-projection and geo-zoom scripts retain upstream attribution in [public/vendor](public/vendor).

Quaternion math uses [Three.js](https://threejs.org/) (MIT); no 3D renderer is used. Magnetic declination uses [geomagnetism](https://github.com/naturalatlas/geomagnetism) (Apache-2.0) with its bundled WMM data.