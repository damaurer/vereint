# Zufaellig erzeugte Secrets, abgelegt als SecureString im SSM Parameter Store.
# Der Server liest sie beim Deployment; im Repository oder in GitHub stehen sie
# nie. Zum Rotieren: `terraform apply -replace='random_password.secrets["..."]'`.
locals {
  generated_secrets = toset([
    "SESSION_SECRET",
    "KEYCLOAK_ADMIN_PASSWORD",
    "KEYCLOAK_CLIENT_SECRET",
    "KEYCLOAK_TABLET_CLIENT_SECRET",
    "KEYCLOAK_DB_PASSWORD",
    "VEREINT_DB_PASSWORD",
    # Superuser der PostgreSQL-Instanz (nur fuer Backups und Verwaltung).
    "POSTGRES_PASSWORD",
    # Passphrase, mit der Backups vor dem Upload nach S3 verschluesselt werden.
    # Zusaetzlich offline (Passwort-Manager) aufbewahren: ohne sie sind die
    # Backups nicht wiederherstellbar.
    "BACKUP_ENCRYPTION_KEY",
  ])
}

resource "random_password" "secrets" {
  for_each = local.generated_secrets

  length  = 48
  special = false
}

resource "aws_ssm_parameter" "generated" {
  for_each = local.generated_secrets

  name  = "${local.ssm_prefix}/${each.key}"
  type  = "SecureString"
  value = random_password.secrets[each.key].result
}

# Schluessel der Anwendungsverschluesselung (AES-256) fuer Chat-Nachrichten,
# Benachrichtigungen und Bilddateien. Wie die Backup-Passphrase zusaetzlich
# offline aufbewahren: ohne ihn sind diese Inhalte nicht mehr lesbar. Nicht mit
# `-replace` rotieren, sondern wie in deploy/README.md beschrieben.
resource "random_bytes" "data_encryption_key" {
  length = 32
}

resource "aws_ssm_parameter" "data_encryption_key" {
  name  = "${local.ssm_prefix}/DATA_ENCRYPTION_KEY"
  type  = "SecureString"
  value = random_bytes.data_encryption_key.base64

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ssm_parameter" "s3_access_key" {
  name  = "${local.ssm_prefix}/S3_ACCESS_KEY"
  type  = "SecureString"
  value = aws_iam_access_key.app_storage.id
}

resource "aws_ssm_parameter" "s3_secret_key" {
  name  = "${local.ssm_prefix}/S3_SECRET_KEY"
  type  = "SecureString"
  value = aws_iam_access_key.app_storage.secret
}

# Nicht geheime Werte, die das Deployment ebenfalls braucht.
resource "aws_ssm_parameter" "config" {
  for_each = {
    PUBLIC_DOMAIN = var.domain
    S3_BUCKET     = aws_s3_bucket.app.bucket
    S3_REGION     = var.region
    BACKUP_BUCKET = aws_s3_bucket.backups.bucket
  }

  name  = "${local.ssm_prefix}/${each.key}"
  type  = "String"
  value = each.value
}
