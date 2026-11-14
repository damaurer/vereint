# syntax=docker/dockerfile:1

# Node 22 LTS, auf ein Patch-Release gepinnt (reproduzierbarer Build).
# Die Angular CLI verlangt mindestens Node 22.22.3; Dependabot haelt das
# Image aktuell.
ARG NODE_IMAGE=node:22.23.3-alpine

# ---------- Build ----------
# Build-Stages laufen nativ auf der Plattform des Runners. Das Ergebnis ist
# reines JavaScript und damit fuer amd64 und arm64 identisch.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Der Build erzeugt ausschliesslich Artefakte. Alle Laufzeitwerte (Keycloak,
# Spring-API, oeffentliche Basis-URL) werden erst im Runtime-Stage bzw. ueber
# die Umgebung gesetzt; Secrets gelangen niemals in Layer oder Image-History.
ENV NODE_ENV=production
RUN npm run build

# ---------- Production dependencies ----------
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# ---------- Runtime ----------
FROM ${NODE_IMAGE} AS runtime

# Nicht vertrauliche Vorgaben. Reale Werte kommen aus Compose bzw. der
# Secret-Verwaltung der Zielplattform (siehe docs/betrieb/selbst-betreiben.md).
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    PUBLIC_BASE_URL=http://localhost:8080 \
    SPRING_API_BASE_URL=http://vereint-service:8081 \
    KEYCLOAK_ISSUER_URI=http://keycloak:8080/realms/vereint \
    KEYCLOAK_REALM=vereint \
    KEYCLOAK_CLIENT_ID=vereint-web \
    SESSION_COOKIE_NAME=vereint_session \
    SESSION_COOKIE_SECURE=true \
    SESSION_DURATION_MINUTES=1440

WORKDIR /app

# Kein Root im Container: eigener, unprivilegierter Benutzer.
# Paketmanager (npm, npx, corepack, yarn) werden zur Laufzeit nicht gebraucht
# und bringen eigene, verwundbare Abhaengigkeiten mit; sie werden entfernt.
# Sicherheitsupdates der Alpine-Pakete (z. B. musl, zlib) kommen oft vor dem
# naechsten Node-Image; `apk upgrade` holt sie bei jedem Build.
RUN apk upgrade --no-cache \
 && addgroup -g 10001 -S vereint \
 && adduser -u 10001 -S -G vereint -h /app vereint \
 && rm -rf /usr/local/lib/node_modules /opt/yarn-* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY --from=deps --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/dist ./dist
COPY --chown=10001:10001 package.json ./

USER 10001:10001

EXPOSE 8080

CMD ["node", "dist/webservice/server/server.mjs"]
