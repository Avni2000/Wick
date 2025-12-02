import { useState, useEffect } from 'react'
import { API } from '../utils/api'

interface StrategyFile {
    filename: string
    created_date: string
    last_modified: string
    size_bytes: number
    description: string
}

interface Template {
    name: string
    filename: string
    description: string
    full_description: string
}

export default function StrategyFiles({
    onRunBacktest
}: {
    onRunBacktest: (filename: string, ticker: string) => void
}) {
    const [files, setFiles] = useState<StrategyFile[]>([])
    const [selectedFile, setSelectedFile] = useState<string | null>(null)
    const [content, setContent] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [status, setStatus] = useState<string | null>(null)
    const [showNewModal, setShowNewModal] = useState(false)
    const [templates, setTemplates] = useState<Template[]>([])
    const [newFileName, setNewFileName] = useState('')
    const [selectedTemplate, setSelectedTemplate] = useState<string>('')
    const [showBacktestConfig, setShowBacktestConfig] = useState(false)
    const [backtestTicker, setBacktestTicker] = useState('RKLB')

    // Load files on mount
    useEffect(() => {
        fetchFiles()
    }, [])

    // Load content when file selected
    useEffect(() => {
        if (selectedFile) {
            loadFileContent(selectedFile)
        } else {
            setContent('')
        }
    }, [selectedFile])

    const fetchFiles = async () => {
        try {
            const res = await fetch(API.strategies)
            const data = await res.json()
            if (data.success) {
                setFiles(data.files)
            }
        } catch (error) {
            console.error('Failed to fetch strategies:', error)
        }
    }

    const loadFileContent = async (filename: string) => {
        try {
            const res = await fetch(API.strategy(filename))
            const data = await res.json()
            if (data.success) {
                setContent(data.content)
            }
        } catch (error) {
            console.error('Failed to load strategy:', error)
        }
    }

    const handleSave = async () => {
        if (!selectedFile) return

        setIsSaving(true)
        setStatus('Saving...')
        try {
            const res = await fetch(API.strategies, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: selectedFile,
                    content: content,
                    description: '' // TODO: Add description editing
                })
            })
            const data = await res.json()

            if (data.success) {
                setStatus('Saved successfully!')
                fetchFiles() // Refresh list to update modified time

                // Validate
                const valRes = await fetch(API.validateStrategy(selectedFile), {
                    method: 'POST'
                })
                const valData = await valRes.json()
                if (valData.success && !valData.validation.valid) {
                    setStatus(`Saved, but has errors: ${valData.validation.errors.join(', ')}`)
                }
            } else {
                setStatus(`Error: ${data.error}`)
            }
        } catch (error) {
            setStatus('Failed to save')
        } finally {
            setIsSaving(false)
            setTimeout(() => setStatus(null), 3000)
        }
    }

    const handleDelete = async () => {
        if (!selectedFile || !confirm(`Are you sure you want to delete ${selectedFile}?`)) return

        try {
            const res = await fetch(API.strategy(selectedFile), {
                method: 'DELETE'
            })
            const data = await res.json()
            if (data.success) {
                setSelectedFile(null)
                fetchFiles()
            }
        } catch (error) {
            alert('Failed to delete file')
        }
    }

    const handleCreateNew = async () => {
        if (!newFileName) return

        let initialContent = ''
        if (selectedTemplate) {
            // Load template content
            try {
                const res = await fetch(API.template(selectedTemplate))
                const data = await res.json()
                if (data.success) {
                    initialContent = data.content
                }
            } catch (e) {
                console.error('Failed to load template:', e)
            }
        }

        // Basic boilerplate if no template
        if (!initialContent) {
            initialContent = `from backtesting import Strategy\nimport pandas as pd\n\nclass MyStrategy(Strategy):\n    def init(self):\n        pass\n\n    def next(self):\n        pass\n`
        }

        const filename = newFileName.endsWith('.py') ? newFileName : `${newFileName}.py`

        try {
            const res = await fetch(API.strategies, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: filename,
                    content: initialContent,
                    description: 'Created from UI'
                })
            })
            const data = await res.json()
            if (data.success) {
                setShowNewModal(false)
                setNewFileName('')
                fetchFiles()
                setSelectedFile(filename)
            } else {
                alert(data.error)
            }
        } catch (e) {
            alert('Failed to create file')
        }
    }

    const openNewModal = async () => {
        setShowNewModal(true)
        // Fetch templates
        try {
            const res = await fetch(API.templates)
            const data = await res.json()
            if (data.success) {
                setTemplates(data.templates)
            }
        } catch (e) { }
    }

    return (
        <div className="flex h-full w-full bg-dark-bg text-dark-text overflow-hidden">
            {/* Sidebar - File List */}
            <div className="w-64 border-r border-dark-border flex flex-col bg-dark-surface">
                <div className="p-4 border-b border-dark-border flex justify-between items-center">
                    <h2 className="font-bold">Strategies</h2>
                    <button
                        onClick={openNewModal}
                        className="p-1 hover:bg-dark-bg rounded text-blue-400"
                        title="New Strategy"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {files.map(file => (
                        <div
                            key={file.filename}
                            onClick={() => setSelectedFile(file.filename)}
                            className={`p-3 cursor-pointer border-b border-dark-border/50 hover:bg-dark-bg transition-colors ${selectedFile === file.filename ? 'bg-blue-900/20 border-l-4 border-l-blue-500' : ''
                                }`}
                        >
                            <div className="font-medium text-sm truncate">{file.filename}</div>
                            <div className="text-xs text-dark-muted mt-1">
                                {new Date(file.last_modified).toLocaleDateString()}
                            </div>
                        </div>
                    ))}

                    {files.length === 0 && (
                        <div className="p-4 text-center text-dark-muted text-sm">
                            No strategies found. Create one to get started!
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content - Editor */}
            <div className="flex-1 flex flex-col min-w-0">
                {selectedFile ? (
                    <>
                        {/* Toolbar */}
                        <div className="h-12 border-b border-dark-border flex items-center px-4 justify-between bg-dark-surface">
                            <div className="font-mono text-sm text-dark-muted">{selectedFile}</div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleDelete}
                                    className="px-3 py-1 text-red-400 hover:bg-red-900/20 rounded text-sm transition-colors"
                                >
                                    Delete
                                </button>
                                <button
                                    onClick={() => setShowBacktestConfig(true)}
                                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors flex items-center gap-1"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Backtest
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors flex items-center gap-1"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                    </svg>
                                    {isSaving ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </div>

                        {/* Editor */}
                        <div className="flex-1 relative">
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="absolute inset-0 w-full h-full bg-[#1e1e1e] text-[#d4d4d4] font-mono p-4 resize-none focus:outline-none text-sm leading-relaxed"
                                spellCheck={false}
                            />
                        </div>

                        {/* Status Bar */}
                        <div className="h-8 bg-blue-900/20 border-t border-dark-border flex items-center px-4 text-xs">
                            {status && <span className={status.includes('Error') || status.includes('errors') ? 'text-red-400' : 'text-green-400'}>{status}</span>}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-dark-muted flex-col gap-4">
                        <svg className="w-16 h-16 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p>Select a strategy file or create a new one</p>
                        <button
                            onClick={openNewModal}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                        >
                            Create New Strategy
                        </button>
                    </div>
                )}
            </div>

            {/* New Strategy Modal */}
            {showNewModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-dark-surface border border-dark-border rounded-lg shadow-xl w-96 p-6">
                        <h3 className="text-lg font-bold mb-4 text-dark-text">New Strategy</h3>

                        <div className="mb-4">
                            <label className="block text-sm text-dark-muted mb-1">Filename</label>
                            <input
                                type="text"
                                value={newFileName}
                                onChange={(e) => setNewFileName(e.target.value)}
                                placeholder="my_strategy.py"
                                className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-dark-text focus:outline-none focus:border-blue-500"
                                autoFocus
                            />
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm text-dark-muted mb-1">Template (Optional)</label>
                            <select
                                value={selectedTemplate}
                                onChange={(e) => setSelectedTemplate(e.target.value)}
                                className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-dark-text focus:outline-none focus:border-blue-500"
                            >
                                <option value="">Empty Strategy</option>
                                {templates.map(t => (
                                    <option key={t.filename} value={t.filename}>{t.name}</option>
                                ))}
                            </select>
                            {selectedTemplate && (
                                <p className="text-xs text-dark-muted mt-2">
                                    {templates.find(t => t.filename === selectedTemplate)?.description}
                                </p>
                            )}
                        </div>

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowNewModal(false)}
                                className="px-4 py-2 text-dark-text hover:bg-dark-bg rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateNew}
                                disabled={!newFileName}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Backtest Config Modal */}
            {showBacktestConfig && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-dark-surface border border-dark-border rounded-lg shadow-xl w-80 p-6">
                        <h3 className="text-lg font-bold mb-4 text-dark-text">Run Backtest</h3>
                        <div className="mb-6">
                            <label className="block text-sm text-dark-muted mb-1">Ticker</label>
                            <input
                                type="text"
                                value={backtestTicker}
                                onChange={(e) => setBacktestTicker(e.target.value.toUpperCase())}
                                className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-dark-text focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowBacktestConfig(false)}
                                className="px-4 py-2 text-dark-text hover:bg-dark-bg rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (selectedFile) {
                                        onRunBacktest(selectedFile, backtestTicker)
                                        setShowBacktestConfig(false)
                                    }
                                }}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
                            >
                                Run
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
