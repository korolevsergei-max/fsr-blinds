-- One-time seed: rooms, windows, and production status for Lansdowne Building B units.
--
-- For each listed unit_number we create:
--   • One "Bedroom" room containing all blackout (B/O) windows.
--   • One "Living Room" room containing all 3% screen windows.
-- Windows are marked measured + bracketed (NOT installed).
-- A window_production_status row is inserted per window with status='qc_approved'
-- (i.e. cut, assembled, and QC passed). Attribution columns left null.
-- Unit status is set to 'manufactured'.
--
-- Safety:
--   • Looks up units by unit_number AND building_name ILIKE '%Lansdown%Building B%'
--     (matches both "Lansdowne" and "Lansdown" typos seen in data).
--   • Raises if a unit cannot be uniquely located.
--   • Skips any unit that already has rooms (idempotent re-runs).

DO $$
DECLARE
  unit_specs JSONB := $json$
  [
    {"unit_number": "2902", "blackout": [[77, 51]], "screen": [[23.625, 50], [35, 91], [36.875, 91], [22.875, 80], [90.25, 91]]},
    {"unit_number": "2905", "blackout": [[41.375, 90], [72.625, 90], [40.25, 90], [13.625, 38], [36.625, 90], [51.75, 90]], "screen": [[21.125, 90], [36, 90], [36.625, 90], [20, 79]]},
    {"unit_number": "2906", "blackout": [[77, 54], [77.375, 54]], "screen": [[26.75, 54], [35.125, 89], [36.625, 89], [26, 89]]},
    {"unit_number": "2907", "blackout": [[77.75, 54], [77.125, 50]], "screen": [[26.625, 50], [36, 91], [35.625, 91], [23.625, 91]]},
    {"unit_number": "2908", "blackout": [[75.375, 51], [76.5, 51], [76.125, 51], [77.375, 51]], "screen": [[25.375, 51], [35.375, 93], [36.375, 93], [25.5, 93]]},
    {"unit_number": "2909", "blackout": [[76.5, 51], [33.875, 38], [76.875, 51], [77.25, 51]], "screen": [[22.875, 51], [35.25, 91], [36.5, 91], [21.75, 79]]},
    {"unit_number": "2910", "blackout": [[77, 53]], "screen": [[24.75, 53], [35, 89], [36.25, 89], [23.125, 76]]},
    {"unit_number": "2911", "blackout": [[77.375, 54]], "screen": [[23.875, 42], [36.25, 89], [36.625, 89], [23.375, 89]]},
    {"unit_number": "2702", "blackout": [[76.5, 53]], "screen": [[23.625, 53], [35.125, 88], [36.875, 88], [22.125, 76]]},
    {"unit_number": "2706", "blackout": [[77.125, 53], [77.125, 53]], "screen": [[26.125, 53], [35.5, 88], [36.375, 88], [26, 88]]},
    {"unit_number": "2708", "blackout": [[76.75, 53], [77, 53], [75.875, 53], [77.5, 53]], "screen": [[26.125, 53], [34.875, 88], [36.625, 88], [25.125, 88]]},
    {"unit_number": "205",  "blackout": [[11.125, 42], [36.75, 88], [35.25, 88], [15.875, 88]], "screen": [[22.5, 88], [35.125, 88], [37.375, 88], [19.25, 76]]}
  ]
  $json$::jsonb;

  spec               JSONB;
  v_unit_number      TEXT;
  v_unit_id          TEXT;
  v_unit_match_count INT;
  v_existing_rooms   INT;
  v_blackouts        JSONB;
  v_screens          JSONB;
  v_blackout_count   INT;
  v_screen_count     INT;
  v_total_windows    INT;
  v_room_count       INT;
  v_bedroom_id       TEXT;
  v_living_id        TEXT;
  v_window_id        TEXT;
  v_idx              INT;
  win                JSONB;
