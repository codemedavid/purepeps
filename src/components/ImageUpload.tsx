import React, { useRef } from 'react';
import { Upload, X, Image as ImageIcon, FileText, ExternalLink } from 'lucide-react';
import { useImageUpload } from '../hooks/useImageUpload';

interface ImageUploadProps {
  currentImage?: string | null;
  onImageChange: (imageUrl: string | undefined) => void;
  className?: string;
  folder?: string;
  allowPdf?: boolean;
}

const isPdfUrl = (url?: string | null): boolean =>
  !!url && url.split('?')[0].toLowerCase().endsWith('.pdf');

const ImageUpload: React.FC<ImageUploadProps> = ({
  currentImage,
  onImageChange,
  className = '',
  folder = 'menu-images',
  allowPdf = false
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadImage, deleteImage, uploading, uploadProgress } = useImageUpload(folder);
  const currentIsPdf = isPdfUrl(currentImage);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imageUrl = await uploadImage(file);
      onImageChange(imageUrl);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to upload image');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = async () => {
    if (currentImage) {
      try {
        await deleteImage(currentImage);
        onImageChange(undefined);
      } catch (error) {
        console.error('Error removing image:', error);
        // Still remove from UI even if deletion fails
        onImageChange(undefined);
      }
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {currentImage ? (
        <div className="relative">
          {currentIsPdf ? (
            <div className="w-full max-w-2xl rounded-2xl border-2 border-sky-200 shadow-lg bg-sky-50/50 p-6 flex flex-col items-center justify-center gap-3">
              <FileText className="h-16 w-16 text-sky-400" />
              <p className="text-sm font-medium text-gray-700">PDF document uploaded</p>
              <a
                href={currentImage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-700"
              >
                <ExternalLink className="h-4 w-4" />
                Open PDF
              </a>
            </div>
          ) : (
            <img
              src={currentImage}
              alt="Preview"
              className="w-full max-w-2xl object-contain rounded-2xl border-2 border-sky-200 shadow-lg hover:shadow-xl transition-all"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              onLoad={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
              style={{ opacity: 0 }}
            />
          )}
          <button
            type="button"
            onClick={handleRemoveImage}
            className="absolute top-3 right-3 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-all"
            disabled={uploading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div
          onClick={triggerFileSelect}
          className="w-full max-w-2xl border-2 border-dashed border-sky-300 rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-sky-400 hover:bg-sky-50/50 transition-all duration-300 bg-gradient-to-br from-sky-50/30 to-blue-50/30"
        >
          {uploading ? (
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Uploading... {uploadProgress}%</p>
              <div className="w-32 bg-gray-200 rounded-full h-2 mt-2">
                <div
                  className="bg-sky-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          ) : (
            <>
              <ImageIcon className="h-16 w-16 text-sky-400 mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-2">
                {allowPdf ? 'Click to upload image or PDF' : 'Click to upload product image'}
              </p>
              <p className="text-sm text-gray-500 mb-1">or drag and drop</p>
              <p className="text-xs text-gray-400">
                {allowPdf
                  ? 'Images (JPG, PNG, WebP, ...) or PDF - max 10MB'
                  : 'All image formats (JPG, PNG, WebP, GIF, BMP, TIFF, SVG, HEIC) - max 10MB'}
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={allowPdf ? 'image/*,application/pdf' : 'image/*'}
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
      />

      {!currentImage && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={triggerFileSelect}
            disabled={uploading}
            className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-2xl font-medium shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="h-5 w-5" />
            <span>Choose File</span>
          </button>
          <span className="text-sm text-gray-500">or enter URL below</span>
        </div>
      )}

      {/* URL Input as fallback */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Or enter image URL</label>
        <input
          type="url"
          value={currentImage || ''}
          onChange={(e) => onImageChange(e.target.value || undefined)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900"
          placeholder="https://example.com/image.jpg"
          disabled={uploading}
        />
      </div>
    </div>
  );
};

export default ImageUpload;