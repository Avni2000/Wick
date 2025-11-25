import { createContext, useContext } from 'react'

interface InfoPanelContextType {
    showInfo: (title: string, description: string) => void
    hideInfo: () => void
}

const InfoPanelContext = createContext<InfoPanelContextType | null>(null)

export const InfoPanelProvider = InfoPanelContext.Provider

export const useInfoPanel = () => {
    const context = useContext(InfoPanelContext)
    if (!context) {
        throw new Error('useInfoPanel must be used within InfoPanelProvider')
    }
    return context
}
