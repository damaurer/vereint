locals {
  ssm_prefix = "/vereint"
}

# --- Rolle des Servers ----------------------------------------------------------
resource "aws_iam_role" "app" {
  name = "vereint-app"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Session Manager (Shell ohne SSH) und Run Command fuer Deployments.
resource "aws_iam_role_policy_attachment" "app_ssm" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "app" {
  name = "vereint-app"
  role = aws_iam_role.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadSecrets"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
        Resource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}/*"
      },
      {
        # Bewusst ohne s3:DeleteObject*: Backups kann der Server nicht loeschen.
        Sid      = "WriteAndReadBackups"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.backups.arn}/*"
      },
      {
        Sid      = "ListBackups"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.backups.arn
      },
      {
        # Erfolgsmeldung des Backups; bleibt sie aus, alarmiert monitoring.tf.
        Sid      = "ReportBackupStatus"
        Effect   = "Allow"
        Action   = "cloudwatch:PutMetricData"
        Resource = "*"
        Condition = {
          StringEquals = { "cloudwatch:namespace" = "Vereint" }
        }
      },
    ]
  })
}

resource "aws_iam_instance_profile" "app" {
  name = "vereint-app"
  role = aws_iam_role.app.name
}

# --- Zugang der Anwendung zum Datei-Bucket --------------------------------------
# Der baseservice signiert Presigned URLs selbst und braucht dafuer statische
# Zugangsdaten. Dieser Benutzer darf ausschliesslich den App-Bucket nutzen.
resource "aws_iam_user" "app_storage" {
  name = "vereint-app-storage"
}

resource "aws_iam_user_policy" "app_storage" {
  name = "vereint-app-storage"
  user = aws_iam_user.app_storage.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.app.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.app.arn
      },
    ]
  })
}

resource "aws_iam_access_key" "app_storage" {
  user = aws_iam_user.app_storage.name
}

# --- Deployments aus GitHub Actions ---------------------------------------------
# GitHub meldet sich per OIDC an; es gibt keine dauerhaften AWS-Schluessel in
# GitHub. Nur Jobs im Environment `production` dieses Repositories duerfen die
# Rolle uebernehmen, und die Rolle darf nur Befehle auf diesem Server ausfuehren.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "deploy" {
  name = "vereint-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:production"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy" {
  name = "vereint-github-deploy"
  role = aws_iam_role.deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "RunDeployCommand"
        Effect = "Allow"
        Action = "ssm:SendCommand"
        Resource = [
          aws_instance.app.arn,
          "arn:aws:ssm:${var.region}::document/AWS-RunShellScript",
        ]
      },
      {
        Sid      = "ReadCommandResult"
        Effect   = "Allow"
        Action   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
        Resource = "*"
      },
    ]
  })
}
