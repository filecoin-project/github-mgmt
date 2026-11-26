terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.74.0"
    }
  }

  required_version = "~> 1.12.0"
}

provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = ["941641221830"]
}

locals {
  name              = "filoz-github-mgmt-filecoin-project"
  github_repository = "filecoin-project/github-mgmt"
  boundary_arn      = "arn:aws:iam::941641221830:policy/filoz-github-mgmt-boundary"
  oidc_host         = "token.actions.githubusercontent.com"
  environments = {
    ro = "read"
    rw = "write"
  }

  # Match backend key=terraform.tfstate and workspace_key_prefix=org.
  state_keys = ["terraform.tfstate", "org/filecoin-project/terraform.tfstate"]
  state_arns = [for key in local.state_keys : "${aws_s3_bucket.this.arn}/${key}"]
  lock_arns  = [for arn in local.state_arns : "${arn}.tflock"]
}

data "aws_iam_openid_connect_provider" "github" {
  url = "https://${local.oidc_host}"
}

resource "aws_s3_bucket" "this" {
  bucket = local.name
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_iam_role" "github" {
  for_each = local.environments

  name                 = "${local.name}-${each.key}"
  permissions_boundary = local.boundary_arn
  # Sync may need more than an hour to import a fresh filecoin-project workspace.
  max_session_duration = each.key == "rw" ? 14400 : 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
      Condition = {
        StringEquals = {
          "${local.oidc_host}:aud" = "sts.amazonaws.com"
          "${local.oidc_host}:sub" = "repo:${local.github_repository}:environment:${each.value}"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "state" {
  for_each = aws_iam_role.github

  name = "${each.value.name}-state"
  role = each.value.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        Sid      = "ListBucket"
        Effect   = "Allow"
        Action   = ["s3:GetBucketLocation", "s3:ListBucket"]
        Resource = [aws_s3_bucket.this.arn]
      },
      {
        Sid      = "ReadState"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = local.state_arns
      }
      ], each.key == "rw" ? [
      {
        Sid      = "WriteState"
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = local.state_arns
      },
      {
        Sid      = "ManageLocks"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = local.lock_arns
      }
    ] : [])
  })
}

output "state_bucket" {
  value = aws_s3_bucket.this.bucket
}

output "github_oidc_role_arns" {
  value = { for access, role in aws_iam_role.github : access => role.arn }
}
