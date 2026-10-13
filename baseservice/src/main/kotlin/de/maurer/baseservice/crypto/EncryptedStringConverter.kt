package de.maurer.baseservice.crypto

import jakarta.persistence.AttributeConverter
import jakarta.persistence.Converter
import org.springframework.stereotype.Component

/**
 * JPA-Konverter für Textspalten, deren Inhalt verschlüsselt gespeichert wird
 * (`@Convert(converter = EncryptedStringConverter::class)`). Hibernate bezieht
 * den Konverter über Spring, damit er den konfigurierten Schlüssel nutzt.
 *
 * Achtung: Verschlüsselte Spalten lassen sich nicht mehr per SQL durchsuchen
 * oder sortieren.
 */
@Component
@Converter
class EncryptedStringConverter(private val encryptor: DataEncryptor) : AttributeConverter<String?, String?> {

    override fun convertToDatabaseColumn(attribute: String?): String? = encryptor.encryptText(attribute)

    override fun convertToEntityAttribute(dbData: String?): String? = encryptor.decryptText(dbData)
}
