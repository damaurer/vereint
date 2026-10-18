# 🚀 Übersicht & Lokales Setup (baseservice)

In diesem Kapitel erfährst du alles über den technischen Stack, die Verzeichnisstruktur, die Voraussetzungen für den lokalen Betrieb sowie alle Umgebungsvariablen des Spring-Boot-Fachservice `baseservice`.

---

## 🛠️ Technologie-Stack & Versionen

Der `baseservice` basiert auf modernsten JVM- und Spring-Standards:

| Komponente / Framework | Version | Zweck & Besonderheiten |
| :--- | :--- | :--- |
| **Java Toolchain** | `25` | Java-Laufzeitumgebung und Compiler-Ziel |
| **Kotlin** | `2.3.21` | Programmiersprache mit Null-Safety, Data Classes und Reflection-Support |
| **Spring Boot** | `4.1.1` | Kern-Framework für REST-Webservices, Dependency Injection und Bootstrapping |
| **Spring Data JPA** | In Spring Boot integriert | Objekt-Relationales Mapping via Hibernate (`ddl-auto: none`), Mandantentrennung über `@TenantId` |
| **Liquibase** | In Spring Boot integriert | Versionierte, deklarative Datenbankmigrationen (`db.changelog-master.xml`) |
| **Spring Security & OAuth2** | In Spring Boot integriert | Resource Server (`jwt`), Stateless Sessions; Rechte prüfen die Services selbst (`StammtischAccess`) |
| **Spring Validation** | In Spring Boot integriert | Bean Validation (`jakarta.validation.*`) für Request-DTOs |
| **Spring Boot Actuator** | In Spring Boot integriert | Health-Probes (`liveness`, `readiness`) und `info`; weitere Endpunkte sind nicht freigegeben |
| **springdoc-openapi** | `3.1.0` | OpenAPI 3.1 Dokumentation und interaktive Swagger UI |
| **PostgreSQL Driver** | In Spring Boot integriert | JDBC-Treiber für die Produktiv- und Testcontainer-Datenbank |
| **Jackson Kotlin & JSR310** | In Spring Boot integriert | JSON-Serialisierung von Kotlin-Klassen und `java.time.*`-Typen (ISO-8601) |
| **H2 Database & Testcontainers** | Test-Scope | In-Memory H2 für Unit-/Slice-Tests; Testcontainers für PostgreSQL-Integrationstests |

---

## 📁 Verzeichnis- & Paketstruktur

Der `baseservice` ist im Projekt-Root als eigenständiges Gradle-Projekt organisiert:

```text
baseservice/
├── build.gradle.kts                     # Gradle-Build-Konfiguration, Plugins & Dependencies
├── settings.gradle.kts                  # Projektname ("baseservice")
├── gradlew / gradlew.bat                # Gradle Wrapper-Skripte
├── Dockerfile                           # Multi-Stage Docker-Build (Temurin 25)
│
├── src/main/
│   ├── kotlin/de/maurer/baseservice/
│   │   ├── BaseserviceApplication.kt    # Spring Boot Hauptklasse mit @SpringBootApplication
│   │   ├── config/                      # Spring-Konfigurationsklassen & Properties
│   │   │   ├── SecurityConfig.kt        # SecurityFilterChain, CSRF, Stateless, CORS, permitAll
│   │   │   ├── CorsProperties.kt        # @ConfigurationProperties("vereint.cors")
│   │   │   ├── EncryptionConfig.kt      # Anwendungsverschlüsselung (vereint.encryption)
│   │   │   ├── I18nConfig.kt            # Sprache der Fehlertexte aus Accept-Language
│   │   │   ├── JacksonConfig.kt         # ObjectMapper, KotlinModule, JavaTimeModule
│   │   │   ├── JpaConfig.kt             # @EnableJpaAuditing
│   │   │   ├── OpenApiConfig.kt         # OpenAPI-Metadaten, BearerAuth-SecurityScheme
│   │   │   ├── PushConfig.kt            # Web-Push-Bean (VapidPushSender vs. NoOpPushSender)
│   │   │   ├── RegistrationConfig.kt    # Kontoanlage in Keycloak (IdentityProvisioner)
│   │   │   ├── SchedulingConfig.kt      # @EnableScheduling (Erinnerungen, Aufräumjobs)
│   │   │   └── StorageConfig.kt         # Storage-Bean (S3ObjectStorage vs. InMemoryObjectStorage)
│   │   ├── billing/                     # Tarife, Stripe-Client, Webhooks, Export
│   │   ├── controller/                  # 27 REST-Controller (@RestController, @RequestMapping)
│   │   ├── service/                     # Fachliche Services (@Service, @Transactional)
│   │   ├── domain/                      # JPA-Entities (@Entity, @Table, @Version) & Enums
│   │   ├── dto/                         # Request-, Response- & Summary-DTOs (@Valid)
│   │   ├── repository/                  # Spring Data Repositories (JpaRepository)
│   │   ├── security/                    # JWT-Konvertierung, UserPrincipal, Matrix & Handlers
│   │   ├── tenancy/                     # Gruppenkontext, @TenantId-Resolver, RLS-DataSource
│   │   ├── crypto/                      # AES-256-GCM-Verschlüsselung (DataEncryptor)
│   │   ├── identity/                    # Keycloak-Admin-API für die Kontoanlage
│   │   ├── error/                       # ApiException, ErrorCode, ApiProblem, ExceptionHandler
│   │   ├── storage/                     # Objektspeicher-Abstraktion (S3 & In-Memory)
│   │   ├── push/                        # Web-Push-Abstraktion (VAPID & No-Op)
│   │   ├── web/                         # RequestIdFilter (X-Request-Id / traceId)
│   │   └── support/                     # Hilfsklassen (Identifiers, SecureTokens, ImageMetadata, Mp4Sanitizer)
│   │
│   └── resources/
│       ├── application.yaml             # Zentrale Produktions- und Standardkonfiguration
│       ├── i18n/                        # Fehlertexte (messages.properties, messages_en.properties)
│       └── db/changelog/                # Liquibase-Migrationen
│           ├── db.changelog-master.xml  # Master-Changelog mit Includes
│           └── changes/                 # Nummerierte XML-Changesets (001 bis 016, ohne 006)
│
└── src/test/
    ├── kotlin/de/maurer/baseservice/    # Controller-, Service- & Integrationstests
    └── resources/
        └── application-test.yaml        # Testprofil (H2-In-Memory, ohne Row Level Security, Test-Liquibase)
```

