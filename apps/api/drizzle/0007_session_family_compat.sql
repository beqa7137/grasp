SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE FUNCTION sync_session_family() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO session_families (id, user_id, revoked_at, created_at)
    VALUES (NEW.family_id, NEW.user_id, NEW.revoked_at, NEW.created_at)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    UPDATE session_families SET revoked_at = NEW.revoked_at
    WHERE id = NEW.family_id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER refresh_tokens_session_family_insert
AFTER INSERT ON refresh_tokens FOR EACH ROW EXECUTE FUNCTION sync_session_family();--> statement-breakpoint
CREATE TRIGGER refresh_tokens_session_family_revoke
AFTER UPDATE OF revoked_at ON refresh_tokens FOR EACH ROW
WHEN (NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS DISTINCT FROM NEW.revoked_at)
EXECUTE FUNCTION sync_session_family();--> statement-breakpoint
INSERT INTO session_families (id, user_id, revoked_at, created_at)
SELECT family_id, user_id, max(revoked_at), min(created_at)
FROM refresh_tokens
GROUP BY family_id, user_id
ON CONFLICT (id) DO UPDATE SET revoked_at = excluded.revoked_at
WHERE excluded.revoked_at IS NOT NULL AND session_families.revoked_at IS NULL;
