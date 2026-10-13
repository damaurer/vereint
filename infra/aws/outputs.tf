output "public_ip" {
  description = "Feste IP des Servers. Fuer die Subdomain einen A-Record auf diese IP anlegen."
  value       = aws_eip.app.public_ip
}

output "instance_id" {
  description = "ID des Servers."
  value       = aws_instance.app.id
}

output "shell_command" {
  description = "Shell auf dem Server oeffnen (AWS CLI + Session-Manager-Plugin noetig)."
  value       = "aws ssm start-session --region ${var.region} --target ${aws_instance.app.id}"
}

output "app_bucket" {
  description = "S3-Bucket fuer Anwendungsdateien."
  value       = aws_s3_bucket.app.bucket
}

output "backup_bucket" {
  description = "S3-Bucket fuer Datenbank-Backups."
  value       = aws_s3_bucket.backups.bucket
}

output "deploy_role_arn" {
  description = "Rolle fuer GitHub Actions (als Secret AWS_DEPLOY_ROLE_ARN im Environment production hinterlegen)."
  value       = aws_iam_role.deploy.arn
}

output "github_environment_variables" {
  description = "Variablen fuer das GitHub-Environment production (Settings -> Environments -> production -> Variables)."
  value = {
    AWS_REGION            = var.region
    VEREINT_INSTANCE_ID   = aws_instance.app.id
    VEREINT_DEPLOY_BUCKET = aws_s3_bucket.backups.bucket
  }
}
