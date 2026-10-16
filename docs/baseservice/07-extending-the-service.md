# 🛠️ Service erweitern, Rezepte, Testing & Troubleshooting

In diesem Kapitel finden Entwickler praxisnahe Schritt-für-Schritt-Rezepte zur Erweiterung des `baseservice`, Best Practices für automatisierte Tests, eine Troubleshooting-Tabelle für typische Fehlerbilder sowie eine PR-Checkliste für Code-Reviews.

---

## 🍳 Schritt-für-Schritt-Rezepte (How-Tos)

### Rezept 1: Neuen REST-Endpunkt anlegen

Wenn du eine neue fachliche Funktion bereitstellen möchtest, führe folgende Schritte durch:

#### 1. DTOs definieren (`dto/FoodDtos.kt`)
```kotlin
data class CreateFoodSpecialRequest(
    @field:NotBlank(message = "name darf nicht leer sein")
    val name: String = "",

    @field:DecimalMin(value = "0.00", message = "price darf nicht negativ sein")
    val price: BigDecimal = BigDecimal.ZERO
)

data class FoodSpecialDto(
    val id: String,
    val name: String,
    val price: BigDecimal
)
```

#### 2. Service-Methode implementieren (`service/FoodCatalogService.kt`)
```kotlin
@Service
@Transactional
class FoodCatalogService(...) {
    fun createSpecial(request: CreateFoodSpecialRequest, principal: UserPrincipal): FoodSpecialDto {
        val caller = userService.getOrCreateUser(principal)
        if (!isBoardOrAdmin(caller, principal)) {
            throw AccessDeniedException(Msg("error.food.specialDenied"), ErrorCode.ACCESS_DENIED)
        }
        val entity = FoodSpecialEntity(
            name = request.name.trim(),
            price = request.price,
            createdBy = caller
        )
        val saved = foodSpecialRepository.save(entity)
        return FoodSpecialDto(id = saved.id.toString(), name = saved.name, price = saved.price)
    }
}
```

#### 3. Controller-Endpunkt exponieren (`controller/FoodCatalogController.kt`)
```kotlin
@RestController
@RequestMapping("/api/v1/food")
@Tag(name = "Speisenkatalog")
class FoodCatalogController(
    private val foodCatalogService: FoodCatalogService,
    private val authContext: AuthContext
) {
    @PostMapping("/specials")
    @Operation(summary = "Tages-Special anlegen", description = "Erstellt ein neues Tagesangebot (nur Vorstand/Admin)")
    fun createSpecial(@Valid @RequestBody request: CreateFoodSpecialRequest): ResponseEntity<FoodSpecialDto> {
        val principal = authContext.getRequiredPrincipal()
        val created = foodCatalogService.createSpecial(request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(created)
    }
}
```

---

### Rezept 2: Neue Entity mit Liquibase-Migration anlegen

#### 1. JPA-Entity erstellen (`domain/FoodEntities.kt`)
```kotlin
@Entity
@Table(name = "food_specials")
@EntityListeners(AuditingEntityListener::class)
class FoodSpecialEntity(
    // erbt `stammtischId` (@TenantId) von StammtischScoped
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "name", length = 255, nullable = false)
    var name: String = "",

    @Column(name = "price", precision = 10, scale = 2, nullable = false)
    var price: BigDecimal = BigDecimal.ZERO,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    var createdBy: UserEntity? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) : StammtischScoped()
```

