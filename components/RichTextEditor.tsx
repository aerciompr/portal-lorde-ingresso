'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import CodeBlock from '@tiptap/extension-code-block';
import { useEffect, useState } from 'react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ value, onChange, placeholder = 'Escreva a descrição...' }: RichTextEditorProps) {
  const [isSource, setIsSource] = useState(false);
  const [sourceValue, setSourceValue] = useState(value || '');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-emerald-400 underline' },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      CodeBlock,
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setSourceValue(html);
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm prose-invert max-w-none focus:outline-none min-h-[180px] p-3 bg-zinc-950 border border-white/10 rounded-xl text-sm text-zinc-200',
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML() && !isSource) {
      editor.commands.setContent(value || '');
      setSourceValue(value || '');
    }
  }, [value, editor, isSource]);

  if (!editor) return null;

  const toggleBold = () => editor.chain().focus().toggleBold().run();
  const toggleItalic = () => editor.chain().focus().toggleItalic().run();
  const toggleUnderline = () => editor.chain().focus().toggleUnderline().run();
  const toggleStrike = () => editor.chain().focus().toggleStrike().run();
  const toggleHeading2 = () => editor.chain().focus().toggleHeading({ level: 2 }).run();
  const toggleHeading3 = () => editor.chain().focus().toggleHeading({ level: 3 }).run();
  const toggleBulletList = () => editor.chain().focus().toggleBulletList().run();
  const toggleOrderedList = () => editor.chain().focus().toggleOrderedList().run();
  const toggleBlockquote = () => editor.chain().focus().toggleBlockquote().run();
  const toggleCodeBlock = () => editor.chain().focus().toggleCodeBlock().run();
  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL do link:', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };
  const alignLeft = () => editor.chain().focus().setTextAlign('left').run();
  const alignCenter = () => editor.chain().focus().setTextAlign('center').run();
  const alignRight = () => editor.chain().focus().setTextAlign('right').run();

  const isActive = (name: string, options?: any) => editor.isActive(name, options);

  const handleSourceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newHtml = e.target.value;
    setSourceValue(newHtml);
    onChange(newHtml);
    editor.commands.setContent(newHtml);
  };

  const toggleSource = () => {
    if (!isSource) {
      // switching to source, sync current
      setSourceValue(editor.getHTML());
    } else {
      // switching back to visual
      editor.commands.setContent(sourceValue);
    }
    setIsSource(!isSource);
  };

  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-zinc-900">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 border-b border-white/10 bg-zinc-950 p-2 text-xs">
        <button type="button" onClick={toggleBold} className={`px-2 py-1 rounded hover:bg-white/10 ${isActive('bold') ? 'bg-emerald-500/20 text-emerald-400' : ''}`}><strong>B</strong></button>
        <button type="button" onClick={toggleItalic} className={`px-2 py-1 rounded hover:bg-white/10 italic ${isActive('italic') ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>I</button>
        <button type="button" onClick={toggleUnderline} className={`px-2 py-1 rounded hover:bg-white/10 underline ${isActive('underline') ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>U</button>
        <button type="button" onClick={toggleStrike} className={`px-2 py-1 rounded hover:bg-white/10 line-through ${isActive('strike') ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>S</button>
        <span className="mx-1 text-white/30">|</span>
        <button type="button" onClick={toggleHeading2} className={`px-2 py-1 rounded hover:bg-white/10 ${isActive('heading', { level: 2 }) ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>H2</button>
        <button type="button" onClick={toggleHeading3} className={`px-2 py-1 rounded hover:bg-white/10 ${isActive('heading', { level: 3 }) ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>H3</button>
        <span className="mx-1 text-white/30">|</span>
        <button type="button" onClick={alignLeft} className="px-2 py-1 rounded hover:bg-white/10">←</button>
        <button type="button" onClick={alignCenter} className="px-2 py-1 rounded hover:bg-white/10">↔</button>
        <button type="button" onClick={alignRight} className="px-2 py-1 rounded hover:bg-white/10">→</button>
        <span className="mx-1 text-white/30">|</span>
        <button type="button" onClick={toggleBulletList} className={`px-2 py-1 rounded hover:bg-white/10 ${isActive('bulletList') ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>• Lista</button>
        <button type="button" onClick={toggleOrderedList} className={`px-2 py-1 rounded hover:bg-white/10 ${isActive('orderedList') ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>1. Lista</button>
        <button type="button" onClick={toggleBlockquote} className={`px-2 py-1 rounded hover:bg-white/10 ${isActive('blockquote') ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>“ ”</button>
        <button type="button" onClick={toggleCodeBlock} className={`px-2 py-1 rounded hover:bg-white/10 ${isActive('codeBlock') ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>{`< >`}</button>
        <button type="button" onClick={setLink} className={`px-2 py-1 rounded hover:bg-white/10 ${isActive('link') ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>Link</button>
        <button type="button" onClick={toggleSource} className={`px-2 py-1 rounded hover:bg-white/10 ml-1 ${isSource ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>
          {isSource ? 'Visual' : 'HTML'}
        </button>
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className="ml-auto px-2 py-1 rounded text-xs text-zinc-400 hover:bg-white/10">Limpar</button>
      </div>

      {isSource ? (
        <textarea
          className="w-full min-h-[180px] p-3 bg-zinc-950 font-mono text-sm text-zinc-200 border-0 focus:outline-none"
          value={sourceValue}
          onChange={handleSourceChange}
        />
      ) : (
        <EditorContent editor={editor} />
      )}

      <div className="px-3 py-1.5 text-[10px] text-zinc-500 border-t border-white/10 bg-zinc-950">
        Editor rico • Use o botão HTML para ver/editar o código fonte
      </div>
    </div>
  );
}
