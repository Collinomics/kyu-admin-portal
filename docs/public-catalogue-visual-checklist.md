# Public catalogue visual checklist

Run the frontend and backend locally. Use a normal browser window plus a mobile viewport in Developer Tools. Phase 5 covers catalogue discovery, programme details and bookmarks; AI answer quality is intentionally reserved for Phase 6.

## 1. Catalogue loading and presentation

1. Open the public catalogue at `/` in a fresh tab.
2. Confirm the header, hero, statistics, filters, programme cards and footer load in the correct order.
3. Scroll slowly through the page.

Expected: headings enter smoothly from their configured sides, programme rows rise into place, no content flashes above the sticky header, and the page has no horizontal overflow.

## 2. Search and combined filters

1. Search using part of a programme name or code.
2. Select a study level, then an academic unit without clearing the first filter.
3. Confirm both active-filter badges appear and the result count changes.
4. Remove one badge, use **Clear all**, and test a combination that returns no programmes.

Expected: selections are always visible in their controls, both filters apply together, page numbering returns to page 1 after a filter change, and the no-results panel offers a working clear action.

## 3. Keyboard filter test

1. Press `Tab` until a catalogue dropdown is focused.
2. Use `Enter` or `Space` to open it.
3. Use `Arrow Up`, `Arrow Down`, `Home` and `End` to move through choices.
4. Press `Enter` to select a choice, then reopen it and press `Escape`.

Expected: the focused choice is visibly identifiable, selection works without a mouse, and Escape closes the list and returns focus to its trigger.

## 4. Programme cards and application state

Inspect programmes with no call, a scheduled call, an open call and a closing-soon call where those records are available.

Expected: only open or closing-soon calls have an actionable **Apply now** link. No-call and scheduled states cannot be activated with either mouse or keyboard. Code, duration, academic unit and other published metadata agree with the governed record.

## 5. Programme detail and browser navigation

1. Open Bachelor of Architecture or another fully populated programme.
2. Confirm the hero image and academic-unit colour, section tabs, full information tiles, Programme essentials, admissions state and related programmes.
3. Scroll through every section and select each section tab.
4. Open a related programme, then use the browser Back button.
5. Close programme details with **Back to catalogue**, `Escape`, and the browser Back button in separate attempts.
6. Copy the URL containing `#programme/...`, open it in a new tab, then close the detail view.

Expected: section links land below the sticky header, the essentials panel remains visible without its own vertical scrollbar, related programmes stay within the same academic unit, browser navigation does not leave an accidental blank tab, and invalid/unpublished direct links return safely to the catalogue with an error message.

## 6. Bookmark lifecycle

1. Bookmark programmes from a card and from a detail page.
2. Open **Bookmarked**, open one saved programme, then return.
3. Remove one item and test **Clear all**, cancelling once before confirming.
4. Refresh the browser.

Expected: the badge count is accurate, saved items survive refresh on the same browser, the drawer explains that storage is local to the device, focus moves into the drawer/detail and returns to the control that opened it when closed, and the empty shortlist has a working catalogue action.

## 7. Responsive layout

Repeat the catalogue, detail view and bookmark drawer at approximately 390 px, 768 px and desktop width.

Expected: the mobile menu is usable; filters stack cleanly; cards never clip; section tabs can scroll horizontally; programme content becomes one column; Programme essentials appears below the main sections rather than in a separate scroll area; buttons remain reachable; and the footer is complete on both catalogue and detail views.

## 8. Reduced motion and connection states

1. Enable **Reduce motion** in the operating system or browser emulation and reload.
2. In Developer Tools, switch the network offline after the catalogue has loaded, then try a new search or refresh.

Expected: content remains immediately readable without entrance movement when reduced motion is enabled. Offline/error states are clear, do not destroy stored bookmarks, and offer a usable retry path.