#### 2. Liquibase-Changeset schreiben (`src/main/resources/db/changelog/changes/017-food-specials.xml`)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
    http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-latest.xsd">

    <changeSet id="200-food-specials-create-table" author="baseservice">
        <createTable tableName="food_specials">
            <column name="id" type="UUID">
                <constraints primaryKey="true" primaryKeyName="pk_food_specials" nullable="false"/>
            </column>
            <column name="name" type="VARCHAR(255)">
                <constraints nullable="false"/>
            </column>
            <column name="price" type="NUMERIC(10, 2)">
                <constraints nullable="false"/>
            </column>
            <column name="stammtisch_id" type="UUID">
                <constraints nullable="false" foreignKeyName="fk_food_specials_stammtisch" references="stammtische(id)"/>
            </column>
            <column name="created_by" type="UUID">
                <constraints nullable="false" foreignKeyName="fk_food_specials_user" references="users(id)"/>
            </column>
            <column name="created_at" type="TIMESTAMP WITH TIME ZONE">
                <constraints nullable="false"/>
            </column>
            <column name="updated_at" type="TIMESTAMP WITH TIME ZONE">
                <constraints nullable="false"/>
            </column>
            <column name="version" type="BIGINT" defaultValueNumeric="0">
                <constraints nullable="false"/>
            </column>
        </createTable>

        <rollback>
            <dropTable tableName="food_specials"/>
        </rollback>
    </changeSet>

    <!-- Zweite Sicherung neben @TenantId, wie Changeset 165 in 013-stammtische.xml -->
    <changeSet id="201-food-specials-rls" author="baseservice" dbms="postgresql">
        <sql splitStatements="false">
            ALTER TABLE food_specials ENABLE ROW LEVEL SECURITY;
            ALTER TABLE food_specials FORCE ROW LEVEL SECURITY;
            CREATE POLICY stammtisch_isolation ON food_specials
                USING (current_setting('vereint.rls_bypass', true) = 'on'
                       OR stammtisch_id = nullif(current_setting('vereint.stammtisch_id', true), '')::uuid)
                WITH CHECK (current_setting('vereint.rls_bypass', true) = 'on'
                       OR stammtisch_id = nullif(current_setting('vereint.stammtisch_id', true), '')::uuid);
        </sql>
    </changeSet>
