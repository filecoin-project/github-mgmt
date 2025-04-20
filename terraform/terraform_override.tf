terraform {
  backend "s3" {
    region               = "us-east-1"
    bucket               = "github-as-code-v1-filoz"
    key                  = "terraform.tfstate"
    workspace_key_prefix = "org"
    dynamodb_table       = "github-as-code-v1-filoz"
  }
}
