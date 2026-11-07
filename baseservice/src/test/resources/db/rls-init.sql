-- Wie in Produktion (init-databases.sh der Rolle vereint in LinuxServerSetup): eigener Benutzer ohne
-- Superuser-Rechte, dem die Datenbank gehört. Nur so greift Row Level Security
-- auch für den Eigentümer der Tabellen (FORCE ROW LEVEL SECURITY).
CREATE ROLE vereint_app LOGIN PASSWORD 'vereint_app' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE vereint_app OWNER vereint_app;
