-- Bucket para banco de imágenes del módulo Contenido Social
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-images',
  'content-images',
  true,
  5242880,  -- 5MB
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: autenticados pueden subir y borrar
CREATE POLICY "content_images_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'content-images' AND auth.role() = 'authenticated');
CREATE POLICY "content_images_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'content-images' AND auth.role() = 'authenticated');
CREATE POLICY "content_images_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'content-images');
