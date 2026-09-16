# Fachdomäne: Moments & Rituale (Gemeinschaftsmomente)

**Moments** (Gemeinschaftsmomente & Rituale) ist ein vielseitiges, ereignisgesteuertes Kollaborationsmerkmal für alle Arten von Clubs und Gemeinschaften. Es ermöglicht Mitgliedern, spontane Momente gemeinsamer Aktivität zu initiieren und zu teilen – von Toasts und Gebeten über Jubelmomente bis hin zu Check-ins und Reflexionsmomenten.

---

## 🎯 Fachliche Sicht (Business Domain)

### 1. Moments-Konzept & Anwendungsfälle
**Moments** ist ein **ereignisgesteuertes, zeitlich begrenzte Kollaborationsmerkmal**, das Vereinsmitglieder nutzen können, um spontane Momente gemeinsamer Aktivität zu initiieren:

- **Soziale & Stammtisch-Clubs**: Gemeinsames Anstoßen ("Gemeinsames Anstoßen 🍻")
- **Glaubensgemeinschaften & Kirchen**: Gemeinsame Gebetskreise ("Gemeinsames Beten & Fürbitten 🙏")
- **Sport- & Fan-Clubs**: Kollektives Jubeln oder Anfeuern ("Jubeln / Anfeuern 📣")
- **Allgemeine Vereinigungen**: Spontane Check-ins, Reflexionsmomente oder Treffpunkt-Bestätigungen ("Check-in 📍")

### 2. Moment-Lebenszyklus
Ein Moment durchläuft folgende Zustände:

- **`active`**: Der Moment ist offen für Antworten und Live-Karten-/Timeline-Updates. Mitglieder können mehrfach Status-Updates und Reaktionen einreichen.
- **`completed`**: Der Moment ist abgelaufen oder wurde manuell vom Initiator/Vorstand finalisiert. Die abgeschlossene Session wird über `listMomentHistory` in der Event-Historie bereitgestellt.
- **`revoked`**: Der Moment wurde vor normaler Fertigstellung storniert.

### 3. Teilnehmer-Multi-Status-Einreichungen
Teilnehmer können während der aktiven Moment-Dauer **mehrfach Status-Updates und Reaktionen** einreichen (z. B. progressive Updates während eines Gebets, wiederholte Toasts/Jubelrufe):

- **Reaktionstypen**: `TOAST`, `PRAYER`, `CHEER`, `CHECKIN`, `THUMBS_UP`, `HEART`, `FIRE` (erweiterbar)
- **Status-Text** (optional): Persönliche Nachricht oder Kommentar (max. 255 Zeichen)
- **Opt-in Koordinaten**: `latitude` und `longitude` mit expliziter Zustimmung (`consent = true`)

### 4. Automatische 24-Stunden-Linked-Konversation
Wenn ein Moment gestartet wird, wird automatisch eine `ConversationEntity` vom Typ `moment` erstellt:

- **Zweck**: Gibt Mitgliedern einen reibungslosen Raum zum Austausch während und nach dem Moment.
- **Lebensdauer**: Automatische Archivierung 24 Stunden nach Erstellung.
- **Teilnehmer**: Alle Event-Mitglieder können beitreten und Nachrichten senden.

### 5. Welt-Karte & GeoJSON-Visualisierung
Ein Moment bietet eine interaktive Welt-Karte, die Geolokalisierungsmarker für Teilnehmer visualisiert, die sich für die Standortfreigabe entschieden haben:

- **Endpunkt**: `GET /api/v1/events/{eventId}/moments/{momentId}/map`
- **Format**: RFC 7946 GeoJSON FeatureCollection mit Point-Geometrien
- **Datenschutz**: Nur Antworten mit `consent = true` und gültigen Koordinaten werden einbezogen.

### 6. Kalender-/Event-Verlauf-Archivierung
Wenn ein Moment abläuft oder fertiggestellt wird, wird die Session abgeschlossen und über `listMomentHistory` in der Moment-Historie des Events bereitgestellt. Der Abschluss wird zusätzlich über `AuditService` protokolliert:

- **Zusammenfassung**: Die Moment-Historie liefert `momentId`, `title`, `topicType`, `totalResponses`, `uniqueParticipants`, `summary` und das nullable Feld `completedAt`.
- **Beispiel-Zusammenfassung**: "5 Teilnehmer haben 8 Statusbeiträge zum Moment 'Stammtisch Anstoßen' (toast) geteilt."
- **Zweck**: Bewahrt Vereinserinnerungen, ohne Haupt-Planungskalender mit Mikro-Events zu überladen.

---

## ⚙️ Technische Sicht (Architecture & Implementation)

### 1. Relevante Komponenten & Klassen

#### Backend (Spring Boot / Kotlin)
- **Controller**:
  - `MomentController`: Verwaltet Moment-Sessions, Antworten, GeoJSON-Kartendaten und Fertigstellungs-Trigger (`/api/v1/events/{eventId}/moments`).
