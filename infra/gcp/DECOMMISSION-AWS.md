# Decommission AWS (after GCP verified)

Do these only after the GCP deploy is verified serving (plan Task 6) and the
AWS files are removed (Task 7).

1. **Delete GitHub secrets** (Settings → Secrets and variables → Actions):
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`,
   `FRONTEND_INSTANCE_ID`, `AWS_ECR_REGISTRY`, `GH_TOKEN`.
2. **Terminate the EC2 frontend instance** that ran `docker-compose`.
3. **Delete the ECR repository** `carmen-platform` (region `ap-southeast-7`).
4. **Revoke** the AWS IAM user/keys used by CI.
5. Confirm production traffic is served only from the GCP LB IP
   (`terraform output -raw lb_ip`).
