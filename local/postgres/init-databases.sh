#!/bin/sh
# Legt beim allerersten Start der PostgreSQL-Instanz je eine Datenbank mit
# eigenem Benutzer fuer Keycloak und den baseservice an. Laeuft nur, solange
# das Datenverzeichnis leer ist.
set -eu

psql -v ON_ERROR_STOP=1 --username postgres \
  -v keycloak_pw="$KEYCLOAK_DB_PASSWORD" \
  -v vereint_pw="$VEREINT_DB_PASSWORD" <<'SQL'
CREATE ROLE keycloak LOGIN PASSWORD :'keycloak_pw';
CREATE DATABASE keycloak OWNER keycloak;
REVOKE ALL ON DATABASE keycloak FROM PUBLIC;

CREATE ROLE vereint LOGIN PASSWORD :'vereint_pw';
CREATE DATABASE vereint OWNER vereint;
REVOKE ALL ON DATABASE vereint FROM PUBLIC;
SQL
