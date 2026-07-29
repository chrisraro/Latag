-- RLS Policy Regression Tests
-- Run with: supabase test db rls_regression.sql
-- These tests verify the security boundaries documented in the audit.

-- ============================================================================
-- SETUP: Create test data
-- ============================================================================

-- Insert test users (using UUIDs that don't exist in auth.users for isolation)
-- Note: These tests assume a clean database state

-- ============================================================================
-- TEST 1: Column grant isolation (anon can't see user_id)
-- ============================================================================
-- Verifies that 0005's column grants prevent anon from reading user_id

-- Switch to anon role
set local role anon;

-- This should fail with permission denied (select=* not allowed)
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.shops LIMIT 1;
    RAISE EXCEPTION 'TEST FAILED: anon should not be able to select * from shops';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST PASSED: anon correctly denied select * from shops';
  END;
END;
$$;

-- This should succeed (granted columns only)
DO $$
DECLARE
  shop_record record;
BEGIN
  SELECT id, handle, display_name INTO shop_record
  FROM public.shops
  WHERE is_published = true
  LIMIT 1;

  IF shop_record IS NULL THEN
    RAISE NOTICE 'TEST SKIPPED: no published shops to test';
    RETURN;
  END IF;

  RAISE NOTICE 'TEST PASSED: anon can read granted columns from shops';
END;
$$;

-- This should fail (user_id is not granted)
DO $$
BEGIN
  BEGIN
    PERFORM user_id FROM public.shops LIMIT 1;
    RAISE EXCEPTION 'TEST FAILED: anon should not be able to read user_id';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST PASSED: anon correctly denied access to user_id column';
  END;
END;
$$;

-- Reset role
reset role;

-- ============================================================================
-- TEST 2: Owner-only write policies
-- ============================================================================
-- Verifies that only shop owners can modify their own shops

-- Switch to authenticated role (simulating a logged-in user)
set local role authenticated;

-- This should fail (user_id doesn't match)
DO $$
BEGIN
  BEGIN
    UPDATE public.shops SET display_name = 'hacked' WHERE id = '00000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'TEST FAILED: authenticated user should not be able to update other shops';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST PASSED: authenticated user correctly denied update on other shops';
  END;
END;
$$;

-- Reset role
reset role;

-- ============================================================================
-- TEST 3: Published shop visibility
-- ============================================================================
-- Verifies that only published shops are visible to anon

set local role anon;

DO $$
DECLARE
  unpublished_count int;
BEGIN
  SELECT count(*) INTO unpublished_count
  FROM public.shops
  WHERE is_published = false;

  IF unpublished_count > 0 THEN
    RAISE EXCEPTION 'TEST FAILED: anon can see % unpublished shops', unpublished_count;
  END IF;

  RAISE NOTICE 'TEST PASSED: anon cannot see unpublished shops';
END;
$$;

reset role;

-- ============================================================================
-- TEST 4: shop_items visibility follows shop publication status
-- ============================================================================

set local role anon;

DO $$
DECLARE
  item_count int;
BEGIN
  -- Anon should only see items from published shops
  SELECT count(*) INTO item_count
  FROM public.shop_items si
  JOIN public.shops s ON s.id = si.shop_id
  WHERE s.is_published = false;

  IF item_count > 0 THEN
    RAISE EXCEPTION 'TEST FAILED: anon can see % items from unpublished shops', item_count;
  END IF;

  RAISE NOTICE 'TEST PASSED: anon cannot see items from unpublished shops';
END;
$$;

reset role;

-- ============================================================================
-- TEST 5: shop_is_mine() function works correctly
-- ============================================================================

-- Test that the SECURITY DEFINER function works as expected
DO $$
BEGIN
  -- As anon, shop_is_mine should always return false
  set local role anon;
  IF public.shop_is_mine('00000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'TEST FAILED: shop_is_mine should return false for anon';
  END IF;
  RAISE NOTICE 'TEST PASSED: shop_is_mine returns false for anon';
  reset role;
END;
$$;

-- ============================================================================
-- TEST 6: Column grants are idempotent (revoke/grant are safe to re-run)
-- ============================================================================

DO $$
BEGIN
  -- These should not error (idempotent operations)
  revoke select on public.shops from anon;
  grant select (
    id, handle, display_name, bio,
    contact_messenger, contact_instagram, contact_email,
    show_sold, is_published, updated_at
  ) on public.shops to anon;

  RAISE NOTICE 'TEST PASSED: column grants are idempotent';
END;
$$;

-- ============================================================================
-- SUMMARY
-- ============================================================================
RAISE NOTICE '=== RLS Regression Tests Complete ===';
