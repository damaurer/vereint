# E-Mail-Benachrichtigungen bei Problemen. AWS schickt nach dem ersten
# `terraform apply` eine Bestaetigungsmail an `alert_email`, die einmal
# angeklickt werden muss.
resource "aws_sns_topic" "alerts" {
  name = "vereint-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Das naechtliche Backup meldet nur dann Erfolg, wenn Dump, Probe-
# Wiederherstellung, Verschluesselung und Upload geklappt haben. Fehlt die
# Meldung 26 Stunden lang, kommt eine E-Mail.
resource "aws_cloudwatch_metric_alarm" "backup_missing" {
  alarm_name          = "vereint-backup-missing"
  alarm_description   = "Seit mehr als einem Tag kein erfolgreiches Datenbank-Backup"
  namespace           = "Vereint"
  metric_name         = "BackupSucceeded"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 26
  datapoints_to_alarm = 26
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
