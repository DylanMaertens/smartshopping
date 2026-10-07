import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, PageModal, Text } from '@/theme/ui';
import { BackendApiError, getValidatedCommunityFields } from '@/services/api/backend';
import type { CommunityField, ValidatedCommunityFields } from '@/services/api/backend';
import { CommunityReportForm } from './CommunityReportForm';

/** Reads current public values on demand; never replaces the user's list or cache. */
export function CommunityProductPanel({ barcodes, onClose }: { barcodes: string[]; onClose: () => void }) {
  const [barcode, setBarcode] = useState<string | null>(barcodes.length === 1 ? barcodes[0] : null);
  return <PageModal title="Fiche communautaire" onClose={onClose}>
    <Text>Consulte les valeurs communautaires actuellement validées pour ce code-barres. Elles peuvent différer du nom et du rayon de ta liste. Tes choix privés ne seront pas modifiés.</Text>
    {barcode ? <>
      <Text>Code-barres : {barcode}</Text>
      {barcodes.length > 1 ? <Button label="Changer de code-barres" variant="secondary" onPress={() => setBarcode(null)} /> : null}
      <CurrentFields key={barcode} barcode={barcode} />
    </> : <>
      <Text>Cette ligne regroupe plusieurs codes-barres. Choisis le produit à consulter.</Text>
      {barcodes.map((value) => <Button key={value} label={value} onPress={() => setBarcode(value)} />)}
    </>}
  </PageModal>;
}

function CurrentFields({ barcode }: { barcode: string }) {
  const [result, setResult] = useState<ValidatedCommunityFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [reportTarget, setReportTarget] = useState<CommunityField | null>(null);
  useEffect(() => {
    let active = true;
    setResult(null); setError(null);
    void getValidatedCommunityFields(barcode).then((data) => {
      if (active) setResult(data);
    }).catch((failure) => {
      if (active) setError(failure instanceof BackendApiError && failure.status === 404
        ? 'Le catalogue communautaire n’est pas accessible sur ce serveur.'
        : 'Impossible de consulter la fiche communautaire. Vérifie ta connexion puis réessaie.');
    });
    return () => { active = false; };
  }, [barcode, attempt]);

  return <>
    {!result && !error ? <Text accessibilityLiveRegion="polite">Chargement de la fiche communautaire…</Text> : null}
    {error ? <>
      <Text accessibilityRole="alert">{error}</Text>
      <Button label="Réessayer" onPress={() => setAttempt((value) => value + 1)} />
    </> : null}
    {result?.fields.length === 0 ? <Text>Aucune valeur communautaire actuellement validée pour ce code-barres. Le produit peut provenir d’un autre catalogue ou d’un choix privé.</Text> : null}
    {result?.fields.map((field) => <View key={field.proposal_id} style={{ gap: 8 }}>
      <Text>{field.field === 'name' ? 'Nom' : 'Rayon'} communautaire : {field.value}</Text>
      {result.contributions_enabled ? <Button variant="secondary" label={`Signaler ce ${field.field === 'name' ? 'nom' : 'rayon'}`}
        onPress={() => setReportTarget(field)} /> : null}
    </View>)}
    {result && result.fields.length > 0 && !result.contributions_enabled ? <Text>Les signalements ne sont pas disponibles sur ce serveur.</Text> : null}
    {reportTarget ? <CommunityReportForm key={reportTarget.proposal_id} suggestion={reportTarget} onClose={() => setReportTarget(null)} /> : null}
  </>;
}
