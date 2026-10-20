# Critical flow acceptance checklist

Use disposable records. Do not close a real admissions call during testing.

## Admissions lifecycle

1. Sign in as Registrar and open **Admissions**.
2. Create a draft call for a published programme.
3. Use **Edit**, change the intake, dates or requirements, save, then reload.
4. Publish a future-dated call and confirm it shows **Scheduled** and remains editable.
5. Confirm an already-open call has no **Edit** action.
6. Delegate the test call to an Admissions Officer with Monitor enabled and Close disabled.
7. Sign in as that officer; confirm only assigned calls appear and Close is unavailable.
8. Enable Close as Registrar, sign back in as the officer, and close only the disposable call.

## Public state

1. For a programme with both a current and future call, confirm **Apply** uses the current call.
2. Confirm a future-only call shows **Opening soon** and disables Apply.
3. Confirm a closed or expired-only call shows no active Apply action.
4. Refresh the programme detail URL and repeat the status check.

## Automation and audit

1. In Audit Log, confirm creation, update, publication, delegation and closure events.
2. Confirm the EC2 scheduler service is active.
3. AI publication testing is blocked until the EC2 `NVIDIA_API_KEY` deployment
   secret is supplied. After configuration, publish a programme revision and allow
   up to five minutes for its outbox event to process.

The critical pass is accepted only when these checks succeed without console errors or failed API requests.
