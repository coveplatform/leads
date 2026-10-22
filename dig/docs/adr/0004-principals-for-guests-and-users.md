# ADR-0004: One `principals` table for guests and signed-in users

**Status:** accepted

The blueprint lists `user_id?` and `guest_token_hash?` on sessions. DIG instead
gives every identity a `principals` row (`kind`, `guest_token_hash`,
`auth_user_id`) and references `principal_id` everywhere. Upgrading a guest to an
account is then a single `UPDATE principals SET kind='user', auth_user_id=…`,
preserving all trail and crate ids, and RLS policies reduce to one helper
(`dig_current_principal_id()`).
