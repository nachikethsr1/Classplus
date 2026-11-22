# ITZNOTDEMO portfolio

`index.html` is the portfolio. `Index.html` is the separate ClassPulse application and is unchanged.

## Run

Requires Node.js 20 or newer. No dependencies are required.

```sh
ADMIN_PASSWORD='your-existing-manager-password' npm start
```

Open port 3000. Set `ADMIN_PASSWORD` through your hosting provider's private environment settings to **the same password you already use**. No portfolio password existed in the checked-in HTML, so none is hard-coded or changed here. Without this setting the manager stays locked. Never commit passwords.

Open Manage, sign in, and upload one HTML file or one ZIP (with an HTML entry page and assets). Edit existing example cards to replace them with your work. When editing an uploaded project you can leave the website file blank to keep it. Publish/hide and delete are available for uploaded projects. Examples must be replaced before hiding/deleting. Preview supports desktop/mobile and a full-window view with a close button; Done returns to projects.

## Public deployment (required for all phones to see uploads)

Deploy the **whole repository as a Node web service**, running `npm start`; static-only hosts such as GitHub Pages cannot run this backend. Set `ADMIN_PASSWORD`, attach a persistent disk, and set `DATA_DIR` to its directory (default: `./data`). `PORT` defaults to 3000; the server binds to `0.0.0.0`. Use HTTPS. The live preview is temporary, not production hosting.

Projects and assets are saved atomically to `DATA_DIR/projects.json`; back up this directory. Run one server instance with one persistent disk (this JSON store is not a multi-replica database). Published uploads are readable by all visitors. Hidden projects and all mutations require an HTTP-only, eight-hour owner session. Sessions reset on server restart. Login attempts are rate-limited. Configure your reverse proxy to overwrite forwarded headers and use appropriate request size/time limits. Uploaded code is never served as an application-origin page: previews use opaque-origin sandboxed iframes.

Limits: one HTML up to 8 MB or ZIP up to 25 MB; extracted site up to 20 MB, 250 files, 8 MB per file; thumbnail up to 4 MB. ZIP extraction happens in the browser with CRC checks and the server independently validates file paths, types, sizes and entry page. Previews bundle local assets; websites requiring a backend, module resolution or arbitrary relative fetches need their own hosting. ZIP deflate requires a modern browser supporting DecompressionStream.

Older browser-only uploads are not automatically migrated: re-upload them once to the shared server. Already-open pages show new projects on refresh.

## Test

```sh
npm test
```
