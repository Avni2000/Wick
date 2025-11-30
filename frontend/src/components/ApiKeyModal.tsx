import { useState, useEffect } from 'react'
import { API } from '../utils/api'

interface ApiKeyModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function ApiKeyModal({ isOpen, onClose }: ApiKeyModalProps) {
    const [apiKey, setApiKey] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [status, setStatus] = useState<string | null>(null)

    useEffect(() => {
        if (isOpen) {
            fetchConfig()
        }
    }, [isOpen])

    const fetchConfig = async () => {
        try {
            const response = await fetch(API.config)
            const data = await response.json()
            if (data.success && data.config?.api_key) {
                setApiKey(data.config.api_key)
            }
        } catch (error) {
            console.error('Failed to fetch config:', error)
        }
    }

    const handleSave = async () => {
        setIsLoading(true)
        setStatus(null)

        try {
            const response = await fetch(API.config, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey }),
            })

            const result = await response.json()

            if (result.success) {
                setStatus('Saved successfully!')
                setTimeout(() => {
                    onClose()
                    setStatus(null)
                }, 1000)
            } else {
                setStatus('Error: ' + result.error)
            }
        } catch (error) {
            setStatus('Error: ' + error)
        } finally {
            setIsLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-dark-surface p-6 rounded-lg border border-dark-border w-[500px] shadow-xl">
                <h3 className="text-xl font-bold mb-4 text-dark-text">🔑 Configure API Key</h3>

                <div className="mb-4">
                    <label className="block text-sm text-dark-muted mb-2 font-semibold">
                        Public.com API Key
                    </label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-dark-text focus:outline-none focus:border-blue-500"
                        placeholder="Enter your API key"
                    />
                    <div className="mt-2 space-y-2">
                        <p className="text-xs text-dark-muted">
                            Your key is saved securely in <code className="bg-dark-bg px-1 rounded">~/.wick/config.json</code>
                        </p>
                        <p className="text-xs text-blue-400">
                            💡 Don't have an API key?{' '}
                            <a
                                href="https://public.com/developer"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:text-blue-300"
                            >
                                Get one from Public.com →
                            </a>
                        </p>
                    </div>
                </div>

                {/* CLI Alternative */}
                <div className="mb-4 p-3 bg-dark-bg border border-dark-border rounded-lg">
                    <div className="text-xs text-dark-muted mb-2 font-semibold">Or use the command line:</div>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-gray-900 text-green-400 px-2 py-1 rounded font-mono">
                            wick config --set-api-key YOUR_KEY
                        </code>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText('wick config --set-api-key YOUR_KEY')
                            }}
                            className="text-xs text-blue-400 hover:text-blue-300 underline"
                        >
                            Copy
                        </button>
                    </div>
                </div>

                {status && (
                    <div className={`mb-4 text-sm ${status.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>
                        {status}
                    </div>
                )}

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-dark-text hover:bg-dark-bg rounded transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isLoading || !apiKey}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded transition-colors font-semibold"
                    >
                        {isLoading ? 'Saving...' : '💾 Save Configuration'}
                    </button>
                </div>
            </div>
        </div>
    )
}