---

## ⚡ Lokales Starten & Entwicklung

### 1. Infrastruktur mit Docker Compose starten
Bevor der `baseservice` gestartet werden kann, müssen PostgreSQL und Keycloak (sowie S3Mock als lokaler S3-Ersatz) laufen:

```bash
# Im Projekt-Hauptverzeichnis:
docker compose up -d vereint-db keycloak-db keycloak object-storage
```

- **PostgreSQL**: `localhost:5432` (User: `vereint`, DB: `vereint`)
- **Keycloak**: `http://localhost:8082` (Realm: `vereint`)
- **S3Mock**: `http://localhost:9090` (Bucket `vereint`, wird beim Start angelegt)

### 2. Service über Gradle starten
Der Service kann direkt über den Gradle-Wrapper gestartet werden:

**Unter Windows (PowerShell / CMD):**
```powershell
cd baseservice
.\gradlew.bat bootRun
```

**Unter Linux / macOS (Bash):**
```bash
cd baseservice
./gradlew bootRun
```

Der Server lauscht standardmäßig auf Port **`8081`**.

### 3. Swagger-UI & OpenAPI
Die API-Beschreibung ist aus Sicherheitsgründen standardmäßig abgeschaltet (in Produktion bleibt sie aus). Lokal mit `API_DOCS_ENABLED=true ./gradlew bootRun` starten; dann stehen folgende Endpunkte für die interaktive API-Erkundung zur Verfügung:
- **Swagger UI**: [http://localhost:8081/swagger-ui.html](http://localhost:8081/swagger-ui.html)
- **OpenAPI JSON**: [http://localhost:8081/v3/api-docs](http://localhost:8081/v3/api-docs)

### 4. Tests ausführen
Um die gesamte Testsuite (Unit-, Slice- und Integrationstests) auszuführen:

```powershell
cd baseservice
.\gradlew.bat test
```

---

## ⚙️ Vollständige Referenz aller Umgebungsvariablen

Alle Konfigurationswerte in `application.yaml` können über Umgebungsvariablen überschrieben werden:

| Umgebungsvariable | YAML-Pfad | Typ | Standardwert | Beschreibung |
| :--- | :--- | :--- | :--- | :--- |
| `SPRING_PORT` | `server.port` | Integer | `8081` | HTTP-Port des Spring-Boot-Webservers. |
| `VEREINT_DB_URL` | `spring.datasource.url` | String | `jdbc:postgresql://localhost:5432/vereint` | JDBC-Verbindungs-URL zur PostgreSQL-Datenbank. |
| `VEREINT_DB_USERNAME` | `spring.datasource.username` | String | `vereint` | Datenbankbenutzer. |
| `VEREINT_DB_PASSWORD` | `spring.datasource.password` | String | `change-me-vereint-db-password` | Datenbankpasswort. |
| `EV_LIQUIBASE_ENABLED` | `spring.liquibase.enabled` | Boolean | `true` | Aktiviert die automatische Ausführung von Liquibase-Migrationen beim Start. |
| `EV_LIQUIBASE_CONTEXTS` | `spring.liquibase.contexts` | String | `prod` | Aktiver Liquibase-Kontext (`prod`, lokal `dev`, in Tests `test`). |
| `KEYCLOAK_ISSUER_URI` | `spring.security.oauth2.resourceserver.jwt.issuer-uri` | URL | `http://localhost:8082/realms/vereint` | OIDC-Issuer-URI von Keycloak zur JWT-Validierung. |
| `KEYCLOAK_JWK_SET_URI` | `spring.security.oauth2.resourceserver.jwt.jwk-set-uri` | URL | `http://localhost:8082/realms/vereint/protocol/openid-connect/certs` | JWK-Set-Endpunkt zum Abrufen öffentlicher Signierschlüssel. |
| `VEREINT_I18N_SUPPORTED_LOCALES` | `vereint.i18n.supported-locales` | String (CSV) | `de,en` | Sprachen der Fehlertexte, siehe [i18n](i18n.md). |
| `TENANCY_BOOTSTRAP_REALM_ROLES` | `vereint.tenancy.bootstrap-realm-roles` | Boolean | `false` | Nur Entwicklung/E2E: Konten ohne Mitgliedschaft treten „Meine Gruppe“ mit ihren Keycloak-Realmrollen bei. In Produktion aus. |
| `VEREIN_CORS_ALLOWED_ORIGINS` | `vereint.cors.allowed-origins` | String (CSV) | `http://localhost:4200` | Erlaubte CORS-Ursprünge (z. B. `http://localhost:4200,http://localhost:4300`). Wildcards (`*`) sind verboten. |
| `S3_ENABLED` | `vereint.storage.enabled` | Boolean | `false` | Schaltet echten S3-Speicher frei. Bei `false` greift der `InMemoryObjectStorage`. |
| `S3_ENDPOINT` | `vereint.storage.endpoint` | URL | `http://localhost:9000` | S3-kompatibler Endpunkt (lokal S3Mock, in Produktion AWS S3). |
| `S3_BUCKET` | `vereint.storage.bucket` | String | `vereint` | Name des S3-Buckets für Bild-Uploads. |
| `S3_REGION` | `vereint.storage.region` | String | `us-east-1` | S3-Region. |
| `S3_ACCESS_KEY` | `vereint.storage.access-key` | String | *leer* | S3 Access Key ID (Geheimnis). |
| `S3_SECRET_KEY` | `vereint.storage.secret-key` | String | *leer* | S3 Secret Access Key (Geheimnis). |
| `S3_PATH_STYLE_ACCESS` | `vereint.storage.path-style-access` | Boolean | `true` | Verwendet Path-Style-URLs (`/bucket/key`), erforderlich für S3Mock. |
| `S3_URL_TTL_SECONDS` | `vereint.storage.url-ttl-seconds` | Long | `900` | Gültigkeitsdauer für signierte Download-URLs (15 Minuten). |
| `VAPID_ENABLED` | `vereint.push.enabled` | Boolean | `false` | Schaltet Web-Push-Versand frei. Bei `false` greift der `NoOpPushSender`. |
| `VAPID_SUBJECT` | `vereint.push.subject` | String | *leer* | VAPID-Subject (`mailto:admin@vereint.de`). |
| `VAPID_PUBLIC_KEY` | `vereint.push.public-key` | String | *leer* | Öffentlicher Base64-VAPID-Schlüssel für den Client. |
| `VAPID_PRIVATE_KEY` | `vereint.push.private-key` | String | *leer* | Privater Base64-VAPID-Schlüssel (Geheimnis). |
| `VAPID_TTL_SECONDS` | `vereint.push.ttl-seconds` | Long | `2419200` | Time-to-Live für Push-Nachrichten (Standard: 28 Tage). |
| `DATA_ENCRYPTION_ENABLED` | `vereint.encryption.enabled` | Boolean | `false` | Anwendungsverschlüsselung für Chat, Benachrichtigungen und Dateien (AES-256-GCM). In Produktion `true`; ohne Schlüssel startet der Service dann nicht. |
| `DATA_ENCRYPTION_KEY` | `vereint.encryption.key` | String | *leer* | 32 Byte, Base64 (Geheimnis). |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | `vereint.encryption.previous-key` | String | *leer* | Vorgängerschlüssel, nur zum Entschlüsseln während einer Rotation. |
| `REGISTRATION_ENABLED` | `vereint.registration.enabled` | Boolean | `false` | Kontoanlage über die Keycloak-Admin-API (Einladungslinks, Gruppe eröffnen). Ohne Secret antwortet die Registrierung mit `503`. |
| `KEYCLOAK_ADMIN_BASE_URL` | `vereint.registration.keycloak-url` | URL | `http://localhost:8082` | Basis-URL von Keycloak für die Admin-API. |
| `KEYCLOAK_REALM` | `vereint.registration.realm` | String | `vereint` | Realm, in dem Konten angelegt werden. |
| `KEYCLOAK_REGISTRATION_CLIENT_ID` | `vereint.registration.client-id` | String | `vereint-registration` | Vertraulicher Client mit `manage-users`. |
| `KEYCLOAK_REGISTRATION_CLIENT_SECRET` | `vereint.registration.client-secret` | String | *leer* | Secret dieses Clients (Geheimnis). |
| `SIGNUP_ENABLED` | `vereint.signup.enabled` | Boolean | `true` | Öffentliches Eröffnen neuer Gruppen (`/api/v1/signup`). |
| `SIGNUP_MAX_OWNED` | `vereint.signup.max-owned` | Integer | `3` | Höchstzahl aktiver Gruppen, die eine Person selbst eröffnet. |
| `TERMS_VERSION` | `vereint.legal.terms-version` | String | `2026-10-16` | Gültige Fassung der AGB, der bei Registrierung und Eröffnung zugestimmt wird. |
| `STRIPE_ENABLED` | `vereint.billing.stripe-enabled` | Boolean | `false` | Online-Zahlung über Stripe. Ohne `true`, Secret-Key und Webhook-Secret antworten Buchung und Portal mit `503`. |
| `STRIPE_SECRET_KEY` | `vereint.billing.stripe-secret-key` | String | *leer* | Stripe-API-Schlüssel (Geheimnis). |
| `STRIPE_WEBHOOK_SECRET` | `vereint.billing.stripe-webhook-secret` | String | *leer* | Signatur-Secret des Webhooks (Geheimnis). |
| `STRIPE_PRICE_STAMMTISCH_MONTH`, `STRIPE_PRICE_STAMMTISCH_YEAR`, `STRIPE_PRICE_VEREIN_MONTH`, `STRIPE_PRICE_VEREIN_YEAR`, `STRIPE_PRICE_SUPPORTER` | `vereint.billing.prices.*` | String | *leer* | Stripe-Preis-IDs der Tarife. |
| `PUBLIC_BASE_URL` | `vereint.billing.app-url` | URL | `http://localhost:4200` | Rücksprungadresse nach Checkout und Kundenportal. |
| `BILLING_GRACE_DAYS` | `vereint.billing.grace-days` | Integer | `30` | Kulanzfrist nach offener Zahlung, danach ist die Gruppe nur lesbar. |
| `API_DOCS_ENABLED` | `springdoc.api-docs.enabled`, `springdoc.swagger-ui.enabled` | Boolean | `false` | OpenAPI und Swagger UI; in Produktion aus. |

---

## 🛡️ Request-Größenlimits & DoS-Schutz

In `application.yaml` sind strikte Obergrenzen für Header und Payloads konfiguriert:
- **HTTP Header-Größe**: `16KB` (`server.max-http-request-header-size`) – ausreichend für große JWT-Tokens und Session-Cookies.
- **Form Post & Swallow Size**: `2MB` (`server.tomcat.max-http-form-post-size` und `max-swallow-size`).
- **Multipart Upload Size**: `5MB` pro Datei (`spring.servlet.multipart.max-file-size`) und `6MB` pro Gesamtrequest (`max-request-size`) für Bild-Uploads. Fotos und Videos in Moments laufen über einen eigenen Weg mit höheren Grenzen, siehe [Moments](../domains/moments-and-rituals.md).

---

## 🔗 Querverweise

- Weiter zu [02. Architektur & Schichten](02-architecture-and-layers.md)
- [BFF Übersicht & Setup](../backend-for-frontend/01-overview-and-setup.md)
- [Betrieb: Docker Compose Setup](../operations/local-setup-docker.md)
- [Betrieb: Keycloak & S3-Objektspeicher](../operations/keycloak-and-storage.md)
