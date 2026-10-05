# TM Messenger

PWA + Supabase messenger. Push: messages INSERT -> Database Webhook -> send-push -> Web Push -> Chrome Android -> Service Worker.

Secrets: VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_SUPABASE_SECRET_KEY. Webhook: public.messages / INSERT / send-push / POST / Add auth header with service key.

Android Chrome: open HTTPS GitHub Pages URL, log in, allow Notifications, optionally install PWA, then test from another account/device.

Important: current message storage is NOT production E2EE; push payload contains metadata only.
