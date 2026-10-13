# --- Datenvolume ---------------------------------------------------------------
# Separate Disk fuer alles, was nicht verloren gehen darf (PostgreSQL-Daten).
# Sie ist vom Server unabhaengig: Wird der Server ersetzt, bleibt sie erhalten
# und wird wieder eingehaengt. `prevent_destroy` verhindert, dass Terraform sie
# jemals loescht.
resource "aws_ebs_volume" "data" {
  availability_zone = var.availability_zone
  type              = "gp3"
  size              = var.data_volume_gb
  encrypted         = true

  tags = {
    Name     = "vereint-data"
    Snapshot = "daily"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Taegliche Snapshots des Datenvolumes ueber den Data Lifecycle Manager.
resource "aws_iam_role" "dlm" {
  name = "vereint-dlm"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "dlm.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "dlm" {
  role       = aws_iam_role.dlm.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}

resource "aws_dlm_lifecycle_policy" "daily" {
  description        = "Taegliche Snapshots des vereint-Datenvolumes"
  execution_role_arn = aws_iam_role.dlm.arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]
    target_tags = {
      Snapshot = "daily"
    }

    schedule {
      name      = "taeglich"
      copy_tags = true

      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = ["02:30"]
      }

      retain_rule {
        count = var.snapshot_retention_days
      }
    }
  }
}

# --- S3: Backups ----------------------------------------------------------------
# Naechtliche Datenbank-Dumps. Der Server darf hier nur schreiben und lesen,
# aber nichts loeschen; zusammen mit der Versionierung kann ein kompromittierter
# Server vorhandene Backups weder entfernen noch unbemerkt ueberschreiben.
resource "aws_s3_bucket" "backups" {
  bucket = "vereint-backups-${data.aws_caller_identity.current.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "aufbewahrung"
    status = "Enabled"
    filter {}

    expiration {
      days = var.backup_retention_days
    }
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  depends_on = [aws_s3_bucket_versioning.backups]
}

# --- S3: Anwendungsdateien (ersetzt MinIO) -------------------------------------
resource "aws_s3_bucket" "app" {
  bucket = "vereint-app-${data.aws_caller_identity.current.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "app" {
  bucket = aws_s3_bucket.app.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "app" {
  bucket = aws_s3_bucket.app.id

  rule {
    id     = "alte-versionen"
    status = "Enabled"
    filter {}

    # Geloeschte oder ueberschriebene Dateien bleiben 30 Tage wiederherstellbar.
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  depends_on = [aws_s3_bucket_versioning.app]
}

# Presigned URLs werden direkt vom Browser aufgerufen.
resource "aws_s3_bucket_cors_configuration" "app" {
  bucket = aws_s3_bucket.app.id

  cors_rule {
    allowed_methods = ["GET", "HEAD", "PUT"]
    allowed_origins = ["https://${var.domain}"]
    allowed_headers = ["*"]
    max_age_seconds = 3600
  }
}

# --- Gemeinsame Absicherung beider Buckets --------------------------------------
# Bewusst je Bucket ausgeschrieben statt per for_each, damit statische Scanner
# (Trivy) die Zuordnung zum Bucket erkennen.
resource "aws_s3_bucket_public_access_block" "backups" {
  bucket = aws_s3_bucket.backups.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Zugriffe ohne TLS werden abgelehnt.
resource "aws_s3_bucket_policy" "backups" {
  bucket = aws_s3_bucket.backups.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.backups.arn, "${aws_s3_bucket.backups.arn}/*"]
      Condition = {
        Bool = { "aws:SecureTransport" = "false" }
      }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.backups]
}

resource "aws_s3_bucket_public_access_block" "app" {
  bucket = aws_s3_bucket.app.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "app" {
  bucket = aws_s3_bucket.app.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app" {
  bucket = aws_s3_bucket.app.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Zugriffe ohne TLS werden abgelehnt.
resource "aws_s3_bucket_policy" "app" {
  bucket = aws_s3_bucket.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.app.arn, "${aws_s3_bucket.app.arn}/*"]
      Condition = {
        Bool = { "aws:SecureTransport" = "false" }
      }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.app]
}
