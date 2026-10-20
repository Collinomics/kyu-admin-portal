# Programme governance visual checklist

Run this phase locally. Use a disposable programme so the approval and rejection paths can be tested safely.

## 1. System Administrator creates the canonical record

1. Sign in as System Administrator and open **Course Profiling**.
2. Select **Create Programme**.
3. Enter only a unique programme name and code, then choose **Save draft**.
4. Confirm the draft appears once in the list and opens with version 1.
5. Confirm the editor explains that name and code are sufficient for a draft.
6. Assign a Programme Coordinator to it from **User Management**.

Expected: only the System Administrator can create the canonical programme record. Saving or submitting shows a loading state and repeated clicks do not create duplicate requests.

## 2. Programme Coordinator completes and submits

1. Sign in as the assigned Programme Coordinator.
2. Confirm only programmes assigned to this coordinator are visible.
3. Open the disposable draft. Confirm its academic unit and department are the assigned values and cannot be moved to another unit.
4. Complete all six governed sections: Overview, Objective & impact, Philosophy & originality, Career prospects, Admission requirements, and Structure & content.
5. Add the duration, campus/centre and study modes, save the draft, reopen it, and confirm every value persisted.
6. Remove one governed section and try to submit.
7. Restore it and submit again.

Expected: incomplete submission is rejected with the missing section identified. A complete submission changes to **Submitted** and is no longer editable by the coordinator while under review.

## 3. HOD review and correction loop

1. Sign in as the HOD responsible for the programme's academic unit.
2. Confirm the submitted programme is visible. If another HOD account is available, confirm it cannot see a programme outside its unit.
3. Open **View** and inspect the chronological review history.
4. Select **Reject**, try to continue without a comment, then enter a clear correction and return it.
5. Sign back in as the coordinator. Confirm the rejection comment is visible, edit the requested field and resubmit.
6. Return as the HOD and select **Forward to Dean**.

Expected: rejection requires a comment and returns the programme to **Rejected**. Resubmission creates a new version. Forwarding changes it to **HOD reviewed**.

## 4. Dean decision

1. Sign in as the Dean for the same academic unit.
2. Open the HOD-reviewed programme and select **Recommend**.
3. Confirm an empty recommendation cannot be sent; add an advisory note and send it.
4. Reopen **View** and confirm the recommendation and Dean's name appear in review history.
5. Confirm the programme remains **HOD reviewed** because a recommendation is advisory.
6. Select **Publish**.

Expected: publication changes the status to **Published**, records the decision in review history, and exposes the programme in the public catalogue.

## 5. Published revision safety

1. Record a distinctive sentence from the published programme on the public catalogue.
2. As the coordinator, edit that sentence and submit the revision.
3. Refresh the public programme page before HOD and Dean approval.
4. Complete HOD forwarding and Dean publication, then refresh the public page again.

Expected: the public page retains the previous approved sentence while the revision is under review. It changes only after the new version is published.

## 6. Concurrent-editor protection

1. Open the same editable programme in two browser tabs.
2. Save a change in the first tab.
3. Without refreshing, save a different change in the second tab.

Expected: the second tab reports that the programme changed elsewhere and does not overwrite the newer version.

## 7. Layout and interaction check

Repeat the create, edit and view screens at approximately 390 px, 768 px and desktop width.

Expected: dialogs remain inside the viewport, content scrolls when necessary, action buttons stay reachable, labels remain readable, and no page has horizontal overflow.

