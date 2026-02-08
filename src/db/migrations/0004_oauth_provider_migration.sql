-- Migration: Remove tables replaced by OAuthProvider + KV
-- Users must re-authorize TickTick after this migration.

DROP TABLE IF EXISTS oauth_start_tickets;
DROP TABLE IF EXISTS oauth_states;
DROP TABLE IF EXISTS ticktick_connections;
