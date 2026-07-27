-- Stop anonymous enumeration of the shop-photos bucket.
--
-- The 0003 policy `using (bucket_id = 'shop-photos')` granted SELECT on
-- storage.objects to everyone, which is what the Storage API's list()
-- endpoint checks — so anyone could walk {user_id}/{item_local_id}/ and
-- discover photos of items a seller had already unpublished.
--
-- Removing it does NOT affect storefront images. Verified empirically on this
-- project 2026-07-27: with a real object in the bucket, an unauthenticated GET
-- of /storage/v1/object/public/shop-photos/... returned 200 while carrying no
-- auth header at all — public buckets serve object reads without consulting
-- RLS. The same probe confirmed anon list() returned the object, i.e. the
-- exposure was real rather than theoretical.
--
-- The owner still needs SELECT so lib/shop-api.ts deleteShopItem can list a
-- folder before cleaning it up, hence the replacement policy below.

drop policy if exists "shop photos public read" on storage.objects;

create policy "shop photos owner read" on storage.objects
  for select
  using (
    bucket_id = 'shop-photos'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );
