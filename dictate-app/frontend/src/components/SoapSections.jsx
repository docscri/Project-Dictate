import { soapSections } from '../shared/account.js';

export default function SoapSections({ preview = false }) {
  return <div className={preview ? 'soap-preview-sections' : 'soap-section-chips'}>{soapSections.map((section) => (
    <div key={section} className={preview ? 'soap-preview-row' : 'soap-section-chip'}>
      <span className="soap-letter" aria-hidden="true">{section[0]}</span>
      <div className="soap-section-body"><span className="soap-section-name">{section}</span>
        {preview && <div className="soap-skeleton" aria-hidden="true"><span /><span /></div>}
      </div>
    </div>
  ))}</div>;
}
