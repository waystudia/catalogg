import { ArrowLeft, CheckCircle2, FileUp } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { navigateBackOrFallback } from '../../shared/appNavigation';
import { saveSellerApplication, submitSellerApplication, uploadSellerDocument } from './partnerRegistrationApi';
import './partner-registration.css';

export function SellerApplicationPage() {
  const navigate = useNavigate();
  const [organizationType, setOrganizationType] = useState('self_employed');
  const [legalName, setLegalName] = useState(''); const [inn, setInn] = useState(''); const [ogrn, setOgrn] = useState('');
  const [legalAddress, setLegalAddress] = useState(''); const [actualAddress, setActualAddress] = useState('');
  const [representativeName, setRepresentativeName] = useState(''); const [authorityBasis, setAuthorityBasis] = useState('');
  const [document, setDocument] = useState<File | null>(null); const [identityDocument, setIdentityDocument] = useState<File | null>(null);
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [sent, setSent] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!document || !identityDocument) return setError('Прикрепите подтверждающий документ и документ личности.'); setSaving(true); setError(''); try { await saveSellerApplication({ organizationType, legalName, inn, ogrn, legalAddress, actualAddress, representativeName, authorityBasis }); await uploadSellerDocument(document, 'business_registration'); await uploadSellerDocument(identityDocument, 'identity'); await submitSellerApplication(); setSent(true); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось отправить заявку.'); } finally { setSaving(false); } };
  if (sent) return <main className="partner-registration"><section className="partner-registration__success"><CheckCircle2 /><h1>Документы отправлены</h1><p>Заявка появилась у администратора. До одобрения кабинет остаётся в режиме настройки, а покупатели не видят бизнес.</p><button onClick={() => navigate('/profile')}>Готово</button></section></main>;
  return <main className="partner-registration"><header><button aria-label="Назад" onClick={() => navigateBackOrFallback(navigate, '/partner-registration')}><ArrowLeft /></button><span>Проверка бизнеса</span></header><form onSubmit={submit}>
    <small>РЕКВИЗИТЫ И ДОКУМЕНТЫ</small><h1>Отправьте данные на проверку</h1><p>Файлы хранятся приватно. Их видите только вы и администратор WayYaam.</p>
    <label>Статус<select value={organizationType} onChange={(event) => setOrganizationType(event.target.value)}><option value="self_employed">Самозанятый</option><option value="individual_entrepreneur">ИП</option><option value="company">Организация</option></select></label>
    <label>ФИО или юридическое наименование<input value={legalName} onChange={(event) => setLegalName(event.target.value)} required /></label><label>ИНН<input value={inn} onChange={(event) => setInn(event.target.value.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" required /></label>
    {organizationType !== 'self_employed' && <label>ОГРНИП / ОГРН<input value={ogrn} onChange={(event) => setOgrn(event.target.value)} required /></label>}<label>Фактический адрес<input value={actualAddress} onChange={(event) => setActualAddress(event.target.value)} required /></label>
    {organizationType !== 'self_employed' && <><label>Юридический адрес<input value={legalAddress} onChange={(event) => setLegalAddress(event.target.value)} required /></label><label>Представитель<input value={representativeName} onChange={(event) => setRepresentativeName(event.target.value)} required /></label><label>Основание полномочий<input value={authorityBasis} onChange={(event) => setAuthorityBasis(event.target.value)} required /></label></>}
    <label className="partner-registration__file"><FileUp /><span><b>Подтверждение статуса</b><small>{document?.name ?? 'JPG, PNG или PDF · до 10 МБ'}</small></span><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => setDocument(event.target.files?.[0] ?? null)} required /></label>
    <label className="partner-registration__file"><FileUp /><span><b>Документ личности</b><small>{identityDocument?.name ?? 'JPG, PNG или PDF · до 10 МБ'}</small></span><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => setIdentityDocument(event.target.files?.[0] ?? null)} required /></label>
    {error && <strong role="alert">{error}</strong>}<button className="partner-registration__primary" disabled={saving}>{saving ? 'Отправляем…' : 'Отправить на проверку'}</button>
  </form></main>;
}
