# Secure credential rotation

For the full group handover, setup instructions, testing checklist and troubleshooting
guide, see `AWS_SECRETS_MANAGER_HANDOVER_GUIDE.md` in this directory.

The System Settings credential screen is a write-only control plane for approved,
rotation-safe integration credentials. It currently permits only the NVIDIA AI API
key. AWS stores it under the `NVIDIA_API_KEY` JSON field. The portal never returns a
saved value and it never stores that value in the PCS database,
browser storage, audit log or source code.

## Production setup

1. Pre-create the secret in AWS Secrets Manager in the EC2 instance's region.
2. Attach an IAM role to the EC2 instance. Do not configure long-lived AWS access keys
   in Laravel or expose AWS credential fields in the portal.
3. Restrict the role to the exact secret ARN. The application needs only
   `secretsmanager:DescribeSecret`, `secretsmanager:GetSecretValue` and
   `secretsmanager:PutSecretValue`. If a customer-managed KMS key protects the secret,
   grant only the corresponding KMS permissions required through Secrets Manager.
4. Configure the deployment environment:

   ```dotenv
   AWS_SECRETS_MANAGER_ENABLED=true
   AWS_SECRETS_MANAGER_REGION=the-ec2-region
   AWS_SECRET_NVIDIA_API_KEY_ID=the-pre-created-secret-name-or-arn
   ```

5. Clear Laravel's configuration cache and restart long-running queue workers after
   changing the deployment mapping. Normal key rotations from the portal invalidate
   the shared application cache automatically and do not require a code edit.

An example least-privilege resource statement is:

```json
{
  "Effect": "Allow",
  "Action": [
    "secretsmanager:DescribeSecret",
    "secretsmanager:GetSecretValue",
    "secretsmanager:PutSecretValue"
  ],
  "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:EXACT_SECRET_SUFFIX"
}
```

## Deliberately excluded credentials

`APP_KEY`, database credentials, AWS/IAM credentials and SSH keys are infrastructure
bootstrap secrets. They must be managed outside the web application because changing
them from the portal could break decryption, database access or the application's own
ability to reach its secret store.

Every permitted rotation requires a System Administrator session, current-password
confirmation and a change reason. The audit event records who changed which credential
and when, but never records the submitted value.

## Local development with temporary credentials

For local development, configure an IAM Identity Center profile with permission to the
same exact secret, then set `AWS_SECRETS_MANAGER_PROFILE` to that profile name. Run
`aws sso login --profile <name>` before starting the local backend. The application uses
the cached temporary SSO session; do not add permanent AWS access keys to `.env`.
