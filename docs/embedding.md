# Embedding portal pages

Any customer-facing page can be dropped into a Shopify page (or anywhere else
on the store) inside an `<iframe>`. Adding `?embed` to the URL strips the
portal's own chrome so the tool sits inside the host page instead of looking
like a second website in a box.

```html
<iframe
  src="https://aquafire.app/maintenance.html?embed&amp;theme=light"
  width="100%"
  height="2400"
  style="border:0"
  loading="lazy"
  title="Aquafire maintenance guide"></iframe>
```

Everything is in the `src` URL:

```
https://aquafire.app/maintenance.html ? embed &amp; theme=light
└──────────── the page ─────────────┘ │   │      │  └ dark is the default
                                      │   │      └ separates the two params
                                      │   └ strips nav, page header, footer
                                      └ starts the query string
```

**Write `&amp;`, not a bare `&`.** `&` starts a character entity in HTML, so a
bare one is invalid and some theme editors and sanitisers mangle it. `&amp;`
resolves to the same URL. A plain `&` is fine when you're typing the URL into a
browser address bar to test. Param order doesn't matter.

## Parameters

| Param | Effect |
|-------|--------|
| `?embed` | Removes the nav bar, the page header (`<h1>` + intro), and the footer. Hides the Ember chat widget so the host page doesn't show two bubbles. |
| `?theme=light` / `?theme=dark` | Forces the lighting. Default is dark. |

`embed.js` does the stripping and runs on every customer page. It names the
chrome by class (`.bar`, `.phead`, `.pfoot`), so **renaming a chrome element
means renaming it there too** — that exact mismatch left `?embed` silently
stripping nothing on every page from the redesign rollout until 2026-08-05.

## Pass the theme explicitly

Normally the portal remembers the visitor's theme in `localStorage`. Inside an
iframe it usually can't: `aquafire.app` is a third party relative to the store's
domain, and Safari and Firefox partition or block third-party storage outright.

So don't rely on the saved theme in an embed — **always pass `theme=` and set it
to whatever matches the surrounding page.** Two other things follow from the same
limitation:

- **The maintenance page's checklist ticks and due dates may not persist** across
  visits in an embed. The page still works; it just may not remember.
- **Don't embed `rewards.html` or `share-install.html`.** Both need Firebase
  sign-in, which is unreliable in a cross-origin iframe. Link to them instead.

## Height

Iframes don't size themselves to their content, and the portal doesn't yet post
its height to the parent, so you have to pick a number. Too small and the frame
scrolls internally; too large and you get dead space under it.

Measured content heights with `?embed` (Chromium, Figtree loaded):

| Page | ~1100px wide | 390px wide |
|------|-------------:|-----------:|
| `quick-start.html` | 800 | 1060 |
| `water-care.html` | 2191 | 2993 |
| `maintenance.html` | 2318 | 4051 |
| `rewards.html` | 2487 | 3083 |
| `enclosure-guide.html` | 3759 | 4213 |
| `aquafire-pro.html` | 7034 | 12027 |
| `aquafire-lite.html` | TBD | TBD |

Phone heights are roughly 1.3–1.7× the desktop ones, so a single fixed height
can't serve both. Either set the height in a media query, or accept internal
scrolling on one of them.

`troubleshoot.html` and `dealer-locator.html` aren't in the table because their
height changes as the visitor uses them — the wizard swaps a card per answer and
the locator fills a list. Give those a fixed viewport-ish height (600–800px) and
let them scroll inside it.

The model guide pages (`aquafire-pro.html`, `aquafire-original.html`,
`aquafire-lite.html`) are very long; consider linking rather than embedding.
The Lite guide's measured heights are TBD — measure per the note above before
embedding it.

## Which origins may embed

`vercel.json` sets:

```
frame-ancestors 'self' https://aquafire.com https://*.aquafire.com https://*.myshopify.com
```

The frame comes up blank anywhere else — a staging host on a different domain, or
a page builder previewing from its own origin. Add the origin there if you need
it.

The two internal pages (`chat-insights.html`, `dealer-admin.html`) carry
`X-Frame-Options: DENY` and cannot be embedded at all, by design.

## Analytics from an embedded Find a Dealer

`dealer-locator.html` carries Google Tag Manager (container `GTM-K6Z2NC7Z`)
and pushes three events to its `dataLayer`:

| Event | Fired when | Fields |
|-------|-----------|--------|
| `dealer_search_bar` | The visitor submits the search bar: Search button, Enter, or picking a suggestion. One event per submission whatever the text is (dealer name, city, ZIP, street) | `search_term`, `search_trigger` (`button` / `enter` / `suggestion`) |
| `dealer_search` | Every time the result list is built: page load (nearest to HQ or the visitor), a search-bar submission, the location button | `search_term`, `search_method` (`auto` / `text` / `geocode` / `geolocate`), `result_count`, `radius_mi` (`0` = any distance; absent on name/type matches) |
| `dealer_click` | A phone, website or directions link is clicked, in a result card or a map popup | `link_type` (`phone` / `website` / `directions`), `dealer_name`, `dealer_type`, `dealer_country`, `link_url`, `placement` (`card` / `map_popup`) |

### Inside an iframe: install the bridge on the host page

Inside an iframe the container still loads and fires, but the frame is a
third party to the host page: Safari and Firefox block its cookies and Chrome
partitions them, so GA4 sees a separate, short-lived session per embed and
cannot join it to the host page's visitor. **The host's own Tag Assistant
also only shows the host page's `dataLayer`, so without the bridge the
events never appear there.**

The page relays every event to its parent with `postMessage`, and
`dealer-embed.js` (served from this repo) receives them and pushes them into
the host page's `dataLayer`. Add it once to the host page, anywhere after
`<body>`:

```html
<script src="https://aquafire.app/dealer-embed.js" async></script>
```

Three places that work on the store, pick one:

- the same Custom HTML section as the iframe (`templates/page.dealer-inquiry.json`
  holds the Find a Dealer embed) — simplest, right next to the frame;
- `layout/theme.liquid`, next to the `assistant.js` tag it already loads;
- a GTM Custom HTML tag on All Pages (the script no-ops on pages without a
  locator frame).

The host's GTM then sees `dealer_search_bar` / `dealer_search` /
`dealer_click` as ordinary custom events, each with a `page` field
(`/dealer-locator.html`) marking where it came from. In GTM: create a Custom
Event trigger per event name and Data Layer Variables for the fields
(`search_term`, `link_type`, `dealer_name`, …) to pass to GA4 event tags.

How it stays correct: the frame numbers its messages and keeps the last 100;
the bridge answers the frame's `hello` (or the first event it sees) with
`ready`, and the frame replays anything sent before the bridge was listening
(GTM injects the tag after page load, so the frame's first `dealer_search`
usually beats it). The bridge de-duplicates by sequence number, so a replay
never double-counts. The bridge accepts messages from `https://aquafire.app`
only (override with `data-origin` on the script tag to test against a
preview deployment), which is what stops any other frame on the host page
from pushing into its `dataLayer`.

Geolocation in the frame needs the host to delegate it:
`<iframe allow="geolocation" ...>`. Without it the location button and the
auto-detect on load fail silently and results default to nearest HQ.

## The chat widget

Ember hides itself under `?embed` so a host page that already runs the widget
doesn't end up with two bubbles. To show it inside the frame anyway, set
`showInEmbed` (see `chat-assistant.md`). If you want Ember on the store page
itself, install it as a script tag rather than through an iframe — it is built
for that.
