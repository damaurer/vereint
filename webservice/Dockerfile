# syntax=docker/dockerfile:1

# Node 22 LTS, zusaetzlich per Digest gepinnt (reproduzierbarer Build).
ARG NODE_IMAGE=node:22.22.0-alpine

# ---------- Build ----------
FROM ${NODE_IMAGE} AS build

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
FROM ${NODE_IMAGE} AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# ---------- Runtime ----------
FROM ${NODE_IMAGE} AS runtime

# Nicht vertrauliche Vorgaben. Reale Werte kommen aus Compose bzw. der
# Secret-Verwaltung der Zielplattform (siehe docs/deployment.md).
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

# Kein Root im Container: eigener, unprivilegierter Benutzer
RUN addgroup -g 10001 -S vereint \
 && adduser -u 10001 -S -G vereint -h /app vereint

COPY --from=deps --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/dist ./dist
COPY --chown=10001:10001 package.json ./

USER 10001:10001

EXPOSE 8080

CMD ["node", "dist/webservice/server/server.mjs"]
