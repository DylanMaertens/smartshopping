import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, PageModal, Pressable, Text, TextInput } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { normalizeItemName, truncateUtf8 } from '@/services/itemValidation';
import { classifyProductLocally, STORE_CATEGORIES } from '@/services/categorization/categoryService';
import type { CommunitySuggestion } from '@/services/api/backend';
import { CommunityReportForm } from './CommunityReportForm';

const ALPHABETICAL_CATEGORIES = [...STORE_CATEGORIES].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

export type CommunityParticipation = { publish: boolean; proposalIds: string[] };

export function UnknownProductPrompt({ barcode, suggestions = [], communityAvailable = false, onSave, onLater }: {
  barcode: string;
  suggestions?: CommunitySuggestion[];
  communityAvailable?: boolean;
  onSave: (name: string, category: string, participation: CommunityParticipation) => void;
  onLater: () => void;
}) {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('À classer');
  const [categoryChosen, setCategoryChosen] = useState(false);
  const [selectedNameProposal, setSelectedNameProposal] = useState<string | null>(null);
  const [selectedCategoryProposal, setSelectedCategoryProposal] = useState<string | null>(null);
  const [choosingCategory, setChoosingCategory] = useState(false);
  const [publish, setPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<CommunitySuggestion | null>(null);
  function save() {
    const normalized = normalizeItemName(name);
    if (!normalized || truncateUtf8(normalized, 200) !== normalized) {
      setError(normalized ? 'Ce nom est trop long.' : 'Saisis le nom du produit.'); return;
    }
    try {
      onSave(normalized, category, {
        publish,
        proposalIds: [selectedNameProposal, selectedCategoryProposal].filter((id): id is string => !!id),
      });
    }
    catch { setError('Impossible d’enregistrer le nom. Réessaie.'); }
  }
  return <PageModal title="Nommer le produit" onClose={onLater}>
    <Text>Le nom de ce produit n’a pas pu être récupéré. Quel nom souhaites-tu utiliser ?</Text>
    <Text>Code-barres : {barcode}</Text>
    {suggestions.length > 0 ? <View style={{ gap: 8 }}>
      <Text style={{ fontWeight: '700' }}>Propositions communautaires en cours</Text>
      {suggestions.slice(0, 3).map((suggestion) => <View key={suggestion.proposal_id} style={{ gap: 4 }}><Pressable accessibilityRole="radio"
        accessibilityLabel={`Proposition de ${suggestion.field === 'name' ? 'nom' : 'rayon'} : ${suggestion.value}`}
        accessibilityState={{ checked: suggestion.field === 'name'
          ? selectedNameProposal === suggestion.proposal_id : selectedCategoryProposal === suggestion.proposal_id }}
        onPress={() => {
          if (suggestion.field === 'name') {
            setName(suggestion.value); setSelectedNameProposal(suggestion.proposal_id);
            if (!categoryChosen) setCategory(classifyProductLocally(suggestion.value).categoryName);
          }
          else { setCategory(suggestion.value); setCategoryChosen(true); setSelectedCategoryProposal(suggestion.proposal_id); }
          setError(null);
        }} style={{ padding: 12, borderRadius: theme.radius, backgroundColor: theme.raised }}>
        <Text>{suggestion.field === 'name' ? 'Nom' : 'Rayon'} : {suggestion.value}</Text>
        <Text style={{ color: theme.muted, fontSize: 13 }}>{suggestion.confirmations} confirmation(s) d’installation · proposition non validée</Text>
      </Pressable>
        {communityAvailable ? <Button variant="secondary" label="Signaler cette proposition"
          accessibilityLabel={`Signaler la proposition de ${suggestion.field === 'name' ? 'nom' : 'rayon'} : ${suggestion.value}`}
          onPress={() => setReportTarget(suggestion)} /> : null}
      </View>)}
    </View> : null}
    <TextInput autoFocus={suggestions.length === 0} accessibilityLabel="Nom du produit scanné" placeholder="Ex. : Lessive" value={name}
      onChangeText={(value) => {
        setName(value); setSelectedNameProposal(null); setError(null);
        if (!categoryChosen) setCategory(classifyProductLocally(value).categoryName);
      }} onSubmitEditing={save} returnKeyType="done" />
    <Button variant="secondary" label={`Rayon : ${category}`} accessibilityLabel="Choisir le rayon du produit inconnu" onPress={() => setChoosingCategory(true)} />
    <Text>Ce nom et ce rayon seront conservés en privé pour les prochains scans sur cet appareil, sans expiration.</Text>
    {communityAvailable ? <Pressable accessibilityRole="checkbox" accessibilityLabel="Participer au catalogue communautaire"
      accessibilityState={{ checked: publish }} onPress={() => setPublish((value) => !value)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
      <Text>{publish ? '☑' : '☐'}</Text><Text style={{ flex: 1 }}>Participer aussi au catalogue communautaire (facultatif)</Text>
    </Pressable> : null}
    {publish ? <Text style={{ color: theme.muted, fontSize: 13 }}>Le nom et le rayon choisis seront envoyés au catalogue communautaire. Leur validation n’est pas garantie.</Text> : null}
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    <Button label="Enregistrer le nom" onPress={save} />
    <Button label="Plus tard" variant="secondary" onPress={onLater} />
    {reportTarget ? <CommunityReportForm key={reportTarget.proposal_id} suggestion={reportTarget} onClose={() => setReportTarget(null)} /> : null}
    {choosingCategory ? <PageModal title="Choisir un rayon" onClose={() => setChoosingCategory(false)}>
      {ALPHABETICAL_CATEGORIES.map((entry) => <Pressable key={entry.id} accessibilityRole="radio"
        accessibilityLabel={entry.name} accessibilityState={{ checked: category === entry.name }}
        onPress={() => { setCategory(entry.name); setCategoryChosen(true); setSelectedCategoryProposal(null); setChoosingCategory(false); }}
        style={{ padding: 12, borderRadius: theme.radius, backgroundColor: category === entry.name ? theme.raised : theme.surface }}>
        <Text>{category === entry.name ? '✓ ' : ''}{entry.name}</Text>
      </Pressable>)}
    </PageModal> : null}
  </PageModal>;
}
