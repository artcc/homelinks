FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Build sqlite3 against the container's glibc instead of using a newer prebuilt binary.
RUN npm_config_build_from_source=sqlite3 npm ci --omit=dev

COPY . ./

ENV PORT=9500
EXPOSE 9500

CMD ["node", "src/server.js"]
