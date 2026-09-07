# <img src="public/logo_white.png" width="48" height="48" alt="" style="vertical-align: middle;"> Homelinks

Keep all your Docker services organized in one place. A modern, self-hosted dashboard designed for Docker deployments. Quick access to your apps with a clean UI, favorites, dark mode, and persistent SQLite storage.

> **Security note**: Includes admin login with rate limiting and timing-attack protection. Designed for private networks behind reverse proxy. Do not expose directly to the internet without additional security measures.

## ✨ Features

### Core
- **Quick access dashboard** for all your Docker services
- **One-click open** in new tab
- **Favorites system** - Pin important apps to the top
- **Favorites section** - Favorites grouped above the main list
- **Category system** - Organize apps with custom categories/tags
- **App descriptions** - Add notes and details about each app
- **Search & filter** - Find apps by name, URL, category, or description
- **Category filter** - Dropdown to filter apps by category
- **Category autocomplete** - Suggests existing categories when typing
- **Backup export/import (ZIP)** - Full backup with JSON + uploaded images
- **Input validation** - Category max 50 chars, description max 500 chars
- **Optional thumbnails** (jpg/png/webp, max 1024x1024, 1MB)
- **Collapsible form** - Clean interface when not editing

### UI/UX
- **Grid & List views** - Toggle between card grid (default) and compact list layout
- **View persistence** - Your layout preference is remembered
- **Modern grid layout** - Responsive cards (3 cols → 2 → 1)
- **Dark mode** - Auto/Light/Dark theme selector with persistence
- **Smooth animations** - Fade-in, scale, hover effects
- **Empty states** - Contextual messages for no apps vs no search results
- **Loading states** - Visual feedback for all operations
- **Pagination** - 6 apps per page with navigation controls
- **Responsive pagination** - Compact label and controls on narrow screens

### Technical
- **SQLite persistence** - No external database needed
- **Docker-first** - Ready for Docker/Portainer deployment
- **Session persistence** - Login cookie lasts 30 days while the server session is available
- **Rate limiting** - Protection against brute force (5 attempts/15min)
- **Timing-attack protection** - Secure credential comparison
- **URL validation** - Only valid HTTP/HTTPS
- **Image validation** - Size, dimensions, and format checks
- **Input length validation** - Server-side limits on category and description
- **Backup validation** - ZIP import validation (structure, size, and image checks)
- **Auto-migration** - Database schema upgrades automatically on startup
- **Graceful shutdown** - Clean database connection handling
- **Health check endpoint** - Database connectivity verification
- **Automatic releases** - Pushes to `main` create a version tag and GitHub release when the top `CHANGELOG.md` version is newer than the latest tag

## 🧱 Tech Stack

- **Backend**: Node.js 20.17+ + Express
- **Database**: SQLite 3
- **Frontend**: Vanilla HTML/CSS/JS + Lucide Icons
- **Deployment**: Docker + docker-compose

## 🐳 Docker Deployment

### Quick Start

1. **Create `.env` file** with your credentials:

```bash
# Generate a secure session secret
openssl rand -hex 32
```

```env
PORT=9500
DB_PATH=/app/data/homelinks.sqlite
UPLOAD_DIR=/app/data/uploads
MAX_IMAGE_SIZE=1024
MAX_IMAGE_BYTES=1048576
ADMIN_EMAIL=your@email.com
ADMIN_PASSWORD=your_secure_password
SESSION_SECRET=your_generated_secret_here
COOKIE_SECURE=false
TRUST_PROXY=false
```

2. **Start with docker-compose**:

```bash
docker compose up -d
```

3. **Access the dashboard**:
   - Open http://localhost:9500
   - Login with your credentials
   - Start adding your Docker services!

### Docker Compose Example

```yaml
services:
  homelinks:
    image: ghcr.io/artcc/homelinks:latest
    container_name: homelinks
    ports:
      - "${PORT:-9500}:${PORT:-9500}"
    environment:
      - PORT=${PORT:-9500}
      - DB_PATH=${DB_PATH:-/app/data/homelinks.sqlite}
      - UPLOAD_DIR=${UPLOAD_DIR:-/app/data/uploads}
      - MAX_IMAGE_SIZE=${MAX_IMAGE_SIZE:-1024}
      - MAX_IMAGE_BYTES=${MAX_IMAGE_BYTES:-1048576}
      - ADMIN_EMAIL=${ADMIN_EMAIL:?}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:?}
      - SESSION_SECRET=${SESSION_SECRET:?}
      - COOKIE_SECURE=${COOKIE_SECURE:-false}
      - TRUST_PROXY=${TRUST_PROXY:-false}
    volumes:
      - ${DATA_DIR:-./data}:/app/data
    restart: unless-stopped
```

### Portainer Stack

1. Go to **Stacks** → **Add stack**
2. Paste the docker-compose.yml above
3. Add environment variables in the **Environment variables** section
4. Click **Deploy the stack**

### Manual Pull

To pull the latest image manually:

```bash
docker pull ghcr.io/artcc/homelinks:latest
```

## 🔧 Configuration

### Generating a secure SESSION_SECRET

Before deploying, generate a strong random secret:

```bash
# Using Node.js (recommended)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or using OpenSSL
openssl rand -hex 32
```

Copy the output and use it as your `SESSION_SECRET` value.

### Environment variables

