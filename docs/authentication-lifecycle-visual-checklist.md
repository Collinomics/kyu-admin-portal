# Authentication and account-lifecycle visual acceptance

Run this checklist against the local frontend and backend. Use disposable staff
accounts and keep EC2 unchanged until local acceptance is complete.

## 1. Sign-in and navigation

1. Open `/login` at desktop width and at approximately 390 px mobile width.
2. Confirm the page fits the viewport without unnecessary horizontal or vertical
   scrolling, the campus image remains behind the translucent layers, and both
   entrance animations are smooth.
3. Sign in with each of the six roles and confirm the correct dashboard and navigation
   items appear.
4. Refresh an authenticated page and confirm the session restores without returning
   to sign-in.
5. Sign out and confirm Back or a protected URL cannot reopen the authenticated page.

## 2. New-account activation

1. Create a disposable account from User Management and open its activation URL.
2. Try signing in before activation. Confirm the browser goes directly to Account
   Activation with the correct email instead of showing a dead-end error.
3. Enter a wrong code and confirm a safe validation message appears.
4. Select **Send a new one**. Confirm the success notice is green, the old code no
   longer works, the timer restarts, and the resend button observes its cooldown.
5. Paste a complete six-digit code into the OTP boxes and confirm all boxes fill.
6. Verify the code, try a weak password and mismatched confirmation, then complete
   activation with a strong password.
7. Confirm the completion screen has no emoji and the new password signs in.
8. Reuse the activation code and confirm it is rejected.
9. Open `/onboarding` without an email query. Confirm it shows **Activation link
   incomplete** and never substitutes a sample account.

## 3. Lockout and password recovery

1. Enter a wrong password five times for a disposable account.
2. Confirm the lock screen and countdown appear and an existing session for that
   account is revoked.
3. Use **Reset my password by email**, open the local development reset link, and set
   a compliant password.
4. Confirm the reset link works once only, the new password signs in, and the old
   password fails.
5. Request a reset for an unknown address and confirm the same generic success message
   appears without revealing whether the account exists.

## 4. Account status and stale sessions

1. Sign in as a disposable staff user in one browser, then suspend that account as an
   administrator in another browser.
2. Perform any action in the first browser. Confirm it returns to sign-in and displays
   a session-unavailable notice.
3. Confirm suspended and inactive accounts cannot sign in.
4. Reactivate a verified account and confirm it can sign in again.
5. Confirm a pending account cannot be manually activated from the status control; it
   must complete activation.

## 5. Assignment boundaries

1. Sign in as Dean, HOD, Coordinator, and Admissions Officer test accounts and confirm
   each sees only records within the effective assignment.
2. Expire each disposable assignment, refresh, and confirm protected lists contain no
   out-of-scope records.
3. Restore the dates and confirm the correctly assigned records become visible again.

## 6. Inactivity lock and step-up confirmation

1. Temporarily set the local inactivity timeout to one minute.
2. Leave the portal idle. Confirm the warning says the screen will lock and the
   countdown reaches the password-confirmation screen.
3. Enter a wrong password, then the correct current password. Confirm the same page is
   restored without losing unsaved field values.
4. Repeat and choose **Sign Out**; confirm the token is revoked and sign-in is required.
5. Trigger a sensitive settings or account action and confirm an incorrect step-up
   password is rejected while the correct password permits the action.

## 7. Audit evidence

As System Administrator, filter Audit Log and confirm entries exist for login and
failed login, onboarding completion/resend, password-reset request/completion,
reauthentication, logout, account creation, status change, and administrator-issued
password reset.

Record Pass/Fail, account role, browser width, and a screenshot or error note for each
failed item. This phase is accepted only after all failures are corrected or explicitly
deferred.
