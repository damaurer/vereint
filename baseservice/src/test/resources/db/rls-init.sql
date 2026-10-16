-- Wie in Produktion (deploy/postgres/init-databases.sh): eigener Benutzer ohne
-- Superuser-Rechte, dem die Datenbank gehört. Nur so greift Row Level Security
-- auch für den Eigentümer der Tabellen (FORCE ROW LEVEL SECURITY).
CREATE ROLE vereint_app LOGIN PASSWORD 'vereint_app' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE vereint_app OWNER vereint_app;
