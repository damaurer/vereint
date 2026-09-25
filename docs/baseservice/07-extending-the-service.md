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
            throw AccessDeniedException("Nur Vorstand/Admin darf Specials anlegen", ErrorCode.ACCESS_DENIED)
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
)
```

#### 2. Liquibase-Changeset schreiben (`src/main/resources/db/changelog/changes/008-food-specials.xml`)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
    http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-latest.xsd">

    <changeSet id="008-food-specials-create-table" author="baseservice">
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
</databaseChangeLog>
```

#### 3. In Master-Changelog einbinden (`db.changelog-master.xml`)
```xml
<include file="db/changelog/changes/008-food-specials.xml"/>
```

---

### Rezept 3: Neue Permission oder Rolle einführen

1. **Permission-Konstante ergänzen** in `security/SecurityContracts.kt`:
   ```kotlin
   object Permission {
       const val SPECIALS_MANAGE = "specials.manage"
   }
   ```
2. **Matrix aktualisieren & `VERSION` erhöhen** in `security/RolePermissionMatrix.kt`:
   ```kotlin
   object RolePermissionMatrix {
       const val VERSION = 3 // Erhöhen!
       private val BOARD_PERMISSIONS = setOf(
           ...,
           Permission.SPECIALS_MANAGE
       )
   }
   ```
3. **BFF abgleichen**: Synchronisiere die Änderung in `webservice/src/server/auth/role-matrix.ts`, damit der BFF-Cache und die TypeScript-Typen synchron bleiben.

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
       message: String = "Das Tages-Special ist abgelaufen",
       errorCode: String = ErrorCode.SPECIAL_EXPIRED
   ) : ApiException(errorCode, message, HttpStatus.GONE)
   ```
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
2. **Risiko-Absicherung**:
   - Stelle sicher, dass im Controller keine sensiblen Benutzerdaten oder unveröffentlichten Entitäten zurückgegeben werden.
   - Der Endpunkt darf **nicht** `authContext.getRequiredPrincipal()` aufrufen (wirft sonst 401).
3. **Test in `SecurityDenyByDefaultTest.kt` anpassen / erweitern**.

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
| **PostgreSQL Integrationstest** | `@SpringBootTest` mit `@Testcontainers` (`PostgresMigrationIntegrationTest`) | Echtes PostgreSQL im Docker-Container | Prüft PostgreSQL-spezifische SQL-Syntax, Indizes, Trigger und Fremdschlüssel. |

---

## 🔍 Debugging & Troubleshooting

| Symptom / Fehler | Ursache | Lösung |
| :--- | :--- | :--- |
| **HTTP `401 Unauthorized`** (`code: "access_denied"`) | Kein `Authorization: Bearer <Token>` Header mitgesendet oder Token abgelaufen. | Gültiges JWT über Keycloak oder BFF anfordern; im Test `.with(jwt())` verwenden. |
| **HTTP `403 Forbidden`** (`code: "permission_denied"`) | Dem Benutzer fehlt die erforderliche Rolle (`board`/`admin`) oder Permission. | Token-Claims in Keycloak prüfen oder Matrix in `RolePermissionMatrix.kt` erweitern. |
| **HTTP `409 Conflict`** (`code: "concurrent_modification"`) | Parallele Modifikation einer Entity (Optimistic Locking `@Version`). | Client muss die Ressource neu abrufen (`GET`) und die Änderung wiederholen. |
| **Liquibase Checksum Error** (`ValidationFailedException`) | Ein bereits ausgeführtes Changeset wurde nachträglich im XML verändert. | Changesets niemals nachträglich editieren! Stattdessen ein neues Changeset (`00X-fix.xml`) anlegen. |
| **PostgreSQL Connection Refused** (`Connection to localhost:5432 refused`) | Lokale PostgreSQL-Instanz läuft nicht. | `docker compose up -d postgres` im Projekt-Hauptverzeichnis ausführen. |
| **Bean Validation ignoriert Validierungsfehler** | `@Valid` vor `@RequestBody` im Controller-Parameter vergessen. | `@Valid` hinzufügen und DTO-Felder mit `@field:NotBlank` / `@field:NotNull` annotieren. |

---

## ✅ Pull-Request-Checkliste

Vor dem Einreichen eines Pull Requests für den `baseservice` bitte prüfen:

- [ ] **Tests erfolgreich**: `./gradlew test` bzw. `.\gradlew.bat test` läuft fehlerfrei durch.
- [ ] **Deny by Default**: Neue Endpunkte erfordern Authentifizierung oder sind begründet in `SecurityConfig.kt` freigegeben.
- [ ] **Rollen- & Rechteprüfung**: Fachlogik im Service prüft `principal` und Berechtigungen über `RolePermissionMatrix`.
- [ ] **Validierung**: Alle Request-DTOs nutzen Jakarta Bean Validation (`@field:NotBlank`, `@field:Min` etc.).
- [ ] **Liquibase**: Schemaänderungen liegen in einem neuen nummerierten Changeset mit `<rollback>` und Eintrag in `db.changelog-master.xml`.
- [ ] **Optimistic Locking**: Neue Entities besitzen `@Version var version: Long = 0`.
- [ ] **OpenAPI**: Controller und Methoden sind mit `@Tag` und `@Operation` dokumentiert.
- [ ] **Kein Secret-Leakage**: Passwörter, VAPID Private Keys oder S3 Secret Keys werden niemals in Logs oder DTOs ausgegeben.
- [ ] **BFF-Abgleich**: Wurden Rollen, Permissions oder `ErrorCode`s geändert, wurden die TypeScript-Gegenstücke im BFF angepasst.

---

## 🔗 Querverweise

- Zurück zum [Inhaltsverzeichnis (README.md)](README.md)
- [BFF Server erweitern & Vitest](../backend-for-frontend/06-extending-the-server.md)
- [Datenbankmigrationen Leitfaden](../operations/database-migrations.md)
- [REST-API Spezifikation](../api/rest-api-reference.md)
