import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { parseFeatureFlagValue } from '../utils/featureFlags';

export const useCOAPageSetting = () => {
  const [coaPageEnabled, setCoaPageEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCOAPageSetting();
    
    // Subscribe to changes in site_settings
    const channel = supabase
      .channel('coa-page-setting-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'site_settings',
          filter: `id=eq.coa_page_enabled`
        },
        (payload) => {
          setCoaPageEnabled(parseFeatureFlagValue(payload.new?.value));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCOAPageSetting = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('id', 'coa_page_enabled')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching COA page setting:', error);
        // Default to enabled if setting doesn't exist
        setCoaPageEnabled(true);
        return;
      }
      
      // Read through the SAME predicate as the Lab Reports feature flag. Both
      // read this one row: parseFeatureFlagValue fails open (only the literal
      // 'false' disables), this used to fail closed (only 'true' enabled). Any
      // other value — a hand-edited '1', or 't' — made FeatureRoute and the
      // bottom nav offer /coa while this rendered "Lab Reports Unavailable".
      setCoaPageEnabled(!data || parseFeatureFlagValue(data.value));
    } catch (error) {
      console.error('Error fetching COA page setting:', error);
      // Default to enabled on error
      setCoaPageEnabled(true);
    } finally {
      setLoading(false);
    }
  };

  return { coaPageEnabled, loading };
};

