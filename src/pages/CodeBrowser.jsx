import React, { useState, useMemo, useCallback } from 'react';
import { Search, FileCode, Folder, FolderOpen, ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Vite-native: discovers ALL source files, imported as raw strings.
const srcGlob = import.meta.glob('/src/**/*.{jsx,js,ts,tsx,css,json}', { query: '?raw', import: 'default' });
const base44Glob = import.meta.glob('/base44/**/*.{ts,js,jsonc,json}', { query: '?raw', import: 'default' });
const rootGlob = import.meta.glob(['/*.{js,ts,json,html,css}', '/index.html'], { query: '?raw', import: 'default' });

const ALL_LOADERS = { ...srcGlob, ...base44Glob, ...rootGlob };
const ALL_PATHS = Object.keys(ALL_LOADERS).sort();

function buildTree(paths) {
  const root = { name: '', children: {}, isFile: false };
  for (const p of paths) {
    const parts = p.split('/').filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (!node.children[part]) {
        node.children[part] = { name: part, path: isLast ? p : null, isFile: isLast, children: {}, expanded: false };
      }
      node = node.children[part];
    }
  }
  return root;
}

function getLanguage(path) {
  if (path.endsWith('.jsx') || path.endsWith('.tsx')) return 'jsx';
  if (path.endsWith('.js') || path.endsWith('.ts')) return 'js';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json') || path.endsWith('.jsonc')) return 'json';
  if (path.endsWith('.html')) return 'html';
  return 'text';
}

function countLines(text) {
  if (!text) return 0;
  return text.split('\n').length;
}

function TreeView({ node, depth, onSelect, selectedPath, expandedNodes, toggleNode }) {
  const entries = Object.values(node.children).sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return entries.map((entry) => {
    const hasChildren = Object.keys(entry.children).length > 0;
    const isExpanded = expandedNodes.has(entry.path || `${node.path || ''}/${entry.name}`);
    const key = entry.path || `${node.path || ''}/${entry.name}`;
    const isSelected = entry.path === selectedPath;

    if (entry.isFile) {
      return (
        <button
          key={key}
          onClick={() => onSelect(entry.path)}
          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            isSelected ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
        >
          <FileCode className="w-3.5 h-3.5 shrink-0 opacity-60" />
          <span className="truncate text-left">{entry.name}</span>
        </button>
      );
    }

    return (
      <div key={key}>
        <button
          onClick={() => toggleNode(key)}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
          {isExpanded ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-500/70" /> : <Folder className="w-3.5 h-3.5 shrink-0 text-amber-500/70" />}
          <span className="truncate text-left">{entry.name}</span>
          <span className="ml-auto text-[10px] opacity-40">{Object.keys(entry.children).length}</span>
        </button>
        {isExpanded && hasChildren && (
          <TreeView
            node={entry}
            depth={depth + 1}
            onSelect={onSelect}
            selectedPath={selectedPath}
            expandedNodes={expandedNodes}
            toggleNode={toggleNode}
          />
        )}
      </div>
    );
  });
}

export default function CodeBrowser() {
  const [selectedPath, setSelectedPath] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState(() => new Set(['src', 'base44']));

  const tree = useMemo(() => buildTree(ALL_PATHS), []);

  const filteredPaths = useMemo(() => {
    if (!search.trim()) return ALL_PATHS;
    const q = search.toLowerCase();
    return ALL_PATHS.filter((p) => p.toLowerCase().includes(q));
  }, [search]);

  const filteredTree = useMemo(() => buildTree(filteredPaths), [filteredPaths]);

  const toggleNode = useCallback((key) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const loadFile = useCallback(async (path) => {
    const loader = ALL_LOADERS[path];
    if (!loader) {
      setContent(`// File not found: ${path}`);
      return;
    }
    setSelectedPath(path);
    setLoading(true);
    setContent('');
    try {
      const text = typeof loader === 'function' ? await loader() : loader;
      setContent(typeof text === 'string' ? text : String(text));
    } catch (e) {
      setContent(`// Error loading file: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const copyToClipboard = useCallback(() => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const lineCount = useMemo(() => countLines(content), [content]);
  const lang = useMemo(() => (selectedPath ? getLanguage(selectedPath) : 'text'), [selectedPath]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-3">
        <h1 className="font-heading font-bold text-2xl text-foreground">Code Browser</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {ALL_PATHS.length} files · {Object.keys(srcGlob).length} frontend · {Object.keys(base44Glob).length} backend/config · click any file to view source
        </p>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Sidebar — file tree */}
        <div className="w-72 shrink-0 flex flex-col border border-border rounded-lg bg-card overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
              <Input
                placeholder="Search files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 sidebar-scroll">
            <TreeView
              node={search.trim() ? filteredTree : tree}
              depth={0}
              onSelect={loadFile}
              selectedPath={selectedPath}
              expandedNodes={expandedNodes}
              toggleNode={toggleNode}
            />
          </div>
        </div>

        {/* Code viewer */}
        <div className="flex-1 flex flex-col border border-border rounded-lg bg-card overflow-hidden min-w-0">
          {selectedPath ? (
            <>
              <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/30">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode className="w-4 h-4 shrink-0 text-primary" />
                  <span className="text-xs font-mono text-foreground truncate">{selectedPath}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] text-muted-foreground">
                    {lang} · {lineCount} lines
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={copyToClipboard}>
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span className="text-xs">{copied ? 'Copied' : 'Copy'}</span>
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto sidebar-scroll">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
                  </div>
                ) : (
                  <pre className="text-xs font-mono leading-relaxed p-4 text-foreground whitespace-pre-wrap break-all">
                    <code>{content}</code>
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-center p-8">
              <div>
                <FileCode className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Select a file from the tree to view its source</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{ALL_PATHS.length} files available</p>
                <p className="text-xs text-muted-foreground/40 mt-2">Click a folder to expand, then click a file</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}