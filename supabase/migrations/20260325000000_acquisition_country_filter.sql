-- Add p_country_filter parameter to get_acquisition_stats
-- Filters Channel x Status and Channel x Plan tables by country
-- NULL = no filter (all countries), otherwise exact match

CREATE OR REPLACE FUNCTION get_acquisition_stats(
  p_week_start date DEFAULT NULL,
  p_country_filter text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
  v_has_data boolean;
  v_total bigint;
  v_paid bigint;
  v_week_end date;
  country_arr jsonb;
  channel_arr jsonb;
  channel_plan_arr jsonb;
  plan_names_arr jsonb;
  summary_obj jsonb;
  v_top_country text;
  v_top_channel text;
  v_best_conv_channel text;
  v_best_conv_pct numeric;
  v_channel_total bigint;
BEGIN
  IF p_week_start IS NOT NULL THEN
    v_week_end := p_week_start + 6;
  END IF;

  SELECT EXISTS(SELECT 1 FROM growth_users LIMIT 1) INTO v_has_data;
  IF NOT v_has_data THEN
    RETURN jsonb_build_object('has_data', false);
  END IF;

  -- Overall totals (not filtered by country — for summary cards)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE plan_paid = true)
  INTO v_total, v_paid
  FROM growth_users
  WHERE (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end));

  -- Country x Status (NOT filtered by p_country_filter — shows all countries)
  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'total')::int DESC), '[]'::jsonb)
  INTO country_arr
  FROM (
    SELECT jsonb_build_object(
      'key', COALESCE(country, 'Sin pais'),
      'pago', COUNT(*) FILTER (WHERE plan_paid = true),
      'gratisActivado', COUNT(*) FILTER (WHERE plan_paid = false AND COALESCE(eventos_valor, 0) >= 1),
      'noActivado', COUNT(*) FILTER (WHERE plan_paid = false AND COALESCE(eventos_valor, 0) < 1),
      'total', COUNT(*),
      'conversionPct', CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE plan_paid = true))::numeric / COUNT(*) * 100, 2) ELSE 0 END,
      'pctOfGrandTotal', CASE WHEN v_total > 0 THEN ROUND(COUNT(*)::numeric / v_total * 100, 1) ELSE 0 END
    ) AS row_data
    FROM growth_users
    WHERE (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end))
    GROUP BY COALESCE(country, 'Sin pais')
  ) sub;

  -- Channel total (with country filter applied)
  SELECT COUNT(*)
  INTO v_channel_total
  FROM growth_users
  WHERE (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end))
    AND (p_country_filter IS NULL OR COALESCE(country, 'Sin pais') = p_country_filter);

  -- Channel x Status (filtered by p_country_filter if provided)
  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'total')::int DESC), '[]'::jsonb)
  INTO channel_arr
  FROM (
    SELECT jsonb_build_object(
      'key', grouped_channel,
      'pago', SUM(is_paid)::int,
      'gratisActivado', SUM(is_free_active)::int,
      'noActivado', SUM(is_not_active)::int,
      'total', COUNT(*),
      'conversionPct', CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(is_paid)::numeric / COUNT(*) * 100, 2) ELSE 0 END,
      'pctOfGrandTotal', CASE WHEN v_channel_total > 0 THEN ROUND(COUNT(*)::numeric / v_channel_total * 100, 1) ELSE 0 END
    ) AS row_data
    FROM (
      SELECT
        CASE
          WHEN origin ILIKE '%recomend%' OR origin ILIKE '%referr%' THEN 'Recomendación'
          WHEN origin ILIKE '%face%' OR origin ILIKE '%fb%' THEN 'Facebook'
          WHEN origin ILIKE '%tiktok%' OR origin ILIKE '%tik%' THEN 'TikTok'
          WHEN origin ILIKE '%google%' OR origin ILIKE '%goo%' THEN 'Google'
          WHEN origin ILIKE '%insta%' OR origin ILIKE '%ig %' OR origin ILIKE 'ig' THEN 'Instagram'
          WHEN origin ILIKE '%youtube%' OR origin ILIKE '%youtu%' OR origin ILIKE '%yt%' THEN 'Youtube'
          WHEN origin ILIKE '%whats%' OR origin ILIKE '%wpp%' OR origin ILIKE '%wa %' OR origin ILIKE 'wa' THEN 'Whatsapp'
          ELSE 'Otros'
        END AS grouped_channel,
        CASE WHEN plan_paid = true THEN 1 ELSE 0 END AS is_paid,
        CASE WHEN plan_paid = false AND COALESCE(eventos_valor, 0) >= 1 THEN 1 ELSE 0 END AS is_free_active,
        CASE WHEN plan_paid = false AND COALESCE(eventos_valor, 0) < 1 THEN 1 ELSE 0 END AS is_not_active
      FROM growth_users
      WHERE (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end))
        AND (p_country_filter IS NULL OR COALESCE(country, 'Sin pais') = p_country_filter)
    ) classified
    GROUP BY grouped_channel
  ) sub;

  -- Channel x Plan (filtered by p_country_filter if provided)
  SELECT COALESCE(jsonb_agg(DISTINCT COALESCE(plan_id, 'Sin plan') ORDER BY COALESCE(plan_id, 'Sin plan')), '[]'::jsonb)
  INTO plan_names_arr
  FROM growth_users
  WHERE plan_paid = true
    AND (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end))
    AND (p_country_filter IS NULL OR COALESCE(country, 'Sin pais') = p_country_filter);

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'total')::int DESC), '[]'::jsonb)
  INTO channel_plan_arr
  FROM (
    SELECT jsonb_build_object(
      'channel', grouped_channel,
      'plans', jsonb_object_agg(COALESCE(plan_id, 'Sin plan'), cnt),
      'total', SUM(cnt)
    ) AS row_data
    FROM (
      SELECT grouped_channel, plan_id, COUNT(*) AS cnt
      FROM (
        SELECT
          CASE
            WHEN origin ILIKE '%recomend%' OR origin ILIKE '%referr%' THEN 'Recomendación'
            WHEN origin ILIKE '%face%' OR origin ILIKE '%fb%' THEN 'Facebook'
            WHEN origin ILIKE '%tiktok%' OR origin ILIKE '%tik%' THEN 'TikTok'
            WHEN origin ILIKE '%google%' OR origin ILIKE '%goo%' THEN 'Google'
            WHEN origin ILIKE '%insta%' OR origin ILIKE '%ig %' OR origin ILIKE 'ig' THEN 'Instagram'
            WHEN origin ILIKE '%youtube%' OR origin ILIKE '%youtu%' OR origin ILIKE '%yt%' THEN 'Youtube'
            WHEN origin ILIKE '%whats%' OR origin ILIKE '%wpp%' OR origin ILIKE '%wa %' OR origin ILIKE 'wa' THEN 'Whatsapp'
            ELSE 'Otros'
          END AS grouped_channel,
          plan_id
        FROM growth_users
        WHERE plan_paid = true
          AND (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end))
          AND (p_country_filter IS NULL OR COALESCE(country, 'Sin pais') = p_country_filter)
      ) inner_classified
      GROUP BY grouped_channel, plan_id
    ) inner_q
    GROUP BY grouped_channel
  ) sub;

  -- Summary stats (NOT filtered by country)
  SELECT COALESCE(country, 'Sin pais') INTO v_top_country
  FROM growth_users
  WHERE (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end))
  GROUP BY COALESCE(country, 'Sin pais')
  ORDER BY COUNT(*) DESC LIMIT 1;

  SELECT sub.grouped_ch INTO v_top_channel
  FROM (
    SELECT
      CASE
        WHEN origin ILIKE '%recomend%' OR origin ILIKE '%referr%' THEN 'Recomendación'
        WHEN origin ILIKE '%face%' OR origin ILIKE '%fb%' THEN 'Facebook'
        WHEN origin ILIKE '%tiktok%' OR origin ILIKE '%tik%' THEN 'TikTok'
        WHEN origin ILIKE '%google%' OR origin ILIKE '%goo%' THEN 'Google'
        WHEN origin ILIKE '%insta%' OR origin ILIKE '%ig %' OR origin ILIKE 'ig' THEN 'Instagram'
        WHEN origin ILIKE '%youtube%' OR origin ILIKE '%youtu%' OR origin ILIKE '%yt%' THEN 'Youtube'
        WHEN origin ILIKE '%whats%' OR origin ILIKE '%wpp%' OR origin ILIKE '%wa %' OR origin ILIKE 'wa' THEN 'Whatsapp'
        ELSE 'Otros'
      END AS grouped_ch
    FROM growth_users
    WHERE (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end))
  ) sub
  GROUP BY sub.grouped_ch
  ORDER BY COUNT(*) DESC LIMIT 1;

  SELECT sub.grouped_ch, sub.conv_pct INTO v_best_conv_channel, v_best_conv_pct
  FROM (
    SELECT
      grouped_ch,
      ROUND(SUM(CASE WHEN plan_paid THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2) AS conv_pct
    FROM (
      SELECT
        CASE
          WHEN origin ILIKE '%recomend%' OR origin ILIKE '%referr%' THEN 'Recomendación'
          WHEN origin ILIKE '%face%' OR origin ILIKE '%fb%' THEN 'Facebook'
          WHEN origin ILIKE '%tiktok%' OR origin ILIKE '%tik%' THEN 'TikTok'
          WHEN origin ILIKE '%google%' OR origin ILIKE '%goo%' THEN 'Google'
          WHEN origin ILIKE '%insta%' OR origin ILIKE '%ig %' OR origin ILIKE 'ig' THEN 'Instagram'
          WHEN origin ILIKE '%youtube%' OR origin ILIKE '%youtu%' OR origin ILIKE '%yt%' THEN 'Youtube'
          WHEN origin ILIKE '%whats%' OR origin ILIKE '%wpp%' OR origin ILIKE '%wa %' OR origin ILIKE 'wa' THEN 'Whatsapp'
          ELSE 'Otros'
        END AS grouped_ch,
        plan_paid
      FROM growth_users
      WHERE (p_week_start IS NULL OR (created_date >= p_week_start AND created_date <= v_week_end))
    ) inner_q
    GROUP BY grouped_ch
    HAVING COUNT(*) >= 5
  ) sub
  ORDER BY sub.conv_pct DESC LIMIT 1;

  summary_obj := jsonb_build_object(
    'total_users', v_total,
    'paid_users', v_paid,
    'top_country', COALESCE(v_top_country, '-'),
    'top_channel', COALESCE(v_top_channel, '-'),
    'best_conv_channel', COALESCE(v_best_conv_channel, '-'),
    'best_conv_pct', COALESCE(v_best_conv_pct, 0)
  );

  result := jsonb_build_object(
    'has_data', true,
    'summary', summary_obj,
    'country_table', country_arr,
    'channel_table', channel_arr,
    'channel_plan_table', channel_plan_arr,
    'plan_names', plan_names_arr
  );

  RETURN result;
END;
$$;
