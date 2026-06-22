import React, { useState } from 'react';
import { Home, Layout } from 'lucide-react';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { useImageUpload } from '../hooks/useImageUpload';

const SiteSettingsManager: React.FC = () => {
  const { siteSettings, loading, updateSiteSettings } = useSiteSettings();
  const { uploadImage, uploading } = useImageUpload();

  const [formData, setFormData] = useState({
    site_name: '',
    site_description: '',
    currency: '',
    currency_code: '',
    // Hero Fields
    hero_badge_text: '',
    hero_title_prefix: '',
    hero_title_highlight: '',
    hero_title_suffix: '',
    hero_subtext: '',
    hero_tagline: '',
    hero_description: '',
    hero_accent_color: 'gold-500'
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
        hero_badge_text: siteSettings.hero_badge_text || '',
        hero_title_prefix: siteSettings.hero_title_prefix || '',
        hero_title_highlight: siteSettings.hero_title_highlight || '',
        hero_title_suffix: siteSettings.hero_title_suffix || '',
        hero_subtext: siteSettings.hero_subtext || '',
        hero_tagline: siteSettings.hero_tagline || '',
        hero_description: siteSettings.hero_description || '',
        hero_accent_color: siteSettings.hero_accent_color || 'gold-500'
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

  const handleResetDefaults = () => {
    if (confirm('Are you sure you want to reset the homepage content to defaults?')) {
      setFormData(prev => ({
        ...prev,
        hero_badge_text: 'Premium Peptide Solutions',
        hero_title_prefix: 'Premium',
        hero_title_highlight: 'Peptides',
        hero_title_suffix: '& Essentials',
        hero_subtext: 'From the Lab to You — Simplifying Science, One Dose at a Time.',
        hero_tagline: 'Quality-tested products. Reliable performance. Trusted by our community.',
        hero_description: 'RSPEPTIDE provides research-grade peptides engineered for precision, purity, and consistency.',
      }));
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="space-y-8 pb-12">
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

      {/* Homepage Content Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Home className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Homepage Content</h2>
              <p className="text-sm text-gray-500 mt-1">Customize the landing page text.</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Badge Text */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Badge Text</label>
            <input
              type="text"
              name="hero_badge_text"
              value={formData.hero_badge_text}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
              placeholder="e.g. Premium Peptide Solutions"
            />
          </div>

          {/* Title Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Title Prefix</label>
              <input
                type="text"
                name="hero_title_prefix"
                value={formData.hero_title_prefix}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 transition-all"
                placeholder="e.g. Premium"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Highlight (Color)</label>
              <input
                type="text"
                name="hero_title_highlight"
                value={formData.hero_title_highlight}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-theme-secondary font-medium focus:ring-2 focus:ring-gray-900 transition-all"
                placeholder="e.g. Peptides"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Title Suffix</label>
              <input
                type="text"
                name="hero_title_suffix"
                value={formData.hero_title_suffix}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 transition-all"
                placeholder="e.g. & Essentials"
              />
            </div>
          </div>

          {/* Subtext */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Subtext (Next to Title)</label>
            <input
              type="text"
              name="hero_subtext"
              value={formData.hero_subtext}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 transition-all"
              placeholder="e.g. — Trusted Quality for Your Journey."
            />
          </div>

          {/* Hero Tagline */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Hero Tagline</label>
            <textarea
              name="hero_tagline"
              value={formData.hero_tagline}
              onChange={handleInputChange}
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 transition-all resize-none"
              placeholder="e.g. Quality-tested products. Reliable performance..."
            />
          </div>

          {/* Main Description */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Main Description</label>
            <textarea
              name="hero_description"
              value={formData.hero_description}
              onChange={handleInputChange}
              rows={4}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:ring-2 focus:ring-gray-900 transition-all resize-none"
              placeholder="e.g. Explore our carefully curated selection..."
            />
          </div>

          {/* Reset Link */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="text-sm text-red-500 hover:text-red-700 font-medium underline underline-offset-2 transition-colors"
            >
              Reset Homepage Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteSettingsManager;
