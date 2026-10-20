# Phase 1 acceptance checklist

Use this checklist after the Phase 1 build is deployed. Test with prepared accounts
and records; do not change unrelated production catalogue data.

## 1. System Administrator

- Open Course Profiling and confirm `New Programme` is available.
- Create a draft in a real active faculty and department.
- Open Roles & Permissions and confirm canonical programme creation is
  System-Administrator-only, while Coordinators have scoped editing.
- Search for a user, programme and call from the global header. Each result must open
  or visibly highlight the exact selected record.

## 2. HOD faculty-wide scope

- Sign in as an HOD assigned to one faculty or school.
- Confirm Course Profiling shows programmes from every department in that faculty,
  including a draft, but shows nothing from another faculty.
- Create a Programme Coordinator. The programme dropdown must contain eligible
  draft and published programmes across the HOD's faculty.
- Select a programme, complete the dates and submit. Reopen the account and confirm
  the chosen programme is displayed.
- Confirm a programme from another faculty is absent and cannot be assigned.

## 3. Programme Coordinator restrictions

- Confirm the dashboard action reads `Open My Programmes`, not `New Programme`.
- Confirm only assigned programmes are visible.
- Open the editor and confirm Faculty / School and Department display their saved
  selections but are locked for the Coordinator.
- Edit programme content, save a draft and submit normally.

## 4. Registrar and Admissions Officer assignment

- Start creating an Admissions Officer and confirm Assigned Call is a dropdown.
- Confirm eligible draft and unexpired open calls appear.
- Confirm closed and expired calls do not appear.
- Select a call, create the account and confirm the selected call and delegated
  permissions are displayed after creation.

## 5. Search and notification destinations

- Select a user result: User Management must open that account drawer.
- Select a programme result or programme notification: Course Profiling must open
  that programme view.
- Select a call result or deadline notification: Admissions must scroll to and
  highlight that exact call below the fixed header.
- Change a page filter afterward and confirm the old target is cleared.

## 6. Public programme navigation

- Open a programme from the catalogue and confirm the URL contains its programme ID.
- Refresh while viewing it; the same published programme must reload.
- Copy the URL into a fresh tab; the same programme must open from the API.
- Use browser Back and Forward after opening from the catalogue.
- Use `Back to catalogue` and Escape from both a normal catalogue visit and a fresh
  direct link. Neither action should close the browser tab or leave a stale hash.
- Open a related programme and repeat Back to catalogue.

## 7. Responsive regression

- Repeat account creation and programme editing at approximately 360 px, 768 px and
  desktop width.
- Confirm role cards, names, assignment dates, permission checkboxes and modal action
  buttons stack without horizontal overflow.
- Confirm disabled academic-unit selectors remain readable.
- Confirm the login page has no unnecessary vertical scroll on a normal mobile
  viewport.

Phase 1 passes only when all items above work in the deployed build and no browser
console or failed-network error appears during the tested journeys.
