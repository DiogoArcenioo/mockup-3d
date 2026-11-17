'use client';
import { useState } from 'react';
import { Icon } from '../icons';
import { api, json, money, margin, units, unitNames, uploadPhoto, categories, type CatalogItem, type Category, type Product, type Unit } from './lib';
import { Chips, ErrorText, MoneyInput, Sheet, Stepper, Thumb } from './ui';
import { CatalogPicker } from './products';

type Kind = Category | 'consumption';
const kinds: [Kind, string, string][] = [
  ['mug', 'Caneca', 'mug'], ['tshirt', 'Camiseta', 'shirt'], ['mobile_accessory', 'Acessório', 'phone'], ['consumption', 'Insumo', 'flask'],
];
const STEPS = 5;

export function ProductWizard({ colors, brands, onCatalog, onClose, onCreated }: { colors: CatalogItem[]; brands: CatalogItem[]; onCatalog: () => void; onClose: () => void; onCreated: (p: Product) => void }) {
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<Kind | null>(null);
  const [name, setName] = useState('');
  const [colorId, setColorId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [unit, setUnit] = useState<Unit>('un');
  const [cost, setCost] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [stock, setStock] = useState(0);
  const [minStock, setMinStock] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Product | null>(null);
  const resale = kind !== 'consumption';

  function next() {
    setError('');
    if (step === 2 && !name.trim()) return setError('Dê um nome ao produto.');
    if (step === 3 && resale && !price) return setError('Informe o preço de venda.');
    setStep(step + 1);
  }
  function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(file); setPreview(URL.createObjectURL(file));
  }
  async function save() {
    if (pending) return;
    setPending(true); setError('');
    try {
      const body = { name: name.trim(), type: resale ? 'resale' : 'consumption', unit: resale ? 'un' : unit, category: resale ? kind : null, colorId: resale ? colorId || null : null, brandId: kind === 'tshirt' ? brandId || null : null, minStock, notes: '', costPrice: cost === null ? null : cost / 100, salePriceCents: resale ? price : null, initialStock: stock };
      let { product } = await api<{ product: Product }>('products', json('POST', body));
      if (photo) {
        try { const { photoUrl } = await uploadPhoto(product.id, photo); product = { ...product, photoUrl }; }
        catch { setError('Produto salvo, mas a foto não foi enviada. Tente pela edição.'); }
      }
      setSaved(product); onCreated(product);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { setPending(false); }
  }
  function restart() {
    setStep(1); setKind(null); setName(''); setColorId(''); setBrandId(''); setUnit('un'); setCost(null); setPrice(null); setStock(0); setMinStock(0); setPhoto(null); setPreview(''); setSaved(null); setError('');
  }

  if (saved) return <Sheet title="Produto cadastrado" onClose={onClose}>
    <div className="st-success">
      <span className="st-success-mark"><Icon name="check" size={40} /></span>
      <div className="st-saved-card"><Thumb product={saved} size={56} /><div><strong>{saved.name}</strong><small>{saved.stock} {units[saved.unit]} em estoque{saved.salePriceCents !== null ? ' · ' + money(saved.salePriceCents) : ''}</small></div></div>
      <ErrorText>{error}</ErrorText>
      <div className="st-two"><button className="quiet" onClick={restart}><Icon name="plus" size={16} /> Outro</button><button className="primary" onClick={onClose}>Concluir</button></div>
    </div>
  </Sheet>;

  const m = margin(cost, price);
  return <Sheet title="Novo produto" onClose={onClose} busy={pending} back={step > 1 ? () => { setError(''); setStep(step - 1); } : undefined}>
    <div className="st-progress" aria-label={`Passo ${step} de ${STEPS}`}><span style={{ width: `${(step / STEPS) * 100}%` }} /></div>
    <p className="st-step">Passo {step} de {STEPS}</p>

    {step === 1 && <>
      <h3 className="st-q">O que você vai cadastrar?</h3>
      <div className="st-kinds">
        {kinds.map(([id, label, icon]) => <button key={id} aria-pressed={kind === id} onClick={() => { setKind(id); setStep(2); }}><Icon name={icon} size={30} /><span>{label}</span>{id === 'consumption' && <small>uso da loja</small>}</button>)}
      </div>
    </>}

    {step === 2 && <form onSubmit={e => { e.preventDefault(); next(); }}>
      <h3 className="st-q">Como ele se chama?</h3>
      <label className="st-field"><input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder={kind === 'mug' ? 'Ex.: Caneca Mãe Coruja' : kind === 'tshirt' ? 'Ex.: Camiseta Básica P' : kind === 'consumption' ? 'Ex.: Papel sublimático' : 'Ex.: Capinha iPhone 15'} aria-label="Nome do produto" enterKeyHint="next" /></label>
      {resale && <CatalogPicker label="Cor" resource="colors" items={colors} value={colorId} onChange={setColorId} onCreated={onCatalog} />}
      {kind === 'tshirt' && <CatalogPicker label="Marca" resource="brands" items={brands} value={brandId} onChange={setBrandId} onCreated={onCatalog} />}
      {!resale && <div className="st-field"><span>Medida</span><Chips label="Unidade" value={unit} onChange={setUnit} options={Object.entries(units) as [Unit, string][]} /></div>}
      <ErrorText>{error}</ErrorText>
      <button className="primary st-block">Continuar <Icon name="arrow" size={18} /></button>
    </form>}

    {step === 3 && <form onSubmit={e => { e.preventDefault(); next(); }}>
      <h3 className="st-q">{resale ? 'Quanto custa e por quanto vende?' : 'Quanto custa?'}</h3>
      <div className="st-field"><span>Custo {resale ? 'por unidade' : `por ${unitNames[unit]}`}</span><MoneyInput label="Preço de custo" value={cost} onChange={setCost} large autoFocus /></div>
      {resale && <div className="st-field"><span>Preço de venda</span><MoneyInput label="Preço de venda" value={price} onChange={setPrice} large /></div>}
      {resale && cost !== null && price ? <div className={`st-profit${m !== null && m < 0 ? ' st-profit-neg' : ''}`}><Icon name="trend" size={18} /> Lucro de <strong>{money(price - cost)}</strong> por unidade ({m}%)</div> : null}
      <ErrorText>{error}</ErrorText>
      <button className="primary st-block">Continuar <Icon name="arrow" size={18} /></button>
      {cost === null && <p className="st-hint st-center-text">Sem o custo agora? Ele entra na primeira compra.</p>}
    </form>}

    {step === 4 && <form onSubmit={e => { e.preventDefault(); next(); }}>
      <h3 className="st-q">Quantos você tem agora?</h3>
      <div className="st-field st-center"><Stepper label="Estoque atual" value={stock} min={0} onChange={setStock} decimals={!resale && unit !== 'un'} /></div>
      <div className="st-field"><span>Avisar quando tiver menos de</span><Stepper label="Estoque mínimo" value={minStock} min={0} onChange={setMinStock} /></div>
      <p className="st-hint">O que já está na loja não entra como compra no financeiro.</p>
      <button className="primary st-block">Continuar <Icon name="arrow" size={18} /></button>
    </form>}

    {step === 5 && <>
      <h3 className="st-q">Uma foto ajuda a achar na hora da venda</h3>
      <label className="st-photo-drop">
        {preview ? <img src={preview} alt="Prévia da foto" /> : <><Icon name="camera" size={34} /><span>Tirar ou escolher foto</span></>}
        <input type="file" accept="image/*" hidden onChange={e => pickPhoto(e.target.files?.[0])} />
      </label>
      <ErrorText>{error}</ErrorText>
      <button className="primary st-block" onClick={save} disabled={pending}>{pending ? 'Salvando…' : <><Icon name="check" size={18} /> {photo ? 'Salvar produto' : 'Salvar sem foto'}</>}</button>
    </>}
  </Sheet>;
}
