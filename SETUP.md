# Detention Club store: one-time setup

The website is already built. It needs a Supabase project to take orders.

1. Go to supabase.com and create a free project (any name, pick a region close to Bahrain).
2. In the project, open **SQL Editor > New query**, paste all of `supabase-setup.sql`, and click **Run**.
3. Open **Authentication > Providers > Email** and turn **Allow new users to sign up** OFF.
4. Open **Authentication > Users > Add user > Create new user**. Use `detentionclub0@gmail.com` and a strong password. Tick "Auto confirm user". This is the admin login for `/admin.html`.
5. Open **Project Settings > API** and copy the **Project URL** and the **anon public** key. Give them to Claude (or paste them into `config.js`). Never share the `service_role` key.

After that, every change Claude pushes goes live on the same link.

## Upgrade 2 (money, restock, 3-month cleanup)

In Supabase SQL Editor, run `supabase-migration-2.sql` once (after `supabase-setup.sql`). It is safe to run again.
Then in the admin: Money tab (set the starting bank balance), Stock & prices (enter your cost per item), Restock tab.
Optional: Database > Extensions > turn on `pg_cron`, then run the migration again to schedule the weekly cleanup.
