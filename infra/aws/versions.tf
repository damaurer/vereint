terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Der State enthaelt die generierten Secrets und liegt deshalb verschluesselt
  # und versioniert in S3 (Bucket aus `bootstrap/`). Konfiguration per
  # `terraform init -backend-config=backend.hcl`, siehe README.md.
  backend "s3" {
    key          = "vereint/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "vereint"
      ManagedBy = "terraform"
    }
  }
}
