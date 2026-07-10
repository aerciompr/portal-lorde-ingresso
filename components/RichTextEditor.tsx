'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import CodeBlock from '@tiptap/extension-code-block';
import { useEffect, useState, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code2,
  Link2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  Code,
  Eraser,
  Eye,
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition ${
        active
          ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40'
          : 'text-zinc-400 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-5 w-px self-center bg-white/10" aria-hidden />;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Escreva a descrição do evento…',
}: RichTextEditorProps) {
  const [isSource, setIsSource] = useState(false);
  const [sourceValue, setSourceValue] = useState(value || '');

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        bulletList: {
          HTMLAttributes: { class: 'list-disc pl-5 my-2 space-y-1' },
        },
        orderedList: {
          HTMLAttributes: { class: 'list-decimal pl-5 my-2 space-y-1' },
        },
        listItem: {
          HTMLAttributes: { class: 'leading-relaxed' },
        },
        paragraph: {
          HTMLAttributes: { class: 'my-1.5' },
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-emerald-400 underline underline-offset-2' },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      CodeBlock.configure({
        HTMLAttributes: {
          class: 'rounded-lg bg-zinc-900 border border-white/10 p-3 font-mono text-xs my-2',
        },
      }),
    ],
    content: value || '',
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      setSourceValue(html);
      onChange(html);
    },
    editorProps: {
      attributes: {
        class:
          'tiptap-editor max-w-none focus:outline-none min-h-[200px] px-4 py-3 text-sm text-zinc-200 leading-relaxed',
        'data-placeholder': placeholder,
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML() && !isSource) {
      editor.commands.setContent(value || '', { emitUpdate: false });
      setSourceValue(value || '');
    }
  }, [value, editor, isSource]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL do link:', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return (
      <div className="min-h-[240px] rounded-2xl border border-white/10 bg-zinc-950 animate-pulse" />
    );
  }

  const handleSourceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newHtml = e.target.value;
    setSourceValue(newHtml);
    onChange(newHtml);
    editor.commands.setContent(newHtml, { emitUpdate: false });
  };

  const toggleSource = () => {
    if (!isSource) {
      setSourceValue(editor.getHTML());
    } else {
      editor.commands.setContent(sourceValue);
    }
    setIsSource(!isSource);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-inner">
      {/* Toolbar moderna */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-white/10 bg-zinc-900/90 px-2 py-1.5 backdrop-blur">
        <ToolbarButton
          title="Negrito"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={15} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          title="Itálico"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Sublinhado"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Riscado"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={15} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Título"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Subtítulo"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={15} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Lista com marcadores"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Lista numerada"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Citação"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Bloco de código"
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code2 size={15} />
        </ToolbarButton>
        <ToolbarButton title="Link" active={editor.isActive('link')} onClick={setLink}>
          <Link2 size={15} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Alinhar à esquerda"
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        >
          <AlignLeft size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Centralizar"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          <AlignCenter size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Alinhar à direita"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          <AlignRight size={15} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton title="Desfazer" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 size={15} />
        </ToolbarButton>
        <ToolbarButton title="Refazer" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 size={15} />
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarButton
            title={isSource ? 'Modo visual' : 'Ver HTML'}
            active={isSource}
            onClick={toggleSource}
          >
            {isSource ? <Eye size={15} /> : <Code size={15} />}
          </ToolbarButton>
          <ToolbarButton
            title="Limpar formatação"
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          >
            <Eraser size={15} />
          </ToolbarButton>
        </div>
      </div>

      {isSource ? (
        <textarea
          className="w-full min-h-[200px] resize-y border-0 bg-zinc-950 p-4 font-mono text-xs text-zinc-300 focus:outline-none"
          value={sourceValue}
          onChange={handleSourceChange}
          spellCheck={false}
        />
      ) : (
        <EditorContent editor={editor} />
      )}

      <div className="flex items-center justify-between border-t border-white/5 bg-zinc-900/50 px-3 py-1.5 text-[10px] text-zinc-500">
        <span>Listas, títulos e links aparecem formatados no site público</span>
        <span className="hidden sm:inline">Ctrl+B · Ctrl+I · Ctrl+Z</span>
      </div>
    </div>
  );
}
