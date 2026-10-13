# Ein einzelner, kleiner ARM-Server im Default-VPC. Bewusst ohne NAT-Gateway,
# Load Balancer oder RDS: Diese Bausteine kosten jeweils mehr als der Server.
# Erreichbar ist er nur ueber HTTP/HTTPS; Administration laeuft ueber AWS
# Systems Manager (Session Manager), es gibt keinen SSH-Port und keinen Schluessel.

data "aws_caller_identity" "current" {}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "default" {
  vpc_id            = data.aws_vpc.default.id
  availability_zone = var.availability_zone
  default_for_az    = true
}

data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

# Jede neue EBS-Disk in diesem Account und dieser Region wird verschluesselt.
resource "aws_ebs_encryption_by_default" "this" {
  enabled = true
}

resource "aws_security_group" "web" {
  name        = "vereint-web"
  description = "Nur HTTP und HTTPS von aussen"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.web.id
  description       = "HTTP (Weiterleitung auf HTTPS, ACME-Challenge)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.web.id
  description       = "HTTPS"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_ingress_rule" "http3" {
  security_group_id = aws_security_group.web.id
  description       = "HTTP/3 (QUIC)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "udp"
  from_port         = 443
  to_port           = 443
}

# Ausgehend nur Web (Updates, Container-Images, Let's Encrypt, S3, SSM) und
# E-Mail-Versand (Keycloak). DNS und Zeit laufen ueber VPC-interne Dienste,
# die Security Groups nicht filtern.
resource "aws_vpc_security_group_egress_rule" "outbound" {
  for_each = {
    http       = 80
    https      = 443
    smtps      = 465
    submission = 587
  }

  security_group_id = aws_security_group.web.id
  description       = "Ausgehend ${each.key}"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = each.value
  to_port           = each.value
}

resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnet.default.id
  vpc_security_group_ids = [aws_security_group.web.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  disable_api_termination = var.termination_protection
  monitoring              = false

  # Nur IMDSv2, Hop-Limit 1: Container auf dem Server erreichen die
  # Instance-Metadaten und damit die Rollen-Credentials nicht.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_gb
    encrypted             = true
    delete_on_termination = true
  }

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    data_volume_id = aws_ebs_volume.data.id
  })

  tags = {
    Name = "vereint-app"
  }

  lifecycle {
    # Neue AMIs sollen den Server nicht automatisch ersetzen; Sicherheitsupdates
    # spielt dnf-automatic ein.
    ignore_changes = [ami, user_data]
  }
}

resource "aws_volume_attachment" "data" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.app.id
}

# Feste oeffentliche IP fuer den DNS-Eintrag der Subdomain.
resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id

  tags = {
    Name = "vereint-app"
  }
}

# Faellt die AWS-Hardware unter dem Server aus, startet AWS ihn automatisch
# auf neuer Hardware neu (gleiche IP, gleiche Disks).
resource "aws_cloudwatch_metric_alarm" "auto_recover" {
  alarm_name          = "vereint-app-auto-recover"
  alarm_description   = "Server bei Ausfall der AWS-Hardware automatisch wiederherstellen"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  dimensions = {
    InstanceId = aws_instance.app.id
  }
  alarm_actions = [
    "arn:aws:automate:${var.region}:ec2:recover",
    aws_sns_topic.alerts.arn,
  ]
}