- **Services**:
  - `MomentService`: Kerngeschäftslogik für Session-Orchestrierung, Multi-Status-Antworten, Push-Benachrichtigungsverteilung via `NotificationService` / `PushSender`, Chat-Erstellung via `ChatService` und Bereitstellung der Moment-Historie.
  - `NotificationService` & `PushSender`: Verteilt Web-Push- und In-App-Benachrichtigungen an alle Event-Mitglieder bei Moment-Initiierung.
  - `ChatService`: Aktualisiert zur Unterstützung temporärer Moment-Konversationen mit 24-Stunden-Ablauf.
  - `ImageService`: `ImagePurpose`-Enum aktualisiert von `drinkWithMe` zu `moment`.
- **Entitäten**:
  - `MomentSessionEntity`: Aggregat-Root für eine Moment-Session mit Metadaten (Titel, Thementyp, Nachricht, Initiator, Ablauf).
  - `MomentResponseEntity`: Chronologische Status-Events ohne Eindeutigkeitsbeschränkung pro Benutzer (ermöglicht mehrfache Einreichungen).

#### Frontend (Angular 22)
- **Komponenten**:
  - `MomentsComponent`: Master-Ansicht mit aktiven Moments, Start-Moment-Modal, Multi-Status-Reaktions-Trigger und Link zu 24h-Chat.
  - `MomentTimelineComponent`: Chronologischer Feed von Teilnehmer-Status-Updates mit Benutzer-Badges.
  - `MomentMapComponent`: Responsive Welt-Karte mit GeoJSON-Marker-Projektion.
  - `EventDetailComponent`: Eingebettete aktive Moments-Schnellaktion und vergangene Moment-Aktivitätszusammenfassungen.

### 2. Datenbank-Schema (PostgreSQL / Liquibase)

```sql
CREATE TABLE moment_sessions (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    topic_type VARCHAR(64) NOT NULL, -- 'toast', 'prayer', 'cheer', 'checkin', 'other'
    message VARCHAR(500),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE moment_responses (
    id UUID PRIMARY KEY,
    moment_id UUID NOT NULL REFERENCES moment_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction VARCHAR(64) NOT NULL,
    status_text VARCHAR(255),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_moment_sessions_event_active ON moment_sessions(event_id, active);
CREATE INDEX idx_moment_responses_moment_created ON moment_responses(moment_id, created_at ASC);
CREATE INDEX idx_moment_responses_user ON moment_responses(user_id);
```

---

## 📋 Datenstrukturen & DTOs

```kotlin
data class StartMomentRequest(
    @field:NotBlank @field:Size(max = 255) val title: String,
    @field:NotBlank @field:Size(max = 64) val topicType: String,
    @field:Size(max = 500) val message: String? = null,
    val consent: Boolean = false,
    @field:DecimalMin("-90.0") @field:DecimalMax("90.0") val latitude: Double? = null,
    @field:DecimalMin("-180.0") @field:DecimalMax("180.0") val longitude: Double? = null,
    @field:Min(1) @field:Max(1440) val durationMinutes: Int = 60
)

data class SubmitMomentResponseRequest(
    @field:NotBlank @field:Size(max = 64) val reaction: String,
    @field:Size(max = 255) val statusText: String? = null,
    val consent: Boolean = false,
    @field:DecimalMin("-90.0") @field:DecimalMax("90.0") val latitude: Double? = null,
    @field:DecimalMin("-180.0") @field:DecimalMax("180.0") val longitude: Double? = null
)

data class MomentSessionDto(
    val id: String,
    val eventId: String,
    val creatorId: String,
    val creatorName: String,
    val conversationId: String?,
    val title: String,
    val topicType: String,
    val message: String?,
    val latitude: Double?,
    val longitude: Double?,
    val active: Boolean,
    val responsesCount: Int,
    val expiresAt: Instant,
    val createdAt: Instant,
    val summary: String?
)

data class MomentResponseDto(
    val id: String,
    val momentId: String,
    val userId: String,
    val userName: String,
    val reaction: String,
    val statusText: String?,
    val latitude: Double?,
    val longitude: Double?,
    val createdAt: Instant
)

data class MomentDetailDto(
    val session: MomentSessionDto,
    val responses: List<MomentResponseDto>,
    val mapGeoJson: GeoJsonFeatureCollectionDto
)

data class MomentSummaryDto(
    val momentId: String,
    val title: String,
    val topicType: String,
    val totalResponses: Int,
    val uniqueParticipants: Int,
    val summary: String?,
    val completedAt: Instant?
)
```

---

## 🔄 Sequenzablauf: Moment starten & Teilnehmer-Antworten

