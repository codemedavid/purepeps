import { useState } from 'react';
import { uploadToImageKit, deleteFromImageKit } from '../lib/imagekit';

// Extension -> MIME type used when a (mobile gallery) file arrives with an empty
// `file.type`. Kept here so the validation logic stays self-contained.
const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  heif: 'image/heif',
  ico: 'image/x-icon',
  avif: 'image/avif',
};

const VALID_EXTENSIONS = Object.keys(EXTENSION_MIME_MAP);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const MIN_UPLOAD_BYTES = 100; // reject placeholder/empty files

/**
 * Image upload hook backed by ImageKit.io. The `folder` argument maps to an
 * ImageKit folder (it used to be the Supabase storage bucket), so existing
 * call sites keep their logical grouping (e.g. `menu-images`, `payment-proofs`).
 */
export const useImageUpload = (folder: string = 'menu-images') => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadImage = async (file: File): Promise<string> => {
    let progressInterval: ReturnType<typeof setInterval> | null = null;

    try {
      setUploading(true);
      setUploadProgress(0);

      // Validate file type — accept all common image formats. Mobile gallery
      // files often have an empty MIME type, so the extension is the primary check.
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      const hasValidExtension = !!fileExtension && VALID_EXTENSIONS.includes(fileExtension);
      const hasValidMimeType = !file.type || file.type.startsWith('image/');

      if (!hasValidExtension && !hasValidMimeType) {
        throw new Error(
          `Please upload a valid image file. Supported formats: JPG, PNG, WebP, GIF, BMP, TIFF, SVG, HEIC, and more. File type: ${file.type || 'unknown'}, Extension: ${fileExtension || 'none'}`,
        );
      }

      if (file.size < MIN_UPLOAD_BYTES) {
        throw new Error('The selected file appears to be invalid or empty. Please select a valid image.');
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error(`Image size must be less than 10MB. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
      }

      // Generate a unique filename, preserving the original extension.
      const fileExt = fileExtension || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      // Simulate upload progress for UI feedback (fetch upload has no native
      // progress events without XHR/streams).
      progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            if (progressInterval) clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      const { url } = await uploadToImageKit({ file, fileName, folder });

      if (progressInterval) clearInterval(progressInterval);
      setUploadProgress(100);

      return url;
    } catch (error) {
      if (progressInterval) clearInterval(progressInterval);
      console.error('Error uploading image:', error);
      throw error;
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const deleteImage = async (imageUrl: string): Promise<void> => {
    try {
      await deleteFromImageKit(imageUrl);
    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  };

  return {
    uploadImage,
    deleteImage,
    uploading,
    uploadProgress,
  };
};
