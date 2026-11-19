# Feedback widget

A button you add to any website or app. What people send arrives in a Redekorate project as tickets, with an optional
screenshot, screen recording, files and the details of the page they were on.

Each project has one widget. Open it from **Project → Tickets → Feedback widget**.

## Install

1. Under **Allowed domains**, add the domain of the site (`app.acme.com`, or `*.acme.com` for every subdomain) and save.
   Feedback from any other site is rejected, and the button does not appear there.
2. Paste the snippet from **Install** before `</body>`:

   ```html
   <script src="https://YOUR-REDEKORATE/widget.js" data-key="rk_pub_…" async></script>
   ```

   In Google Tag Manager, put the same tag in a *Custom HTML* tag triggered on all pages.

Changes made in the settings reach the sites within about five minutes; nothing needs reinstalling.

The public key is safe to publish: it only works from the allowed domains. **Rotate key** replaces it, and the old one stops
working at once.

If the site sends a Content-Security-Policy, it must allow your Redekorate origin in `script-src` and `connect-src`.

## Tell the widget who is signed in

Without this, the widget asks visitors for their email (you can turn that question off).

```html
<script>
  window.RedekorateUser = { id: "u_1842", name: "Mike Jones", email: "mike@acme.com", meta: { plan: "Pro", appVersion: "2.8.1" } };
</script>
```

Set it before the widget script, or, in a single-page app, call it when someone signs in or out:

```js
window.Redekorate?.identify({ id: "u_1842", name: "Mike Jones", email: "mike@acme.com" });
window.Redekorate?.identify(null); // signed out
```

`meta` is shown on the ticket as *Custom data*: up to 20 keys with short text, number or boolean values.

### Verified users

Anything a browser sends can be typed by anyone, so a name alone is never shown as verified. To get the *verified user* mark,
sign the user id on **your server** with the widget's secret key and pass the result as `hash`:

```js
// Node.js, on your server
const hash = crypto.createHmac("sha256", process.env.REDEKORATE_WIDGET_SECRET).update(user.id).digest("hex");
```

```js
window.RedekorateUser = { id: user.id, name: user.name, email: user.email, hash };
```

The secret key is under **Install → Verified users**. Never put it in a page.

## JavaScript API

| Call | What it does |
|---|---|
| `Redekorate.identify(user \| null)` | Sets or clears the signed-in user |
| `Redekorate.open()` | Opens the form (use it with the position *Hidden* to open from your own button) |
| `Redekorate.close()` | Closes it |

## What people can send

| Setting | Notes |
|---|---|
| Screenshots with markup | The camera icon in the message box asks the visitor to share the current tab and takes one frame. It is attached at once, with a thumbnail; *Edit* opens the markup tools (highlight, hide, arrow, text) for those who want them; *Undo* (or Ctrl/Cmd+Z) takes back the last mark and *Clear marks* removes them all. Private fields hidden automatically stay hidden. |
| Screen recordings | Up to 2 minutes, after the browser's own permission prompt. |
| File attachments | The paperclip in the message box, or pasting an image into the message. Up to 3 files of 10 MB each: images, PDF, MP4 or WebM, recognized by content, not by name. Every attachment is optional, and the form says so. Attachments go through the [upload security scan](../README.md#upload-security-scan): a PDF with scripts or other active content is refused and the visitor is told to remove it. |
| Page and browser details | Page address and title, browser, system, window and screen size, language and time zone. Sent with every message while this is on; the form says so and lists what is sent. |
| Console errors | The last 20 errors the page logged. Off by default. |

Screenshots and recordings use the browser's screen-sharing prompt, which exists on desktop browsers. On phones those two
buttons report that capture is not available, and the visitor can attach a file instead.

## Privacy

- Mark anything that must never be captured with `data-rk-private`:

  ```html
  <span data-rk-private>4111 1111 1111 1111</span>
  ```

  Those areas are blacked out in screenshots before the visitor sees the image, and in every frame of a recording. This works
  when the visitor shares **the tab the widget is on**. If they pick another window or the whole screen, the picture does not
  line up with the page, so nothing is blacked out automatically; the *Hide* tool is still there for screenshots.
- The widget sets no cookies. A draft of the message is kept in the tab's session storage until it is sent.
- The visitor's IP address is not stored and no location is derived from it.
- Everything is stored on your Redekorate server. **Delete reporter's personal data** on a ticket erases the name, email,
  user id, page details, custom data and attachments of whoever sent it; the attached files are deleted from the server too.
- Editors can also remove a single attachment (the screenshot, the recording or one file) from a ticket with the trash
  button next to it, for example a screenshot that shows private data. The file is deleted from the server; the message stays.

## Limits

- 30 messages per IP address every 10 minutes (`WIDGET_PER_IP_10MIN`).
- A paused widget shows nothing on the sites and refuses messages.
- Replies to the reporter are sent by email through the server's SMTP settings; receiving their answer by email is not implemented.
