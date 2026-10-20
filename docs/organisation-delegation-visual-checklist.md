# Organisation and delegated-authority visual acceptance

Run locally with disposable records. Use a normal browser plus an Incognito window
to switch between the creating officer and the newly created account. Do not update
EC2 until this checklist passes.

## 1. System Administrator — organisation structure

1. Sign in as System Administrator and open **Organisation**.
2. Create a temporary Faculty / School, then create two departments inside it.
3. Confirm codes are converted to uppercase and the new records appear immediately.
4. Search by faculty name, faculty code, department name and department code.
5. Search for a value that does not exist and confirm the clear no-results message.
6. Edit the temporary faculty and one department and confirm the saved text remains
   after refreshing the browser.
7. Attempt to create a duplicate code or name and confirm it is rejected.
8. Attempt to deactivate a unit without the correct current password and confirm it
   is rejected.

## 2. System Administrator — top-level delegation

1. Open **User Management** and select **Create Account**.
2. Select Dean and confirm a real Faculty / School dropdown appears.
3. Create a disposable Dean assigned to the temporary faculty.
4. Create a disposable Registrar and confirm no irrelevant faculty, department,
   programme or call fields appear.
5. Reopen both account details and confirm the saved role and assignment are displayed.

## 3. Dean — HOD delegation boundary

1. Activate and sign in as the disposable Dean.
2. Confirm User Management offers only **Head of Department**.
3. Confirm the faculty selector contains only the Dean's assigned faculty.
4. Select that faculty and confirm its departments appear in the department dropdown.
5. Change the faculty selection, where possible, and confirm any previous department
   selection is cleared rather than silently retained.
6. Create an HOD for the first temporary department.
7. Confirm the Dean cannot create a Coordinator, Registrar or Admissions Officer.

## 4. HOD — programme visibility and Coordinator assignment

1. Activate and sign in as the disposable HOD.
2. Open **Course Profiling** and confirm every programme in the HOD's faculty/school is
   visible, including programmes belonging to sibling departments.
3. Confirm programmes from other faculties/schools are absent.
4. Open User Management and confirm only **Programme Coordinator** is offered.
5. Open the programme dropdown and confirm every option shows programme code, name and
   academic unit so similarly named programmes are distinguishable.
6. Select a programme, then set a valid assignment start and end date.
7. Confirm the end-date field does not permit a date before the start date.
8. Create and activate the Coordinator, then confirm the account drawer displays the
   correct programme, faculty, department, dates and **Currently effective** state.
9. Attempt to create another Coordinator for the same programme using overlapping
   dates. Confirm the system rejects the overlap.
10. Attempt to assign a programme from another faculty. Confirm it is absent from the
    dropdown and rejected by the API if a stale/tampered request is submitted.

## 5. Registrar — Admissions Officer assignment

1. Sign in as Registrar and open User Management.
2. Confirm only **Admissions Officer** is offered.
3. Confirm **Assigned Call** is a dropdown containing real eligible draft or unexpired
   open application calls.
4. Confirm closed and expired calls do not appear.
5. Select a call, choose permissions, create the account, and reopen its details.
6. Confirm the selected programme/call and permissions persist after refresh.
7. Confirm submitting without a call produces a clear validation message.

## 6. Organisation deactivation and safe reactivation

1. While the disposable HOD or Coordinator has an effective assignment, attempt to
   deactivate its department/faculty as System Administrator.
2. Confirm the operation is blocked and explains that assigned staff must be handled.
3. Deactivate the disposable staff account, then deactivate the organisation unit.
4. Confirm the unit and its departments disappear from new-account assignment options
   but remain visible in historical organisation information.
5. Attempt to reactivate the staff account while its unit remains inactive.
6. Confirm reactivation is rejected until the organisation unit is active again.
7. Reactivate the faculty first, then the department, then the staff account.

## 7. Audit and responsive checks

1. As System Administrator, open Audit Log and confirm events for faculty creation,
   department creation, unit editing/deactivation, account creation and status change.
2. Repeat the Create Account modal at approximately 390 px, 768 px and desktop width.
3. Confirm selectors display their selected values, fields stack cleanly, action
   buttons remain visible, and there is no horizontal page overflow.

Record Pass/Fail and a screenshot for any failure. This phase is accepted only after
the complete delegation chain and all boundary checks pass visually.
