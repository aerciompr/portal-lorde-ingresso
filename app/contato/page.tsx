'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';

type ContactPublic = {
  whatsapp_display?: string;
  whatsapp_e164?: string;
  contact_email?: string;
  instagram_url?: string;
  contact_note?: string;
};

export default function ContatoPage() {
  const [cfg, setCfg] = useState<ContactPublic>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: 'Ingressos',
    message: '',
    website: '', // honeypot
  });

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d === 'object') setCfg(d);
      })
      .catch(() => {});
  }, []);

  const waDigits = (cfg.whatsapp_e164 || '5582996471998').replace(/\D/g, '');
  const waHref = `https://wa.me/${waDigits}`;
  const waDisplay = cfg.whatsapp_display || '(82) 99647-1998';
  const contactEmail = cfg.contact_email || 'contato@lordenelson.com.br';
  const ig = (cfg.instagram_url || '').trim();
  const note =
    cfg.contact_note ||
    'Respondemos em horário comercial. Para ingressos já comprados, use Meus Ingressos.';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar');
      setSent(true);
      setForm((f) => ({ ...f, message: '', subject: 'Ingressos' }));
      toast.success('Mensagem enviada! Responderemos em breve.');
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível enviar');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <div className="text-emerald-400 text-sm tracking-[2px] mb-1">FALE CONOSCO</div>
        <h1 className="section-title mb-2">Contato</h1>
        <p className="text-zinc-400 max-w-xl text-sm leading-relaxed">{note}</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-8 lg:gap-12">
        {/* Form */}
        <div className="lg:col-span-3">
          {sent ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-3">
                <i className="fa-solid fa-circle-check text-emerald-400 text-2xl" aria-hidden />
                <h2 className="text-lg font-semibold text-white">Mensagem enviada</h2>
              </div>
              <p className="text-sm text-zinc-400 mb-6">
                Obrigado! Se for urgente sobre o dia do show, fale no WhatsApp.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  onClick={() => setSent(false)}
                >
                  Enviar outra
                </button>
                <Link href="/ingressos" className="btn btn-primary text-sm">
                  Meus Ingressos
                </Link>
              </div>
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5 sm:p-6 space-y-4"
            >
              {/* honeypot */}
              <input
                type="text"
                name="website"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
              />

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="contact-name">
                    Nome *
                  </label>
                  <input
                    id="contact-name"
                    className="input"
                    required
                    maxLength={120}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Seu nome"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="contact-email">
                    E-mail *
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    className="input"
                    required
                    maxLength={160}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="voce@email.com"
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="contact-subject">
                  Assunto
                </label>
                <select
                  id="contact-subject"
                  className="input"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                >
                  <option value="Ingressos">Ingressos</option>
                  <option value="Evento">Evento / Programação</option>
                  <option value="Parceria">Parceria</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div>
                <label className="label" htmlFor="contact-message">
                  Mensagem *
                </label>
                <textarea
                  id="contact-message"
                  className="input min-h-[140px] resize-y"
                  required
                  minLength={10}
                  maxLength={4000}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Como podemos ajudar?"
                />
              </div>

              <button
                type="submit"
                disabled={sending}
                className="btn btn-primary w-full sm:w-auto px-8 disabled:opacity-60"
              >
                {sending ? (
                  'Enviando…'
                ) : (
                  <>
                    <i className="fa-solid fa-paper-plane mr-2" aria-hidden />
                    Enviar mensagem
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Canais */}
        <aside className="lg:col-span-2 space-y-4">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 rounded-2xl border border-[#25D366]/25 bg-[#25D366]/10 hover:bg-[#25D366]/15 p-4 transition"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#25D366]/20 text-[#25D366] text-2xl">
              <i className="fa-brands fa-whatsapp" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">WhatsApp</div>
              <div className="text-sm text-zinc-400 truncate">{waDisplay}</div>
            </div>
          </a>

          <a
            href={`mailto:${contactEmail}`}
            className="flex items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/60 hover:border-emerald-500/30 p-4 transition"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 text-xl">
              <i className="fa-solid fa-envelope" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">E-mail</div>
              <div className="text-sm text-zinc-400 truncate">{contactEmail}</div>
            </div>
          </a>

          {ig ? (
            <a
              href={ig.startsWith('http') ? ig : `https://instagram.com/${ig.replace(/^@/, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 rounded-2xl border border-pink-500/20 bg-pink-500/10 hover:bg-pink-500/15 p-4 transition"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-pink-500/20 text-pink-400 text-2xl">
                <i className="fa-brands fa-instagram" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Instagram</div>
                <div className="text-sm text-zinc-400 truncate">
                  {ig.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}
                </div>
              </div>
            </a>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4 text-sm text-zinc-400 space-y-2">
            <div className="flex items-start gap-2">
              <i className="fa-solid fa-location-dot text-emerald-400 mt-0.5" aria-hidden />
              <span>
                Rua Silvério Jorge, 241
                <br />
                Jaraguá — Maceió/AL
              </span>
            </div>
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-ticket text-emerald-400" aria-hidden />
              <Link href="/ingressos" className="text-emerald-400 hover:underline">
                Já tenho ingresso → Meus Ingressos
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
