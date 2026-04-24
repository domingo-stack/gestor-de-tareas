-- Actualizar check constraint para incluir nuevas categorías del backlog
ALTER TABLE product_initiatives DROP CONSTRAINT product_initiatives_item_type_check;

ALTER TABLE product_initiatives ADD CONSTRAINT product_initiatives_item_type_check
CHECK (item_type = ANY (ARRAY[
  'experiment'::text, 'feature'::text, 'tech_debt'::text, 'bug'::text,
  'producto'::text, 'customer_success'::text, 'marketing'::text, 'otro'::text
]));
