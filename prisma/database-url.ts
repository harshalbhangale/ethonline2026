/**
 * Resolves the URL used for direct database work: migrations, introspection and seeding.
 *
 * Supabase's transaction pooler on port 6543 does not support the session-level
 * features these commands need, so it is rewritten to the session pooler on 5432
 * unless an explicit DIRECT_URL is supplied.
 */
export function resolveDirectDatabaseUrl(): string | undefined {
  const directUrl = process.env.DIRECT_URL?.trim();
  if (directUrl) return directUrl;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return undefined;

  const url = new URL(databaseUrl);

  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") {
    url.port = "5432";
    return url.toString();
  }

  return databaseUrl;
}

export function requireDirectDatabaseUrl(): string {
  const url = resolveDirectDatabaseUrl();

  if (!url) {
    throw new Error(
      "DATABASE_URL or DIRECT_URL must be configured for direct database access.",
    );
  }

  return url;
}