BEGIN
  FOR spec IN SELECT * FROM jsonb_array_elements(unit_specs)
  LOOP
    v_unit_number := spec->>'unit_number';

    -- Resolve unit_id, scoped to Lansdowne Building B
    SELECT COUNT(*) INTO v_unit_match_count
    FROM public.units
    WHERE unit_number = v_unit_number
      AND building_name ILIKE '%Lansdown%Building B%';

    IF v_unit_match_count = 0 THEN
      RAISE EXCEPTION 'Unit % not found in Lansdowne Building B', v_unit_number;
    ELSIF v_unit_match_count > 1 THEN
      RAISE EXCEPTION 'Unit % matches % rows in Lansdowne Building B (expected 1)', v_unit_number, v_unit_match_count;
    END IF;

    SELECT id INTO v_unit_id
    FROM public.units
    WHERE unit_number = v_unit_number
      AND building_name ILIKE '%Lansdown%Building B%';

    -- Idempotency: skip units that already have rooms
    SELECT COUNT(*) INTO v_existing_rooms FROM public.rooms WHERE unit_id = v_unit_id;
    IF v_existing_rooms > 0 THEN
      RAISE NOTICE 'Unit % already has % room(s); skipping', v_unit_number, v_existing_rooms;
      CONTINUE;
    END IF;

    v_blackouts      := spec->'blackout';
    v_screens        := spec->'screen';
    v_blackout_count := COALESCE(jsonb_array_length(v_blackouts), 0);
    v_screen_count   := COALESCE(jsonb_array_length(v_screens), 0);
    v_total_windows  := v_blackout_count + v_screen_count;
    v_room_count     := (CASE WHEN v_blackout_count > 0 THEN 1 ELSE 0 END)
                      + (CASE WHEN v_screen_count   > 0 THEN 1 ELSE 0 END);

    -- Bedroom (blackouts)
    IF v_blackout_count > 0 THEN
      v_bedroom_id := gen_random_uuid()::text;
      INSERT INTO public.rooms (id, unit_id, name, window_count, completed_windows)
      VALUES (v_bedroom_id, v_unit_id, 'Bedroom', v_blackout_count, v_blackout_count);

      v_idx := 0;
      FOR win IN SELECT * FROM jsonb_array_elements(v_blackouts)
      LOOP
        v_idx := v_idx + 1;
        v_window_id := gen_random_uuid()::text;

        INSERT INTO public.windows
          (id, room_id, label, blind_type, width, height,
           notes, risk_flag, measured, bracketed, installed)
        VALUES
          (v_window_id, v_bedroom_id, 'Window ' || v_idx, 'blackout',
           (win->>0)::double precision, (win->>1)::double precision,
           '', 'green', TRUE, TRUE, FALSE);

        INSERT INTO public.window_production_status
          (id, window_id, unit_id, status, cut_at, assembled_at, qc_approved_at)
        VALUES
          (gen_random_uuid()::text, v_window_id, v_unit_id, 'qc_approved',
           NOW(), NOW(), NOW());
      END LOOP;
    END IF;

    -- Living Room (3% screens)
    IF v_screen_count > 0 THEN
      v_living_id := gen_random_uuid()::text;
      INSERT INTO public.rooms (id, unit_id, name, window_count, completed_windows)
      VALUES (v_living_id, v_unit_id, 'Living Room', v_screen_count, v_screen_count);

      v_idx := 0;
      FOR win IN SELECT * FROM jsonb_array_elements(v_screens)
      LOOP
        v_idx := v_idx + 1;
        v_window_id := gen_random_uuid()::text;

        INSERT INTO public.windows
          (id, room_id, label, blind_type, width, height,
           notes, risk_flag, measured, bracketed, installed)
        VALUES
          (v_window_id, v_living_id, 'Window ' || v_idx, 'screen',
           (win->>0)::double precision, (win->>1)::double precision,
           '', 'green', TRUE, TRUE, FALSE);

        INSERT INTO public.window_production_status
          (id, window_id, unit_id, status, cut_at, assembled_at, qc_approved_at)
        VALUES
          (gen_random_uuid()::text, v_window_id, v_unit_id, 'qc_approved',
           NOW(), NOW(), NOW());
      END LOOP;
    END IF;

    -- Roll up to unit
    UPDATE public.units
    SET
      status       = 'manufactured',
      room_count   = v_room_count,
      window_count = v_total_windows
    WHERE id = v_unit_id;

    RAISE NOTICE 'Unit %: created % room(s), % window(s) (% blackout, % screen)',
      v_unit_number, v_room_count, v_total_windows, v_blackout_count, v_screen_count;
  END LOOP;
END;
$$;
