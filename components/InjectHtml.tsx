'use client';

import { useEffect } from 'react';

/**
 * Injeta HTML (incl. &lt;script src&gt; e inline) em head ou body.
 * Scripts são recriados para o browser executar de fato.
 */
export default function InjectHtml({
  html,
  target,
}: {
  html: string;
  target: 'head' | 'body';
}) {
  useEffect(() => {
    if (!html?.trim() || typeof document === 'undefined') return;

    const parent = target === 'head' ? document.head : document.body;
    const marker = document.createElement('div');
    marker.setAttribute('data-ln-inject', target);
    marker.style.display = 'none';
    // Parse em template para isolar
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();

    const mounted: Node[] = [marker];
    parent.appendChild(marker);

    const walk = (nodes: NodeListOf<ChildNode> | ChildNode[]) => {
      Array.from(nodes).forEach((node) => {
        if (node.nodeName === 'SCRIPT') {
          const el = node as HTMLScriptElement;
          const s = document.createElement('script');
          Array.from(el.attributes).forEach((a) => s.setAttribute(a.name, a.value));
          if (el.textContent) s.text = el.textContent;
          parent.appendChild(s);
          mounted.push(s);
          return;
        }
        const clone = node.cloneNode(true);
        parent.appendChild(clone);
        mounted.push(clone);
      });
    };

    walk(tpl.content.childNodes);

    return () => {
      mounted.forEach((n) => {
        try {
          n.parentNode?.removeChild(n);
        } catch {
          /* ignore */
        }
      });
    };
  }, [html, target]);

  return null;
}
