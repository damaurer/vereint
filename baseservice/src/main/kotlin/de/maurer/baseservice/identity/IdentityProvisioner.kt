package de.maurer.baseservice.identity

/** Neues Login-Konto im Identity Provider. */
data class NewAccount(
    val email: String,
    val firstName: String,
    val lastName: String,
    val password: String
) {
    /** Das Passwort erscheint nie in Logs oder Fehlermeldungen. */
    override fun toString(): String = "NewAccount(email=$email, firstName=$firstName, lastName=$lastName)"
}

/**
 * Legt Login-Konten im Identity Provider an. Die Implementierung vergibt keine
 * Rollen; neue Konten erhalten ausschließlich die Standardrollen des Realms
 * (`default-roles-vereint` = `member`).
 */
interface IdentityProvisioner {

    /**
     * Legt ein aktiviertes Konto mit dauerhaftem Passwort an und liefert dessen
     * Subject (Keycloak-Benutzer-ID).
     *
     * @throws de.maurer.baseservice.error.EmailAlreadyRegisteredException wenn es die E-Mail bereits gibt
     * @throws de.maurer.baseservice.error.PasswordRejectedException wenn die Passwortrichtlinie greift
     * @throws de.maurer.baseservice.error.RegistrationUnavailableException wenn Keycloak nicht erreichbar ist
     */
    fun createAccount(account: NewAccount): String

    /** Entfernt ein gerade angelegtes Konto wieder (Kompensation bei Fehlern). */
    fun deleteAccount(subject: String)
}
