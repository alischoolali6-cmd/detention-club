# Detention Club store: one-time setup

The website is already built. It needs a Supabase project to take orders.

1. Go to supabase.com and create a free project (any name, pick a region close to Bahrain).
2. In the project, open **SQL Editor > New query**, paste all of `supabase-setup.sql`, and click **Run**.
3. Open **Authentication > Providers > Email** and turn **Allow new users to sign up** OFF.
4. Open **Authentication > Users > Add user > Create new user**. Use `detentionclub0@gmail.com` and a strong password. Tick "Auto confirm user". This is the admin login for `/admin.html`.
5. Open **Project Settings > API** and copy the **Project URL** and the **anon public** key. Give them to Claude (or paste them into `config.js`). Never share the `service_role` key.

After that, every change Claude pushes goes live on the same link.
