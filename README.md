# Gymni Website

A responsive, dependency-free browser client for the Gymni log API. It adapts to phone, tablet, and desktop screens and supports daily summaries, food and workout logs, history filtering, editing, and deletion.

## Run locally

Open `index.html` in a browser, or serve this folder from a local web server:

```sh
python3 -m http.server 5174
```

Then visit `http://localhost:5174`. Set `window.GYMNI_API_BASE_URL` in [config.js](./config.js) to the backend's public `api_base_url` Terraform output before using the site. The initial value matches the API URL used by the existing app; change it if your deployment uses a different domain.

For production, the Terraform configuration in `Gymni-Backend/terraform` builds this folder into its own container, listening on port `5174` on the private Docker network. Varnish routes the configured website hostname to that container, and Caddy provides public HTTPS. The deployment sets `config.js` to the configured backend API URL and adds the website's HTTPS origin to the backend's CORS allowlist. The backend currently has no authentication; do not treat CORS as access control.

The included [Dockerfile](./Dockerfile) runs the same dependency-free static server on port `5174` used by the local development instructions.

## Backend contract

The site uses the existing FastAPI endpoints:

- `GET /logs/?skip=0&limit=100` (requests further pages when needed)
- `POST /logs/` with `{"category":"food|workout","content":"<JSON-encoded record>"}`
- `PUT /logs/{id}` with the same body shape
- `DELETE /logs/{id}`

The `content` string uses the food/workout fields already written by the app. Backend errors are shown in the page; no success is reported when an API request fails. Photo analysis is intentionally not simulated by this website: the current backend only persists log records and has no AI-analysis route.

## Component flow

Open [flowchart.svg](./flowchart.svg) for the visual view of how the user interface, API client, FastAPI routes, ORM, and database interact.

Open [architecture.svg](./architecture.svg) for the deployment technologies and network paths, including Terraform, Docker Compose, Caddy, Varnish, the website container, API, and database.
