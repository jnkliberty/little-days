# Little Days runtime web shell

This is a production UI shell derived from the approved round 4 UI. It has no sample entries, mock toolbar, seeded gallery art, or mock clock. The clock and calendar use the install's time zone, which the server sends as `tz` with the session (`LittleDaysZone` in `theme.js` holds it). Event `t` and timer `t0` values are wall-clock minutes relative to local midnight for the current date; a sleep also carries `tEnd` and, across a clock change, `shift`, so day totals keep real minutes.

`transport.js` owns browser requests. Session cookies stay HttpOnly on the server. CSRF values stay in memory and are sent in `X-CSRF-Token`; the client does not store passwords or tokens in browser storage. Record, timer, photo, reminder, preference, duty, and child writes use the agreed server routes. The UI applies returned state only after a `saved` response with state. Pending timer stops poll for a terminal result before the UI reports success.

Care confirmations and export sharing have a separate screen under More. The browser sends care forms through the guarded same-origin routes and keeps care data only in memory. Each adult can confirm and revoke their own periods and must turn on sharing explicitly.

The browser checks use test-only mocked server responses. They verify the client contract; they do not prove writes against Baby Buddy or a running gateway. Do not treat mock test records as persisted family data. Reminder records are schedule preferences only; this UI does not send notifications.

## Growth curves (plan decision D5): shipped without WHO tables

Current state (2026-11-21): the Growth card draws the child's measurements with no reference curves. `growth-insights.js` builds Recorded weight and Recorded length cards from the child's own records and carries no WHO percentile tables. No "WHO growth chart" setting appears in Settings.

The plan's fallback was: "If the terms block reuse, the wave ships with no curves."

Terms check, read on 2026-11-11 (sources: who.int/about/policies/publishing/copyright and who.int/about/policies/terms-of-use):

- WHO materials need no permission only when they are issued under CC BY-NC-SA 3.0 IGO. All other use of WHO tables "is subject to permission being granted by WHO". Commercial use and licensing of WHO materials need permission.
- The website terms allow extracts "for research or private study but not for sale or for use in conjunction with commercial purposes".
- The growth standards pages carry no licence statement for the percentile tables, which WHO offers as PDF and Excel files only.
- A non-commercial, share-alike licence does not fit an MIT public repository, so no WHO table is committed here.

To add curves or percentile bands later: get written permission from WHO (permissions form: who.int/about/policies/publishing/permissions), record its wording here and in `NOTICE`, then add the optional growth chart setting and the data table in one change.
