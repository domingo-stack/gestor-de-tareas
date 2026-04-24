-- Migrar item_type viejos a nuevas categorías
-- feature → producto (la mayoría de tareas eran de producto)
-- tech_debt → producto
-- bug → producto
-- experiment queda como experiment (para tab Experimentos que no se tocó)

UPDATE product_initiatives SET item_type = 'producto'
WHERE item_type IN ('feature', 'tech_debt', 'bug')
  AND phase IN ('backlog', 'finalized', 'delivery');

-- Experimentos (phase=discovery) mantienen 'experiment' — no tocar
