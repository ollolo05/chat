import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { LoginModal } from './components/LoginModal';
import { useChat } from './hooks/useChat';
import { Menu, WifiOff } from 'lucide-react';

const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const {
    messages,
    onlineUsers,
    sendMessage,
    currentUser,
    login,
    isConnected
  } = useChat();

  if (!currentUser) {
    return <LoginModal onLogin={login} />;
  }

  return (
    <div className="flex h-screen w-full items-center justify-center p-0 md:p-6 lg:p-8">
      <div className="relative flex h-full w-full max-w-[1600px] overflow-hidden bg-white shadow-2xl md:rounded-xl">
        
        {/* Mobile Header for Sidebar Toggle */}
        <div className="absolute top-0 left-0 z-20 flex w-full items-center justify-between bg-white px-4 py-2 shadow-sm md:hidden">
            <div className="flex items-center gap-2">
                 <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-gray-600">
                    <Menu size={24} />
                </button>
                <span className="font-semibold text-gray-700">Chat</span>
            </div>
            {!isConnected && (
                <div className="flex items-center gap-1 text-xs text-red-500">
                    <WifiOff size={14} />
                    <span>Offline</span>
                </div>
            )}
        </div>

        {/* Sidebar - Hidden on mobile unless toggled */}
        <div className={`
            absolute inset-y-0 left-0 z-30 w-full transform bg-white transition-transform duration-300 ease-in-out md:relative md:w-80 md:translate-x-0 md:border-r border-gray-200
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
           <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b p-4 pt-16 md:pt-4">
                  <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                          {currentUser.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                          <p className="font-bold text-gray-800">{currentUser.name}</p>
                          <p className="text-xs text-green-500 flex items-center gap-1">
                              <span className="block h-2 w-2 rounded-full bg-green-500"></span>
                              Online
                          </p>
                      </div>
                  </div>
                  <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-gray-500">
                      Close
                  </button>
              </div>
              
              <Sidebar onlineUsers={onlineUsers} currentUser={currentUser} />
           </div>
        </div>

        {/* Overlay for mobile sidebar */}
        {isSidebarOpen && (
            <div 
                className="absolute inset-0 z-20 bg-black/50 md:hidden"
                onClick={() => setIsSidebarOpen(false)}
            />
        )}

        {/* Main Chat Area */}
        <div className="flex flex-1 flex-col bg-[#EFE7DD] relative pt-14 md:pt-0">
            {/* Desktop Connection Status */}
            {!isConnected && (
                <div className="absolute top-0 left-0 right-0 z-10 bg-red-500 text-white text-xs py-1 text-center hidden md:block">
                    Connection lost. Reconnecting...
                </div>
            )}
            
            <ChatWindow 
                messages={messages} 
                currentUser={currentUser} 
                onSendMessage={sendMessage} 
                isConnected={isConnected}
            />
        </div>
      </div>
    </div>
  );
};

export default App;