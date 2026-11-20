# Seat alerts with the site closed (issue #16)

A student turns on **Alert me** for a watched section on Just opened, and gets a notification when it opens, even
with the site closed. It's Web Push, in three parts:

| Part | Issue | Where | State |
| --- | --- | --- | --- |
| Subscribe on the site | #90 | `web/lib/push.ts`, `web/components/SeatAlerts.tsx`, `web/public/sw.js` | Built and tested; hidden until `push.json` is filled in |
| Keep subscriptions | #91 | the alert server | Not built |
| Send alerts | #92 | the live seat job tells the alert server what opened | Not built |

Until the alert server runs, `web/public/push.json` stays empty and Just opened works as before, with its in-tab
**Notify me**.

## Switching it on

Fill in `web/public/push.json` once the server is up:

```json
{ "api": "https://alerts.example.org", "vapid_public_key": "B..." }
```

`vapid_public_key` is the server's VAPID public key, base64url, as `web-push generate-vapid-keys` prints it. The
private key stays on the server.

## What the site sends

One request for everything, from `setAlerts` in `web/lib/push.ts`:

```http
POST {api}/subscriptions
Content-Type: application/json

{ "endpoint": "https://fcm.googleapis.com/fcm/send/...", "keys": { "p256dh": "...", "auth": "..." },
  "sections": ["2027-sp.31152", "2027-sp.40001"] }
```

- `endpoint` and `keys` are the browser's push subscription: where to send, and the keys that encrypt the message.
- `sections` is the whole list for that subscription, as `term.CRN`. It replaces what the server had. An empty list
  means stop: delete the subscription. The site then unsubscribes the browser too.
- Answer 2xx with CORS for the site's origin (`POST`, `content-type`). Anything else shows the student "The alert
  server didn't accept that".

That is all the server ever gets: no name, email, account or other courses. The site says so next to the alerts
("What alerts send"), so keep it true: don't log IP addresses with subscriptions, and delete a subscription when its
push service answers 404 or 410.

## What the server pushes

A JSON payload, all fields optional:

```json
{ "title": "CS 124 AL1 just opened", "body": "CRN 31152. Register in Self-Service.", "url": "course/CS/124/#crn-31152", "tag": "2027-sp.31152" }
```

`public/sw.js` shows it (defaults: "A section you watch just opened") and opens `url` on a click. `url` is relative
to the site's root, and links to other sites are ignored. Use the section as `tag` so a second push for it replaces
the first instead of stacking.

## Limits worth knowing

- The live seat job re-reads only the busiest courses and those on `data/watch.txt` every 10 to 20 minutes; every
  other course once a day (docs/LIMITATIONS.md). #92 has to add the alerted sections' courses to what it re-reads,
  or the notification for a quiet course can come a day late.
- iPhone and iPad get Web Push only from the Home Screen (iOS 16.4 or later). The site says so on those devices and
  has a web app manifest so it opens there as its own app.
- A browser can drop its subscription (cleared site data, an expired endpoint). The server learns from the 404/410;
  the student sees their alerts as on until they press Alert me again.
