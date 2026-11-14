# syntax=docker/dockerfile:1

# Produktions-Image fuer Keycloak: Realm-Import und Login-Theme sind eingebaut,
# die Konfiguration ist vorab optimiert (`kc.sh build`), damit der Container
# mit `start --optimized` schnell und ohne Schreibzugriff auf das Image startet.
# Dieselbe Version wie in `docker-compose.yml`, weil das Theme auf den
# FTL-Vorlagen dieser Version basiert (siehe keycloak/README.md).
ARG KEYCLOAK_IMAGE=quay.io/keycloak/keycloak:26.8.1

# Der Build laeuft nativ auf der Plattform des Runners; das Ergebnis (Jars und
# Konfiguration) ist plattformunabhaengig.
FROM --platform=$BUILDPLATFORM ${KEYCLOAK_IMAGE} AS builder

# Build-Zeit-Optionen: Datenbank, Health-Endpunkte (Management-Port 9000) und
# der Pfad, unter dem Caddy Keycloak ausliefert (`https://<domain>/kc`).
ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=false \
    KC_HTTP_RELATIVE_PATH=/kc

COPY --chown=1000:0 themes /opt/keycloak/themes
RUN /opt/keycloak/bin/kc.sh build

FROM ${KEYCLOAK_IMAGE}

COPY --from=builder /opt/keycloak/ /opt/keycloak/
# Nur der Produktions-Realm (ohne Seed-Benutzer). Platzhalter wie
# ${PUBLIC_BASE_URL} ersetzt Keycloak beim Import aus der Umgebung.
COPY --chown=1000:0 realm-export.json /opt/keycloak/data/import/realm-export.json

USER 1000

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
