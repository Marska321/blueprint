import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  Settings, 
  LogOut, 
  ChevronRight, 
  Cpu, 
  Zap, 
  Package, 
  FileText, 
  Share2, 
  Download, 
  Trash2,
  Menu,
  X,
  Loader2,
  ExternalLink,
  CircuitBoard
} from 'lucide-react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  Node,
  Edge,
  ConnectionMode
} from 'reactflow';
import 'reactflow/dist/style.css';
import Markdown from 'react-markdown';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { auth, db, googleProvider, OperationType, handleFirestoreError } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { generateProject } from './services/gemini';
import { Project, ProjectComponent } from './types';
import { cn, formatCurrency } from './lib/utils';

// --- Components ---

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md', 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) => {
  const variants = {
    primary: 'bg-white text-black hover:bg-gray-200',
    secondary: 'bg-zinc-800 text-white hover:bg-zinc-700',
    outline: 'border border-zinc-700 text-white hover:bg-zinc-800',
    ghost: 'text-zinc-400 hover:text-white hover:bg-zinc-800',
    danger: 'text-red-500 hover:bg-red-500/10'
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <button 
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden', className)}>
    {children}
  </div>
);

const Badge = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-400 border border-zinc-700', className)}>
    {children}
  </span>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [activeTab, setActiveTab] = useState<'bom' | 'wiring' | 'instructions'>('bom');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setProjects([]);
        setSelectedProject(null);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
      setProjects(projs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    });

    return unsubscribe;
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    try {
      const newProject = await generateProject(prompt, user.uid);
      await addDoc(collection(db, 'projects'), newProject);
      setSelectedProject(newProject);
      setPrompt('');
    } catch (error) {
      console.error('Generation failed', error);
      alert(error instanceof Error ? error.message : 'Generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      await deleteDoc(doc(db, 'projects', id));
      if (selectedProject?.id === id) setSelectedProject(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `projects/${id}`);
    }
  };

  const exportBOM = () => {
    if (!selectedProject) return;

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`BOM: ${selectedProject.name}`, 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated by Blueprint SA`, 14, 30);
    doc.text(`Total Cost: ${formatCurrency(selectedProject.totalCostZAR)}`, 14, 38);

    const tableData = selectedProject.components.map(c => [
      c.name,
      c.category,
      c.quantity,
      formatCurrency(c.estimatedPriceZAR),
      formatCurrency(c.estimatedPriceZAR * c.quantity),
      c.supplier || 'N/A'
    ]);

    autoTable(doc, {
      startY: 45,
      head: [['Part', 'Category', 'Qty', 'Unit Price', 'Subtotal', 'Supplier']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [20, 20, 20] }
    });

    doc.save(`${selectedProject.name.replace(/\s+/g, '_')}_BOM.pdf`);
  };

  const exportCSV = () => {
    if (!selectedProject) return;
    
    const headers = ['Part', 'Category', 'Qty', 'Unit Price', 'Subtotal', 'Supplier'];
    const rows = selectedProject.components.map(c => [
      c.name,
      c.category,
      c.quantity,
      c.estimatedPriceZAR,
      c.estimatedPriceZAR * c.quantity,
      c.supplier || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedProject.name.replace(/\s+/g, '_')}_BOM.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 font-sans">
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#1a1a1a_0%,transparent_100%)]" />
          <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] h-full w-full">
            {Array.from({ length: 400 }).map((_, i) => (
              <div key={i} className="border-[0.5px] border-zinc-800/30" />
            ))}
          </div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 text-center max-w-2xl"
        >
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center rotate-12">
              <CircuitBoard className="text-black w-10 h-10" />
            </div>
          </div>
          <h1 className="text-6xl font-bold tracking-tighter mb-4 uppercase">Blueprint SA</h1>
          <p className="text-zinc-400 text-xl mb-12 leading-relaxed">
            The hardware project accelerator for South Africa. Turn your ideas into structured BOMs, wiring diagrams, and assembly guides in seconds.
          </p>
          <Button size="lg" onClick={handleLogin} className="px-12 py-4 rounded-full text-lg">
            Get Started with Google
          </Button>
          <div className="mt-12 flex items-center justify-center gap-8 text-zinc-500 text-sm uppercase tracking-widest">
            <span>Micro Robotics</span>
            <span className="w-1 h-1 bg-zinc-700 rounded-full" />
            <span>Communica</span>
            <span className="w-1 h-1 bg-zinc-700 rounded-full" />
            <span>DIYElectronics</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r border-zinc-800 flex flex-col bg-zinc-950"
          >
            <div className="p-4 border-bottom border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CircuitBoard className="w-5 h-5" />
                <span className="font-bold tracking-tight uppercase">Blueprint SA</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsSidebarOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">My Projects</div>
              {projects.length === 0 ? (
                <div className="text-zinc-600 text-xs italic p-4 text-center">No projects yet. Start by generating one!</div>
              ) : (
                projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProject(p)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg transition-all group flex items-center justify-between",
                      selectedProject?.id === p.id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                    )}
                  >
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      <span className="text-[10px] opacity-50">{new Date(p.createdAt).toLocaleDateString()}</span>
                    </div>
                    <Trash2 
                      className="w-3.5 h-3.5 text-zinc-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" 
                      onClick={(e) => { e.stopPropagation(); handleDeleteProject(p.id); }}
                    />
                  </button>
                ))
              )}
            </div>

            <div className="p-4 border-t border-zinc-800 space-y-4">
              <div className="flex items-center gap-3">
                <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-zinc-700" referrerPolicy="no-referrer" />
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs font-medium truncate">{user.displayName}</span>
                  <span className="text-[10px] text-zinc-500 truncate">{user.email}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-black/50 backdrop-blur-md z-20">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <Button variant="ghost" size="sm" onClick={() => setIsSidebarOpen(true)}>
                <Menu className="w-5 h-5" />
              </Button>
            )}
            {selectedProject ? (
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold tracking-tight uppercase">{selectedProject.name}</h2>
                <Badge>{formatCurrency(selectedProject.totalCostZAR)}</Badge>
              </div>
            ) : (
              <h2 className="text-lg font-bold tracking-tight uppercase text-zinc-500">New Project</h2>
            )}
          </div>

          {selectedProject && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={exportBOM}>
                <Download className="w-4 h-4" />
                PDF BOM
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV}>
                <FileText className="w-4 h-4" />
                CSV
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                alert('Project link copied to clipboard!');
              }}>
                <Share2 className="w-4 h-4" />
                Share
              </Button>
            </div>
          )}
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!selectedProject ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="max-w-xl w-full space-y-8">
                <div className="text-center space-y-2">
                  <h3 className="text-3xl font-bold tracking-tighter uppercase">What are you building?</h3>
                  <p className="text-zinc-500">Describe your project in natural language. We'll handle the rest.</p>
                </div>
                
                <form onSubmit={handleGenerate} className="space-y-4">
                  <div className="relative">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g. An ESP32 based weather station with a solar panel and e-ink display..."
                      className="w-full h-40 bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-lg focus:outline-none focus:ring-2 focus:ring-white/20 resize-none transition-all"
                      disabled={isGenerating}
                    />
                    <div className="absolute bottom-4 right-4 flex items-center gap-2 text-[10px] text-zinc-500 uppercase font-bold tracking-widest">
                      <Zap className="w-3 h-3 text-yellow-500" />
                      Powered by Gemini 3
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    size="lg" 
                    className="w-full py-6 text-lg gap-2" 
                    disabled={isGenerating || !prompt.trim()}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Architecting Project...
                      </>
                    ) : (
                      <>
                        <Plus className="w-5 h-5" />
                        Generate Project
                      </>
                    )}
                  </Button>
                </form>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    "Solar powered IoT weather station for the Karoo",
                    "Raspberry Pi Zero based retro gaming console",
                    "Smart home energy monitor for Eskom loadshedding",
                    "Arduino based automatic garden irrigation system"
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(suggestion)}
                      className="text-left p-4 rounded-lg bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors text-xs text-zinc-400"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-zinc-800 px-6 bg-zinc-950">
                {[
                  { id: 'bom', label: 'Bill of Materials', icon: Package },
                  { id: 'wiring', label: 'Wiring Diagram', icon: Zap },
                  { id: 'instructions', label: 'Instructions', icon: FileText },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-widest transition-all relative",
                      activeTab === tab.id ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {activeTab === tab.id && (
                      <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto">
                {activeTab === 'bom' && (
                  <div className="p-8 max-w-5xl mx-auto space-y-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-bold tracking-tight uppercase">Component List</h3>
                        <p className="text-zinc-500 text-sm">Estimated pricing based on South African suppliers.</p>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Total Estimated Cost</div>
                        <div className="text-3xl font-bold">{formatCurrency(selectedProject.totalCostZAR)}</div>
                      </div>
                    </div>

                    <div className="border border-zinc-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-900 border-b border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                          <tr>
                            <th className="px-6 py-4">Part</th>
                            <th className="px-6 py-4">Category</th>
                            <th className="px-6 py-4 text-center">Qty</th>
                            <th className="px-6 py-4 text-right">Unit Price</th>
                            <th className="px-6 py-4 text-right">Subtotal</th>
                            <th className="px-6 py-4">Supplier</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {selectedProject.components.map((c, i) => (
                            <tr key={i} className="hover:bg-zinc-900/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="font-medium text-white">{c.name}</span>
                                  <span className="text-xs text-zinc-500">{c.description}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <Badge>{c.category}</Badge>
                              </td>
                              <td className="px-6 py-4 text-center font-mono">{c.quantity}</td>
                              <td className="px-6 py-4 text-right font-mono">{formatCurrency(c.estimatedPriceZAR)}</td>
                              <td className="px-6 py-4 text-right font-mono text-white">{formatCurrency(c.estimatedPriceZAR * c.quantity)}</td>
                              <td className="px-6 py-4">
                                {c.supplier ? (
                                  <span className="text-zinc-400 flex items-center gap-1">
                                    {c.supplier}
                                    <ExternalLink className="w-3 h-3" />
                                  </span>
                                ) : 'Local Store'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === 'wiring' && (
                  <div className="h-full w-full bg-zinc-950 relative">
                    <ReactFlow
                      nodes={selectedProject.wiring.nodes as any}
                      edges={selectedProject.wiring.edges as any}
                      fitView
                      connectionMode={ConnectionMode.Loose}
                    >
                      <Background color="#333" gap={20} />
                      <Controls className="bg-zinc-900 border-zinc-800 fill-white" />
                      <MiniMap className="bg-zinc-900 border-zinc-800" nodeColor="#444" />
                    </ReactFlow>
                    <div className="absolute top-4 left-4 z-10 p-4 bg-black/80 border border-zinc-800 rounded-lg backdrop-blur-sm max-w-xs">
                      <h4 className="text-xs font-bold uppercase tracking-widest mb-2">Wiring Guide</h4>
                      <p className="text-[10px] text-zinc-400 leading-relaxed">
                        This diagram shows the logical connections between components. Animated edges indicate power flow.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'instructions' && (
                  <div className="p-8 max-w-3xl mx-auto">
                    <div className="prose prose-invert prose-zinc max-w-none">
                      <Markdown>{selectedProject.instructions}</Markdown>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
