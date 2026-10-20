// Embed entry — builds the chat bubble as a standalone script that ANY page
// can mount with two lines:
//
//   <link rel="stylesheet" href="kyambogo-chat-widget.css" />
//   <script>window.KYAMBOGO_CHAT = { apiBase: "http://192.168.1.81:8080" };</script>
//   <script src="kyambogo-chat-widget.js"></script>
//   <script>KyambogoChat.mount(document.getElementById("kyambogo-chat"));</script>
//
// The brain (PHP + Postgres) stays on the admin's machine — the embed only
// renders the bubble and talks to it over CORS.
import React from "react";
import { createRoot } from "react-dom/client";
import ChatWidget from "./ChatWidget.jsx";

/** Mount the bubble inside `el`. Returns an unmount function. */
export function mount(el, props = {}) {
  const root = createRoot(el);
  root.render(<ChatWidget {...props} />);
  return () => root.unmount();
}

export default ChatWidget;
