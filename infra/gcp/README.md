# GCP hosting (Terraform)

Provisions static SPA hosting: GCS bucket + Cloud CDN + global HTTPS LB +
Workload Identity Federation for keyless GitHub Actions deploys.

## One-time apply (project owner)

```bash
gcloud auth application-default login
gcloud services enable compute.googleapis.com storage.googleapis.com iamcredentials.googleapis.com iam.googleapis.com --project <PROJECT_ID>
cd infra/gcp
cp terraform.tfvars.example terraform.tfvars   # edit values
terraform init
terraform apply
```

Managed SSL certs take ~10–60 min to reach ACTIVE. Check:

```bash
gcloud compute ssl-certificates describe carmen-web-cert --global --format='value(managed.status)'
```

Copy the `outputs` into GitHub repo **Variables** for the deploy workflow.
