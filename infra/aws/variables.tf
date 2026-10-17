variable "region" {
  description = "AWS-Region. Frankfurt haelt die Daten in der EU."
  type        = string
  default     = "eu-central-1"
}

variable "availability_zone" {
  description = "Zone fuer Server und Datenvolume (beide muessen in derselben Zone liegen)."
  type        = string
  default     = "eu-central-1a"
}

variable "domain" {
  description = "Subdomain, unter der die App erreichbar ist, z. B. vereint.example.de."
  type        = string
}

variable "website_domain" {
  description = "Optional: Domain(s) der statischen Website, mehrere durch Komma getrennt, z. B. \"example.de, www.example.de\". Jeweils einen A-Record auf die Server-IP anlegen. Leer = Website nicht veroeffentlicht."
  type        = string
  default     = ""

  validation {
    condition     = can(regex("^([a-z0-9.-]+(, ?[a-z0-9.-]+)*)?$", var.website_domain))
    error_message = "Nur Domainnamen (Kleinbuchstaben), mehrere durch Komma getrennt."
  }
}

variable "alert_email" {
  description = "E-Mail-Adresse fuer Budget-Warnungen."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Monatsbudget in USD; bei 80 % Ist- bzw. 100 % Prognosewert kommt eine Warnung. Normalbetrieb liegt bei etwa 21 USD."
  type        = number
  default     = 30
}

variable "instance_type" {
  description = "EC2-Typ (ARM/Graviton). t4g.small hat 2 GB RAM, das Minimum fuer den Stack."
  type        = string
  default     = "t4g.small"
}

variable "root_volume_gb" {
  description = "Groesse der System-Disk (Betriebssystem, Docker-Images)."
  type        = number
  default     = 20
}

variable "data_volume_gb" {
  description = "Groesse des Datenvolumes (Datenbanken). Es ueberlebt einen Austausch des Servers."
  type        = number
  default     = 10
}

variable "snapshot_retention_days" {
  description = "Wie viele taegliche Snapshots des Datenvolumes aufbewahrt werden."
  type        = number
  default     = 7
}

variable "backup_retention_days" {
  description = "Wie lange Datenbank-Dumps im Backup-Bucket aufbewahrt werden."
  type        = number
  default     = 30
}

variable "github_repository" {
  description = "Repository, dessen GitHub-Actions-Environment `production` deployen darf."
  type        = string
  default     = "damaurer/vereint"
}

variable "termination_protection" {
  description = "Schuetzt den Server vor versehentlichem Loeschen (auch durch `terraform destroy`)."
  type        = bool
  default     = true
}
