"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Wand2, User, MapPin, Box, ChevronRight, ChevronLeft, Save, Sparkles, Plus, Trash2, X } from "lucide-react";
import { api, crudApi } from "@/lib/api";
import { useProjectStore } from "@/store/projectStore";

interface ScriptNode {
    type: "character" | "scene" | "prop";
    id?: string;
    name: string;
    desc: string;
    // Extended attributes
    age?: string;
    gender?: string;
    clothing?: string;
    visual_weight?: number;
}

export default function ScriptProcessor() {
    const ts = useTranslations("script");
    const tc = useTranslations("common");
    const currentProject = useProjectStore((state) => state.currentProject);
    const updateProject = useProjectStore((state) => state.updateProject);
    const analyzeProject = useProjectStore((state) => state.analyzeProject);
    const isAnalyzing = useProjectStore((state) => state.isAnalyzing);

    // Initialize from project data
    const [script, setScript] = useState(currentProject?.originalText || "");
    const [nodes, setNodes] = useState<ScriptNode[]>([]);

    // UI State
    const [selectedNode, setSelectedNode] = useState<ScriptNode | null>(null);
    const [showPanel, setShowPanel] = useState(true);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

    // Sync from project
    useEffect(() => {
        if (currentProject) {
            setScript(currentProject.originalText || "");
            const newNodes: ScriptNode[] = [
                ...currentProject.characters.map((c: any) => ({
                    type: "character" as const,
                    id: c.id,
                    name: c.name,
                    desc: c.description,
                    age: c.age,
                    gender: c.gender,
                    clothing: c.clothing,
                    visual_weight: c.visual_weight
                })),
                ...currentProject.scenes.map((s: any) => ({
                    type: "scene" as const,
                    id: s.id,
                    name: s.name,
                    desc: s.description,
                    visual_weight: s.visual_weight
                })),
                ...currentProject.props.map((p: any) => ({
                    type: "prop" as const,
                    id: p.id,
                    name: p.name,
                    desc: p.description
                }))
            ];
            setNodes(newNodes);
        }
    }, [currentProject]); // Depend on the whole object to catch updates

    const handleAnalyze = async () => {
        if (!script) return;
        try {
            await analyzeProject(script);
        } catch (error: any) {
            console.error("Failed to analyze script:", error);
            // Extract error message from axios response or error object
            const errorMessage = error?.response?.data?.detail || error?.message || "未知错误";
            alert(ts("analysisFailed", { error: errorMessage }));
        }
    };

    const handleDeleteNode = async (node: ScriptNode, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!currentProject) return;
        if (!confirm(ts("confirmDelete", { name: node.name }))) return;

        try {
            if (node.type === "character" && node.id) {
                await crudApi.deleteCharacter(currentProject.id, node.id);
            } else if (node.type === "scene" && node.id) {
                await crudApi.deleteScene(currentProject.id, node.id);
            } else if (node.type === "prop" && node.id) {
                await crudApi.deleteProp(currentProject.id, node.id);
            }

            const updatedProject = await api.getProject(currentProject.id);
            updateProject(currentProject.id, updatedProject);
        } catch (error) {
            console.error("Failed to delete node:", error);
            alert(ts("deleteFailed"));
        }
    };

    const handleCreateNode = async (data: any) => {
        if (!currentProject) return;
        try {
            if (data.type === "character") {
                await crudApi.createCharacter(currentProject.id, data);
            } else if (data.type === "scene") {
                await crudApi.createScene(currentProject.id, data);
            } else if (data.type === "prop") {
                await crudApi.createProp(currentProject.id, data);
            }

            const updatedProject = await api.getProject(currentProject.id);
            updateProject(currentProject.id, updatedProject);
            setIsCreateDialogOpen(false);
        } catch (error) {
            console.error("Failed to create node:", error);
            alert(ts("createFailed"));
        }
    };

    const handleNodeUpdate = (updatedNode: ScriptNode) => {
        // Update local state
        setNodes(prev => prev.map(n => n.name === updatedNode.name ? updatedNode : n));
        setSelectedNode(updatedNode);
    };

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* Left: Script Editor */}
            <div className={`flex-1 flex flex-col transition-all duration-300 ${showPanel ? 'mr-0' : 'mr-0'}`}>
                <div className="p-4 border-b border-glass-border flex justify-between items-center bg-surface">
                    <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
                        <Sparkles className="text-primary" size={18} />
                        {ts("scriptEditor")}
                    </h2>
                    <div className="flex gap-2">
                        <button
                            onClick={handleAnalyze}
                            disabled={!script || isAnalyzing}
                            className="glass-button px-4 py-1.5 text-sm flex items-center gap-2 text-primary border-primary/30 hover:bg-primary/10"
                        >
                            {isAnalyzing ? <Wand2 className="animate-spin" size={14} /> : <Wand2 size={14} />}
                            {isAnalyzing ? ts("analyzingScript") : ts("extractEntities")}
                        </button>
                        <button
                            onClick={() => setShowPanel(!showPanel)}
                            className="p-2 hover:bg-hover-bg rounded-lg text-text-secondary"
                        >
                            {showPanel ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                        </button>
                    </div>
                </div>

                <div className="flex-1 relative p-6">
                    <textarea
                        value={script}
                        onChange={(e) => {
                            const newText = e.target.value;
                            setScript(newText);
                            if (currentProject) {
                                updateProject(currentProject.id, { originalText: newText });
                            }
                        }}
                        placeholder={ts("scriptPlaceholder")}
                        className="w-full h-full bg-transparent text-text-secondary font-mono text-base leading-relaxed resize-none focus:outline-none"
                        spellCheck={false}
                    />
                </div>
            </div>

            {/* Right: Entity Intelligence Panel */}
            <AnimatePresence mode="popLayout">
                {showPanel && (
                    <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 400, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        className="border-l border-glass-border bg-surface backdrop-blur-md flex flex-col h-full"
                    >
                        <div className="p-4 border-b border-glass-border flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-foreground">{ts("entityPanel")}</h3>
                                <p className="text-xs text-text-muted">{ts("entitiesCount", { count: nodes.length })}</p>
                            </div>
                            <button
                                onClick={() => setIsCreateDialogOpen(true)}
                                className="p-1.5 bg-hover-bg hover:bg-hover-bg rounded-lg text-text-secondary hover:text-foreground transition-colors"
                                title="Add Entity"
                            >
                                <Plus size={16} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {nodes.length === 0 && !isAnalyzing && (
                                <div className="text-center text-text-muted mt-10 text-sm">
                                    {ts("extractHint")}
                                </div>
                            )}

                            {nodes.map((node, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    onClick={() => setSelectedNode(node)}
                                    className={`group p-3 rounded-lg border cursor-pointer transition-all hover:bg-glass ${selectedNode?.name === node.name
                                        ? "border-primary bg-primary/5"
                                        : "border-border-subtle bg-glass"
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            {node.type === "character" && <User size={14} className="text-blue-400" />}
                                            {node.type === "scene" && <MapPin size={14} className="text-green-400" />}
                                            {node.type === "prop" && <Box size={14} className="text-yellow-400" />}
                                            <span className="font-bold text-sm text-foreground">{node.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {node.visual_weight && (
                                                <div className="flex gap-0.5">
                                                    {[...Array(5)].map((_, w) => (
                                                        <div key={w} className={`w-1 h-3 rounded-full ${w < (node.visual_weight || 0) ? "bg-primary" : "bg-hover-bg"}`} />
                                                    ))}
                                                </div>
                                            )}
                                            <button
                                                onClick={(e) => handleDeleteNode(node, e)}
                                                className="p-1 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Delete"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-text-secondary line-clamp-2">{node.desc}</p>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Attribute Card (Popover) */}
            <AnimatePresence>
                {selectedNode && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm" onClick={() => setSelectedNode(null)}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="w-[500px] bg-elevated border border-glass-border rounded-xl shadow-2xl overflow-hidden"
                        >
                            <div className="p-6 border-b border-glass-border flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-xs px-2 py-0.5 rounded uppercase font-bold ${selectedNode.type === "character" ? "bg-blue-500/20 text-blue-400" :
                                            selectedNode.type === "scene" ? "bg-green-500/20 text-green-400" :
                                                "bg-yellow-500/20 text-yellow-400"
                                            }`}>
                                            {selectedNode.type}
                                        </span>
                                        <h2 className="text-xl font-bold text-foreground">{selectedNode.name}</h2>
                                    </div>
                                    <p className="text-sm text-text-secondary">{ts("entityConfig")}</p>
                                </div>
                                <button onClick={() => setSelectedNode(null)} className="text-text-muted hover:text-foreground">✕</button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs text-text-muted mb-1">{ts("visualDescription")}</label>
                                    <textarea
                                        value={selectedNode.desc}
                                        onChange={e => handleNodeUpdate({ ...selectedNode, desc: e.target.value })}
                                        className="glass-input w-full h-24 resize-none text-sm"
                                    />
                                </div>

                                {selectedNode.type === "character" && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-text-muted mb-1">{ts("age")}</label>
                                            <input
                                                type="text"
                                                value={selectedNode.age || ""}
                                                onChange={e => handleNodeUpdate({ ...selectedNode, age: e.target.value })}
                                                className="glass-input w-full text-sm"
                                                placeholder="e.g. 18"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-text-muted mb-1">{ts("gender")}</label>
                                            <input
                                                type="text"
                                                value={selectedNode.gender || ""}
                                                onChange={e => handleNodeUpdate({ ...selectedNode, gender: e.target.value })}
                                                className="glass-input w-full text-sm"
                                                placeholder="e.g. Female"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs text-text-muted mb-1">{ts("clothing")}</label>
                                            <input
                                                type="text"
                                                value={selectedNode.clothing || ""}
                                                onChange={e => handleNodeUpdate({ ...selectedNode, clothing: e.target.value })}
                                                className="glass-input w-full text-sm"
                                                placeholder="e.g. Black Hoodie"
                                            />
                                        </div>
                                    </div>
                                )}

                                {selectedNode.type !== "prop" && (
                                    <div>
                                        <label className="block text-xs text-text-muted mb-2">{ts("visualWeight")}</label>
                                        <div className="flex gap-2">
                                            {[1, 2, 3, 4, 5].map(w => (
                                                <button
                                                    key={w}
                                                    onClick={() => handleNodeUpdate({ ...selectedNode, visual_weight: w })}
                                                    className={`flex-1 py-2 rounded text-xs font-bold transition-colors ${(selectedNode.visual_weight || 3) === w
                                                        ? "bg-primary text-white"
                                                        : "bg-glass text-text-muted hover:bg-hover-bg"
                                                        }`}
                                                >
                                                    {w}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-text-muted mt-1 text-center">
                                            {ts("weightScale")}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 border-t border-glass-border bg-surface flex justify-end">
                                <button
                                    onClick={async () => {
                                        if (currentProject && selectedNode && selectedNode.id) {
                                            try {
                                                // Construct attributes to update
                                                const attributes: any = {
                                                    description: selectedNode.desc,
                                                    visual_weight: selectedNode.visual_weight
                                                };

                                                if (selectedNode.type === "character") {
                                                    attributes.age = selectedNode.age;
                                                    attributes.gender = selectedNode.gender;
                                                    attributes.clothing = selectedNode.clothing;
                                                }

                                                const updatedProject = await api.updateAssetAttributes(
                                                    currentProject.id,
                                                    selectedNode.id,
                                                    selectedNode.type,
                                                    attributes
                                                );

                                                updateProject(currentProject.id, updatedProject);
                                                console.log("Asset attributes updated successfully");
                                                // alert("配置已保存"); // Optional: Feedback
                                                setSelectedNode(null);
                                            } catch (error) {
                                                console.error("Failed to update asset attributes:", error);
                                                alert(ts("saveFailed"));
                                            }
                                        } else {
                                            setSelectedNode(null);
                                        }
                                    }}
                                    className="px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-bold flex items-center gap-2"
                                >
                                    <Save size={14} /> {ts("saveConfig")}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Create Entity Dialog */}
            <AnimatePresence>
                {isCreateDialogOpen && (
                    <CreateEntityDialog
                        onClose={() => setIsCreateDialogOpen(false)}
                        onCreate={handleCreateNode}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

function CreateEntityDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (data: any) => void }) {
    const ts = useTranslations("script");
    const tc = useTranslations("common");
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [type, setType] = useState<"character" | "scene" | "prop">("character");

    const handleSubmit = () => {
        if (!name.trim()) return alert(ts("nameRequired"));
        onCreate({ name, description: desc, type });
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm" onClick={onClose}>
            <div className="w-[400px] bg-elevated border border-glass-border rounded-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold text-foreground">{ts("addEntity")}</h3>

                <div className="flex gap-2 p-1 bg-surface rounded-lg">
                    {(["character", "scene", "prop"] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setType(t)}
                            className={`flex-1 py-1.5 text-xs font-bold rounded capitalize ${type === t ? "bg-primary text-white" : "text-text-muted hover:text-foreground"}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                <div>
                    <label className="text-xs text-text-muted">{ts("nameLabel")}</label>
                    <input
                        className="glass-input w-full"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder={ts("entityNamePlaceholder")}
                    />
                </div>

                <div>
                    <label className="text-xs text-text-muted">{ts("descriptionLabel")}</label>
                    <textarea
                        className="glass-input w-full h-24 resize-none"
                        value={desc}
                        onChange={e => setDesc(e.target.value)}
                        placeholder={ts("visualDescPlaceholder")}
                    />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onClose} className="px-4 py-2 text-xs text-text-secondary hover:text-foreground">{tc("cancel")}</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded text-xs font-bold">{tc("create")}</button>
                </div>
            </div>
        </div>
    );
}