| Variable | Description | Required | Default |
| --- | --- | --- | --- |
| `PORT` | Server port | No | 9500 |
| `DB_PATH` | SQLite database path | No | `./data/homelinks.sqlite` |
| `DATA_DIR` | Host data directory for Docker volume | No | `./data` |
| `UPLOAD_DIR` | Uploads directory | No | `./data/uploads` |
| `MAX_IMAGE_SIZE` | Max image dimensions (px) | No | 1024 |
| `MAX_IMAGE_BYTES` | Max image file size (bytes) | No | 1048576 (1MB) |
| `ADMIN_EMAIL` | Admin email for login | Yes | - |
| `ADMIN_PASSWORD` | Admin password (plain text) | Yes | - |
| `SESSION_SECRET` | Session secret | Yes | - |
| `COOKIE_SECURE` | Set `true` behind HTTPS | No | `false` |
| `TRUST_PROXY` | Set `true` behind a reverse proxy (Traefik, Nginx, etc.) | No | `false` |

### .env example

Create a `.env` file based on [.env.example](.env.example):

```env
PORT=9500
DB_PATH=/app/data/homelinks.sqlite
DATA_DIR=./data
UPLOAD_DIR=/app/data/uploads
MAX_IMAGE_SIZE=1024
MAX_IMAGE_BYTES=1048576
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=
SESSION_SECRET=change-me
COOKIE_SECURE=false
TRUST_PROXY=false
```

Store the admin password in `ADMIN_PASSWORD` (plain text).

**Important**: Replace `SESSION_SECRET=change-me` with a secure random string generated with OpenSSL or Node.js (see Quick Start).

## 💾 Data persistence

The SQLite database is stored at `DB_PATH` and uploads go to `UPLOAD_DIR`. With Docker, map a volume (e.g. `./data:/app/data`) so data survives container restarts. Login sessions are kept in memory, so users must log in again after the container or Node.js process restarts.

### Permissions (Linux servers)

If you create a host directory like `/opt/docker/homelinks/data`, these permissions work with the default container user (root):

```bash
sudo chown -R root:root /opt/docker/homelinks
sudo chmod 755 /opt/docker/homelinks
sudo chmod 755 /opt/docker/homelinks/data
```

If you prefer running as a non-root user (e.g. `1000:1000`), use:

```bash
sudo chown -R 1000:1000 /opt/docker/homelinks
sudo chmod 775 /opt/docker/homelinks
sudo chmod 775 /opt/docker/homelinks/data
```

## 🔒 Security Features

- **Rate limiting**: Maximum 5 login attempts per 15 minutes per IP
- **Timing-attack protection**: Uses `crypto.timingSafeEqual` for credential comparison
- **URL validation**: Only valid HTTP/HTTPS URLs are accepted
- **Image validation**: Size, dimensions, and format checks
- **Input length validation**: Category (50 chars) and description (500 chars) limits enforced server-side
- **Session security**: HttpOnly cookies with SameSite protection (30-day cookie duration; sessions reset when the process restarts)
- **SQL injection prevention**: Prepared statements in all database queries
- **Graceful shutdown**: Proper database connection cleanup on termination

## 🧪 API

### Authentication
- `GET /api/session` - Check if user is authenticated
- `POST /api/login` - Login with email and password (rate limited)
- `POST /api/logout` - Logout and destroy session

### Apps
- `GET /api/apps` - List all apps (authenticated, ordered by favorite then name)
- `GET /api/apps/categories` - List all unique categories (authenticated)
- `POST /api/apps` - Create new app (authenticated, multipart form with `name`, `url`, optional `image`, `category`, `description`)
- `PUT /api/apps/:id` - Update app (authenticated, multipart form with `name`, `url`, optional `image`, `category`, `description`)
- `PATCH /api/apps/:id/favorite` - Toggle favorite status (authenticated)
- `DELETE /api/apps/:id` - Delete app (authenticated)
- `GET /api/apps/export` - Export full backup as ZIP (authenticated)
- `POST /api/apps/import` - Import full backup from ZIP and replace all existing apps/images (authenticated, max 50MB)

### Backup format (ZIP)

Export creates a ZIP file with:
- `apps.json` - Metadata + apps array
- `uploads/` - App images referenced by `image_url`

Import behavior:
- **Replace all mode**: current apps are replaced by the backup content
- Existing uploads from previous apps are removed after successful import
- ZIP size limit: **50MB**
- Image rules remain enforced (jpg/png/webp, max 1024x1024, 1MB each)

## 🩺 Health check

- `GET /health` - Health status with database connectivity check

Returns:
```json
{
  "ok": true,
  "timestamp": "2026-02-09T16:30:00.000Z",
  "status": "healthy"
}
```

## 🔧 Troubleshooting

### ERR_ERL_UNEXPECTED_X_FORWARDED_FOR

If you see this error in the logs when running behind Traefik, Nginx, or another reverse proxy:

```
ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false
```

Set `TRUST_PROXY=true` in your `.env` file to enable Express's trust proxy setting.

### "Too many login attempts"

Wait 15 minutes or restart the container to reset the rate limiter.

### Database locked errors

Ensure only one instance is accessing the database. SQLite doesn't support multiple concurrent writers.

### Images not loading

Check that:
- The `UPLOAD_DIR` permissions are correct
- The volume mapping in Docker is set up properly
- Images are <= 1024x1024 pixels and <= 1MB

### 404 errors on static files

Rebuild the Docker image to include the latest path fixes:
```bash
docker compose build --no-cache
docker compose up -d
```

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md).

## 📝 License

This project is licensed under the Apache 2.0 License - see [LICENSE](LICENSE).

## 👤 Author

Arturo Carretero Calvo — 2026
