# Admissions lifecycle visual checklist

Run this phase locally with one disposable published programme. Keep the public catalogue open in a separate browser or private window.

## 1. Registrar creates and publishes a call

1. Sign in as Registrar and open **Admissions**.
2. Select **New Call** and inspect the programme dropdown.
3. Confirm only published programmes are offered.
4. Create a draft with a unique intake name, future opening date and later deadline.
5. Edit the draft, save it, reopen it and confirm the changes persisted.
6. Publish the draft.

Expected: the buttons show the loading state for the action selected and cannot be submitted twice. The call changes from Draft to Scheduled because its opening date is in the future.

## 2. Date and duplicate protections

1. Try a deadline equal to or before the opening date.
2. Try creating the same intake name twice for the same programme.
3. Save another draft with a deadline that has already passed and try to publish it.

Expected: each operation is stopped with a clear field-level message. An expired draft remains a draft.

## 3. Public scheduled and open states

1. Open the programme in the public catalogue while its call is scheduled.
2. Confirm the intake and opening date are shown, but **Apply now** is disabled.
3. Create or use a call whose opening date is today or earlier and whose deadline is in the future.
4. Refresh the public programme page.

Expected: the current call takes priority over a future call, its status is Open or Closing Soon, and **Apply now** uses the application portal configured in System Settings.

## 4. Officer delegation and scope

1. As Registrar, open **Delegate** on the live call.
2. Confirm only active Admissions Officers appear.
3. Try saving with Create, Monitor and Close all unchecked.
4. Assign Monitor only to one officer; optionally give Create or Close to another test officer.
5. Sign in as the delegated officer.

Expected: at least one permission is required. The officer sees only delegated calls. The call card clearly shows the allowed actions, and Close is unavailable unless explicitly delegated.

## 5. Create permission boundary

1. Give an Admissions Officer Create permission on a call for Programme A.
2. Sign in as that officer and select **New Call**.
3. Inspect the programme dropdown and create a draft.

Expected: only Programme A is offered. The officer cannot create a call for an unrelated programme, even through a direct request.

## 6. Manual closure and public fallback

1. Close the current call, first trying without a reason.
2. Enter a meaningful closure reason and confirm.
3. Refresh the Registrar dashboard, Admissions page and public programme page.

Expected: a reason is mandatory and visible on the staff call. Dashboard counts update. The closed call no longer enables Apply; if a future call exists, the public page shows it as Scheduled, otherwise it shows no active application window.

## 7. Automatic closure

For local verification, use an expired disposable open call and run:

```shell
php artisan pcs:close-expired-calls
```

Expected: the command reports the number closed, the call becomes Closed, and Audit Log contains `application_call.auto_closed`. The production scheduler is already configured to invoke this command hourly, but EC2 is not changed during this local phase.

## 8. Responsive and navigation checks

Repeat the Admissions list and all three dialogs at approximately 390 px, 768 px and desktop width.

Expected: programme and status selections remain visible, dialogs fit the viewport, buttons remain reachable, cards wrap without overlap, search/status filters work, notification and dashboard links scroll to and highlight the correct call, and there is no horizontal page overflow.