</databaseChangeLog>
```

#### 3. In Master-Changelog einbinden (`db.changelog-master.xml`)
```xml
<include file="db/changelog/changes/017-food-specials.xml"/>
```

---

### Rezept 3: Neue Permission einführen

Rollen und ihre Rechte stehen je Gruppe in `stammtisch_roles`. Eine neue Permission braucht deshalb drei Stellen:

1. **Permission-Konstante ergänzen** in `security/SecurityContracts.kt` und in `Permission.ALL` aufnehmen (sonst lehnt die Rollenverwaltung sie ab):
   ```kotlin
   object Permission {
       const val SPECIALS_MANAGE = "specials.manage"
   }
   ```
2. **Startwerte aktualisieren & `VERSION` erhöhen** in `security/RolePermissionMatrix.kt`. Das wirkt nur für neu angelegte Gruppen:
   ```kotlin
   object RolePermissionMatrix {
       const val VERSION = 5 // Erhöhen!
       private val BOARD_PERMISSIONS = MEMBER_PERMISSIONS + setOf(
           ...,
           Permission.SPECIALS_MANAGE
       )
   }
   ```
3. **Bestehende Gruppen per Migration nachziehen**: ein Changeset, das die Permission in `stammtisch_roles.permissions` der passenden Systemrollen ergänzt (vorher `SET LOCAL vereint.rls_bypass = 'on'`, Beispiel in `015-billing.xml`).
4. **Oberfläche**: Die Rollenverwaltung gruppiert Rechte nach ihrem Präfix; für ein neues Präfix einen Text unter `stammtisch.permissionGroups.<präfix>` in `webservice/src/app/i18n/locales/*.json` anlegen. Der BFF liest die Matrix über `GET /api/v1/auth/access/matrix` und braucht keinen eigenen Abgleich.

---

### Rezept 4: Neuen `ErrorCode` & Exception einführen

1. **Konstante ergänzen** in `error/ErrorCode.kt`:
   ```kotlin
   object ErrorCode {
       const val SPECIAL_EXPIRED = "special_expired"
   }
   ```
2. **Exception definieren** in `error/Exceptions.kt`:
   ```kotlin
   class SpecialExpiredException(
       msg: Msg = Msg("error.food.specialExpired"),
       errorCode: String = ErrorCode.SPECIAL_EXPIRED
   ) : ApiException(errorCode, msg, HttpStatus.GONE)
   ```
   Den Text unter dem Schlüssel in `i18n/messages.properties` und `messages_en.properties` eintragen (siehe [i18n](i18n.md)).
3. *Hinweis*: Da `SpecialExpiredException` von `ApiException` erbt, greift automatisch `GlobalExceptionHandler.handleApiException` – kein weiterer Code im Exception-Handler nötig!

---

### Rezept 5: Neue Konfigurationseigenschaft hinzufügen

1. **Properties-Klasse erstellen** (z. B. `config/SpecialsProperties.kt`):
   ```kotlin
   @ConfigurationProperties(prefix = "vereint.specials")
   data class SpecialsProperties(
       val enabled: Boolean = true,
       val maxPerDay: Int = 5
   )
   ```
2. **In `application.yaml` eintragen**:
   ```yaml
   vereint:
     specials:
       enabled: ${SPECIALS_ENABLED:true}
       max-per-day: ${SPECIALS_MAX_PER_DAY:5}
   ```
3. **In Konfigurationsklasse aktivieren**: `@EnableConfigurationProperties(SpecialsProperties::class)`

---

### Rezept 6: Öffentlichen Endpunkt freigeben (`permitAll`)

Soll ein Endpunkt ausnahmsweise ohne JWT erreichbar sein (z. B. ein öffentlicher Speiseplan):

1. **In `SecurityConfig.kt` freigeben**:
   ```kotlin
   .requestMatchers(
       "/api/v1/food/public-menu",
       ...
   ).permitAll()
   ```
2. **Ohne Gruppe erreichbar?** Fachliche Pfade verlangen eine gewählte Gruppe. Soll der Endpunkt ohne Gruppenkontext laufen, den Pfad zusätzlich in `StammtischContextFilter.isStammtischFree` aufnehmen.
3. **Risiko-Absicherung**:
   - Stelle sicher, dass im Controller keine sensiblen Benutzerdaten oder unveröffentlichten Entitäten zurückgegeben werden.
   - Der Endpunkt darf **nicht** `authContext.getRequiredPrincipal()` aufrufen (wirft sonst 401).
4. **Test in `SecurityDenyByDefaultTest.kt` anpassen / erweitern**.

---

### Rezept 7: Tests schreiben

#### 1. Controller-Test mit MockMvc & `jwt()` (`FoodCatalogControllerTest.kt`)
```kotlin
@SpringBootTest
@ActiveProfiles("test")
class FoodCatalogControllerTest {

    @Autowired private lateinit var context: WebApplicationContext
    @Autowired private lateinit var objectMapper: ObjectMapper
    @MockitoBean private lateinit var foodCatalogService: FoodCatalogService
    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setup() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
            .apply<DefaultMockMvcBuilder>(springSecurity())
            .build()
    }

    @Test
    fun `POST create special returns 201 for board`() {
        val request = CreateFoodSpecialRequest(name = "Pizza", price = BigDecimal("8.50"))
        `when`(foodCatalogService.createSpecial(any(), any())).thenReturn(
            FoodSpecialDto(id = UUID.randomUUID().toString(), name = "Pizza", price = BigDecimal("8.50"))
        )

        mockMvc.perform(
            post("/api/v1/food/specials")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .with(jwt().jwt { it.subject("sub-board").claim("roles", listOf("board")) })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.name").value("Pizza"))
    }
}
```

---

## 🧪 Test-Konventionen

| Test-Typ | Basisklasse / Annotation | DB & Setup | Verwendung |
| :--- | :--- | :--- | :--- |
| **Controller Slice-Test** | `@SpringBootTest`, `@ActiveProfiles("test")` | H2 InMemory (`application-test.yaml`), Services gemockt via `@MockitoBean` | Testet HTTP-Routing, Bean-Validation, Security-Filter und Statuscodes. |
| **Service Unit-Test** | Reines JUnit 5 mit Mockito (`@ExtendWith(MockitoExtension::class)`) | Keine DB (Mocks für Repositories) | Testet Berechnungslogik, Rollenprüfung, Guard Clauses und Exceptions. |
| **Liquibase Schema-Test** | `@SpringBootTest`, `@ActiveProfiles("test")` (`LiquibaseSchemaTest`) | H2 InMemory | Validiert die syntaktische Korrektheit aller XML-Migrationen. |
| **PostgreSQL Integrationstest** | `@SpringBootTest` mit `@Testcontainers` (`PostgresMigrationIntegrationTest`, `RowLevelSecurityIntegrationTest`) | Echtes PostgreSQL im Docker-Container | Prüft PostgreSQL-spezifische SQL-Syntax, Indizes, Trigger, Fremdschlüssel und Row Level Security. |
| **Gruppentrennung** | `StammtischSeparationIntegrationTest` | H2 InMemory | Prüft, dass Daten einer Gruppe in einer anderen nicht sichtbar sind. |

---

## 🔍 Debugging & Troubleshooting

| Symptom / Fehler | Ursache | Lösung |
| :--- | :--- | :--- |
| **HTTP `401 Unauthorized`** (`code: "access_denied"`) | Kein `Authorization: Bearer <Token>` Header mitgesendet oder Token abgelaufen. | Gültiges JWT über Keycloak oder BFF anfordern; im Test `.with(jwt())` verwenden. |
| **HTTP `403 Forbidden`** (`code: "access_denied"` / `"permission_denied"`) | Der Person fehlt die Permission in der gewählten Gruppe. | Rollen der Person und `stammtisch_roles` der Gruppe prüfen; Keycloak-Realmrollen zählen nicht. |
| **HTTP `409 Conflict`** (`code: "stammtisch_required"`) | Person ist in mehreren Gruppen, die Anfrage trägt keinen Header `X-Stammtisch-Id`. | Gruppe wählen (BFF: `POST /api/auth/stammtisch`) oder im Test den Header setzen. |
| **Abfrage liefert nichts / Insert scheitert an RLS** | Code läuft ohne `TenantContext` (z. B. in einem Job). | Über `TenantTransactions.inStammtisch` bzw. `StammtischJobs` je Gruppe ausführen. |
| **HTTP `409 Conflict`** (`code: "concurrent_modification"`) | Parallele Modifikation einer Entity (Optimistic Locking `@Version`). | Client muss die Ressource neu abrufen (`GET`) und die Änderung wiederholen. |
| **Liquibase Checksum Error** (`ValidationFailedException`) | Ein bereits ausgeführtes Changeset wurde nachträglich im XML verändert. | Changesets niemals nachträglich editieren! Stattdessen ein neues Changeset (`00X-fix.xml`) anlegen. |
| **PostgreSQL Connection Refused** (`Connection to localhost:5432 refused`) | Lokale PostgreSQL-Instanz läuft nicht. | `docker compose up -d vereint-db` im Projekt-Hauptverzeichnis ausführen. |
| **Bean Validation ignoriert Validierungsfehler** | `@Valid` vor `@RequestBody` im Controller-Parameter vergessen. | `@Valid` hinzufügen und DTO-Felder mit `@field:NotBlank` / `@field:NotNull` annotieren. |

---

## ✅ Pull-Request-Checkliste

Vor dem Einreichen eines Pull Requests für den `baseservice` bitte prüfen:

- [ ] **Tests erfolgreich**: `./gradlew test` bzw. `.\gradlew.bat test` läuft fehlerfrei durch.
- [ ] **Deny by Default**: Neue Endpunkte erfordern Authentifizierung oder sind begründet in `SecurityConfig.kt` freigegeben.
- [ ] **Rollen- & Rechteprüfung**: Fachlogik im Service prüft Berechtigungen der Gruppe über `StammtischAccess`.
- [ ] **Gruppentrennung**: Neue fachliche Entities erben von `StammtischScoped`; die Tabelle hat `stammtisch_id` und eine RLS-Policy.
- [ ] **Validierung**: Alle Request-DTOs nutzen Jakarta Bean Validation (`@field:NotBlank`, `@field:Min` etc.).
- [ ] **Liquibase**: Schemaänderungen liegen in einem neuen nummerierten Changeset mit `<rollback>` und Eintrag in `db.changelog-master.xml`.
- [ ] **Optimistic Locking**: Neue Entities besitzen `@Version var version: Long = 0`.
- [ ] **OpenAPI**: Controller und Methoden sind mit `@Tag` und `@Operation` dokumentiert.
- [ ] **Kein Secret-Leakage**: Passwörter, VAPID Private Keys oder S3 Secret Keys werden niemals in Logs oder DTOs ausgegeben.
- [ ] **Frontend-Abgleich**: Wurden Permissions oder `ErrorCode`s geändert, sind Texte und Typen im `webservice` angepasst (z. B. `api.types.ts`, `i18n/locales`).

---

## 🔗 Querverweise

- Zurück zum [Inhaltsverzeichnis (README.md)](README.md)
- [BFF Server erweitern & Vitest](../backend-for-frontend/06-extending-the-server.md)
- [Datenbankmigrationen Leitfaden](../operations/database-migrations.md)
- [REST-API Spezifikation](../api/rest-api-reference.md)
