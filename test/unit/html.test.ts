import { describe, expect, it } from 'vitest';
import { html, raw } from '../../src/views/html.js';

describe('html', () => {
  it('escapes interpolated values', () => {
    const note = '<script>alert("x")</script> & \'quotes\'';
    expect(html`<p>${note}</p>`.value).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quotes&#39;</p>',
    );
  });

  it('does not double-escape nested templates', () => {
    const inner = html`<b>${'a&b'}</b>`;
    expect(html`<p>${inner}</p>`.value).toBe('<p><b>a&amp;b</b></p>');
  });

  it('joins arrays and drops empty values', () => {
    const items = ['<1>', '2'].map((item) => html`<li>${item}</li>`);
    expect(html`<ul>${items}${null}${undefined}${false}</ul>`.value).toBe(
      '<ul><li>&lt;1&gt;</li><li>2</li></ul>',
    );
  });

  it('passes raw markup through', () => {
    expect(html`<div>${raw('<hr>')}</div>`.value).toBe('<div><hr></div>');
  });

  it('renders numbers and zero', () => {
    expect(html`${0}/${5}`.value).toBe('0/5');
  });
});
