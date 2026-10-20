# Securing API keys in KYU PCS

## What we changed

The KYU PCS application previously allowed the NVIDIA API key to be kept in
`backend/.env`. We changed this so the key can be stored in **AWS Secrets Manager**.

The application now keeps only the secret's identifier in `.env`; the API key itself is
retrieved securely when the AI assistant or indexing process needs it.

System Administrators also have a **Secure credentials** section in System Settings.
It shows whether the application can reach the secret and will later allow an approved
key to be replaced without editing source code.

The portal never displays an existing key and never stores it in the PCS database,
browser storage or Audit Log.

## Why we made this change

Keeping API keys directly in `.env` creates risks:

- somebody with file access can read and copy the key;
- it can accidentally be committed, backed up, logged or shared;
- replacing it requires editing server files;
- permanent AWS credentials might also be added to `.env`.

AWS Secrets Manager gives us encrypted storage, controlled access and secret versions.
AWS IAM determines exactly who or what can read or replace the key.

## How access works

Local development and production use different ways to authenticate:

```text
Local developer
    -> AWS IAM Identity Center login
    -> temporary SSO credentials
    -> development secret

Production application
    -> EC2 instance role
    -> temporary EC2 credentials
    -> production secret
```

Neither environment requires a permanent AWS access-key pair in `.env`.

We use separate secret records:

```text
kyu-pcs/development/nvidia-api-key
kyu-pcs/production/nvidia-api-key
```

This prevents local testing from accidentally replacing the production secret.

## AWS permissions used

Both the local permission set and EC2 role are restricted to their exact secret ARN.
They use only:

```text
secretsmanager:DescribeSecret
secretsmanager:GetSecretValue
secretsmanager:PutSecretValue
```

- `DescribeSecret` lets System Settings show **Connected**.
- `GetSecretValue` lets the AI assistant and indexer use the key.
- `PutSecretValue` permits controlled key replacement.

The policy must name the complete secret ARN instead of using `Resource: "*"`.

Example policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:DescribeSecret",
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue"
      ],
      "Resource": "PASTE_THE_CORRECT_SECRET_ARN_IN_AWS"
    }
  ]
}
```

## Local setup

The local developer is assigned the IAM Identity Center permission set:

```text
KYUPCSLocalSecretsAccess
```

AWS CLI v2 is configured with:

```powershell
aws configure sso --profile kyu-pcs-local
aws sso login --profile kyu-pcs-local
```

This creates a temporary session. When it expires, the developer runs the SSO login
command again. The ordinary AWS root/console password is not stored in the application.

Local `backend/.env` contains:

```dotenv
NVIDIA_API_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

AWS_SECRETS_MANAGER_ENABLED=true
AWS_SECRETS_MANAGER_REGION=us-east-1
AWS_SECRETS_MANAGER_PROFILE=kyu-pcs-local
AWS_SECRET_NVIDIA_API_KEY_ID=THE_COMPLETE_DEVELOPMENT_SECRET_ARN
AWS_EC2_METADATA_DISABLED=true
```

After changing local configuration:

```powershell
cd C:\Users\muzir\kyu-admin-portal\backend
php artisan config:clear
```

`config:cache` should not be used while running local PHPUnit tests because it can make
tests use the normal database configuration instead of their isolated test database.

## Production EC2 setup

Production uses the role:

```text
KYUPCS-EC2-ApplicationRole
```

The role is attached directly to the EC2 instance and its policy points only to the
production secret ARN.

Production `backend/.env` contains:

```dotenv
NVIDIA_API_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

AWS_SECRETS_MANAGER_ENABLED=true
AWS_SECRETS_MANAGER_REGION=us-east-1
AWS_SECRETS_MANAGER_PROFILE=
AWS_SECRET_NVIDIA_API_KEY_ID=THE_COMPLETE_PRODUCTION_SECRET_ARN
AWS_EC2_METADATA_DISABLED=false
```

The empty profile tells the AWS SDK to use the EC2 instance role. After deployment:

```bash
php artisan config:clear
php artisan config:cache
php artisan queue:restart
```

## Using Secure credentials in the portal

Only a System Administrator can access the control.

When another valid development API key is available:

1. open **System Settings -> Secure credentials**;
2. paste the replacement key into the write-only field;
3. enter a reason for the change;
4. click **Review & Replace**;
5. confirm the administrator password;
6. test the public AI with a known published question.

The saved key is never shown again. The Audit Log records who changed which credential,
when and why, but never records the key itself.

The live replacement test is currently postponed because only one purchased NVIDIA key
is available.

## What to check

1. AWS SSO login works locally.
2. Secure credentials shows **Connected**.
3. The public AI answers a known programme question; this confirms the key can be read.
4. No key appears in the page, browser response, application logs or Audit Log.
5. Non-System Administrators cannot access the credential controls.
6. EC2 uses its instance role and contains no AWS access keys in `.env`.

## Important limits

Only approved integration credentials such as the NVIDIA API key can be managed from
the portal.

`APP_KEY`, database passwords, AWS credentials and SSH keys must not be added to the
portal's rotation screen. They are needed before the application can start, and an
incorrect web change could lock the application out of its encryption or database.

The first administrator's bootstrap password can be cleared after that account has been
created and tested:

```dotenv
PCS_BOOTSTRAP_ADMIN_EMAIL=
PCS_BOOTSTRAP_ADMIN_PASSWORD=
```

The database keeps the administrator's password hash, not the original password.

## Rules the group should remember

- Never paste API keys into Git, documentation, screenshots, chat or logs.
- Never place permanent AWS access keys in `.env`.
- Use separate development and production secrets.
- Give each developer an individual SSO account.
- Restrict every policy to the exact secret ARN.
- Test a replacement in development before changing production.
- Do not revoke an old provider key until the replacement has been verified.