```mermaid
sequenceDiagram
    autonumber
    actor Initiator as Initiator Mitglied
    actor Member as Teilnehmer Mitglied
    participant Spring as MomentController / Service
    participant Chat as ChatService
    participant Push as NotificationService / PushSender
    participant DB as PostgreSQL

    Initiator->>Spring: Startet Moment
    Spring->>DB: Speichert Moment Session
    DB-->>Spring: Created
    Spring->>Chat: Erstellt Moment Chat
    Chat-->>Spring: Conversation erstellt
    Spring->>Push: Sendet Moment Benachrichtigung
    Push-->>Member: Web Push und In-App Alert
    Spring-->>Initiator: 201 Created

    Member->>Spring: Sendet erste Moment Antwort
    Spring->>DB: Speichert Moment Response
    DB-->>Spring: Created
    Spring-->>Member: 201 Created

    Member->>Spring: Sendet weitere Moment Antwort
    Spring->>DB: Speichert Moment Response
    DB-->>Spring: Created
    Spring-->>Member: 201 Created

    Initiator->>Spring: Schliesst Moment ab
    Spring->>DB: Aktualisiert Moment Session
    DB-->>Spring: Updated
    Spring->>DB: Schreibt Audit Log
    DB-->>Spring: Created
    Spring-->>Initiator: 200 OK
```

---

## 🔒 Datenschutz & GDPR-Compliance

### Opt-in Geolokalisierung
- **Zustimmungspflicht**: Sowohl `StartMomentRequest` als auch `SubmitMomentResponseRequest` erzwingen `consent = true` vor dem Schreiben von Koordinaten.
- **Koordinaten-Validierung**: Latitude `[-90, 90]`, Longitude `[-180, 180]`.
- **Snapshot-basiert**: Geolokalisierung ist snapshot-basiert bei Status-Einreichung, nicht kontinuierliches GPS-Tracking.

### Zugriffskontrolle (Deny-by-Default)
- Nur Event-Besitzer, beigetretene Teilnehmer und Board/Admin können auf Moments eines Events zugreifen.
- Nicht-Teilnehmer erhalten `403 Forbidden` (`ErrorCode.ACCESS_DENIED`).

---

## 🎨 Frontend-Benutzerfluss

### 1. Moment starten (Initiator)
1. Navigiere zu `/events/:eventId/moments`
2. Klicke auf "Moment starten"
3. Wähle Thementyp (Anstoßen, Gebet, Anfeuern, Check-in, Sonstiges)
4. Gib optionale Nachricht ein
5. Wähle Dauer (15–1440 Minuten, Standard 60)
6. Aktiviere Standortfreigabe (optional, mit Browser-GPS)
7. Klicke "Moment starten"
8. Alle Event-Mitglieder erhalten Web-Push-Benachrichtigung

### 2. Moment beitreten & Antworten (Teilnehmer)
1. Erhalte Web-Push-Benachrichtigung oder navigiere zu `/events/:eventId/moments`
2. Klicke auf aktiven Moment
3. Wähle Reaktion (Emoji/Typ)
4. Gib optionalen Status-Text ein
5. Aktiviere Standortfreigabe (optional)
6. Klicke "Antwort einreichen"
7. Wiederhole Schritte 3–6 für mehrfache Updates während des Moments

### 3. Timeline & Karte anzeigen
1. Öffne Moment-Details
2. Sehe chronologische Timeline mit allen Teilnehmer-Updates
3. Sehe interaktive Welt-Karte mit Standort-Markern (nur für Teilnehmer mit Zustimmung)

### 4. Moment-Chat beitreten
1. Klicke auf "24h Chat" im Moment-Detail
2. Navigiere zu `/chat?conversationId={conversationId}`
3. Sende Nachrichten mit anderen Teilnehmern

### 5. Moment abschließen (Initiator/Board)
1. Klicke auf "Moment abschließen"
2. Moment wird als `completed` markiert
3. Automatische Zusammenfassung wird generiert
4. Moment wird in der Event-Historie verfügbar; der Abschluss wird zusätzlich per Audit protokolliert

---

## 📊 Metriken & Archivierung

Wenn ein Moment abläuft oder fertiggestellt wird, werden für die Moment-Historie folgende Werte erfasst:

- **`uniqueParticipants`**: Anzahl eindeutiger Benutzer aus Antworten einschließlich des Initiators
- **`totalResponses`**: Gesamtzahl der eingereichten Status-Updates
- **`summary`**: Ein Satz mit Teilnehmerzahl, Beitragszahl, Moment-Titel und `topicType`
- **`completedAt`**: Zeitpunkt des Abschlusses; vor dem Abschluss kann der Wert `null` sein

Beispiel-Zusammenfassung:
```
"5 Teilnehmer haben 8 Statusbeiträge zum Moment 'Stammtisch Anstoßen' (toast) geteilt."
```

---

## 🚀 Implementierungs-Roadmap

| Phase | Komponente | Status |
| :--- | :--- | :--- |
| 1 | Datenbank-Schema, Domain-Entitäten, DTOs | ✅ Abgeschlossen |
| 2 | Backend-Services, Push-Benachrichtigungen, REST-API, Unit-Tests | ✅ Abgeschlossen |
| 3 | Frontend-UI, Karte, Timeline, Push-Alert-Handling, Temporary-Chat-Integration | ✅ Abgeschlossen |
| 4 | Dokumentation, API-Referenz, Domain-Modell-Updates | 🔄 In Bearbeitung |
