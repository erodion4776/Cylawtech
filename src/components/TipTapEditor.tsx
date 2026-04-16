import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { Bold, Italic, List, ListOrdered, Underline as UnderlineIcon, Quote, Undo, Redo } from 'lucide-react';

interface TipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
}

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b border-slate-200 bg-slate-50 rounded-t-xl">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('bold') ? 'bg-slate-200 text-blue-700' : 'text-slate-600'}`}
      >
        <Bold size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('italic') ? 'bg-slate-200 text-blue-700' : 'text-slate-600'}`}
      >
        <Italic size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('underline') ? 'bg-slate-200 text-blue-700' : 'text-slate-600'}`}
      >
        <UnderlineIcon size={18} />
      </button>
      <div className="w-px h-6 bg-slate-300 mx-1 self-center" />
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('bulletList') ? 'bg-slate-200 text-blue-700' : 'text-slate-600'}`}
      >
        <List size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('orderedList') ? 'bg-slate-200 text-blue-700' : 'text-slate-600'}`}
      >
        <ListOrdered size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('blockquote') ? 'bg-slate-200 text-blue-700' : 'text-slate-600'}`}
      >
        <Quote size={18} />
      </button>
      <div className="w-px h-6 bg-slate-300 mx-1 self-center" />
      <button
        onClick={() => editor.chain().focus().undo().run()}
        className="p-2 rounded hover:bg-slate-200 text-slate-600"
      >
        <Undo size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        className="p-2 rounded hover:bg-slate-200 text-slate-600"
      >
        <Redo size={18} />
      </button>
    </div>
  );
};

const TipTapEditor = ({ content, onChange }: TipTapEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({
        placeholder: 'Start drafting your legal document here...',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  return (
    <div className="flex flex-col h-full border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
      <MenuBar editor={editor} />
      <EditorContent 
        editor={editor} 
        className="flex-grow p-6 prose prose-slate max-w-none focus:outline-none overflow-y-auto"
      />
    </div>
  );
};

export default TipTapEditor;
