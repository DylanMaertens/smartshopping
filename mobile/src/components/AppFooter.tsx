import React, { useState } from 'react';
import { View } from 'react-native';
import { PageModal, Pressable, Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';

const pages = {
  CGU: { title: 'Conditions générales d’utilisation', description: 'Les conditions d’utilisation seront publiées ici avant la diffusion publique de l’app.' },
  CGV: { title: 'Conditions générales de vente', description: 'Les conditions de vente seront publiées ici avant l’ouverture des achats.' },
  Contact: { title: 'Contact', description: 'Les coordonnées de contact seront ajoutées ici avant la diffusion publique de l’app.' },
};

export function AppFooter() {
  const { theme } = useTheme();
  const [page, setPage] = useState<keyof typeof pages | null>(null);
  return <View style={{ gap: 4, paddingTop: 16, borderTopWidth: theme.stroke, borderColor: theme.border }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
      {(Object.keys(pages) as (keyof typeof pages)[]).map((key) => <Pressable key={key}
        accessibilityLabel={`${key} — à venir`} onPress={() => setPage(key)} style={{ paddingHorizontal: 8, alignItems: 'center' }}>
        <Text style={{ fontSize: 14, color: theme.muted }}>{key}</Text>
      </Pressable>)}
    </View>
    <Text style={{ color: theme.muted, fontSize: 12, textAlign: 'center' }}>Informations à venir</Text>
    {page ? <PageModal title={pages[page].title} onClose={() => setPage(null)}>
      <Text style={{ fontWeight: '700' }}>À venir</Text>
      <Text>{pages[page].description}</Text>
    </PageModal> : null}
  </View>;
}
