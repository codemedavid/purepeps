import React, { useState } from 'react';
import { Layout } from 'lucide-react';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { useImageUpload } from '../hooks/useImageUpload';
import AccessIntakeToggle from './AccessIntakeToggle';
import StorefrontNoticeManager from './StorefrontNoticeManager';
import GbLandingManager from './GbLandingManager';

const SiteSettingsManager: React.FC = () => {
  const { siteSettings, loading, updateSiteSettings } = useSiteSettings();
  const { uploadImage, uploading } = useImageUpload();

  const [formData, setFormData] = useState({
    site_name: '',
    site_description: '',
    currency: '',
    currency_code: '',
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (siteSettings) {
      setFormData({
        site_name: siteSettings.site_name,
        site_description: siteSettings.site_description,
        currency: siteSettings.currency,
        currency_code: siteSettings.currency_code,
      });
      setLogoPreview(siteSettings.site_logo);
    }
  }, [siteSettings]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      let logoUrl = logoPreview;

      if (logoFile) {
        // useImageUpload uses the folder defined at hook level (default 'menu-images')
        const uploadedUrl = await uploadImage(logoFile);
        logoUrl = uploadedUrl;
      }

      await updateSiteSettings({
        ...formData,
        site_logo: logoUrl
      });

      setLogoFile(null);
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving site settings:', error);
      alert('Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Access request intake switch (shared with the Access Requests view). */}
      <AccessIntakeToggle />

      {/* Every string on the public homepage. */}
      <GbLandingManager />

      {/* Every string in the storefront's Important Notice pop-up. */}
      <StorefrontNoticeManager />

      {/* General Site Settings Card */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Layout className="w-5 h-5 text-gray-500" />
          General Site Settings
        </h2>

        <div className="space-y-6">
          {/* Logo & Name Row */}
          <div className="flex flex-col md:flex-row gap-6">
            <div className="shrink-0">
              <label className="block text-sm font-medium text-gray-700 mb-2">Site Logo</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
                  <img src={logoPreview || '/logo.png'} alt="Logo" className="w-full h-full object-cover" />
                </div>
                <label className="cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium transition-colors">
                  Change
                  <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                </label>
              </div>
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
                <input
                  type="text"
                  name="site_name"
                  value={formData.site_name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-shadow text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Site Description</label>
                <textarea
                  name="site_description"
                  value={formData.site_description}
                  onChange={handleInputChange}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-shadow text-gray-900"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency Symbol</label>
              <input type="text" name="currency" value={formData.currency} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency Code</label>
              <input type="text" name="currency_code" value={formData.currency_code} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900" />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleSave} disabled={isSaving || uploading} className="bg-navy-900 text-white px-4 py-2 rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-50">
              {isSaving ? 'Saving...' : 'Save General Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteSettingsManager;
